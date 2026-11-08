"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR } from "@/lib/utils";
import { TrendingUp, Wallet, Percent, Activity } from "lucide-react";
import { StatCard } from "@/components/ui/DesignSystem";

export function QuickStats() {
  const { stats, activePosition, connectionStatus } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";

  const openPnl = activePosition ? activePosition.pnl : 0;
  const todayTotalPnl = isConnected ? stats.todayPnl + openPnl : 0;

  return (
    <div className="space-y-2">
      {!isConnected && (
        <p className="text-xs text-slate-400">
          Live account metrics are unavailable while the broker session is offline.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open P&L"
          value={isConnected ? formatINR(openPnl, true) : "--"}
          subtext={
            isConnected
              ? activePosition
                ? activePosition.symbol
                : "No active position"
              : undefined
          }
          tone={
            !isConnected
              ? "default"
              : openPnl > 0
              ? "positive"
              : openPnl < 0
              ? "negative"
              : "default"
          }
          icon={Activity}
        />

        <StatCard
          label="Today's net P&L"
          value={isConnected ? formatINR(todayTotalPnl, true) : "--"}
          subtext={
            isConnected ? `${stats.totalTrades} trades executed` : undefined
          }
          tone={
            !isConnected
              ? "default"
              : todayTotalPnl > 0
              ? "positive"
              : todayTotalPnl < 0
              ? "negative"
              : "default"
          }
          icon={TrendingUp}
        />

        <StatCard
          label="Margin used"
          value={isConnected ? formatINR(stats.marginUsed) : "--"}
          subtext={
            isConnected
              ? `Available: ${formatINR(stats.marginAvailable)}`
              : undefined
          }
          tone="default"
          icon={Wallet}
        />

        <StatCard
          label="Daily win rate"
          value={isConnected ? `${stats.winRate}%` : "--"}
          subtext={
            isConnected ? `Profit factor: ${stats.profitFactor}x` : undefined
          }
          tone="default"
          icon={Percent}
        />
      </div>
    </div>
  );
}
