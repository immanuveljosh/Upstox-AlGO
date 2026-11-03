"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function ConnectionBadge() {
  const { connectionStatus, toggleConnection } = useTrading();

  if (connectionStatus === "RECONNECTING") {
    return (
      <button
        onClick={toggleConnection}
        title="Reconnecting to Upstox API..."
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium cursor-pointer transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Reconnecting...</span>
      </button>
    );
  }

  if (connectionStatus === "DISCONNECTED") {
    return (
      <button
        onClick={toggleConnection}
        title="Click to reconnect Upstox WebSocket"
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-semibold cursor-pointer hover:bg-rose-500/25 transition-all shadow-sm shadow-rose-950"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
        </span>
        <WifiOff className="w-3.5 h-3.5" />
        <span>Connection Lost</span>
        <span className="hidden sm:inline text-[10px] text-rose-300/70 border-l border-rose-500/30 pl-1.5">
          Click to Retry
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleConnection}
      title="Connected to Upstox Live OMS (Click to simulate disconnect)"
      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-all cursor-pointer"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <Wifi className="w-3.5 h-3.5" />
      <span>Connected</span>
      <span className="hidden md:inline text-[10px] text-emerald-500/80 font-mono">
        18ms
      </span>
    </button>
  );
}

