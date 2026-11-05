"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { Shield, TrendingDown, Target, IndianRupee, Layers, CheckCircle2, Sliders } from "lucide-react";
import { formatIndianNumber } from "@/lib/utils";

export function RiskSettings() {
  const { strategy, updateRiskSettings, updateCapital, updateStrategyLots, addToast } = useTrading();

  const [capitalInput, setCapitalInput] = useState(strategy.totalCapital.toString());
  const [slPct, setSlPct] = useState(strategy.stoplossPercent.toString());
  const [tgtPct, setTgtPct] = useState(strategy.targetPercent.toString());
  const [lots, setLots] = useState(strategy.lots.toString());

  const handleSaveCapital = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(capitalInput);
    if (isNaN(cap) || cap < 50000) {
      addToast({
        type: "error",
        title: "Invalid Capital",
        message: "Total strategy capital must be at least ₹50,000.",
      });
      return;
    }
    updateCapital(cap);
  };

  const handleSaveRisk = (e: React.FormEvent) => {
    e.preventDefault();
    const sl = parseFloat(slPct);
    const tgt = parseFloat(tgtPct);
    if (isNaN(sl) || sl <= 0 || sl > 20) {
      addToast({
        type: "error",
        title: "Invalid Stop Loss",
        message: "Stop Loss must be between 0.5% and 20.0% of capital.",
      });
      return;
    }
    if (isNaN(tgt) || tgt <= 0 || tgt > 50) {
      addToast({
        type: "error",
        title: "Invalid Target Profit",
        message: "Target Profit must be between 1.0% and 50.0% of capital.",
      });
      return;
    }
    updateRiskSettings(sl, tgt);
  };

  const handleSaveLots = (e: React.FormEvent) => {
    e.preventDefault();
    const l = parseInt(lots, 10);
    if (isNaN(l) || l < 1 || l > 27) {
      addToast({
        type: "error",
        title: "Invalid Lot Size",
        message: "Quantity must be between 1 and 27 lots (NSE freeze limit: 1,755 units).",
      });
      return;
    }
    updateStrategyLots(l);
  };

  const currentCapital = strategy.totalCapital || 200000;
  const slAmt = (currentCapital * strategy.stoplossPercent) / 100;
  const tgtAmt = (currentCapital * strategy.targetPercent) / 100;
  const totalQty = (strategy.lots || 1) * (strategy.lotSize || 65);

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Strategy Risk & Capital Management
            </h3>
            <p className="text-xs text-slate-400">
              Institutional safety bounds: NIFTY Directional rules & circuit breakers.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
          NIFTY DIRECTIONAL
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Capital */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-300">Total Strategy Capital</span>
              <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-lg font-mono font-bold text-white tabular-nums">
              ₹{formatIndianNumber(currentCapital)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Base equity pool allocated for SL & Target calculations.
            </p>
          </div>

          <form onSubmit={handleSaveCapital} className="mt-4 flex gap-2">
            <input
              type="number"
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-colors shrink-0"
            >
              Update
            </button>
          </form>
        </div>

        {/* Stop Loss & Target Profit */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-300">Capital Risk Limits</span>
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex items-center justify-between text-xs font-mono pt-1">
              <span className="text-rose-400">SL: -{strategy.stoplossPercent}% (₹{formatIndianNumber(slAmt)})</span>
              <span className="text-emerald-400">Target: +{strategy.targetPercent}% (₹{formatIndianNumber(tgtAmt)})</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Automatic square-off triggers if daily P&L hits either bound.
            </p>
          </div>

          <form onSubmit={handleSaveRisk} className="mt-4 flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                step="0.5"
                value={slPct}
                onChange={(e) => setSlPct(e.target.value)}
                placeholder="SL %"
                className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-rose-300 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="0.5"
                value={tgtPct}
                onChange={(e) => setTgtPct(e.target.value)}
                placeholder="Target %"
                className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors shrink-0"
            >
              Save
            </button>
          </form>
        </div>

        {/* Position Lots & Freezes */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-300">Position Quantity</span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-lg font-mono font-bold text-white tabular-nums">
              {strategy.lots} Lot{strategy.lots > 1 ? "s" : ""} ({totalQty} units)
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              NIFTY 50 contract size: 65 units per lot.
            </p>
          </div>

          <form onSubmit={handleSaveLots} className="mt-4 flex gap-2">
            <input
              type="number"
              min="1"
              max="27"
              value={lots}
              onChange={(e) => setLots(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors shrink-0"
            >
              Update
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
