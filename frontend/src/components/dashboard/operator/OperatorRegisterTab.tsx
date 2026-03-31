"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

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

export function OperatorRegisterTab() {
  const { isConnected, address } = useAccount();

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [runtimeHash, setRuntimeHash] = useState("");
  const [stakeEth, setStakeEth] = useState("0.25");
  const [revealAllowlist, setRevealAllowlist] = useState("0x…");

  const revealList = useMemo(
    () =>
      revealAllowlist
        .split(/[\n,]+/g)
        .map((s) => s.trim())
        .filter(Boolean),
    [revealAllowlist]
  );

  const canNextStep1 = isConnected;
  const canNextStep2 = runtimeHash.trim().length >= 12;
  const canNextStep3 = Number(stakeEth) > 0;
  const canNextStep4 = revealList.length > 0;

  const next = () => setWizardStep((s) => (s < 5 ? ((s + 1) as typeof s) : s));
  const back = () => setWizardStep((s) => (s > 1 ? ((s - 1) as typeof s) : s));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-12">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Register agent
          </p>
          <p className="mt-2 text-sm text-[#05058a]/70">
            Five-step wizard. Both wallets required (agent spans EVM + NEAR).
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWizardStep(n)}
                className={`border px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                  wizardStep === n
                    ? "border-[#05058a] bg-white text-[#05058a]"
                    : "border-[#05058a]/15 bg-[#f5f5f0] text-[#05058a]/70 hover:bg-white"
                }`}
              >
                Step {n}
              </button>
            ))}
          </div>

          <div className="mt-6 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
            {wizardStep === 1 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 1 — Connect EVM wallet
                </p>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-4 border border-[#05058a]/15 bg-white px-4 py-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                        EVM wallet
                      </p>
                      <p className="mt-2 font-mono text-sm text-[#05058a]">
                        {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "not connected"}
                      </p>
                    </div>
                    <div className="hidden md:block">
                      <ConnectButton chainStatus="icon" showBalance={false} />
                    </div>
                    <div className="md:hidden">
                      <span
                        className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                          isConnected ? "ok" : "warn"
                        )}`}
                      >
                        {isConnected ? "ready" : "todo"}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-[#05058a]/65">
                  NEAR wallet connect will be added next (agent spans EVM + NEAR).
                </p>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 2 — Paste TEE runtime hash
                </p>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                    Runtime hash
                  </p>
                  <input
                    value={runtimeHash}
                    onChange={(e) => setRuntimeHash(e.target.value)}
                    className="mt-2 w-full border border-[#05058a]/30 bg-white px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                    placeholder="0x… (from enclave build)"
                  />
                </div>
                <p className="text-xs text-[#05058a]/65">
                  This binds the staked agent identity to a specific enclave runtime.
                </p>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 3 — Stake amount + slash preview
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                      Stake (ETH)
                    </p>
                    <input
                      value={stakeEth}
                      onChange={(e) => setStakeEth(e.target.value)}
                      className="mt-2 w-full border border-[#05058a]/30 bg-white px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                      placeholder="0.25"
                    />
                  </div>
                  <div className="border border-[#05058a]/15 bg-white px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                      Plain-language preview
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                      If an action’s commitment doesn’t match execution, stake can be automatically slashed. This is enforced by the contract.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {wizardStep === 4 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 4 — Reveal permissions (allowlist)
                </p>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                    Addresses allowed to request reveals
                  </p>
                  <textarea
                    value={revealAllowlist}
                    onChange={(e) => setRevealAllowlist(e.target.value)}
                    className="mt-2 min-h-[120px] w-full resize-y border border-[#05058a]/30 bg-white px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                    placeholder="One address per line (multisig ok)"
                  />
                </div>
                <div className="border border-[#05058a]/15 bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                    Preview
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-[#05058a]/70">
                    {revealList.slice(0, 6).map((a) => (
                      <li key={a} className="font-mono">
                        {a}
                      </li>
                    ))}
                    {revealList.length > 6 ? (
                      <li className="text-[#05058a]/55">…and {revealList.length - 6} more</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            ) : null}

            {wizardStep === 5 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 5 — Confirm and deploy
                </p>
                <dl className="grid gap-2 text-xs">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">EVM</dt>
                    <dd className="font-mono">{isConnected ? "connected" : "missing"}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Runtime hash</dt>
                    <dd className="font-mono">{runtimeHash ? runtimeHash : "—"}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Stake</dt>
                    <dd className="font-mono">{stakeEth} ETH</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Reveal allowlist</dt>
                    <dd className="font-mono">{revealList.length} addresses</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="w-full bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
                >
                  confirm and deploy (coming soon)
                </button>
                <p className="text-xs text-[#05058a]/65">
                  On deploy: agent gets an ID and stake is locked (NEAR registry + EVM contract link).
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              className="border border-[#05058a]/20 bg-white px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[#05058a] hover:bg-[#f5f5f0]"
              disabled={wizardStep === 1}
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              className="bg-[#05058a] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={
                (wizardStep === 1 && !canNextStep1) ||
                (wizardStep === 2 && !canNextStep2) ||
                (wizardStep === 3 && !canNextStep3) ||
                (wizardStep === 4 && !canNextStep4) ||
                wizardStep === 5
              }
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

