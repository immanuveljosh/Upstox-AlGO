"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR, formatPercent } from "@/lib/utils";
import {
  ShieldCheck,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  Clock,
  Layers,
} from "lucide-react";

export function PositionCard() {
  const { activePosition, closeActivePosition, connectionStatus } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-center items-center text-center h-[260px]">
        <div className="p-3 rounded-xl bg-slate-800/80 text-slate-500 mb-2">
          <Layers className="w-6 h-6" />
        </div>
        <div className="text-xs font-semibold text-slate-400">
          Position Stream Offline
        </div>
        <p className="text-[11px] text-slate-500 max-w-xs mt-1">
          Open positions cannot be verified while disconnected from Upstox OMS.
        </p>
      </div>
    );
  }

  if (!activePosition) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-center items-center text-center h-[260px]">
        <div className="w-12 h-12 rounded-xl bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
          <Layers className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">
          No Open Directional Position
        </h4>
        <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
          Strategy scanner is waiting for next 5-min trend confirmation, or place a manual Call / Put below.
        </p>
      </div>
    );
  }

  const isCall = activePosition.type === "CE";
  const isProfit = activePosition.pnl >= 0;

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between relative overflow-hidden">
      {/* Top indicator stripe */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isCall ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />

      {/* Header Info */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-wider ${
                isCall
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              {activePosition.type}
            </span>
            <div>
              <h3 className="text-base font-bold text-white font-mono tracking-tight">
                {activePosition.symbol}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {activePosition.entryTime}
                </span>
                <span>&bull;</span>
                <span>
                  {activePosition.lots} Lots ({activePosition.qty} Qty)
                </span>
              </div>
            </div>
          </div>

          {/* Quick Exit / Square-off Button */}
          <button
            onClick={closeActivePosition}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Square Off</span>
          </button>
        </div>

        {/* Real-time P&L Display */}
        <div className="mt-4 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Unrealized P&L
            </span>
            <div
              className={`text-xl md:text-2xl font-bold font-mono tracking-tight tabular-nums flex items-baseline gap-1.5 ${
                isProfit ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              <span>{formatINR(activePosition.pnl, true)}</span>
              <span className="text-xs font-mono font-medium">
                ({formatPercent(activePosition.pnlPercent, true)})
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              LTP / Premium
            </span>
            <div className="text-lg font-bold font-mono text-white tabular-nums">
              ₹{activePosition.ltp.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Avg Buy: ₹{activePosition.buyPrice.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Target & Trailing SL Progress */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs pt-3 border-t border-slate-800">
        <div className="p-2 rounded bg-slate-950 border border-slate-800">
          <div className="text-[10px] text-slate-400">Stoploss</div>
          <div className="font-mono font-bold text-rose-400 mt-0.5">
            ₹{activePosition.stoploss.toFixed(2)}
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950 border border-slate-800">
          <div className="text-[10px] text-slate-400">Trailing SL</div>
          <div className="font-mono font-bold text-amber-400 mt-0.5">
            ₹{activePosition.trailingSl.toFixed(2)}
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950 border border-slate-800">
          <div className="text-[10px] text-slate-400">Target (1:2)</div>
          <div className="font-mono font-bold text-emerald-400 mt-0.5">
            ₹{activePosition.target.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

