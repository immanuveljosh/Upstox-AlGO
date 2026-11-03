"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { Play, Square, Sliders, ArrowUpRight, Zap, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export function ActiveStrategyCard() {
  const { strategy, toggleStrategy, updateStrategyLots, connectionStatus } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";
  const isRunning = strategy.status === "RUNNING";

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {strategy.name}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    isRunning && isConnected
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {isRunning && isConnected ? "RUNNING" : "STOPPED"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Directional Nifty Intraday – Buy Call or Put based on trend
              </p>
            </div>
          </div>

          <Link
            href="/strategy"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Configure Strategy"
          >
            <Sliders className="w-4 h-4" />
          </Link>
        </div>

        {/* Strategy Parameters Grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-medium">Lot Size</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-bold font-mono text-white">
                {strategy.lots} Lots
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                ({strategy.lots * strategy.lotSize} Qty)
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-medium">Risk / Reward</span>
            <div className="text-sm font-bold font-mono text-white mt-1">
              {strategy.stoplossPoints} : {strategy.targetPoints} pts
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400 font-medium">Trend Confluence</span>
            <div className="text-xs font-semibold text-emerald-400 mt-1 truncate">
              Bullish Supertrend
            </div>
          </div>
        </div>
      </div>

      {/* Start / Stop Strategy Action Button */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          Auto square-off scheduled at <strong>15:15 IST</strong>
        </span>

        <button
          onClick={toggleStrategy}
          disabled={!isConnected}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            !isConnected
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

