"use client";

import React from "react";
import { PnlSummary } from "@/types/trading";
import { formatINR } from "@/lib/utils";
import { TrendingUp, Percent, AlertTriangle, Scale } from "lucide-react";
import { StatCard } from "@/components/ui/DesignSystem";

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Net realized P&L"
        value={formatINR(netPnl, true)}
        subtext={`Gross: ${formatINR(grossPnl)}`}
        tone={netPnl > 0 ? "positive" : netPnl < 0 ? "negative" : "default"}
        icon={TrendingUp}
      />
      <StatCard
        label="Win rate"
        value={`${winRate.toFixed(1)}%`}
        subtext={`${profitTrades}W / ${lossTrades}L`}
        tone={winRate >= 50 ? "positive" : "default"}
        icon={Percent}
      />
      <StatCard
        label="Max drawdown"
        value={formatINR(maxDrawdown)}
        subtext={`${maxDrawdownPct.toFixed(1)}% of peak equity`}
        tone={maxDrawdown > 0 ? "negative" : "default"}
        icon={AlertTriangle}
      />
      <StatCard
        label="Profit factor"
        value={`${profitFactor.toFixed(2)}x`}
        subtext={`Avg win: ${formatINR(avgWin)}`}
        tone={profitFactor > 1 ? "positive" : "default"}
        icon={Scale}
      />
    </div>
  );
}
