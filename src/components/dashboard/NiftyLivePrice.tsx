"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatIndianNumber, formatPoints, formatPercent } from "@/lib/utils";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Card, StatusBadge } from "@/components/ui/DesignSystem";

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
  const hasPrice = isConnected && niftyPrice > 0;
  const isPositive = niftyChange >= 0;
  const isMarketLive = marketStatus === "LIVE";
  const atmStrike = hasPrice ? Math.round(niftyPrice / 50) * 50 : 0;

  return (
    <Card
      title="Nifty 50 spot index"
      subtitle="NSE underlying benchmark"
      headerAction={
        <StatusBadge tone={isMarketLive ? "success" : "neutral"} dot>
          {isMarketLive ? "LIVE" : "MARKET CLOSED"}
        </StatusBadge>
      }
      className="flex flex-col justify-between h-full"
    >
      <div className="py-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-[13px] font-medium text-slate-400">
            Spot index value
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold text-slate-400 font-mono">
              ₹
            </span>
            <span
              suppressHydrationWarning
              className="font-mono text-3xl sm:text-4xl font-semibold text-slate-100 tracking-tight tabular-nums"
            >
              {hasPrice ? formatIndianNumber(niftyPrice, 2) : "--"}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-1">
          <span className="text-[13px] font-medium text-slate-400">
            Session net change
          </span>
          {hasPrice ? (
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-sm font-semibold tabular-nums ${
                isPositive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/25"
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
          ) : (
            <span className="font-mono text-sm text-slate-500 tabular-nums">
              --
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
        <div>
          <span className="text-slate-400 block">Market status</span>
          <span
            className={`font-mono font-medium mt-0.5 block ${
              isMarketLive ? "text-emerald-400" : "text-slate-300"
            }`}
          >
            {marketStatus}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block">ATM strike</span>
          <span className="font-mono font-medium text-slate-200 mt-0.5 block tabular-nums">
            {atmStrike ? atmStrike.toLocaleString("en-IN") : "--"}
          </span>
        </div>

        <div>
          <span className="text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Last updated
          </span>
          <span className="font-mono font-medium text-slate-300 mt-0.5 block truncate">
            {hasPrice ? niftyTimestamp || "Live" : "--"}
          </span>
        </div>
      </div>
    </Card>
  );
}
