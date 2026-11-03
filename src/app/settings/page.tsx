"use client";

import React from "react";
import { BrokerSettings } from "@/components/settings/BrokerSettings";
import { RiskSettings } from "@/components/settings/RiskSettings";
import { KillSwitchSettings } from "@/components/settings/KillSwitchSettings";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            System & Broker Configuration
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Configure Upstox v2 API keys, risk circuit breakers, and emergency liquidation protocols.
        </p>
      </div>

      {/* 1. Broker API Connection */}
      <BrokerSettings />

      {/* 2. Risk Settings */}
      <RiskSettings />

      {/* 3. Kill Switch Safeguards */}
      <KillSwitchSettings />
    </div>
  );
}

