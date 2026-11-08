"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import { AlertTriangle, KeyRound, ChevronDown, ChevronUp, X } from "lucide-react";

export function CriticalAlertBanner() {
  const { connectionStatus, strategyStatus, brokerError } = useTrading();
  const [dismissed, setDismissed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isConnected = connectionStatus === "CONNECTED";
  const criticalAlert = strategyStatus?.critical_alert || null;

  // Reset dismissed state when connection status or alert text changes
  useEffect(() => {
    setDismissed(false);
  }, [connectionStatus, criticalAlert]);

  if ((isConnected && !criticalAlert) || dismissed) {
    return null;
  }

  const isAuthRequired =
    connectionStatus === "TOKEN_EXPIRED" ||
    connectionStatus === "AUTH_FAILED" ||
    Boolean(
      criticalAlert &&
        (criticalAlert.toLowerCase().includes("token") ||
          criticalAlert.toLowerCase().includes("401") ||
          criticalAlert.toLowerCase().includes("auth"))
    );

  const summaryTitle = isAuthRequired
    ? "Upstox authentication required"
    : !isConnected
    ? "Broker connection offline"
    : "Live monitoring alert";

  const summaryMessage = isAuthRequired
    ? "Your Upstox session token has expired or requires authorization. Live quotes and automated protection are paused until you re-authorize."
    : !isConnected
    ? "Upstox market feed is currently offline. Live quotes and automated triggers are paused."
    : criticalAlert || "Attention required for active strategy monitoring.";

  const detailText =
    [
      criticalAlert,
      brokerError && brokerError !== criticalAlert ? brokerError : null,
      !isConnected ? `Connection state: ${connectionStatus}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || "No additional diagnostic details reported.";

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/30 bg-slate-900 px-4 py-3 text-slate-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                {summaryTitle}
              </span>
              <span className="text-[13px] text-slate-400">
                {summaryMessage}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <span>Details</span>
              {detailsOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Re-authorize Upstox</span>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss alert"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {detailsOpen && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-xs font-mono text-slate-400 break-words">
          {detailText}
        </div>
      )}
    </div>
  );
}
