"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { KillSwitchButton } from "@/components/ui/KillSwitchButton";
import { TrendingUp, TrendingDown, Menu, AlertCircle } from "lucide-react";
import { formatPoints, formatPercent, formatIndianNumber } from "@/lib/utils";

interface TopBarProps {
  onToggleMobileSidebar: () => void;
}

export function TopBar({ onToggleMobileSidebar }: TopBarProps) {
  const { niftyPrice, niftyChange, niftyChangePct, connectionStatus, mode } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";
  const isPositive = niftyChange >= 0;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md">
      {/* Left: Mobile Toggle + Nifty Index Ticker */}
      <div className="flex items-center gap-3 md:gap-5">
        <button
          onClick={onToggleMobileSidebar}
          aria-label="Toggle Navigation Menu"
          className="lg:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* NIFTY 50 Live Ticker Pill */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Nifty 50
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Spot Index
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {isConnected ? (
            <div className="flex items-baseline gap-2">
              <span suppressHydrationWarning className="font-mono text-base md:text-lg font-bold text-slate-50 tracking-tight tabular-nums">
                {formatIndianNumber(niftyPrice, 2)}
              </span>

              <div
                className={`flex items-center text-xs font-mono font-medium ${
                  isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 mr-0.5 inline" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 mr-0.5 inline" />
                )}
                <span>{formatPoints(niftyChange, true)}</span>
                <span className="hidden sm:inline ml-1">
                  ({formatPercent(niftyChangePct, true)})
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Offline &bull; &mdash;</span>
            </div>
          )}
        </div>

        {/* Mode context pill on desktop */}
        {mode === "BACKTEST" && (
          <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-300">
            Backtest Simulation Mode
          </span>
        )}
        {mode === "LIVE" && (
          <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
            Live Trading Mode
          </span>
        )}
      </div>

      {/* Right Controls: Mode Switch, Connection Badge, Kill Switch */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mode Switch (Big Toggle) */}
        <ModeToggle />

        {/* Connection Status Badge */}
        <ConnectionBadge />

        {/* Kill Switch (Red, Prominent) */}
        <KillSwitchButton />
      </div>
    </header>
  );
}

