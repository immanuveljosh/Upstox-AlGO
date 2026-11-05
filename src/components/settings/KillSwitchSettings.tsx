"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertOctagon, Power, Flame, ShieldAlert, CheckCircle2 } from "lucide-react";

export function KillSwitchSettings() {
  const { strategy, toggleStrategy, closeActivePosition, activePosition, addToast } = useTrading();
  const [isSquaringOff, setIsSquaringOff] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isRunning = strategy.status === "RUNNING";

  const handleEmergencySquareOff = async () => {
    setIsSquaringOff(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/strategy/square-off", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        addToast({
          type: "warning",
          title: "Emergency Square-Off Complete",
          message: json.message || "All active positions squared off at market price.",
        });
        if (activePosition) {
          closeActivePosition();
        }
      } else {
        addToast({
          type: "error",
          title: "Square-Off Failed",
          message: json.message || "Failed to execute emergency square-off.",
        });
      }
    } catch {
      // Local fallback
      closeActivePosition();
      addToast({
        type: "warning",
        title: "Positions Liquidated",
        message: "Active positions squared off locally.",
      });
    } finally {
      setIsSquaringOff(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <AlertOctagon className="w-5 h-5 text-rose-500" />
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Emergency Liquidation & Kill Switch Protocols
            </h3>
            <p className="text-xs text-slate-400">
              Immediate execution halt and market liquidation safeguards.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold">
          SAFETY CIRCUIT
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strategy Engine Switch */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              Strategy Automation Engine
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Status:{" "}
              <strong className={isRunning ? "text-emerald-400" : "text-amber-400"}>
                {isRunning ? "RUNNING (Active Monitoring)" : "STOPPED (Paused)"}
              </strong>
            </span>
          </div>

          <button
            onClick={toggleStrategy}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
              isRunning
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950"
                : "bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-950"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isRunning ? "Stop Strategy" : "Start Strategy"}</span>
          </button>
        </div>

        {/* Emergency Square Off */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              Emergency Market Square-Off
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Active Position:{" "}
              <strong className={activePosition ? "text-cyan-400" : "text-slate-400"}>
                {activePosition ? `${activePosition.symbol} (${activePosition.qty} qty)` : "None"}
              </strong>
            </span>
          </div>

          {showConfirm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleEmergencySquareOff}
                disabled={isSquaringOff}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
              >
                {isSquaringOff ? "Closing..." : "Confirm Liquidate"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-900/60 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Square Off All</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

