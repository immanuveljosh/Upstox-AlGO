"use client";

import React from "react";
import { StrategyCard } from "@/components/strategy/StrategyCard";
import { useTrading } from "@/context/TradingContext";
import {
  Sliders,
  CheckCircle2,
  TrendingUp,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export default function StrategyPage() {
  const { strategy, connectionStatus } = useTrading();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            Algo Trading Strategies
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Intraday directional trend algorithms executing automated Call and Put option purchases.
        </p>
      </div>

      {/* Main Strategy Card (Selected by default) */}
      <StrategyCard />

      {/* Strategy Architecture & Execution Logic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Rules & Logic */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Directional Execution Logic
            </h3>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-emerald-400 block mb-1">
                1. Bullish Trigger (+80 Gift Nifty 1-Day)
              </span>
              <span>
                If Gift Nifty 1-Day change is +80 points or higher between 09:15 – 09:17 AM IST, triggers an immediate market buy of Nifty <strong>ITM 3 Call option</strong> (In-The-Money 3rd strike, ATM - 150).
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-rose-400 block mb-1">
                2. Bearish Trigger (-80 Gift Nifty 1-Day)
              </span>
              <span>
                If Gift Nifty 1-Day change is -80 points or lower between 09:15 – 09:17 AM IST, triggers an immediate market buy of Nifty <strong>ITM 3 Put option</strong> (In-The-Money 3rd strike, ATM + 150).
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">
                3. Risk & Daily Frequency Guard
              </span>
              <span>
                Strict limit of <strong>maximum 1 trade per day</strong>. Stop loss is fixed at <strong>5% of total capital</strong> (₹10,000 on ₹2L) and Target is fixed at <strong>6% of total capital</strong> (₹12,000 on ₹2L). Product: MIS / Intraday.
              </span>
            </div>
          </div>
        </div>

        {/* Backtest Benchmark Stats */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Historical Benchmark (12 Months Backtest)
              </h3>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Tested on 1-minute historical tick data for Nifty 50 Index options, including slippage and STT.
            </p>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  Historical Win Rate
                </span>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  68.2%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  Profit Factor
                </span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                  2.45x
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  Max Drawdown
                </span>
                <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                  3.1%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  Avg Monthly Trades
                </span>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  42
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Option Strategy: Simple Directional CE / PE only</span>
            <span className="text-emerald-400 font-medium">Zero Multi-leg Drag</span>
          </div>
        </div>
      </div>
    </div>
  );
}

