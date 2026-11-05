"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertTriangle, RefreshCw, KeyRound } from "lucide-react";
import Link from "next/link";

export function CriticalAlertBanner() {
  const { strategyStatus, reconnectBroker } = useTrading();
  const alert = strategyStatus?.critical_alert;

  if (!alert) return null;

  const isTokenExpired =
    alert.toLowerCase().includes("token expired") ||
    alert.toLowerCase().includes("401 unauthorized") ||
    alert.toLowerCase().includes("re-authenticate");

  const isStaleQuote = alert.toLowerCase().includes("stale");

  return (
    <div className="rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/80 to-rose-900/60 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0 mt-0.5 sm:mt-0 animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                {isTokenExpired ? "CRITICAL: AUTH REQUIRED" : isStaleQuote ? "WARNING: STALE FEED" : "CRITICAL ALERT"}
              </span>
            </div>
            <p className="text-xs text-rose-200 mt-1 font-medium leading-relaxed">
              {alert}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {isTokenExpired ? (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Re-Authorize Upstox</span>
            </Link>
          ) : (
            <button
              onClick={() => reconnectBroker()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 text-xs font-semibold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Sync</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

