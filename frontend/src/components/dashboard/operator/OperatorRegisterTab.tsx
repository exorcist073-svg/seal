"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatEther, isAddress, parseEther } from "viem";
import { sealAbi } from "@/lib/seal-abi";
import { computeAgentIdBytes32 } from "@/lib/agent-id";
import { expectedChain, sealContractAddress } from "@/lib/wagmi-config";
import type { OperatorAgentRegistration } from "@/lib/operator-agent";
import { saveOperatorAgent } from "@/lib/operator-agent";

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

type AgentProfileOption = {
  id: "treasury" | "worker" | "hiring" | "custom";
  label: string;
  available: boolean;
};

const AGENT_PROFILE_OPTIONS: AgentProfileOption[] = [
  { id: "treasury", label: "Treasury Manager", available: true },
  { id: "worker", label: "Worker agent", available: false },
  { id: "hiring", label: "Hiring agent", available: false },
  { id: "custom", label: "Custom", available: false },
];

export function OperatorRegisterTab({
  onRegistered,
}: {
  onRegistered?: (reg: OperatorAgentRegistration) => void;
}) {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [agentProfile, setAgentProfile] = useState<AgentProfileOption["id"]>("treasury");
  const [runtimeHash, setRuntimeHash] = useState("");
  const [stakeEth, setStakeEth] = useState("0.001");
  const [revealAllowlist, setRevealAllowlist] = useState("0x…");

  const revealList = useMemo(
    () =>
      revealAllowlist
        .split(/[\n,]+/g)
        .map((s) => s.trim())
        .filter(Boolean),
    [revealAllowlist]
  );

  const contractAddr =
    isAddress(sealContractAddress) && sealContractAddress !== "0x0000000000000000000000000000000000000000"
      ? sealContractAddress
      : undefined;
  const wrongChain = isConnected && chainId !== expectedChain.id;

  // Read min stake on the deployment chain (Sepolia), not whatever chain the wallet is on — otherwise minStake stays undefined and the button never enables.
  const {
    data: minStakeWei,
    isPending: minStakePending,
    isError: minStakeReadError,
    error: minStakeReadErr,
  } = useReadContract({
    address: contractAddr,
    abi: sealAbi,
    functionName: "minStake",
    chainId: expectedChain.id,
    query: { enabled: Boolean(contractAddr) },
  });

  const agentIdBytes32 = useMemo(() => {
    if (!address || runtimeHash.trim().length < 12) return null;
    return computeAgentIdBytes32(address, runtimeHash);
  }, [address, runtimeHash]);

  const stakeWei = useMemo(() => {
    try {
      return parseEther(stakeEth || "0");
    } catch {
      return BigInt(0);
    }
  }, [stakeEth]);

  const stakeMeetsMin =
    minStakeWei !== undefined && stakeWei >= minStakeWei && stakeWei > BigInt(0);

  const registerBlockers = useMemo(() => {
    const lines: string[] = [];
    if (!isConnected) lines.push("Connect your wallet (step 1).");
    if (!contractAddr) {
      lines.push(
        "Set NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS in frontend/.env to your deployed SEAL proxy (not 0x0)."
      );
    }
    if (!agentIdBytes32) {
      lines.push("Go back to step 3: runtime hash must be at least 12 characters.");
    }
    if (contractAddr && minStakePending) lines.push("Reading min stake from the contract…");
    if (contractAddr && minStakeReadError && minStakeReadErr) {
      lines.push(
        `Could not read contract on ${expectedChain.name} (wrong address or not a SEAL contract). ${minStakeReadErr.message?.slice(0, 120) ?? ""}`
      );
    }
    if (contractAddr && minStakeWei !== undefined && !stakeMeetsMin) {
      lines.push(`Stake in step 4 must be at least ${formatEther(minStakeWei)} ETH.`);
    }
    if (wrongChain) {
      lines.push(`Switch the wallet to ${expectedChain.name} (chain id ${expectedChain.id}).`);
    }
    return lines;
  }, [
    isConnected,
    contractAddr,
    agentIdBytes32,
    minStakePending,
    minStakeReadError,
    minStakeReadErr,
    minStakeWei,
    stakeMeetsMin,
    wrongChain,
  ]);

  const { writeContract, data: regTxHash, isPending: isRegisterPending, error: registerError } =
    useWriteContract();

  const { isLoading: isConfirming, isSuccess: registerSuccess } = useWaitForTransactionReceipt({
    hash: regTxHash,
  });

  const handleRegister = useCallback(() => {
    if (!agentIdBytes32 || !contractAddr || !stakeMeetsMin || wrongChain) return;
    writeContract({
      address: contractAddr,
      abi: sealAbi,
      functionName: "registerAgent",
      args: [agentIdBytes32],
      value: stakeWei,
    });
  }, [agentIdBytes32, contractAddr, stakeMeetsMin, stakeWei, wrongChain, writeContract]);

  const onRegisteredRef = useRef(onRegistered);
  onRegisteredRef.current = onRegistered;
  const registerNotifiedTxRef = useRef<string | null>(null);

  useEffect(() => {
    if (!registerSuccess || !regTxHash || !agentIdBytes32 || !address) return;
    if (registerNotifiedTxRef.current === regTxHash) return;
    registerNotifiedTxRef.current = regTxHash;
    const reg: OperatorAgentRegistration = {
      agentIdBytes32,
      runtimeHash,
      stakeEth,
      registerTxHash: regTxHash,
      agentProfile,
      registeredAt: Date.now(),
    };
    saveOperatorAgent(reg);
    onRegisteredRef.current?.(reg);
  }, [
    registerSuccess,
    regTxHash,
    agentIdBytes32,
    address,
    runtimeHash,
    stakeEth,
    agentProfile,
  ]);

  const explorerBase = expectedChain.blockExplorers?.default?.url;

  const canNextStep1 = isConnected;
  const canNextStep2 = true;
  const canNextStep3 = runtimeHash.trim().length >= 12;
  const canNextStep4 = Number(stakeEth) > 0;
  const canNextStep5 = revealList.length > 0;

  const next = () => setWizardStep((s) => (s < 6 ? ((s + 1) as typeof s) : s));
  const back = () => setWizardStep((s) => (s > 1 ? ((s - 1) as typeof s) : s));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-12">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Register agent
          </p>
          <div className="mt-5 flex w-full gap-2">
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWizardStep(n)}
                className={`min-w-0 flex-1 border px-2 py-2.5 text-center text-[10px] uppercase tracking-[0.14em] sm:text-[11px] sm:tracking-[0.18em] ${
                  wizardStep === n
                    ? "border-[#05058a] bg-[#05058a] text-white"
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
                  Use the same network as your deployed SEAL contract ({expectedChain.name}).
                </p>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 2 — Agent profile
                </p>
                <p className="text-xs text-[#05058a]/65">
                  Choose the agent role this registration targets. Additional profiles will unlock as they ship.
                </p>
                <div className="flex flex-wrap gap-2">
                  {AGENT_PROFILE_OPTIONS.map((opt) => {
                    const selected = agentProfile === opt.id;
                    const base =
                      "border px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] transition-colors";
                    if (!opt.available) {
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled
                          className={`${base} cursor-not-allowed border-[#05058a]/10 bg-white/60 text-[#05058a]/35`}
                        >
                          {opt.label}
                          <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[#05058a]/30">
                            Coming soon
                          </span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAgentProfile(opt.id)}
                        className={`${base} ${
                          selected
                            ? "border-[#05058a] bg-white text-[#05058a]"
                            : "border-[#05058a]/15 bg-white text-[#05058a]/70 hover:border-[#05058a]/40"
                        }`}
                      >
                        {opt.label}
                        {selected ? (
                          <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[#05058a]/55">
                            Active
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 3 — Paste TEE runtime hash
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
                <p className="text-xs leading-relaxed text-[#05058a]/65">
                  This string is hashed together with your wallet into your on-chain <span className="font-mono">agentId</span>{" "}
                  (same formula the backend uses for the pipeline). Use a <strong>stable</strong> value you can repeat later.
                </p>
                <ul className="list-inside list-disc text-xs leading-relaxed text-[#05058a]/65">
                  <li>
                    <strong>Demo / local:</strong> any fingerprint you choose, e.g.{" "}
                    <span className="font-mono">seal-demo-runtime-v1</span> or a short hex string (min. 12 characters).
                  </li>
                  <li>
                    <strong>Production TEE:</strong> paste the real runtime / image hash from your enclave build (often{" "}
                    <span className="font-mono">0x…</span>).
                  </li>
                </ul>
              </div>
            ) : null}

            {wizardStep === 4 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 4 — Stake amount + slash preview
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
                      placeholder="0.001"
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

            {wizardStep === 5 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 5 — Reveal permissions (allowlist)
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

            {wizardStep === 6 ? (
              <div className="grid gap-4">
                <p className="text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  Step 6 — Register on-chain
                </p>
                <dl className="grid gap-2 text-xs">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Network</dt>
                    <dd className="font-mono">{expectedChain.name}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">EVM</dt>
                    <dd className="font-mono">{isConnected ? "connected" : "missing"}</dd>
                  </div>
                  {wrongChain ? (
                    <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      Switch your wallet to {expectedChain.name} before registering.
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Contract</dt>
                    <dd className="break-all font-mono text-[10px]">
                      {contractAddr ? contractAddr : "Set NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Min stake (contract)</dt>
                    <dd className="font-mono">
                      {minStakePending
                        ? "loading…"
                        : minStakeWei !== undefined
                          ? `${formatEther(minStakeWei)} ETH`
                          : minStakeReadError
                            ? "read failed"
                            : "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Agent profile</dt>
                    <dd className="font-mono">
                      {AGENT_PROFILE_OPTIONS.find((o) => o.id === agentProfile)?.label ?? agentProfile}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[#05058a]/60">Agent id (bytes32)</dt>
                    <dd className="break-all font-mono text-[10px]">{agentIdBytes32 ?? "—"}</dd>
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
                    <dd className="font-mono">{revealList.length} addresses (off-chain policy for now)</dd>
                  </div>
                </dl>
                {registerBlockers.length > 0 && !registerSuccess ? (
                  <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <p className="font-semibold">Button stays disabled until these are fixed:</p>
                    <ul className="mt-1 list-inside list-disc">
                      {registerBlockers.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!stakeMeetsMin && minStakeWei !== undefined ? (
                  <p className="text-xs text-amber-900">
                    Stake must be at least {formatEther(minStakeWei)} ETH.
                  </p>
                ) : null}
                {registerError ? (
                  <p className="text-xs text-rose-800">{registerError.message}</p>
                ) : null}
                {regTxHash ? (
                  <p className="text-xs text-[#05058a]/70">
                    Tx:{" "}
                    {explorerBase ? (
                      <a
                        href={`${explorerBase}/tx/${regTxHash}`}
                        className="font-mono text-[#2020e8] underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {regTxHash}
                      </a>
                    ) : (
                      <span className="font-mono">{regTxHash}</span>
                    )}
                    {isConfirming ? " (confirming…)" : ""}
                    {registerSuccess ? " — confirmed" : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={
                    !contractAddr ||
                    !agentIdBytes32 ||
                    !stakeMeetsMin ||
                    wrongChain ||
                    isRegisterPending ||
                    isConfirming ||
                    registerSuccess
                  }
                  className="w-full bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {registerSuccess
                    ? "Registered"
                    : isRegisterPending || isConfirming
                      ? "Confirm in wallet…"
                      : "Register agent (stake)"}
                </button>
              </div>
            ) : null}
          </div>

          <div
            className={`mt-4 flex items-center gap-3 ${wizardStep === 6 ? "justify-start" : "justify-between"}`}
          >
            <button
              type="button"
              onClick={back}
              className="border border-[#05058a]/20 bg-white px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[#05058a] hover:bg-[#f5f5f0]"
              disabled={wizardStep === 1}
            >
              Back
            </button>
            {wizardStep < 6 ? (
              <button
                type="button"
                onClick={next}
                className="bg-[#05058a] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                disabled={
                  (wizardStep === 1 && !canNextStep1) ||
                  (wizardStep === 2 && !canNextStep2) ||
                  (wizardStep === 3 && !canNextStep3) ||
                  (wizardStep === 4 && !canNextStep4) ||
                  (wizardStep === 5 && !canNextStep5)
                }
              >
                Next
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

