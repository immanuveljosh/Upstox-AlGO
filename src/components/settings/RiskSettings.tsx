"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import { IndianRupee, Layers, Sliders } from "lucide-react";
import { formatIndianNumber } from "@/lib/utils";
import { Card, StatusBadge } from "@/components/ui/DesignSystem";

export function RiskSettings() {
  const {
    strategy,
    updateRiskSettings,
    updateCapital,
    updateStrategyLots,
    addToast,
  } = useTrading();

  const [capitalInput, setCapitalInput] = useState(
    strategy.totalCapital.toString()
  );
  const [slPct, setSlPct] = useState(strategy.stoplossPercent.toString());
  const [tgtPct, setTgtPct] = useState(strategy.targetPercent.toString());
  const [lots, setLots] = useState(strategy.lots.toString());

  useEffect(() => {
    setCapitalInput(String(strategy.totalCapital || 200000));
    setSlPct(String(strategy.stoplossPercent || 4.0));
    setTgtPct(String(strategy.targetPercent || 5.0));
    setLots(String(strategy.lots || 1));
  }, [
    strategy.totalCapital,
    strategy.stoplossPercent,
    strategy.targetPercent,
    strategy.lots,
  ]);

  const handleSaveCapital = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(capitalInput);
    if (isNaN(cap) || cap < 10000) {
      addToast({
        type: "error",
        title: "Invalid Capital",
        message: "Total strategy capital must be at least ₹10,000.",
      });
      return;
    }
    updateCapital(cap);
  };

  const handleSaveRisk = (e: React.FormEvent) => {
    e.preventDefault();
    const sl = parseFloat(slPct);
    const tgt = parseFloat(tgtPct);
    if (isNaN(sl) || sl <= 0 || sl > 25) {
      addToast({
        type: "error",
        title: "Invalid Stop Loss",
        message: "Stop Loss must be between 0.5% and 25.0% of capital.",
      });
      return;
    }
    if (isNaN(tgt) || tgt <= 0 || tgt > 50) {
      addToast({
        type: "error",
        title: "Invalid Target Profit",
        message: "Target Profit must be between 0.5% and 50.0% of capital.",
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
        message:
          "Quantity must be between 1 and 27 lots (NSE freeze limit: 1,755 units).",
      });
      return;
    }
    updateStrategyLots(l);
  };

  const currentCapital = strategy.totalCapital || 200000;
  const slAmt = (currentCapital * strategy.stoplossPercent) / 100;
  const tgtAmt = (currentCapital * strategy.targetPercent) / 100;
  const actualLotSize = strategy.lotSize || 65;
  const totalQty = (strategy.lots || 1) * actualLotSize;

  return (
    <Card
      title="Strategy Risk & Capital Management"
      subtitle="Single source of truth for strategy capital, stop-loss/target bounds, and position lot size."
      headerAction={
        <StatusBadge tone="success">Nifty Directional</StatusBadge>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Capital */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-slate-300">
                Total strategy capital
              </span>
              <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-mono font-semibold text-slate-100 tabular-nums">
              ₹{formatIndianNumber(currentCapital)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Base equity pool allocated for SL &amp; Target calculations.
            </p>
          </div>

          <form onSubmit={handleSaveCapital} className="mt-4 flex gap-2">
            <input
              type="number"
              min={10000}
              step={5000}
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              aria-label="Total Strategy Capital"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
            >
              Update
            </button>
          </form>
        </div>

        {/* Stop Loss & Target Profit */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-slate-300">
                Capital risk limits
              </span>
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex items-center justify-between text-xs font-mono pt-1 tabular-nums">
              <span className="text-rose-400">
                SL: -{strategy.stoplossPercent}% (₹{formatIndianNumber(slAmt)})
              </span>
              <span className="text-emerald-400">
                Target: +{strategy.targetPercent}% (₹
                {formatIndianNumber(tgtAmt)})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Automatic square-off triggers if daily P&amp;L hits either bound.
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
                aria-label="Stop Loss Percent"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-rose-300 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="0.5"
                value={tgtPct}
                onChange={(e) => setTgtPct(e.target.value)}
                placeholder="Target %"
                aria-label="Target Profit Percent"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs border border-slate-700 transition-colors shrink-0 cursor-pointer"
            >
              Save
            </button>
          </form>
        </div>

        {/* Position Quantity (Single Editable Source of Truth) */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-slate-300">
                Position Quantity
              </span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-mono font-semibold text-slate-100 tabular-nums">
              {strategy.lots} {strategy.lots === 1 ? "Lot" : "Lots"} ({totalQty}{" "}
              units)
            </div>
            <p className="text-xs text-slate-400 mt-1">
              NIFTY 50 contract size: {actualLotSize} units per lot (max 27
              lots).
            </p>
          </div>

          <form onSubmit={handleSaveLots} className="mt-4 flex gap-2">
            <input
              type="number"
              min="1"
              max="27"
              value={lots}
              onChange={(e) => setLots(e.target.value)}
              aria-label="Position Quantity Lots"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs border border-slate-700 transition-colors shrink-0 cursor-pointer"
            >
              Update
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}
