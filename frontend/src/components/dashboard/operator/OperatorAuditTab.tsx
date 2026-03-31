"use client";

import { useMemo } from "react";
import { SelectiveRevealPanel } from "@/components/dashboard/SelectiveRevealPanel";

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

type AuditRequest = {
  id: string;
  auditor: string;
  reason: string;
  scope: string;
  ts: string;
  status: "pending" | "approved" | "denied";
};

export function OperatorAuditTab(props: { selectedActionLabel: string }) {
  const auditRequests: AuditRequest[] = useMemo(
    () => [
      {
        id: "REQ-0008",
        auditor: "0xA9b1…2F0c",
        reason: "Investigate suspected execution drift on recent withdrawals.",
        scope: "ACT-10288 … ACT-10291",
        ts: "2026-03-31 12:06:11Z",
        status: "pending",
      },
      {
        id: "REQ-0007",
        auditor: "0x91c0…1aB2",
        reason: "Regulatory audit sample set for Q1.",
        scope: "last 24h",
        ts: "2026-03-31 11:20:42Z",
        status: "approved",
      },
    ],
    []
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-6">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Audit requests inbox
          </p>
          <p className="mt-2 text-sm text-[#05058a]/70">
            Incoming requests from auditors (on-chain events).
          </p>

          <div className="mt-5 grid gap-3">
            {auditRequests.map((r) => (
              <div key={r.id} className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] text-[#2020e8]">{r.id}</p>
                    <p className="mt-2 text-sm font-black tracking-[-0.01em] text-[#05058a]">
                      {r.scope}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                      {r.reason}
                    </p>
                    <p className="mt-2 font-mono text-xs text-[#05058a]/60">
                      auditor: {r.auditor} · {r.ts}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${pillTone(
                        r.status === "approved" ? "ok" : r.status === "denied" ? "bad" : "warn"
                      )}`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="w-full bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
                  >
                    approve (coming soon)
                  </button>
                  <button
                    type="button"
                    className="w-full border border-[#05058a]/20 bg-white px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-[#f5f5f0]"
                  >
                    deny (coming soon)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lg:col-span-6">
        <div className="border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Reveal view
          </p>
          <p className="mt-2 text-sm text-[#05058a]/70">
            Operator can decrypt their own agent’s reasoning blob at any time. This uses the existing selective reveal tool.
          </p>

          <div className="mt-5 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#05058a]/55">
              Context
            </p>
            <p className="mt-2 text-sm text-[#05058a]/70">
              Selected action: <span className="font-mono">{props.selectedActionLabel}</span>
            </p>
          </div>

          <div className="mt-6">
            <SelectiveRevealPanel />
          </div>
        </div>
      </section>
    </div>
  );
}

