"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatIndianNumber, formatPoints, formatPercent } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Radio,
  Layers,
  ShieldCheck,
} from "lucide-react";

export function NiftyLivePrice() {
  const {
    connectionStatus,
    niftyPrice,
    niftyChange,
    niftyChangePct,
    niftyTimestamp,
    marketStatus,
  } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";
  const isPositive = niftyChange >= 0;
  const isMarketLive = marketStatus === "LIVE";

  // Calculate ATM Strike dynamically
  const atmStrike = niftyPrice > 0 ? Math.round(niftyPrice / 50) * 50 : 0;

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 md:p-6 flex flex-col justify-between h-full min-h-[260px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-800/80 text-slate-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                NIFTY 50 Spot Index
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                NSE • Underlying Benchmark
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            DISCONNECTED
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center py-6">
          <span className="font-mono text-3xl font-extrabold text-slate-600 tracking-tight">
            ₹ —
          </span>
          <p className="text-xs text-slate-400 mt-2 max-w-sm">
            Live Upstox market quote feed is offline. Connect broker credentials in Settings to stream real-time NIFTY spot ticks.
          </p>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-800/80 pt-3">
          <span>Source: Upstox v2 Live OMS</span>
          <span>Status: Awaiting Feed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 md:p-6 flex flex-col justify-between h-full min-h-[260px] shadow-sm hover:border-slate-700/80 transition-all">
      {/* Top Header: Title, Segment, and Small Live Indicator */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                NIFTY 50 Spot Index
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                NSE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Real-Time Tick Telemetry &bull; Upstox v2 API
            </p>
          </div>
        </div>

        {/* Small Live Indicator Badge */}
        <div className="flex items-center gap-2">
          {isMarketLive ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-slate-400 text-[11px] font-mono font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>MARKET CLOSED</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Body: Prominent Numeric NIFTY Price Display & Point Changes */}
      <div className="py-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider">
            Spot Index Value
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-400 font-mono">
              ₹
            </span>
            <span
              suppressHydrationWarning
              className="font-mono text-4xl sm:text-5xl font-extrabold text-white tracking-tight tabular-nums"
            >
              {niftyPrice ? formatIndianNumber(niftyPrice, 2) : "—"}
            </span>
          </div>
        </div>

        {/* Point Change & Percentage Change Pills */}
        <div className="flex flex-col md:items-end gap-1.5">
          <span className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider">
            Session Net Change
          </span>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm sm:text-base font-bold tabular-nums ${
              isPositive
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-4 h-4 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 shrink-0" />
            )}
            <span>{formatPoints(niftyChange, true)} pts</span>
            <span className="text-xs opacity-90">
              ({formatPercent(niftyChangePct, true)})
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Telemetry Bar: Market Status, Last Updated Time, ATM Strike */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3.5 border-t border-slate-800/80 text-[11px] font-mono">
        <div className="flex flex-col">
          <span className="text-slate-400 text-[10px] uppercase font-medium">
            Market Status
          </span>
          <span
            className={`font-semibold ${
              isMarketLive ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {marketStatus}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-slate-400 text-[10px] uppercase font-medium">
            ATM Strike
          </span>
          <span className="font-semibold text-slate-200">
            {atmStrike ? `${atmStrike.toLocaleString("en-IN")}` : "—"}
          </span>
        </div>

        <div className="flex flex-col col-span-2 sm:col-span-1">
          <span className="text-slate-400 text-[10px] uppercase font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Last Updated
          </span>
          <span className="text-slate-300 font-semibold truncate">
            {niftyTimestamp || "Awaiting quote..."}
          </span>
        </div>
      </div>
    </div>
  );
}
