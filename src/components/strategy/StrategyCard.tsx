"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINRInteger } from "@/lib/utils";
import {
  Play,
  Square,
  Clock,
  Shield,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Target,
  Sparkles,
  Zap,
} from "lucide-react";

export function StrategyCard() {
  const {
    strategy,
    toggleStrategy,
    updateStrategyLots,
    updateCapital,
    setGiftNiftyChange,
    triggerStrategyEntry,
    connectionStatus,
    mode,
    activePosition,
  } = useTrading();

  const [lotCount, setLotCount] = useState<number>(strategy.lots);
  const [capitalInput, setCapitalInput] = useState<number>(strategy.totalCapital);
  const [testGapInput, setTestGapInput] = useState<number>(strategy.giftNiftyChange);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isConnected = connectionStatus === "CONNECTED";
  const isRunning = strategy.status === "RUNNING";
  const isBullish = strategy.signal === "BULLISH";
  const isBearish = strategy.signal === "BEARISH";
  const isNoTrade = strategy.signal === "NO_TRADE";

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

  const handleCapitalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (capitalInput >= 10000) {
      updateCapital(capitalInput);
    }
  };

  const handleApplyTestGap = (points: number) => {
    setTestGapInput(points);
    setGiftNiftyChange(points);
  };

  return (
    <div suppressHydrationWarning className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
      {/* Top Header Banner */}
      <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-emerald-400">
              Default System Strategy
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">ID: {strategy.id}</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
              {mode} MODE
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white mt-1.5 tracking-tight flex items-center gap-2">
            <span>{strategy.name}</span>
            <span className="text-xs font-normal text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
              {strategy.underlying}
            </span>
          </h2>

          <p className="text-xs text-slate-300 mt-1.5 max-w-3xl leading-relaxed">
            {strategy.description}
          </p>
        </div>

        {/* Start / Stop Strategy Action Button */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">
              Engine Status
            </div>
            <div
              className={`font-mono text-xs font-bold ${
                isRunning ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isRunning ? "RUNNING & SCANNING" : "STOPPED / IDLE"}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleStrategy}
            disabled={!isConnected && mode === "LIVE"}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md ${
              !isConnected && mode === "LIVE"
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

      {/* Real-time Telemetry Bar */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Gift Nifty 1-Day Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">GIFT NIFTY 1-Day Change:</span>
            <span
              className={`text-sm font-mono font-bold flex items-center gap-1 ${
                strategy.giftNiftyChange > 0
                  ? "text-emerald-400"
                  : strategy.giftNiftyChange < 0
                  ? "text-rose-400"
                  : "text-slate-300"
              }`}
            >
              {strategy.giftNiftyChange > 0 ? (
                <TrendingUp className="w-4 h-4 inline" />
              ) : strategy.giftNiftyChange < 0 ? (
                <TrendingDown className="w-4 h-4 inline" />
              ) : null}
              {strategy.giftNiftyChange > 0 ? "+" : ""}
              {strategy.giftNiftyChange} pts ({strategy.giftNiftyChangePct}%)
            </span>
          </div>

          {/* Signal Pill */}
          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
              isBullish
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : isBearish
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}
          >
            {isBullish
              ? "BULLISH SIGNAL (>= +80)"
              : isBearish
              ? "BEARISH SIGNAL (<= -80)"
              : "NO TRADE SIGNAL (-80 to +80)"}
          </span>
        </div>

        {/* Quick Testing Simulation Buttons */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 text-[11px] font-medium mr-1">Simulate Gap:</span>
          <button
            type="button"
            onClick={() => handleApplyTestGap(95)}
            className="px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/50 text-[11px] font-mono cursor-pointer"
          >
            +95 (Bullish CE)
          </button>
          <button
            type="button"
            onClick={() => handleApplyTestGap(-90)}
            className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 text-[11px] font-mono cursor-pointer"
          >
            -90 (Bearish PE)
          </button>
          <button
            type="button"
            onClick={() => handleApplyTestGap(25)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
          >
            +25 (No Trade)
          </button>
        </div>
      </div>

      {/* Strategy Configuration & Live Status Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/30">
        {/* Selected Option (3rd ITM Only) */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Option Contract
              </span>
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-base font-bold font-mono text-white mt-1">
              {strategy.selectedOption}
            </div>
            <div className="text-xs text-cyan-400 font-mono mt-0.5">
              Est. Entry: ₹{strategy.entryPrice.toFixed(1)}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Selected dynamically: <strong>3rd ITM strike only</strong>
          </div>
        </div>

        {/* Capital Management */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Strategy Capital
              </span>
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <div suppressHydrationWarning className="text-lg font-bold font-mono text-white mt-1">
              {formatINRInteger(strategy.totalCapital)}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {strategy.lots} Lots &bull; {strategy.lots * strategy.lotSize} Quantity
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span>Lot Multiplier:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={lotCount <= 1}
                className="w-5 h-5 rounded bg-slate-800 text-slate-300 disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <span className="font-mono font-bold text-white text-xs">{lotCount}</span>
              <button
                type="button"
                onClick={handleIncrement}
                disabled={lotCount >= 20}
                className="w-5 h-5 rounded bg-slate-800 text-slate-300 disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Stop Loss & Target Profit (5% and 6% of Capital) */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                SL & Target (from Capital)
              </span>
              <Target className="w-4 h-4 text-amber-400" />
            </div>
            <div suppressHydrationWarning className="text-sm font-bold font-mono text-white mt-1 space-y-0.5">
              <div className="text-rose-400 flex items-center justify-between">
                <span>Stop Loss (5%):</span>
                <span>-{formatINRInteger(strategy.stoplossAmount)}</span>
              </div>
              <div className="text-emerald-400 flex items-center justify-between">
                <span>Target (6%):</span>
                <span>+{formatINRInteger(strategy.targetAmount)}</span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Calculated from total strategy capital, not premium %
          </div>
        </div>

        {/* Trading Window & Daily Trade Counter */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Window & Trade Limit
              </span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-base font-bold font-mono text-white mt-1">
              {strategy.entryWindowStart} &ndash; {strategy.entryWindowEnd} AM IST
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              Trades Today: <strong className="text-cyan-400">{strategy.dailyTradeCount} / {strategy.maxDailyTrades}</strong>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            Strict maximum 1 trade per day. Auto-exit @ 15:15 IST
          </div>
        </div>
      </div>
    </div>
  );
}
