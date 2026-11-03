"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { WifiOff, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface DisconnectedNoticeProps {
  moduleName?: string;
  compact?: boolean;
}

export function DisconnectedNotice({
  moduleName = "Market Data & Trading",
  compact = false,
}: DisconnectedNoticeProps) {
  const { toggleConnection, connectionStatus } = useTrading();

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs">
        <div className="flex items-center gap-2 text-rose-300">
          <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
          <span>No live data available for {moduleName} (Broker Offline).</span>
        </div>
        <button
          onClick={toggleConnection}
          className="text-xs text-rose-300 hover:text-white underline font-medium"
        >
          Reconnect
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-xl bg-slate-900/40 border border-dashed border-rose-900/40 my-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-inner">
        <WifiOff className="w-7 h-7" />
      </div>

      <h3 className="text-base font-bold text-slate-100 tracking-tight">
        No Data Available &bull; Upstox Disconnected
      </h3>

      <p className="max-w-md text-xs text-slate-400 mt-2 leading-relaxed">
        Live market telemetry, order status, and real-time P&L for{" "}
        <span className="text-slate-200 font-medium">{moduleName}</span> are
        suspended. Simulated or fake values are intentionally suppressed to prevent misinformed trades.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <button
          onClick={toggleConnection}
          disabled={connectionStatus === "RECONNECTING"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950 cursor-pointer"
        >
          {connectionStatus === "RECONNECTING" ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Connecting to Upstox...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Connect Broker</span>
            </>
          )}
        </button>

        <Link
          href="/settings"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
        >
          <span>Verify API Credentials</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

