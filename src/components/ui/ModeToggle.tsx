"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { Activity, History, FileText, AlertTriangle, ShieldCheck } from "lucide-react";

export function ModeToggle() {
  const {
    mode,
    setMode,
    isLiveConfirmOpen,
    confirmLiveMode,
    cancelLiveMode,
  } = useTrading();

  return (
    <>
      <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 shadow-inner">
        {/* Paper Mode (Default) */}
        <button
          type="button"
          onClick={() => setMode("PAPER")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            mode === "PAPER"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Safe paper trading simulation with real-time quotes"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Paper</span>
        </button>

        {/* Live Mode */}
        <button
          type="button"
          onClick={() => setMode("LIVE")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            mode === "LIVE"
              ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/60"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Real Upstox live order execution"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              mode === "LIVE" ? "bg-slate-950 animate-pulse" : "bg-slate-600"
            }`}
          />
          <Activity className="w-3.5 h-3.5" />
          <span>Live</span>
        </button>

        {/* Backtest Mode */}
        <button
          type="button"
          onClick={() => setMode("BACKTEST")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
            mode === "BACKTEST"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Historical backtesting sandbox"
        >
          <History className="w-3.5 h-3.5" />
          <span>Backtest</span>
        </button>
      </div>

      {/* Confirmation Modal when user requests switching to LIVE */}
      {isLiveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Activate Live Trading?
                </h3>
                <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                  Explicit Confirmation Required
                </p>
              </div>
            </div>

            <div className="my-4 text-xs text-slate-300 space-y-2.5 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <p>
                You are about to switch from <strong>Paper Trading</strong> to <strong>Live Trading</strong>.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
                <li>Signals will submit real orders to your <strong>Upstox Trading Account</strong>.</li>
                <li>Strategy uses <strong>5% Capital SL</strong> and <strong>6% Capital Target</strong>.</li>
                <li>Ensure your Upstox account has sufficient intraday margin.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={cancelLiveMode}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Keep Paper Mode
              </button>
              <button
                type="button"
                onClick={confirmLiveMode}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Confirm & Activate Live</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
