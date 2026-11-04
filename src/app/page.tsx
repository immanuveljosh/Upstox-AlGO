"use client";

import React from "react";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { NiftyChart } from "@/components/dashboard/NiftyChart";
import { PositionCard } from "@/components/dashboard/PositionCard";
import { ActiveStrategyCard } from "@/components/dashboard/ActiveStrategyCard";
import { ManualOrderPanel } from "@/components/dashboard/ManualOrderPanel";
import LotSizeCalculator from "@/components/dashboard/LotSizeCalculator";
import { useTrading } from "@/context/TradingContext";
import { AlertCircle, WifiOff } from "lucide-react";

export default function DashboardPage() {
  const { connectionStatus, mode } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";

  return (
    <div className="space-y-5">
      {/* If broker offline, show non-intrusive warning header bar */}
      {!isConnected && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Broker Offline:</strong> Upstox market feed disconnected. Live quotes and automated triggers are halted. Reconnect in Settings or Top Bar.
            </span>
          </div>
          <span className="font-mono text-[11px] text-rose-400/80 hidden sm:inline">
            Status: DISCONNECTED
          </span>
        </div>
      )}

      {/* Row 1: Quick Stats (Open P&L, Today's P&L, Margin Used, Win Rate) */}
      <QuickStats />

      {/* Row 2: Live Chart & Active Position Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
          <NiftyChart />
        </div>
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
          <PositionCard />
        </div>
      </div>

      {/* Row 3: Active Strategy & Manual Directional Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ActiveStrategyCard />
        <ManualOrderPanel />
      </div>

      {/* Row 4: Professional Lot Size & Quantity Calculator */}
      <LotSizeCalculator />
    </div>
  );
}

