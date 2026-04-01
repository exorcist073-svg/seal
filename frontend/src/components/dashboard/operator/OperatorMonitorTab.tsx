"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { parseApiJson } from "@/lib/api-json";
import { expectedChain, sealApiBase, sealContractAddress, sealApiLabel } from "@/lib/wagmi-config";
import { sealAbi } from "@/lib/seal-abi";
import { computeAgentIdBytes32 } from "@/lib/agent-id";
import type { OperatorAgentRegistration } from "@/lib/operator-agent";
import { isAddress, type Address } from "viem";

type Tone = "neutral" | "ok" | "warn" | "bad";

type AgentApiTask = {
  taskId: string;
  committed: boolean;
  executed: boolean;
  merkleRoot: string;
  nonce: number;
  timestamp: number;
  submitter: string;
  executionHash: string;
};

type AgentApiSummary = {
  agentId: string;
  registered: boolean;
  nonce: number;
  stakeEth: string;
  slashed: boolean;
  agentOwner: string;
  tasks: AgentApiTask[];
};

function pillTone(v: Tone) {
  return v === "ok"
    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
    : v === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : v === "bad"
        ? "border-rose-300 bg-rose-50 text-rose-950"
        : "border-[#05058a]/15 bg-[#f5f5f0] text-[#05058a]/70";
}

function shortHex(hex: string, n = 10) {
  if (!hex || hex.length < n + 4) return hex;
  return `${hex.slice(0, n)}…${hex.slice(-6)}`;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7V5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2M8 7h8a2 2 0 012 2v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PIPELINE_SYSTEM_PROMPT = `You are a SEAL agent. Respond with ONLY valid JSON (no markdown):
{"reasoning":"Brief reason for this run.","executionPlan":{"action":"demo","target":"0x0000000000000000000000000000000000000000","value":"0","calldata":"0x","gasLimit":21000}}`;

export function OperatorMonitorTab(props: {
  registeredAgent: OperatorAgentRegistration | null;
  /** When the wizard did not run in this browser (e.g. CLI register), load agent id from wallet + runtime hash. */
  onLoadAgent?: (reg: OperatorAgentRegistration) => void;
  selectedActionId: string;
  onSelectActionId: (id: string) => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: expectedChain.id });
  const [manualRuntime, setManualRuntime] = useState("0x78b1f08cb045792f");
  const [pastedAgentId, setPastedAgentId] = useState("");
  const [summary, setSummary] = useState<AgentApiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineLastTx, setPipelineLastTx] = useState<{ commit: string; execute: string } | null>(null);
  /** Set after a successful prepare+chain run: whether backend sealed reasoning (Storacha + Lit). */
  const [pipelineSealHint, setPipelineSealHint] = useState<{ sealed: boolean; cid?: string } | null>(null);
  const [copiedAgentId, setCopiedAgentId] = useState(false);
  const [regAgents, setRegAgents] = useState<{ list: string[]; err: string | null } | null>(null);
  const [copiedRegId, setCopiedRegId] = useState<string | null>(null);
  const didInitSelection = useRef(false);

  useEffect(() => {
    didInitSelection.current = false;
  }, [props.registeredAgent?.agentIdBytes32]);

  useEffect(() => {
    if (!props.registeredAgent?.agentIdBytes32) {
      setSummary(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const id = encodeURIComponent(props.registeredAgent.agentIdBytes32);
    fetch(`${sealApiBase}/api/agents/${id}`)
      .then(async (r) => {
        const j = await parseApiJson<AgentApiSummary & { error?: string }>(r);
        if (!r.ok) throw new Error(j.error || r.statusText || "fetch failed");
        return j as AgentApiSummary;
      })
      .then((j) => {
        if (cancelled) return;
        setSummary(j);
        if (j.tasks?.length && !didInitSelection.current) {
          didInitSelection.current = true;
          props.onSelectActionId(String(j.tasks[0].taskId));
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.registeredAgent?.agentIdBytes32, refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${sealApiBase}/api/chain/registered-agents`)
      .then(async (r) => {
        const j = await parseApiJson<{ agents?: string[]; error?: string }>(r);
        if (!r.ok) throw new Error(j.error || r.statusText);
        return j;
      })
      .then((j) => {
        if (!cancelled) setRegAgents({ list: j.agents ?? [], err: null });
      })
      .catch((e: Error) => {
        if (!cancelled) setRegAgents({ list: [], err: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  const copyRegId = useCallback(async (full: string) => {
    try {
      await navigator.clipboard.writeText(full);
      setCopiedRegId(full);
      window.setTimeout(() => setCopiedRegId(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const ownerWalletMismatch = useMemo(() => {
    if (!summary || !address) return false;
    return summary.agentOwner.toLowerCase() !== address.toLowerCase();
  }, [summary, address]);

  const copyFullAgentId = useCallback(async (fullId: string) => {
    try {
      await navigator.clipboard.writeText(fullId);
      setCopiedAgentId(true);
      window.setTimeout(() => setCopiedAgentId(false), 2000);
    } catch {
      // Clipboard may be blocked (non-HTTPS or permission); no toast — user can select text manually.
    }
  }, []);

  const runPipelineWithWallet = useCallback(async () => {
    const reg = props.registeredAgent;
    if (!reg?.agentIdBytes32) return;
    if (!isAddress(sealContractAddress) || sealContractAddress === "0x0000000000000000000000000000000000000000") {
      setPipelineError("Set NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS in frontend/.env.");
      return;
    }
    if (!address) {
      setPipelineError("Connect the wallet that registered this agent (on-chain owner).");
      return;
    }
    if (summary && summary.agentOwner.toLowerCase() !== address.toLowerCase()) {
      setPipelineError("Switch to the agent owner wallet — the connected address must match on-chain owner.");
      return;
    }
    setPipelineRunning(true);
    setPipelineError(null);
    setPipelineLastTx(null);
    setPipelineSealHint(null);
    try {
      if (chainId !== expectedChain.id) {
        await switchChainAsync?.({ chainId: expectedChain.id });
      }

      const res = await fetch(`${sealApiBase}/api/pipeline-prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            taskId: `dashboard-${Date.now()}`,
            agentId: "seal-dashboard",
            nonce: 1,
            onChainState: { trigger: "operator-dashboard" },
            externalData: { note: "Run pipeline (wallet)" },
            timestamp: Date.now(),
          },
          systemPrompt: PIPELINE_SYSTEM_PROMPT,
          authorizedAddress: address,
          agentIdBytes32: reg.agentIdBytes32,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        sealed?: {
          cid: string;
          url?: string;
          iv: string;
          encryptedKey: { ciphertext: string; dataToEncryptHash: string };
        } | null;
        onChainPrepared?: {
          agentId: `0x${string}`;
          submitCommitment: {
            taskId: `0x${string}`;
            merkleRoot: `0x${string}`;
            attestationQuote: `0x${string}`;
            nonce: number;
            timestamp: number;
          };
          executeTask: {
            taskId: `0x${string}`;
            txData: `0x${string}`;
            executionHash: `0x${string}`;
            signature: `0x${string}`;
          };
        };
      };
      if (!res.ok) throw new Error(j.error || res.statusText || "Prepare failed");
      const prep = j.onChainPrepared;
      if (!prep) throw new Error("Invalid prepare response");

      const sc = prep.submitCommitment;
      const ex = prep.executeTask;

      const hash1 = await writeContractAsync({
        address: sealContractAddress,
        abi: sealAbi,
        functionName: "submitCommitment",
        args: [
          sc.taskId,
          sc.merkleRoot,
          sc.attestationQuote,
          BigInt(sc.nonce),
          BigInt(sc.timestamp),
          prep.agentId,
        ],
        chainId: expectedChain.id,
      });

      await publicClient!.waitForTransactionReceipt({ hash: hash1 });

      const hash2 = await writeContractAsync({
        address: sealContractAddress,
        abi: sealAbi,
        functionName: "executeTask",
        args: [ex.taskId, ex.txData, ex.executionHash, ex.signature],
        chainId: expectedChain.id,
      });

      await publicClient!.waitForTransactionReceipt({ hash: hash2 });

      setPipelineLastTx({ commit: hash1, execute: hash2 });
      if (j.sealed?.cid) {
        setPipelineSealHint({ sealed: true, cid: j.sealed.cid });
      } else {
        setPipelineSealHint({ sealed: false });
      }
      setRefreshNonce((n) => n + 1);
    } catch (e: unknown) {
      setPipelineError(e instanceof Error ? e.message : String(e));
    } finally {
      setPipelineRunning(false);
    }
  }, [
    props.registeredAgent,
    address,
    summary,
    chainId,
    sealApiBase,
    writeContractAsync,
    publicClient,
    switchChainAsync,
  ]);

  const selected = useMemo(() => {
    if (!summary?.tasks?.length) return null;
    return summary.tasks.find((t) => String(t.taskId) === props.selectedActionId) ?? summary.tasks[0];
  }, [summary, props.selectedActionId]);

  if (!props.registeredAgent) {
    return (
      <div className="border border-[#05058a]/15 bg-white p-6">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Agents monitor</p>
        <p className="mt-3 text-sm text-[#05058a]/70">
          No agent saved in this browser yet. Either complete <span className="font-semibold">Register agent</span>, or
          load the same wallet + runtime hash you used on-chain (e.g. after a CLI pipeline).
        </p>
        <div className="mt-5 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Load from chain identity</p>
          <p className="mt-2 text-xs text-[#05058a]/65">
            Connect the <span className="font-semibold">same</span> wallet that called <span className="font-mono">registerAgent</span>, then paste the
            exact runtime hash string from step 3.
          </p>
          <label className="mt-3 block text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Runtime hash</label>
          <input
            value={manualRuntime}
            onChange={(e) => setManualRuntime(e.target.value)}
            className="mt-2 w-full border border-[#05058a]/30 bg-white px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
            placeholder="same string as registration / pipeline"
          />
          <button
            type="button"
            disabled={!isConnected || !address || manualRuntime.trim().length < 8}
            onClick={() => {
              if (!address || !props.onLoadAgent) return;
              const rh = manualRuntime.trim();
              const agentIdBytes32 = computeAgentIdBytes32(address as Address, rh);
              props.onLoadAgent({
                agentIdBytes32,
                runtimeHash: rh,
                stakeEth: "0",
                agentProfile: "treasury",
                registeredAt: Date.now(),
              });
            }}
            className="mt-4 w-full bg-[#05058a] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Load agent into this browser
          </button>
          {!isConnected ? (
            <p className="mt-2 text-xs text-amber-900">Connect your wallet first (header).</p>
          ) : null}
        </div>

        <div className="mt-6 border border-[#05058a]/15 bg-white p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Or paste agent id (bytes32)</p>
          <p className="mt-2 text-xs leading-relaxed text-[#05058a]/65">
            If you registered or ran <span className="font-mono">npm run pipeline:onchain</span> with the backend signer, the dashboard may compute a{" "}
            <span className="font-semibold">different</span> agent id than your connected MetaMask address. Paste the full{" "}
            <span className="font-mono">0x…</span> (66 chars) printed at the end of the pipeline script, or from step 6 of the wizard.
          </p>
          <input
            value={pastedAgentId}
            onChange={(e) => setPastedAgentId(e.target.value.trim())}
            className="mt-3 w-full border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 font-mono text-[11px] text-[#05058a] outline-none focus:border-[#05058a]"
            placeholder="0x + 64 hex characters"
          />
          <button
            type="button"
            disabled={!/^0x[a-fA-F0-9]{64}$/.test(pastedAgentId)}
            onClick={() => {
              if (!props.onLoadAgent || !/^0x[a-fA-F0-9]{64}$/.test(pastedAgentId)) return;
              props.onLoadAgent({
                agentIdBytes32: pastedAgentId as `0x${string}`,
                runtimeHash: manualRuntime.trim(),
                stakeEth: "0",
                agentProfile: "treasury",
                registeredAt: Date.now(),
              });
            }}
            className="mt-3 w-full border border-[#05058a]/30 bg-white px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-[#f5f5f0] disabled:opacity-40"
          >
            Load with pasted agent id
          </button>
        </div>

        <p className="mt-4 text-xs text-[#05058a]/55">
          Backend API: <span className="font-mono">{sealApiLabel}</span> — restart <span className="font-mono">next dev</span> after changing env.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-5">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Agents monitor</p>

          {regAgents?.err ? (
            <p className="mt-3 text-xs text-amber-900">
              Could not load registered agents: {regAgents.err}
              {regAgents.err === "Not Found" || regAgents.err.includes("404") ? (
                <>
                  {" "}
                  Check <span className="font-mono">NEXT_PUBLIC_SEAL_API_URL</span> matches the backend port (default{" "}
                  <span className="font-mono">3001</span>), or leave it unset so Next proxies to{" "}
                  <span className="font-mono">SEAL_API_PROXY_TARGET</span>.
                </>
              ) : (
                <>
                  {" "}
                  (backend needs <span className="font-mono">CONTRACT_ADDRESS</span> + <span className="font-mono">RPC_URL</span>.)
                </>
              )}
            </p>
          ) : null}
          {regAgents && !regAgents.err && regAgents.list.length > 0 ? (
            <div className="mt-4 border border-[#05058a]/15 bg-[#f5f5f0] p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Registered on this contract ({regAgents.list.length})</p>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                {regAgents.list.map((id) => (
                  <li key={id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-[#05058a]">{shortHex(id, 14)}</span>
                    <button
                      type="button"
                      onClick={() => void copyRegId(id)}
                      title="Copy full agent id"
                      aria-label="Copy full agent id"
                      className="inline-flex shrink-0 items-center justify-center rounded border border-[#05058a]/25 bg-white p-1 text-[#05058a] hover:bg-white"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                    </button>
                    {copiedRegId === id ? <span className="text-[10px] uppercase tracking-[0.15em] text-emerald-700">Copied</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : regAgents && !regAgents.err && regAgents.list.length === 0 ? (
            <p className="mt-3 text-xs text-[#05058a]/55">No agents registered on-chain for this deployment yet.</p>
          ) : null}

          {loading ? <p className="mt-4 text-sm text-[#05058a]/70">Loading…</p> : null}
          {error ? (
            <p className="mt-4 text-sm text-rose-800">
              {error} — is the backend running with <span className="font-mono">CONTRACT_ADDRESS</span> +{" "}
              <span className="font-mono">RPC_URL</span>?
            </p>
          ) : null}

          {!loading && summary && (
            <div className="mt-5 grid gap-4">
              <div
                data-oci-cursor="on-dark"
                className="border border-white/10 bg-[#05058a] px-4 py-4 text-white"
              >
                {summary.slashed ? (
                  <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-950">
                    Agent is slashed on-chain.
                  </div>
                ) : null}

                {!summary.registered ? (
                  <div className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Not registered on the contract the backend reads ({expectedChain.name}). Align{" "}
                    <span className="font-mono">CONTRACT_ADDRESS</span> (backend) with{" "}
                    <span className="font-mono">NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS</span> (this app), confirm the same
                    wallet + runtime hash as <span className="font-mono">registerAgent</span>, or paste the bytes32 from
                    your pipeline output.
                  </div>
                ) : null}

                {summary.registered && address && summary.agentOwner.toLowerCase() !== address.toLowerCase() ? (
                  <div className="mb-4 border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                    Connected wallet is not the on-chain owner; you can still view this agent&apos;s tasks. Owner:{" "}
                    <span className="font-mono">{shortHex(summary.agentOwner, 8)}</span>
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/80">
                        {shortHex(summary.agentId, 12)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyFullAgentId(summary.agentId)}
                        title="Copy full agent id (bytes32)"
                        aria-label="Copy full agent id"
                        className="inline-flex shrink-0 items-center justify-center rounded border border-white/25 bg-white/10 p-1.5 text-white/90 transition-colors hover:bg-white/20"
                      >
                        <CopyIcon />
                      </button>
                      {copiedAgentId ? (
                        <span className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Copied</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-white/75">
                      owner: <span className="font-mono">{shortHex(summary.agentOwner, 8)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                        summary.registered && !summary.slashed ? "ok" : "bad"
                      )}`}
                    >
                      {summary.registered ? "registered" : "not registered"}
                    </span>
                    {summary.registered && !summary.slashed ? (
                      <button
                        type="button"
                        disabled={pipelineRunning || !address || ownerWalletMismatch}
                        title={
                          ownerWalletMismatch
                            ? "Connect the on-chain owner wallet"
                            : pipelineRunning
                              ? "Running…"
                              : "Run pipeline"
                        }
                        onClick={() => void runPipelineWithWallet()}
                        className="shrink-0 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#05058a] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {pipelineRunning ? "…" : "Run"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">Stake</p>
                    <p className="mt-2 font-mono text-sm text-white">{summary.stakeEth} ETH</p>
                  </div>
                  <div className="border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">Nonce</p>
                    <p className="mt-2 font-mono text-sm text-white">{summary.nonce}</p>
                  </div>
                </div>

                {summary.registered && !summary.slashed ? (
                  <>
                    {pipelineError ? (
                      <p className="mt-3 text-xs leading-relaxed text-rose-200">{pipelineError}</p>
                    ) : null}
                    {pipelineLastTx ? (
                      <div className="mt-3 space-y-1 text-[11px] text-white/85">
                        <p>
                          Commit:{" "}
                          {expectedChain.blockExplorers?.default?.url ? (
                            <a
                              href={`${expectedChain.blockExplorers.default.url}/tx/${pipelineLastTx.commit}`}
                              className="font-mono text-sky-200 underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortHex(pipelineLastTx.commit, 12)}
                            </a>
                          ) : (
                            <span className="font-mono">{shortHex(pipelineLastTx.commit, 12)}</span>
                          )}
                        </p>
                        <p>
                          Execute:{" "}
                          {expectedChain.blockExplorers?.default?.url ? (
                            <a
                              href={`${expectedChain.blockExplorers.default.url}/tx/${pipelineLastTx.execute}`}
                              className="font-mono text-sky-200 underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortHex(pipelineLastTx.execute, 12)}
                            </a>
                          ) : (
                            <span className="font-mono">{shortHex(pipelineLastTx.execute, 12)}</span>
                          )}
                        </p>
                      </div>
                    ) : null}
                    {pipelineSealHint ? (
                      <div
                        className={`mt-3 border px-3 py-2 text-[11px] leading-relaxed ${
                          pipelineSealHint.sealed
                            ? "border-emerald-400/40 bg-emerald-950/30 text-emerald-100"
                            : "border-amber-300/40 bg-amber-950/20 text-amber-100"
                        }`}
                      >
                        {pipelineSealHint.sealed && pipelineSealHint.cid ? (
                          <>
                            <span className="font-semibold">Sealed for audit:</span> reasoning encrypted and pinned (CID{" "}
                            <span className="font-mono">{shortHex(pipelineSealHint.cid, 14)}</span>). Lit key is for the
                            wallet you had connected when you clicked Run (same as <span className="font-mono">authorizedAddress</span> on the server). Use{" "}
                            <strong>Audit</strong> → <strong>Decrypt &amp; reveal</strong> when an auditor requests access.
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">No sealed blob this run:</span> on-chain commit/execute still
                            succeeded. Configure the backend with Storacha + Lit so <span className="font-mono">sealBlob</span> can
                            return a CID; otherwise audit reveal has nothing stored for this agent.
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          )}

        </div>
      </section>

      <section className="lg:col-span-7">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Action explorer</p>
          <p className="mt-2 text-sm text-[#05058a]/70">Tasks recorded for this agent (on-chain).</p>

          <div className="mt-5 overflow-x-auto border border-[#05058a]/15">
            <table className="w-full min-w-[640px] bg-white text-left text-xs">
              <thead className="bg-[#f5f5f0]">
                <tr className="[&>th]:border-b [&>th]:border-[#05058a]/15 [&>th]:px-3 [&>th]:py-3 [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-[0.18em] [&>th]:text-[#05058a]/65">
                  <th>Task (bytes32)</th>
                  <th>Committed</th>
                  <th>Executed</th>
                  <th>Merkle root</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-[#05058a]/10 [&>tr>td]:px-3 [&>tr>td]:py-3">
                {summary?.tasks?.length ? (
                  summary.tasks.map((a) => (
                    <tr
                      key={a.taskId}
                      className={`cursor-pointer ${String(a.taskId) === props.selectedActionId ? "bg-[#f5f5f0]" : "hover:bg-[#f5f5f0]"}`}
                      onClick={() => props.onSelectActionId(String(a.taskId))}
                    >
                      <td className="font-mono text-[#2020e8]">{shortHex(a.taskId, 12)}</td>
                      <td>
                        <span
                          className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                            a.committed ? "ok" : "neutral"
                          )}`}
                        >
                          {a.committed ? "yes" : "no"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                            a.executed ? "ok" : "warn"
                          )}`}
                        >
                          {a.executed ? "yes" : "pending"}
                        </span>
                      </td>
                      <td className="font-mono text-[#05058a]">{shortHex(a.merkleRoot, 10)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-[#05058a]/60">
                      {loading
                        ? "…"
                        : "No tasks yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#05058a]/55">Selected task</p>
            {!selected ? (
              <p className="mt-2 text-sm text-[#05058a]/70">None selected.</p>
            ) : (
              <p className="mt-2 text-sm text-[#05058a]/70">
                <span className="font-mono">{shortHex(String(selected.taskId), 16)}</span> · executed{" "}
                <span className="font-mono">{selected.executed ? "yes" : "no"}</span>
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
