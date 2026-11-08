"use client";

import React, { useState } from "react";
import { BrokerSettings } from "@/components/settings/BrokerSettings";
import { RiskSettings } from "@/components/settings/RiskSettings";
import { KillSwitchSettings } from "@/components/settings/KillSwitchSettings";
import { Zap, Sliders, AlertOctagon } from "lucide-react";
import { PageHeader } from "@/components/ui/DesignSystem";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "broker" | "risk" | "safeguards" | "all"
  >("all");

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="System & Broker Configuration"
        subtitle="Configure official Upstox v2/v3 credentials, daily token approval requests, webhook endpoints, and strategy risk parameters."
        actions={
          <div
            role="tablist"
            aria-label="Settings sections"
            className="flex flex-wrap rounded-lg bg-slate-900 border border-slate-800 p-1 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "all"}
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "all"
                  ? "bg-slate-800 text-slate-100 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Settings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "broker"}
              onClick={() => setActiveTab("broker")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "broker"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Broker &amp; Auth</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "risk"}
              onClick={() => setActiveTab("risk")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "risk"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Risk Controls</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "safeguards"}
              onClick={() => setActiveTab("safeguards")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "safeguards"
                  ? "bg-emerald-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Safeguards</span>
            </button>
          </div>
        }
      />

      {(activeTab === "all" || activeTab === "broker") && <BrokerSettings />}
      {(activeTab === "all" || activeTab === "risk") && <RiskSettings />}
      {(activeTab === "all" || activeTab === "safeguards") && (
        <KillSwitchSettings />
      )}
    </div>
  );
}
