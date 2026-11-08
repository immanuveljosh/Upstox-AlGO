"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { KillSwitchButton } from "@/components/ui/KillSwitchButton";
import { TrendingUp, TrendingDown, Menu } from "lucide-react";
import { formatPoints, formatPercent, formatIndianNumber } from "@/lib/utils";

interface TopBarProps {
  onToggleMobileSidebar: () => void;
}

export function TopBar({ onToggleMobileSidebar }: TopBarProps) {
  const { niftyPrice, niftyChange, niftyChangePct, connectionStatus } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";
  const isPositive = niftyChange >= 0;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-slate-950/95 border-b border-slate-800 backdrop-blur-md">
      {/* Left: Mobile Toggle + Nifty 50 Spot Ticker */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Toggle Navigation Menu"
          className="lg:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Nifty 50 Spot Index Pill */}
        <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-xs font-medium text-slate-400">
            Nifty 50
          </span>

          <div className="h-4 w-px bg-slate-800" />

          {isConnected && niftyPrice > 0 ? (
            <div className="flex items-baseline gap-2">
              <span
                suppressHydrationWarning
                className="font-mono text-sm md:text-base font-semibold text-slate-100 tracking-tight tabular-nums"
              >
                {formatIndianNumber(niftyPrice, 2)}
              </span>

              <div
                className={`flex items-center text-xs font-mono font-medium tabular-nums ${
                  isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 mr-1 inline" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 mr-1 inline" />
                )}
                <span>{formatPoints(niftyChange, true)}</span>
                <span className="hidden sm:inline ml-1">
                  ({formatPercent(niftyChangePct, true)})
                </span>
              </div>
            </div>
          ) : (
            <span className="text-sm font-mono text-slate-500 tabular-nums">
              --
            </span>
          )}
        </div>
      </div>

      {/* Right Controls: Mode Switch, Single Connection Badge, Kill Switch */}
      <div className="flex items-center gap-3">
        <ModeToggle />
        <ConnectionBadge />
        <KillSwitchButton />
      </div>
    </header>
  );
}
