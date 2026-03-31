"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { OperatorRegisterTab } from "@/components/dashboard/operator/OperatorRegisterTab";
import { OperatorMonitorTab } from "@/components/dashboard/operator/OperatorMonitorTab";
import { OperatorAuditTab } from "@/components/dashboard/operator/OperatorAuditTab";

export function Operators_Dash() {
  const [tab, setTab] = useState<"register" | "monitor" | "audit">("register");
  const [selectedActionId, setSelectedActionId] = useState("ACT-10291");

  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Path A — Operator dashboard
            </p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Control room
            </h1>
            <p className="mt-4 max-w-[56rem] text-sm leading-relaxed text-[#05058a]/70">
              Requires: EVM wallet connect + NEAR wallet connect.
            </p>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55 md:mt-2">
              Wallet-native identity
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 border border-[#05058a]/15 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "register", label: "Register agent" },
            { id: "monitor", label: "Agents monitor" },
            { id: "audit", label: "Audit request box" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                tab === t.id
                  ? "bg-[#05058a] text-white"
                  : "border border-[#05058a]/20 bg-white text-[#05058a] hover:bg-[#f5f5f0]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "register" ? (
        <div className="mt-6">
          <OperatorRegisterTab />
        </div>
      ) : null}

      {tab === "monitor" ? (
        <div className="mt-6">
          <OperatorMonitorTab
            selectedActionId={selectedActionId}
            onSelectActionId={setSelectedActionId}
          />
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="mt-6">
          <OperatorAuditTab selectedActionLabel={selectedActionId} />
        </div>
      ) : null}
    </div>
  );
}

