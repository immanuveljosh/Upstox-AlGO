"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR } from "@/lib/utils";
import {
  TrendingUp,
  Wallet,
  PieChart,
  Percent,
  AlertCircle,
  Activity,
} from "lucide-react";

export function QuickStats() {
  const { stats, activePosition, connectionStatus } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";

  const openPnl = activePosition ? activePosition.pnl : 0;
  const todayTotalPnl = isConnected ? stats.todayPnl + openPnl : 0;

  const statItems = [
    {
      label: "Open P&L",
      value: isConnected ? formatINR(openPnl, true) : "—",
      subtext: isConnected
        ? activePosition
          ? `${activePosition.symbol}`
          : "No active position"
        : "Broker offline",
      color:
        isConnected && openPnl > 0
          ? "text-emerald-400"
          : isConnected && openPnl < 0
          ? "text-rose-400"
          : "text-slate-300",
      icon: Activity,
    },
    {
      label: "Today's Net P&L",
      value: isConnected ? formatINR(todayTotalPnl, true) : "—",
      subtext: isConnected
        ? `${stats.totalTrades} trades executed`
        : "Broker offline",
      color:
        isConnected && todayTotalPnl >= 0
          ? "text-emerald-400"
          : isConnected && todayTotalPnl < 0
          ? "text-rose-400"
          : "text-slate-300",
      icon: TrendingUp,
    },
    {
      label: "Margin Used",
      value: isConnected ? formatINR(stats.marginUsed) : "—",
      subtext: isConnected
        ? `Avail: ${formatINR(stats.marginAvailable)}`
        : "Broker offline",
      color: "text-slate-100",
      icon: Wallet,
    },
    {
      label: "Daily Win Rate",
      value: isConnected ? `${stats.winRate}%` : "—",
      subtext: isConnected
        ? `PF: ${stats.profitFactor}x`
        : "Broker offline",
      color: isConnected ? "text-cyan-400" : "text-slate-400",
      icon: Percent,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {statItems.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700/80 transition-all shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold tracking-wide uppercase text-[11px] text-slate-400">
                {item.label}
              </span>
              <Icon className="w-4 h-4 text-slate-500" />
            </div>

            <div className={`text-xl md:text-2xl font-bold font-mono tracking-tight tabular-nums ${item.color}`}>
              {item.value}
            </div>

            <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1 font-mono">
              {!isConnected && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
              <span className="truncate">{item.subtext}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

