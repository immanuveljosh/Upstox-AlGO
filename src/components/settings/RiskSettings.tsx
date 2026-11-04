"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import { ShieldAlert, Save } from "lucide-react";
import { formatINRCurrency } from "@/lib/format";

export function RiskSettings() {
  const { strategy, updateRiskSettings, updateCapital } = useTrading();

  const [capital, setCapital] = useState<number>(strategy.totalCapital || 200000);
  const [slPct, setSlPct] = useState<number>(strategy.stoplossPercent || 4.0);
  const [targetPct, setTargetPct] = useState<number>(
    strategy.targetPercent || 5.0
  );

  useEffect(() => {
    setCapital(strategy.totalCapital || 200000);
    setSlPct(strategy.stoplossPercent || 4.0);
    setTargetPct(strategy.targetPercent || 5.0);
  }, [
    strategy.totalCapital,
    strategy.stoplossPercent,
    strategy.targetPercent,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (capital >= 10000) {
      updateCapital(capital);
    }
    if (slPct > 0 && targetPct > 0) {
      updateRiskSettings(slPct, targetPct);
    }
  };

  const slAmount = capital * (slPct / 100);
  const targetAmount = capital * (targetPct / 100);

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
        <ShieldAlert className="w-5 h-5 text-amber-400" />
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Nifty Directional — Capital &amp; Risk Management Controls
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Capital-based Stop Loss (default 4%) and Target Profit (default 5%)
            limits including statutory F&amp;O charges.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Total Strategy Capital (₹)
            </label>
            <input
              type="number"
              step={5000}
              min={10000}
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500/50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Default: {formatINRCurrency(200000, 0)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Stop Loss (% of Capital)
            </label>
            <input
              type="number"
              step={0.5}
              min={0.5}
              max={25}
              value={slPct}
              onChange={(e) => setSlPct(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500/50"
            />
            <p className="text-[11px] text-rose-400/80 mt-1 font-mono">
              Max Loss: -{formatINRCurrency(slAmount, 0)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target Profit (% of Capital)
            </label>
            <input
              type="number"
              step={0.5}
              min={0.5}
              max={50}
              value={targetPct}
              onChange={(e) => setTargetPct(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500/50"
            />
            <p className="text-[11px] text-emerald-400/80 mt-1 font-mono">
              Target Profit: +{formatINRCurrency(targetAmount, 0)}
            </p>
          </div>
        </div>

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
