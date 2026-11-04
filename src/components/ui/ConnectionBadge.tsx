"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, ShieldAlert, KeyRound } from "lucide-react";

export function ConnectionBadge() {
  const { connectionStatus, toggleConnection, latencyMs, credentials } = useTrading();

  if (connectionStatus === "CONNECTING" || connectionStatus === "RECONNECTING") {
    return (
      <button
        onClick={toggleConnection}
        title="Verifying connection with Upstox API..."
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium cursor-pointer transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Verifying...</span>
      </button>
    );
  }

  if (connectionStatus === "TOKEN_EXPIRED") {
    return (
      <button
        onClick={toggleConnection}
        title="Upstox daily access token expired. Click to re-authenticate."
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer hover:bg-amber-500/25 transition-all shadow-sm shadow-amber-950"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
        <span>Token Expired</span>
        <span className="hidden sm:inline text-[10px] text-amber-300/80 border-l border-amber-500/30 pl-1.5">
          Login Required
        </span>
      </button>
    );
  }

  if (connectionStatus === "AUTH_FAILED") {
    return (
      <button
        onClick={toggleConnection}
        title="Upstox authentication failed. Please check API Key & Secret in Settings."
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-semibold cursor-pointer hover:bg-rose-500/25 transition-all shadow-sm shadow-rose-950"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
        </span>
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>Auth Failed</span>
        <span className="hidden sm:inline text-[10px] text-rose-300/80 border-l border-rose-500/30 pl-1.5">
          Check Keys
        </span>
      </button>
    );
  }

  if (connectionStatus === "DISCONNECTED") {
    return (
      <button
        onClick={toggleConnection}
        title="Disconnected from Upstox. Click to verify & connect."
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-400 text-xs font-medium cursor-pointer hover:bg-slate-700/80 hover:text-slate-200 transition-all"
      >
        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
        <WifiOff className="w-3.5 h-3.5" />
        <span>Disconnected</span>
        <span className="hidden sm:inline text-[10px] text-slate-400 border-l border-slate-700 pl-1.5">
          Click to Connect
        </span>
      </button>
    );
  }

  // CONNECTED state with genuine latency
  return (
    <button
      onClick={toggleConnection}
      title={`Connected to Upstox Live OMS (${credentials.accountName || "User"} • ${credentials.ucc || "5GC3MG"}). Click to disconnect.`}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-all cursor-pointer"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <Wifi className="w-3.5 h-3.5" />
      <span className="font-semibold">Connected</span>
      <span className="hidden md:inline text-[11px] text-emerald-400/90 font-mono">
        {latencyMs > 0 ? `${latencyMs}ms` : "Live"}
      </span>
    </button>
  );
}
