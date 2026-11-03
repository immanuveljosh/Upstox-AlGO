"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { mockPnlData } from "@/lib/mockData";
import { PnlMetrics } from "@/components/pnl/PnlMetrics";
import { EquityCurveChart } from "@/components/pnl/EquityCurveChart";
import { MonthlyBreakdown } from "@/components/pnl/MonthlyBreakdown";
import { DisconnectedNotice } from "@/components/ui/DisconnectedNotice";
import { LineChart, Calendar, TrendingUp } from "lucide-react";

export default function PnlPage() {
  const { connectionStatus } = useTrading();
  const [period, setPeriod] = useState<"monthly" | "sixMonth" | "yearly">("monthly");

  const isConnected = connectionStatus === "CONNECTED";

  if (!isConnected) {
    return (
      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              P&L Analytics & Equity Curves
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Historical returns, drawdown metrics, and intraday trading performance.
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-6">
          <DisconnectedNotice moduleName="P&L Reports & Analytics" />
        </div>
      </div>
    );
  }

  const currentSummary = mockPnlData[period];

  return (
    <div className="space-y-5">
      {/* Page Header with Period Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              P&L Analytics & Equity Curves
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Realized index returns, win rate statistics, and maximum drawdown evaluation.
          </p>
        </div>

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

      {/* Primary KPI Metrics */}
      <PnlMetrics summary={currentSummary} />

      {/* Equity Curve Card */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 md:p-6 shadow-sm">
        <EquityCurveChart data={currentSummary.equityCurve} />
      </div>

      {/* Session Journal Breakdown Table */}
      <MonthlyBreakdown records={currentSummary.dailyPnl} />
    </div>
  );
}

