"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertOctagon, ShieldAlert, CheckCircle2, Power } from "lucide-react";

export function KillSwitchSettings() {
  const { openKillSwitchModal, connectionStatus, addToast } = useTrading();
  const [autoSlPrevention, setAutoSlPrevention] = useState(true);
  const [circuitBreakerToggle, setCircuitBreakerToggle] = useState(true);

  const isConnected = connectionStatus === "CONNECTED";

  const handleToggleAutoSl = () => {
    const nextVal = !autoSlPrevention;
    setAutoSlPrevention(nextVal);
    addToast({
      type: nextVal ? "success" : "warning",
      title: "Auto Stoploss Guard",
      message: nextVal
        ? "Enabled: System prevents manual orders that violate defined stoploss bounds."
        : "Disabled: Manual orders bypass safety boundary checks.",
    });
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
        <AlertOctagon className="w-5 h-5 text-rose-500" />
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Kill Switch & Emergency Safeguards
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Hard system override for instantaneous emergency liquidations.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {/* Toggle 1: Auto Stoploss Prevention */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Auto Stoploss Protection Guard</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/30">
                RECOMMENDED
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              Automatically places an exchange SL-M leg directly on Upstox immediately upon entry. Prevents unhedged overnight exposure and slippage during sudden index spikes.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleAutoSl}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoSlPrevention ? "bg-emerald-600" : "bg-slate-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                autoSlPrevention ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Emergency Kill Switch Action Panel */}
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Emergency Liquidate & Halt System</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-lg">
              Squares off all active Nifty CE/PE positions at market bid/ask, cancels all open limit orders, and puts strategy into permanent halt.
            </p>
          </div>

          <button
            type="button"
            onClick={openKillSwitchModal}
            disabled={!isConnected}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shadow-lg ${
              isConnected
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 cursor-pointer"
                : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
            }`}
          >
            <AlertOctagon className="w-4 h-4" />
            <span>Emergency Exit All</span>
          </button>
        </div>
      </div>
    </div>
  );
}

