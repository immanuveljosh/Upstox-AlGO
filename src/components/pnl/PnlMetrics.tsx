"use client";

import React from "react";
import { PnlSummary } from "@/types/trading";
import { formatINR } from "@/lib/utils";
import {
  TrendingUp,
  Percent,
  AlertTriangle,
  Scale,
  Award,
  Layers,
} from "lucide-react";

interface PnlMetricsProps {
  summary: PnlSummary;
}

export function PnlMetrics({ summary }: PnlMetricsProps) {
  const metrics = [
    {
      label: "Net Realized P&L",
      value: formatINR(summary.netPnl, true),
      subtext: `Gross: ${formatINR(summary.grossPnl)}`,
      color: summary.netPnl >= 0 ? "text-emerald-400" : "text-rose-400",
      icon: TrendingUp,
    },
    {
      label: "Win Rate",
      value: `${summary.winRate}%`,
      subtext: `${summary.profitTrades}W / ${summary.lossTrades}L`,
      color: "text-cyan-400",
      icon: Percent,
    },
    {
      label: "Max Drawdown",
      value: formatINR(summary.maxDrawdown),
      subtext: `${summary.maxDrawdownPct}% of peak equity`,
      color: "text-rose-400",
      icon: AlertTriangle,
    },
    {
      label: "Profit Factor",
      value: `${summary.profitFactor}x`,
      subtext: `Avg Win: ${formatINR(summary.avgWin)}`,
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

            <div className={`text-xl md:text-2xl font-bold font-mono tracking-tight tabular-nums ${item.color}`}>
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

