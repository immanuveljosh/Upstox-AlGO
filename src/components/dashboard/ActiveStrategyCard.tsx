"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import {
  Play,
  Square,
  Sliders,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  Target,
  Layers,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export function ActiveStrategyCard() {
  const {
    strategy,
    toggleStrategy,
    triggerStrategyEntry,
    connectionStatus,
    mode,
    activePosition,
  } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";
  const isRunning = strategy.status === "RUNNING";
  const isBullish = strategy.signal === "BULLISH";
  const isBearish = strategy.signal === "BEARISH";
  const isNoTrade = strategy.signal === "NO_TRADE";

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between shadow-sm">
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                isBullish
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : isBearish
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  : "bg-slate-800/60 border-slate-700/60 text-slate-400"
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {strategy.name}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    isRunning
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 animate-pulse"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {isRunning ? "RUNNING" : "STOPPED"}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                  {mode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Underlying: <strong className="text-slate-300">{strategy.underlying}</strong> &bull; Strike Rule:{" "}
                <strong className="text-cyan-400">3rd ITM Only</strong>
              </p>
            </div>
          </div>

          <Link
            href="/strategy"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Configure Strategy & View Backtest"
          >
            <Sliders className="w-4 h-4" />
          </Link>
        </div>

        {/* Signal & Telemetry Banner */}
        <div className="mt-3.5 p-3 rounded-xl bg-slate-950 border border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">GIFT NIFTY 1-Day:</span>
            <span
              className={`font-mono text-xs font-bold flex items-center gap-1 ${
                strategy.giftNiftyChange > 0
                  ? "text-emerald-400"
                  : strategy.giftNiftyChange < 0
                  ? "text-rose-400"
                  : "text-slate-300"
              }`}
            >
              {strategy.giftNiftyChange > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 inline" />
              ) : strategy.giftNiftyChange < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 inline" />
              ) : null}
              {strategy.giftNiftyChange > 0 ? "+" : ""}
              {strategy.giftNiftyChange} pts ({strategy.giftNiftyChangePct}%)
            </span>
          </div>

          {/* Directional Signal Badge */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Signal:</span>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                isBullish
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : isBearish
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              {isBullish ? "BULLISH (BUY CALL)" : isBearish ? "BEARISH (BUY PUT)" : "NO TRADE ZONE"}
            </span>
          </div>
        </div>

        {/* Key Strategy Parameters Grid */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Selected 3rd ITM Option */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">Selected 3rd ITM</span>
            <span className="font-mono text-xs font-bold text-white mt-1 block truncate">
              {strategy.selectedOption}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              @ ₹{strategy.entryPrice}
            </span>
          </div>

          {/* Total Capital */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">Strategy Capital</span>
            <span className="font-mono text-xs font-bold text-white mt-1 block">
              ₹{strategy.totalCapital.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {strategy.lots} Lots ({strategy.lots * strategy.lotSize} Qty)
            </span>
          </div>

          {/* Stop Loss Amount (5%) */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              SL (5% Capital)
            </span>
            <span className="font-mono text-xs font-bold text-rose-400 mt-1 block">
              -₹{strategy.stoplossAmount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ~{strategy.stoplossPoints} pts
            </span>
          </div>

          {/* Target Amount (6%) */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium flex items-center gap-1">
              <Target className="w-3 h-3 text-emerald-400" />
              Target (6% Capital)
            </span>
            <span className="font-mono text-xs font-bold text-emerald-400 mt-1 block">
              +₹{strategy.targetAmount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ~{strategy.targetPoints} pts
            </span>
          </div>
        </div>

        {/* Timing Window & Daily Trades Status Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 py-1 bg-slate-950/40 rounded-lg">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>
              Window: <strong>09:15 – 09:17 AM IST</strong>
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-amber-400 font-medium">After 09:17 AM entries disabled</span>
          </div>

          <div className="flex items-center gap-1 font-mono">
            <span>Daily Trade Limit:</span>
            <strong className="text-slate-200">
              {strategy.dailyTradeCount} / {strategy.maxDailyTrades} used
            </strong>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isRunning && !activePosition && !isNoTrade && strategy.dailyTradeCount < strategy.maxDailyTrades && (
            <button
              type="button"
              onClick={() => triggerStrategyEntry()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              Trigger Signal Entry Now
            </button>
          )}
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Auto square-off scheduled at <strong>15:15 IST</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={toggleStrategy}
          disabled={!isConnected && mode === "LIVE"}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            !isConnected && mode === "LIVE"
              ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
              : isRunning
              ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30"
              : "bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950"
          }`}
        >
          {isRunning ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Strategy</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Strategy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
