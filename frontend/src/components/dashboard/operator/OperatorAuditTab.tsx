"use client";

import "@/lib/ensure-node-buffer";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { keccak256, toUtf8Bytes } from "ethers";
import type { Address } from "viem";
import { decryptSealedBlobInBrowser, type SealedPayload } from "@/lib/seal-reveal-client";
import { SelectiveRevealPanel } from "@/components/dashboard/SelectiveRevealPanel";
import { parseApiJson } from "@/lib/api-json";
import { sealApiBase } from "@/lib/wagmi-config";
import { buildDenyMessage, buildRevealSubmitMessage } from "@/lib/audit-message";

type Tone = "neutral" | "ok" | "warn" | "bad";

function pillTone(v: Tone) {
  return v === "ok"
    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
    : v === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : v === "bad"
        ? "border-rose-300 bg-rose-50 text-rose-950"
        : "border-[#05058a]/15 bg-[#f5f5f0] text-[#05058a]/70";
}

type AuditStatus = "pending" | "revealed" | "denied";

type AuditRequest = {
  id: string;
  createdAt: string;
  agentIdBytes32: string;
  auditorAddress: string;
  scope: string;
  status: AuditStatus;
  note?: string;
  revealedPlaintext?: string;
  revealedAt?: string;
  denyAt?: string;
};

type SealedBlobRow = {
  taskId: string;
  cid: string;
  encryptedKey: SealedPayload["encryptedKey"];
  iv: string;
};

function shortHex(hex: string, n = 10) {
  if (!hex || hex.length < n + 4) return hex;
  return `${hex.slice(0, n)}…${hex.slice(-6)}`;
}

export function OperatorAuditTab(props: { selectedActionLabel: string }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [requests, setRequests] = useState<AuditRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealPk, setRevealPk] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which inbox row is shown in the right-hand Reveal view */
  const [panelRequestId, setPanelRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${sealApiBase}/api/audit-requests?operator=${encodeURIComponent(address)}`);
      const j = await parseApiJson<{ requests?: AuditRequest[]; error?: string }>(r);
      if (!r.ok) throw new Error(j.error || r.statusText);
      setRequests(j.requests ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (requests.length === 0) return;
    setPanelRequestId((prev) => {
      if (prev && requests.some((r) => r.id === prev)) return prev;
      return requests[0].id;
    });
  }, [requests]);

  const panelRequest = panelRequestId ? requests.find((r) => r.id === panelRequestId) ?? null : null;

  async function deny(req: AuditRequest) {
    if (!address) return;
    setBusyId(req.id);
    setActionError(null);
    try {
      const msg = buildDenyMessage(req.id, req.agentIdBytes32);
      const signature = await signMessageAsync({ message: msg });
      const res = await fetch(`${sealApiBase}/api/audit-requests/${encodeURIComponent(req.id)}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const j = await parseApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(j.error || res.statusText);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revealWithWallet(req: AuditRequest) {
    if (!address) return;
    setPanelRequestId(req.id);
    setBusyId(req.id);
    setActionError(null);
    try {
      const r = await fetch(
        `${sealApiBase}/api/audit-requests/${encodeURIComponent(req.id)}/sealed-blobs?operator=${encodeURIComponent(address)}`,
      );
      const j = await parseApiJson<{ blobs?: SealedBlobRow[]; error?: string }>(r);
      if (!r.ok) throw new Error(j.error || r.statusText);
      const blobs = j.blobs ?? [];
      if (blobs.length === 0) {
        throw new Error(
          "No sealed blobs for this agent. Run Monitor → Run pipeline with Storacha/Lit so the backend persists CID + Lit fields.",
        );
      }
      const parts: string[] = [];
      for (const b of blobs) {
        const pt = await decryptSealedBlobInBrowser(
          { cid: b.cid, encryptedKey: b.encryptedKey, iv: b.iv },
          address as Address,
          (m) => signMessageAsync({ message: m }),
        );
        parts.push(`--- task: ${b.taskId} ---\n${pt}`);
      }
      const plaintext = parts.join("\n\n");
      const plaintextKeccak256 = keccak256(toUtf8Bytes(plaintext));
      const msg = buildRevealSubmitMessage(req.id, req.agentIdBytes32, req.auditorAddress, plaintextKeccak256);
      const signature = await signMessageAsync({ message: msg });
      const res = await fetch(`${sealApiBase}/api/audit-requests/${encodeURIComponent(req.id)}/reveal-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaintext, signature }),
      });
      const out = await parseApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(out.error || res.statusText);
      await load();
      setPanelRequestId(req.id);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revealWithPrivateKey(req: AuditRequest) {
    const pk = revealPk[req.id]?.trim();
    if (!pk) {
      setActionError(
        "Paste the private key for the wallet that authorized the sealed blob, or use “Decrypt & reveal” with your connected wallet instead.",
      );
      return;
    }
    setPanelRequestId(req.id);
    setBusyId(req.id);
    setActionError(null);
    try {
      const res = await fetch(`${sealApiBase}/api/audit-requests/${encodeURIComponent(req.id)}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorPrivateKey: pk }),
      });
      const j = await parseApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(j.error || res.statusText);
      setRevealPk((prev) => ({ ...prev, [req.id]: "" }));
      await load();
      setPanelRequestId(req.id);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-6">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Audit requests inbox</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="border border-[#05058a]/25 bg-white px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#05058a] hover:bg-[#f5f5f0]"
            >
              Refresh
            </button>
            {loading ? <span className="text-xs text-[#05058a]/55">Loading…</span> : null}
          </div>

          {!isConnected || !address ? (
            <p className="mt-4 text-sm text-amber-900">Connect the operator wallet (agent owner) to see requests for your agents.</p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}
          {actionError ? <p className="mt-3 text-sm text-rose-800">{actionError}</p> : null}

          <div className="mt-5 grid gap-3">
            {requests.length === 0 && address && !loading ? (
              <p className="text-sm text-[#05058a]/65">No pending or completed requests for this wallet.</p>
            ) : null}
            {requests.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setPanelRequestId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPanelRequestId(r.id);
                  }
                }}
                className={`cursor-pointer border px-4 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#05058a]/40 ${
                  panelRequestId === r.id
                    ? "border-[#05058a] bg-[#eef0ff]"
                    : "border-[#05058a]/15 bg-[#f5f5f0] hover:border-[#05058a]/35"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] text-[#2020e8]">{r.id}</p>
                    <p className="mt-2 text-sm font-black tracking-[-0.01em] text-[#05058a]">
                      Agent <span className="font-mono text-xs">{shortHex(r.agentIdBytes32, 14)}</span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                      Auditor: <span className="font-mono">{shortHex(r.auditorAddress, 8)}</span> · {r.scope}
                    </p>
                    {r.note ? <p className="mt-2 text-sm text-[#05058a]/70">{r.note}</p> : null}
                    <p className="mt-2 font-mono text-xs text-[#05058a]/60">{r.createdAt}</p>
                    {r.status === "revealed" ? (
                      <p className="mt-2 text-[11px] text-[#05058a]/55">Plaintext is in Reveal view →</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                        r.status === "revealed" ? "ok" : r.status === "denied" ? "bad" : "warn",
                      )}`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>

                {r.status === "pending" ? (
                  <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void revealWithWallet(r)}
                        className="w-full bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === r.id ? "Working…" : "Decrypt & reveal to auditor"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void deny(r)}
                        className="w-full border border-[#05058a]/20 bg-white px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-[#f5f5f0] disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                    <details className="border border-[#05058a]/15 bg-white px-3 py-2 text-xs text-[#05058a]/80">
                      <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.18em] text-[#05058a]/60">
                        Advanced: reveal via server (private key)
                      </summary>
                      <p className="mt-2 text-[11px] leading-relaxed text-[#05058a]/65">
                        Sends the key to the API for Lit SIWE — use only on trusted networks.
                      </p>
                      <label className="mt-2 block text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Operator private key</label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={revealPk[r.id] ?? ""}
                        onChange={(e) => setRevealPk((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="0x…"
                        className="mt-1 w-full border border-[#05058a]/30 bg-white px-3 py-2 font-mono text-[11px] text-[#05058a] outline-none focus:border-[#05058a]"
                      />
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void revealWithPrivateKey(r)}
                        className="mt-2 w-full border border-[#05058a]/25 bg-[#f5f5f0] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#05058a] hover:bg-white disabled:opacity-50"
                      >
                        Reveal via API
                      </button>
                    </details>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lg:col-span-6">
        <div className="flex h-full min-h-[320px] flex-col border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Reveal view</p>
          <p className="mt-1 text-xs text-[#05058a]/55">Operator monitor context · {props.selectedActionLabel}</p>

          {!panelRequest ? (
            <p className="mt-6 text-sm text-[#05058a]/65">Select an audit request from the inbox.</p>
          ) : (
            <>
              <div className="mt-4 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#05058a]/50">Request</p>
                <p className="mt-2 font-mono text-xs text-[#2020e8]">{shortHex(panelRequest.id, 20)}</p>
                <p className="mt-2 text-sm text-[#05058a]/80">
                  Agent <span className="font-mono text-xs">{shortHex(panelRequest.agentIdBytes32, 12)}</span>
                  {" · "}
                  <span
                    className={`inline-flex border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] ${pillTone(
                      panelRequest.status === "revealed" ? "ok" : panelRequest.status === "denied" ? "bad" : "warn",
                    )}`}
                  >
                    {panelRequest.status}
                  </span>
                </p>
                {panelRequest.revealedAt ? (
                  <p className="mt-2 font-mono text-[10px] text-[#05058a]/55">Revealed {panelRequest.revealedAt}</p>
                ) : null}
                {panelRequest.denyAt ? (
                  <p className="mt-2 font-mono text-[10px] text-[#05058a]/55">Denied {panelRequest.denyAt}</p>
                ) : null}
              </div>

              <div className="mt-4 min-h-0 flex-1">
                {busyId === panelRequest.id ? (
                  <p className="text-sm text-[#05058a]/70">Decrypting and submitting… approve wallet prompts if asked.</p>
                ) : null}
                {panelRequest.status === "revealed" && panelRequest.revealedPlaintext ? (
                  <pre className="max-h-[min(60vh,480px)] overflow-auto border border-[#05058a]/15 bg-[#fafaf8] p-4 text-[11px] leading-relaxed text-[#05058a]/90">
                    {panelRequest.revealedPlaintext}
                  </pre>
                ) : null}
                {panelRequest.status === "pending" && busyId !== panelRequest.id ? (
                  <p className="rounded border border-dashed border-[#05058a]/25 bg-white px-4 py-8 text-center text-sm text-[#05058a]/60">
                    No plaintext yet. Use <strong>Decrypt &amp; reveal</strong> on this row in the inbox.
                  </p>
                ) : null}
                {panelRequest.status === "denied" ? (
                  <p className="text-sm text-[#05058a]/65">This request was denied. There is no reveal payload.</p>
                ) : null}
              </div>
            </>
          )}

          <details className="mt-6 border-t border-[#05058a]/10 pt-5">
            <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.2em] text-[#05058a]/55">
              Manual selective reveal (CID + Lit fields)
            </summary>
            <p className="mt-3 text-xs text-[#05058a]/60">
              Paste gateway CID and Lit fields to call <span className="font-mono">/api/reveal</span> — independent of the inbox.
            </p>
            <div className="mt-4">
              <SelectiveRevealPanel />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
