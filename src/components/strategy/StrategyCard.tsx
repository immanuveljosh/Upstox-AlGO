"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import {
  Play,
  Square,
  Sliders,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  TrendingUp,
  Minus,
  Plus,
  Save,
} from "lucide-react";

export function StrategyCard() {
  const { strategy, toggleStrategy, updateStrategyLots, connectionStatus } = useTrading();
  const [lotCount, setLotCount] = useState<number>(strategy.lots);
  const isConnected = connectionStatus === "CONNECTED";
  const isRunning = strategy.status === "RUNNING";

  const handleIncrement = () => {
    const next = Math.min(20, lotCount + 1);
    setLotCount(next);
    updateStrategyLots(next);
  };

  const handleDecrement = () => {
    const next = Math.max(1, lotCount - 1);
    setLotCount(next);
    updateStrategyLots(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 20) {
      setLotCount(val);
      updateStrategyLots(val);
    }
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
      {/* Top Banner */}
      <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-emerald-400">
              Default System Strategy
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">ID: {strategy.id}</span>
          </div>

          <h2 className="text-xl font-bold text-white mt-1.5 tracking-tight">
            {strategy.name}
          </h2>

          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {strategy.description}
          </p>
        </div>

        {/* Start / Stop Strategy Action */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">
              Current Engine Status
            </div>
            <div
              className={`font-mono text-xs font-bold ${
                isRunning && isConnected ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isRunning && isConnected ? "RUNNING & SCANNING" : "STOPPED / IDLE"}
            </div>
          </div>

          <button
            onClick={toggleStrategy}
            disabled={!isConnected}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md ${
              !isConnected
                ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
                : isRunning
                ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30"
                : "bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-950"
            }`}
          >
            {isRunning ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Strategy</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Start Strategy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Strategy Configuration Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/40">
        {/* Lot Size Input */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Lot Size Multiplier
              </span>
              <Layers className="w-4 h-4 text-slate-500" />
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={lotCount <= 1}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                type="number"
                min={1}
                max={20}
                value={lotCount}
                onChange={handleInputChange}
                className="w-16 h-8 text-center bg-slate-950 border border-slate-700 rounded-lg font-mono font-bold text-white text-sm focus:outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={handleIncrement}
                disabled={lotCount >= 20}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-slate-400 pl-1">
                = {lotCount * strategy.lotSize} Qty
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Nifty standard contract (25 units per lot)
          </div>
        </div>

        {/* Risk & Target */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Stoploss / Target
              </span>
              <Shield className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold font-mono text-white mt-2">
              {strategy.stoplossPoints} pts <span className="text-slate-500 font-normal">SL</span> &bull;{" "}
              {strategy.targetPoints} pts <span className="text-slate-500 font-normal">TP</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Fixed 1:2 Risk to Reward per directional trigger
          </div>
        </div>

        {/* Execution Timings */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Execution Window
              </span>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold font-mono text-white mt-2">
              {strategy.entryWindowStart} &ndash; {strategy.entryWindowEnd}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Auto square-off: <strong className="text-slate-300">15:15 IST</strong>
          </div>
        </div>

        {/* Indicator Logic */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Indicator Filter
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xs font-semibold text-emerald-400 mt-2">
              {strategy.indicator}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Dual timeframe directional trend validation
          </div>
        </div>
      </div>
    </div>
  );
}

