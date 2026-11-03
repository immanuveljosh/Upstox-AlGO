"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { TradingMode } from "@/types/trading";
import { Activity, History } from "lucide-react";

export function ModeToggle() {
  const { mode, setMode } = useTrading();

  return (
    <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 shadow-inner">
      <button
        onClick={() => setMode("BACKTEST")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          mode === "BACKTEST"
            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <History className="w-3.5 h-3.5" />
        <span>Backtest</span>
      </button>

      <button
        onClick={() => setMode("LIVE")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
          mode === "LIVE"
            ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/60"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${mode === "LIVE" ? "bg-slate-950 animate-pulse" : "bg-slate-600"}`} />
        <Activity className="w-3.5 h-3.5" />
        <span>Live</span>
      </button>
    </div>
  );
}

