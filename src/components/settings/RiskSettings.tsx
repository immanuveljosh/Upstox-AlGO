"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { ShieldAlert, Save, Sliders, DollarSign, Percent } from "lucide-react";
import { formatINR } from "@/lib/utils";

export function RiskSettings() {
  const { strategy, updateRiskSettings } = useTrading();

  const [slPoints, setSlPoints] = useState<number>(strategy.stoplossPoints);
  const [maxLoss, setMaxLoss] = useState<number>(strategy.maxDailyLoss);
  const [slMode, setSlMode] = useState<"POINTS" | "PERCENT">("POINTS");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateRiskSettings(slPoints, maxLoss);
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
        <ShieldAlert className="w-5 h-5 text-amber-400" />
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Risk Management Controls
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated hard stoploss limits and daily account drawdown breakers.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {/* Stoploss Mode & Points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Directional Stoploss Limit
              </label>
              <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSlMode("POINTS")}
                  className={`px-2 py-0.5 rounded font-mono ${
                    slMode === "POINTS" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-500"
                  }`}
                >
                  Points
                </button>
                <button
                  type="button"
                  onClick={() => setSlMode("PERCENT")}
                  className={`px-2 py-0.5 rounded font-mono ${
                    slMode === "PERCENT" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-500"
                  }`}
                >
                  %
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                min={5}
                max={100}
                value={slPoints}
                onChange={(e) => setSlPoints(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500/50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                {slMode === "POINTS" ? "points / leg" : "% premium"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Triggers instant market SL when option premium decays by {slPoints} {slMode === "POINTS" ? "points" : "%"}.
            </p>
          </div>

          {/* Max Daily Loss */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Max Daily Loss Guard
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                ₹
              </span>
              <input
                type="number"
                step={500}
                min={1000}
                max={50000}
                value={maxLoss}
                onChange={(e) => setMaxLoss(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-xs font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500/50"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Halts all algo triggers if cumulative daily loss reaches {formatINR(maxLoss)}.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            <span>Save Risk Parameters</span>
          </button>
        </div>
      </form>
    </div>
  );
}

