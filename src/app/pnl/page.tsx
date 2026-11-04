"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTrading } from "@/context/TradingContext";
import { PnlSummary } from "@/types/trading";
import { PnlMetrics } from "@/components/pnl/PnlMetrics";
import { EquityCurveChart } from "@/components/pnl/EquityCurveChart";
import { MonthlyBreakdown } from "@/components/pnl/MonthlyBreakdown";
import {
  createEmptyPnlSummary,
  deriveDailyRecordsFromOrders,
  normalizePnlSummary,
} from "@/lib/pnlNormalizer";
import { LineChart, RefreshCw, AlertTriangle } from "lucide-react";

export default function PnlPage() {
  const { orders } = useTrading();
  const [period, setPeriod] = useState<"monthly" | "sixMonth" | "yearly">(
    "monthly"
  );
  const [summary, setSummary] = useState<PnlSummary>(() =>
    createEmptyPnlSummary("monthly")
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchPnl = useCallback(async (selectedPeriod: "monthly" | "sixMonth" | "yearly") => {
    setIsLoading(true);
    setApiError(null);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/pnl/summary?period=${selectedPeriod}`
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          (json && (json.message || json.detail)) ||
          `Failed to load P&L summary (HTTP ${res.status}).`;
        setApiError(String(msg));
        setSummary(createEmptyPnlSummary(selectedPeriod));
        return;
      }

      if (json && json.data) {
        setSummary(normalizePnlSummary(json.data, selectedPeriod));
      } else {
        setSummary(createEmptyPnlSummary(selectedPeriod));
        if (json?.connection_status === "connection_lost" && json?.message) {
          setApiError(String(json.message));
        }
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Unable to reach P&L backend service.";
      setApiError(`P&L API Error: ${errMsg}`);
      setSummary(createEmptyPnlSummary(selectedPeriod));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPnl(period);
  }, [period, fetchPnl]);

  const safeDailyRecords = Array.isArray(summary?.dailyPnl)
    ? summary.dailyPnl.length > 0
      ? summary.dailyPnl
      : deriveDailyRecordsFromOrders(orders)
    : deriveDailyRecordsFromOrders(orders);

  const safeEquityCurve = Array.isArray(summary?.equityCurve)
    ? summary.equityCurve
    : [];

  return (
    <div className="space-y-5">
      {/* Page Header with Period Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              P&amp;L Analytics &amp; Equity Curves
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Realized index returns, win rate statistics, and maximum drawdown
            evaluation from real Upstox trades.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchPnl(period)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`}
            />
            <span>Refresh</span>
          </button>

          {/* Period Selector Tabs */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(
              [
                { id: "monthly", label: "Monthly" },
                { id: "sixMonth", label: "6 Months" },
                { id: "yearly", label: "Yearly" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  period === tab.id
                    ? "bg-slate-800 text-emerald-400 border border-slate-700/80 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {apiError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-300"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Primary KPI Metrics */}
      <PnlMetrics summary={summary} />

      {/* Equity Curve Card */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 md:p-6 shadow-sm">
        <EquityCurveChart data={safeEquityCurve} />
      </div>

      {/* Session Journal Breakdown Table */}
      <MonthlyBreakdown
        records={safeDailyRecords}
        isLoading={isLoading}
        error={apiError}
      />
    </div>
  );
}
