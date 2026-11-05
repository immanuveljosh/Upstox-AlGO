"use client";

import React, { useState } from "react";
import { BrokerSettings } from "@/components/settings/BrokerSettings";
import { RiskSettings } from "@/components/settings/RiskSettings";
import { KillSwitchSettings } from "@/components/settings/KillSwitchSettings";
import { Settings as SettingsIcon, Shield, Sliders, AlertOctagon, Zap } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"broker" | "risk" | "safeguards" | "all">("all");

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Settings Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              System & Broker Configuration
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure official Upstox v2/v3 credentials, daily semi-automated token request, webhook endpoints, and strategy risk parameters.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 self-start md:self-auto shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "all"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Settings
          </button>
          <button
            onClick={() => setActiveTab("broker")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "broker"
                ? "bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Broker & Auth</span>
          </button>
          <button
            onClick={() => setActiveTab("risk")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "risk"
                ? "bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Risk Controls</span>
          </button>
          <button
            onClick={() => setActiveTab("safeguards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "safeguards"
                ? "bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Safeguards</span>
          </button>
        </div>
      </div>

      {/* Render Components based on active tab */}
      {(activeTab === "all" || activeTab === "broker") && (
        <BrokerSettings />
      )}

      {(activeTab === "all" || activeTab === "risk") && (
        <RiskSettings />
      )}

      {(activeTab === "all" || activeTab === "safeguards") && (
        <KillSwitchSettings />
      )}
    </div>
  );
}

