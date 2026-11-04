"use client";

import React from "react";
import { PnlSummary } from "@/types/trading";
import { formatINR } from "@/lib/utils";
import { TrendingUp, Percent, AlertTriangle, Scale } from "lucide-react";

interface PnlMetricsProps {
  summary?: Partial<PnlSummary> | null;
}

export function PnlMetrics({ summary }: PnlMetricsProps) {
  const netPnl = Number(summary?.netPnl ?? 0);
  const grossPnl = Number(summary?.grossPnl ?? 0);
  const winRate = Number(summary?.winRate ?? 0);
  const profitTrades = Number(summary?.profitTrades ?? 0);
  const lossTrades = Number(summary?.lossTrades ?? 0);
  const maxDrawdown = Number(summary?.maxDrawdown ?? 0);
  const maxDrawdownPct = Number(summary?.maxDrawdownPct ?? 0);
  const profitFactor = Number(summary?.profitFactor ?? 0);
  const avgWin = Number(summary?.avgWin ?? 0);

  const metrics = [
    {
      label: "Net Realized P&L",
      value: formatINR(netPnl, true),
      subtext: `Gross: ${formatINR(grossPnl)}`,
      color: netPnl >= 0 ? "text-emerald-400" : "text-rose-400",
      icon: TrendingUp,
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      subtext: `${profitTrades}W / ${lossTrades}L`,
      color: "text-cyan-400",
      icon: Percent,
    },
    {
      label: "Max Drawdown",
      value: formatINR(maxDrawdown),
      subtext: `${maxDrawdownPct.toFixed(1)}% of peak equity`,
      color: "text-rose-400",
      icon: AlertTriangle,
    },
    {
      label: "Profit Factor",
      value: `${profitFactor.toFixed(2)}x`,
      subtext: `Avg Win: ${formatINR(avgWin)}`,
      color: "text-amber-400",
      icon: Scale,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {metrics.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
                {item.label}
              </span>
              <Icon className="w-4 h-4 text-slate-500" />
            </div>

            <div
              className={`text-xl md:text-2xl font-bold font-mono tracking-tight tabular-nums ${item.color}`}
            >
              {item.value}
            </div>

            <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
              {item.subtext}
            </div>
          </div>
        );
      })}
    </div>
  );
}
