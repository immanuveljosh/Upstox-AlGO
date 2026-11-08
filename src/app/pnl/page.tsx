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
import { RefreshCw, AlertTriangle } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/DesignSystem";

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

  const fetchPnl = useCallback(
    async (selectedPeriod: "monthly" | "sixMonth" | "yearly") => {
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
    },
    []
  );

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
    <div className="space-y-6">
      <PageHeader
        title="P&L Analytics & Equity Curve"
        subtitle="Realized index returns, win rate statistics, and maximum drawdown evaluation from closed trades."
        actions={
          <>
            <button
              type="button"
              onClick={() => fetchPnl(period)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isLoading ? "animate-spin text-emerald-400" : ""
                }`}
              />
              <span>Refresh</span>
            </button>

            <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: "monthly", label: "Monthly" },
                  { id: "sixMonth", label: "6 Months" },
                  { id: "yearly", label: "Yearly" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriod(tab.id)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    period === tab.id
                      ? "bg-slate-800 text-emerald-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {apiError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-300"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Primary KPI Metrics (max 4 per row) */}
      <PnlMetrics summary={summary} />

      {/* Equity Curve Card */}
      <Card
        title="Cumulative account equity curve"
        subtitle="Realized equity trajectory across closed trading sessions"
      >
        <EquityCurveChart data={safeEquityCurve} />
      </Card>

      {/* Daily Trading Journal Breakdown (Single source of truth on /pnl) */}
      <MonthlyBreakdown
        records={safeDailyRecords}
        isLoading={isLoading}
        error={apiError}
      />
    </div>
  );
}
