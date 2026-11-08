"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { RefreshCw } from "lucide-react";

export function ConnectionBadge() {
  const { connectionStatus, toggleConnection, latencyMs, credentials } = useTrading();

  if (connectionStatus === "CONNECTING" || connectionStatus === "RECONNECTING") {
    return (
      <button
        type="button"
        onClick={toggleConnection}
        title="Verifying connection with Upstox API..."
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-amber-300 text-xs font-medium cursor-pointer transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
        <span>Verifying...</span>
      </button>
    );
  }

  if (connectionStatus === "TOKEN_EXPIRED" || connectionStatus === "AUTH_FAILED") {
    return (
      <button
        type="button"
        onClick={toggleConnection}
        title="Upstox authentication required. Click to verify or re-authenticate in Settings."
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium cursor-pointer hover:bg-amber-500/15 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        <span>Auth required</span>
      </button>
    );
  }

  if (connectionStatus === "DISCONNECTED") {
    return (
      <button
        type="button"
        onClick={toggleConnection}
        title="Broker is offline. Click to verify connection."
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs font-medium cursor-pointer hover:bg-slate-800 hover:text-slate-200 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        <span>Offline</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleConnection}
      title={`Connected to Upstox Live OMS (${credentials.accountName || "Trader"} • ${credentials.ucc || "5GC3MG"}). Click to disconnect.`}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-medium hover:bg-emerald-500/15 transition-colors cursor-pointer"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span>Connected</span>
      {latencyMs > 0 && (
        <span className="hidden md:inline text-xs text-emerald-400/80 font-mono tabular-nums border-l border-emerald-500/25 pl-2">
          {latencyMs}ms
        </span>
      )}
    </button>
  );
}
