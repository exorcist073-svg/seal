"use client";

import { useMemo, useState } from "react";

type ActionStageStatus = "pending" | "confirmed" | "failed";
type Tone = "neutral" | "ok" | "warn" | "bad";

type AgentStatus = "active" | "paused" | "slashed";
type Agent = {
  id: string;
  status: AgentStatus;
  stakeEth: string;
  slashRisk: "low" | "medium" | "high";
  pipelineHealth: "ok" | "degraded" | "offline";
  nonce: number;
  lastAction: string;
  slashedByActionId?: string;
};

type ActionRow = {
  id: string;
  ts: string;
  commitmentHash: string;
  deliveryMatch: boolean;
  stages: Record<"01" | "02" | "03" | "04" | "05" | "06", ActionStageStatus>;
  revealStatus: "encrypted" | "revealed" | "pending request";
};

function stageTone(s: ActionStageStatus): Tone {
  if (s === "confirmed") return "ok";
  if (s === "failed") return "bad";
  return "neutral";
}

function pillTone(v: Tone) {
  return v === "ok"
    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
    : v === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : v === "bad"
        ? "border-rose-300 bg-rose-50 text-rose-950"
        : "border-[#05058a]/15 bg-[#f5f5f0] text-[#05058a]/70";
}

export function OperatorMonitorTab(props: {
  selectedActionId: string;
  onSelectActionId: (id: string) => void;
}) {
  const agents: Agent[] = useMemo(
    () => [
      {
        id: "AGENT-0007",
        status: "active",
        stakeEth: "0.25",
        slashRisk: "medium",
        pipelineHealth: "ok",
        nonce: 128,
        lastAction: "2026-03-31 12:04:19Z",
      },
      {
        id: "AGENT-0011",
        status: "slashed",
        stakeEth: "1.00",
        slashRisk: "high",
        pipelineHealth: "offline",
        nonce: 44,
        lastAction: "2026-03-31 10:12:02Z",
        slashedByActionId: "ACT-10290",
      },
    ],
    []
  );

  const actions: ActionRow[] = useMemo(
    () => [
      {
        id: "ACT-10291",
        ts: "2026-03-31 12:04:19Z",
        commitmentHash:
          "0x6b0c0b9f1cf4f2f06c3aa8b7a4d9e9a1b27f6f8c2c7c2e6a1e5a9d9e4bf0a011",
        deliveryMatch: true,
        stages: {
          "01": "confirmed",
          "02": "confirmed",
          "03": "confirmed",
          "04": "confirmed",
          "05": "confirmed",
          "06": "pending",
        },
        revealStatus: "encrypted",
      },
      {
        id: "ACT-10290",
        ts: "2026-03-31 11:58:03Z",
        commitmentHash:
          "0x1c8d7b0a3d3f2b6f7737b7e2a1f088c1dfced2e07a0d1f47a0a9b8b33f13c0aa",
        deliveryMatch: false,
        stages: {
          "01": "confirmed",
          "02": "confirmed",
          "03": "confirmed",
          "04": "failed",
          "05": "failed",
          "06": "pending",
        },
        revealStatus: "pending request",
      },
    ],
    []
  );

  const selected =
    actions.find((a) => a.id === props.selectedActionId) ?? actions[0] ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-5">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Agents monitor
          </p>
          <p className="mt-2 text-sm text-[#05058a]/70">
            Cards view with higher contrast.
          </p>

          <div className="mt-5 grid gap-4">
            {agents.map((a) => (
              <div
                key={a.id}
                data-oci-cursor="on-dark"
                className="border border-white/10 bg-[#05058a] px-4 py-4 text-white"
              >
                {a.status === "slashed" ? (
                  <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-950">
                    Slash event detected. Triggering action{" "}
                    <span className="font-mono">{a.slashedByActionId ?? "—"}</span>.
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/80">
                      {a.id}
                    </p>
                    <p className="mt-2 text-sm text-white/75">
                      last action: <span className="font-mono">{a.lastAction}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(a.status === "active" ? "ok" : a.status === "paused" ? "warn" : "bad")}`}>
                      {a.status}
                    </span>
                    <span className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(a.pipelineHealth === "ok" ? "ok" : a.pipelineHealth === "degraded" ? "warn" : "bad")}`}>
                      pipeline {a.pipelineHealth}
                    </span>
                    <span className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(a.slashRisk === "low" ? "ok" : a.slashRisk === "medium" ? "warn" : "bad")}`}>
                      slash risk {a.slashRisk}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                      Stake
                    </p>
                    <p className="mt-2 font-mono text-sm text-white">{a.stakeEth} ETH</p>
                  </div>
                  <div className="border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                      Nonce
                    </p>
                    <p className="mt-2 font-mono text-sm text-white">{a.nonce}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lg:col-span-7">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Action explorer
          </p>
          <p className="mt-2 text-sm text-[#05058a]/70">
            Click a row to select an action.
          </p>

          <div className="mt-5 overflow-x-auto border border-[#05058a]/15">
            <table className="w-full min-w-[760px] bg-white text-left text-xs">
              <thead className="bg-[#f5f5f0]">
                <tr className="[&>th]:border-b [&>th]:border-[#05058a]/15 [&>th]:px-3 [&>th]:py-3 [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-[0.18em] [&>th]:text-[#05058a]/65">
                  <th>Action</th>
                  <th>Timestamp</th>
                  <th>Commitment</th>
                  <th>Stages</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-[#05058a]/10 [&>tr>td]:px-3 [&>tr>td]:py-3">
                {actions.map((a) => (
                  <tr
                    key={a.id}
                    className={`cursor-pointer ${a.id === props.selectedActionId ? "bg-[#f5f5f0]" : "hover:bg-[#f5f5f0]"}`}
                    onClick={() => props.onSelectActionId(a.id)}
                  >
                    <td className="font-mono text-[#2020e8]">{a.id}</td>
                    <td className="font-mono text-[#05058a]/70">{a.ts}</td>
                    <td className="font-mono text-[#05058a]">
                      {a.commitmentHash.slice(0, 10)}…{a.commitmentHash.slice(-8)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(a.stages) as (keyof ActionRow["stages"])[]).map((k) => (
                          <span
                            key={k}
                            className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                              stageTone(a.stages[k])
                            )}`}
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(a.deliveryMatch ? "ok" : "bad")}`}>
                        {a.deliveryMatch ? "match" : "mismatch"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#05058a]/55">
              Selected action
            </p>
            {!selected ? (
              <p className="mt-2 text-sm text-[#05058a]/70">None selected.</p>
            ) : (
              <p className="mt-2 text-sm text-[#05058a]/70">
                <span className="font-mono">{selected.id}</span> · reveal{" "}
                <span className="font-mono">{selected.revealStatus}</span>
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

