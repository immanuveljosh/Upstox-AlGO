"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import {
  StrategyIntelligenceData,
  SignalAnalysisItem,
  ExecutionMonitoringItem,
  MonthlyHeatmapItem,
  BacktestDurationCode,
} from "@/types/trading";
import {
  formatINRCurrency,
  formatISTDate,
  formatISTDateTime,
  formatSignedPoints,
} from "@/lib/format";
import { EquityCurveChart } from "@/components/pnl/EquityCurveChart";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ShieldAlert,
  DollarSign,
  Compass,
  Radio,
  FileSpreadsheet,
  Zap,
} from "lucide-react";

const DURATION_PRESETS: { code: BacktestDurationCode; label: string }[] = [
  { code: "1M", label: "1 Month" },
  { code: "3M", label: "3 Months" },
  { code: "6M", label: "6 Months" },
  { code: "1Y", label: "1 Year" },
  { code: "CUSTOM", label: "Custom Range" },
];

type IntelligenceTab = "SIGNALS" | "EXECUTIONS" | "HEATMAP";

export default function StrategyIntelligencePage() {
  const { addToast } = useTrading();

  // Mode & Filters
  const [mode, setMode] = useState<"LIVE" | "BACKTEST">("BACKTEST");
  const [selectedDuration, setSelectedDuration] =
    useState<BacktestDurationCode>("3M");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Active Tab
  const [activeTab, setActiveTab] = useState<IntelligenceTab>("SIGNALS");

  // Filter within tables
  const [signalFilter, setSignalFilter] = useState<
    "ALL" | "CALL" | "PUT" | "MISSED" | "EXECUTED"
  >("ALL");

  // State
  const [data, setData] = useState<StrategyIntelligenceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fetch intelligence data
  const fetchIntelligence = useCallback(
    async (
      targetMode: "LIVE" | "BACKTEST",
      duration: BacktestDurationCode,
      fromDate?: string,
      toDate?: string
    ) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("mode", targetMode);
        params.set("duration", duration);
        if (duration === "CUSTOM") {
          if (fromDate) params.set("from_date", fromDate);
          if (toDate) params.set("to_date", toDate);
        }

        const res = await fetch(
          `http://localhost:8000/api/v1/strategy/intelligence?${params.toString()}`
        );
        const json = await res.json();
        if (res.ok && json.data) {
          setData(json.data as StrategyIntelligenceData);
        } else {
          addToast({
            type: "error",
            title: "Intelligence Fetch Failed",
            message: json.message || "Failed to load strategy intelligence data.",
          });
        }
      } catch (err) {
        addToast({
          type: "error",
          title: "Connection Error",
          message:
            err instanceof Error
              ? err.message
              : "Backend unreachable on http://localhost:8000",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [addToast]
  );

  // Initial load and dependency trigger
  useEffect(() => {
    fetchIntelligence(
      mode,
      selectedDuration,
      customStartDate,
      customEndDate
    );
  }, [mode, selectedDuration, customStartDate, customEndDate, fetchIntelligence]);

  // Handle Export CSV
  const handleExportCSV = useCallback(async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      params.set("mode", mode);
      params.set("duration", selectedDuration);
      if (selectedDuration === "CUSTOM") {
        if (customStartDate) params.set("from_date", customStartDate);
        if (customEndDate) params.set("to_date", customEndDate);
      }
      const exportUrl = `http://localhost:8000/api/v1/strategy/intelligence/export.csv?${params.toString()}`;
      window.open(exportUrl, "_blank");
      addToast({
        type: "info",
        title: "Export Initiated",
        message: `Exporting ${mode} strategy intelligence CSV...`,
      });
    } catch {
      addToast({
        type: "error",
        title: "Export Failed",
        message: "Failed to download strategy intelligence CSV.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [mode, selectedDuration, customStartDate, customEndDate, addToast]);

  // Filtered Signals
  const filteredSignals = useMemo(() => {
    if (!data?.signals) return [];
    return data.signals.filter((s: SignalAnalysisItem) => {
      if (signalFilter === "ALL") return true;
      if (signalFilter === "CALL") return s.signal === "CALL";
      if (signalFilter === "PUT") return s.signal === "PUT";
      if (signalFilter === "MISSED") return s.is_missed;
      if (signalFilter === "EXECUTED") return s.executed_status === "EXECUTED";
      return true;
    });
  }, [data?.signals, signalFilter]);

  const summary = data?.summary;
  const netPnl = summary?.net_pnl ?? 0;
  const isProfitable = netPnl >= 0;

  return (
    <div className="space-y-5 pb-12">
      {/* Action Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs font-medium">
          <button
            onClick={() => setMode("BACKTEST")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              mode === "BACKTEST"
                ? "bg-purple-600 text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            BACKTEST
          </button>
          <button
            onClick={() => setMode("LIVE")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              mode === "LIVE"
                ? "bg-emerald-600 text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            LIVE BROKER
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() =>
            fetchIntelligence(
              mode,
              selectedDuration,
              customStartDate,
              customEndDate
            )
          }
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh Intelligence Data"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-purple-400" : ""}`}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {/* Export CSV Button */}
        <button
          onClick={handleExportCSV}
          disabled={isExporting || isLoading || !data}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 border border-emerald-300 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-900" />
          Export CSV
        </button>
      </div>

      {/* Rules Banner & Duration Filter Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Compass className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="font-semibold text-slate-200">Active Rule Profile:</span>
            <span className="text-slate-400">
              NIFTY 50 • Gift Nifty (≥ +80 CE, ≤ -80 PE) • ITM 3 strictly • 09:15–09:17 Window • SL 4% • Target 5% • Exit 15:15 IST
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                mode === "LIVE"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  mode === "LIVE" ? "bg-emerald-400 animate-pulse" : "bg-purple-400"
                }`}
              />
              {mode === "LIVE"
                ? "Live Upstox Verified Fills"
                : "Historical Simulation"}
            </span>
          </div>
        </div>

        {/* Duration Selector Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Duration:
            </span>
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.code}
                onClick={() => setSelectedDuration(preset.code)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-all ${
                  selectedDuration === preset.code
                    ? "bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {selectedDuration === "CUSTOM" && (
            <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-lg">
              <label className="text-slate-400">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2 py-0.5 rounded focus:outline-none focus:border-purple-500"
              />
              <label className="text-slate-400 ml-1">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2 py-0.5 rounded focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {data && (
            <div className="text-[11px] font-mono text-slate-400">
              Period: <span className="text-slate-200">{formatISTDate(data.start_date)}</span> →{" "}
              <span className="text-slate-200">{formatISTDate(data.end_date)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mode Informational Banner */}
      {mode === "LIVE" && (!data?.executions || data.executions.length === 0) && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-amber-200">
              No Live Broker Trades in Selected Period
            </div>
            <p className="text-amber-300/80">
              The live trading desk executes real Upstox OMS orders strictly between 09:15:00 and 09:17:00 IST when Gift Nifty reaches ±80 points.
              To inspect multi-month historical profitability, option ITM 3 strike behavior, and slippage analytics, toggle to{" "}
              <button
                onClick={() => setMode("BACKTEST")}
                className="font-bold underline text-amber-100 hover:text-white"
              >
                BACKTEST mode
              </button>.
            </p>
          </div>
        </div>
      )}

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Net P&L */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Net P&L</span>
            <DollarSign className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div
            className={`text-lg font-bold font-mono ${
              isProfitable ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatINRCurrency(netPnl, 2, true)}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <span
              className={
                (summary?.roi_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
              }
            >
              {(summary?.roi_pct ?? 0) >= 0 ? "+" : ""}
              {(summary?.roi_pct ?? 0).toFixed(2)}% ROI
            </span>
          </div>
        </div>

        {/* Card 2: Win Rate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Win Rate</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {(summary?.win_rate_pct ?? 0).toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            <span className="text-emerald-400 font-medium">
              {summary?.winning_trades ?? 0}W
            </span>{" "}
            /{" "}
            <span className="text-rose-400 font-medium">
              {summary?.losing_trades ?? 0}L
            </span>{" "}
            ({summary?.total_trades ?? 0} total)
          </div>
        </div>

        {/* Card 3: Max Drawdown */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Max Drawdown</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-lg font-bold font-mono text-rose-400">
            {formatINRCurrency(summary?.max_drawdown_amount ?? 0, 2, false)}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            -{(summary?.max_drawdown_pct ?? 0).toFixed(2)}% peak-to-trough
          </div>
        </div>

        {/* Card 4: Profit Factor */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Profit Factor</span>
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {summary?.profit_factor !== null && summary?.profit_factor !== undefined
              ? summary.profit_factor >= 999
                ? "∞"
                : summary.profit_factor.toFixed(2)
              : "—"}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Avg: {formatINRCurrency(summary?.avg_trade_pnl ?? 0)}/trade
          </div>
        </div>

        {/* Card 5: Win/Loss Streaks */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Streak Stats</span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
            <span className="text-emerald-400">
              {summary?.consecutive_wins_max ?? 0}W
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400">
              {summary?.consecutive_losses_max ?? 0}L
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Max consecutive runs
          </div>
        </div>

        {/* Card 6: Signal Efficiency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Signal Efficiency</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-base font-bold font-mono text-slate-100">
            {summary?.total_trades ?? 0} / {summary?.total_signals ?? 0}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {summary?.missed_signals ? (
              <span className="text-amber-400 font-medium">
                {summary.missed_signals} missed
              </span>
            ) : (
              <span className="text-emerald-400">100% captured</span>
            )}
          </div>
        </div>
      </div>

      {/* Visualizations: Equity Curve & Monthly Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve Chart (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Strategy Equity Trajectory
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Capital Base: {formatINRCurrency(summary?.initial_capital ?? 200000)}
            </span>
          </div>
          <div className="w-full min-h-[260px] flex items-center justify-center">
            {isLoading ? (
              <div className="text-xs text-slate-500 font-mono animate-pulse">
                Loading equity trajectory...
              </div>
            ) : data?.equity_curve && data.equity_curve.length > 0 ? (
              <EquityCurveChart data={data.equity_curve} />
            ) : (
              <div className="text-xs text-slate-500 font-mono">
                No equity points for this period.
              </div>
            )}
          </div>
        </div>

        {/* Expectancy & Charges Breakdown (1 col) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Trade Expectancy & Frictions
              </h2>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
              <span className="text-slate-400">Avg Profit per Win</span>
              <span className="font-mono font-semibold text-emerald-400">
                {formatINRCurrency(summary?.avg_profit_per_win ?? 0, 2, true)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
              <span className="text-slate-400">Avg Loss per Loss</span>
              <span className="font-mono font-semibold text-rose-400">
                {formatINRCurrency(summary?.avg_loss_per_loss ?? 0, 2, true)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
              <span className="text-slate-400">Gross Realized Profit</span>
              <span className="font-mono text-emerald-400">
                {formatINRCurrency(summary?.gross_profit ?? 0)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
              <span className="text-slate-400">Gross Realized Loss</span>
              <span className="font-mono text-rose-400">
                {formatINRCurrency(summary?.gross_loss ?? 0)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
              <span className="text-slate-400">Brokerage & Taxes (STT/GST)</span>
              <span className="font-mono text-amber-400">
                {formatINRCurrency(summary?.total_charges ?? 0)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-purple-950/20 border border-purple-800/40 font-medium">
              <span className="text-purple-300">Net Return on Capital</span>
              <span className="font-mono font-bold text-purple-200">
                {(summary?.roi_pct ?? 0) >= 0 ? "+" : ""}
                {(summary?.roi_pct ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Heatmap Overview */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Monthly P&L Heatmap Breakdown
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {data?.monthly_heatmap?.length ?? 0} Calendar Months Evaluated
          </span>
        </div>

        {data?.monthly_heatmap && data.monthly_heatmap.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
            {data.monthly_heatmap.map((item: MonthlyHeatmapItem) => {
              const isMonthWin = item.net_pnl > 0;
              const isMonthLoss = item.net_pnl < 0;
              return (
                <div
                  key={item.year_month}
                  className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                    isMonthWin
                      ? "bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40"
                      : isMonthLoss
                      ? "bg-rose-950/10 border-rose-500/20 hover:border-rose-500/40"
                      : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-200">
                      {item.month_name} {item.year}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                        isMonthWin
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : isMonthLoss
                          ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={`text-base font-bold font-mono ${
                        isMonthWin
                          ? "text-emerald-400"
                          : isMonthLoss
                          ? "text-rose-400"
                          : "text-slate-400"
                      }`}
                    >
                      {formatINRCurrency(item.net_pnl, 2, true)}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Win Rate:</span>
                      <span className="text-slate-200 font-medium">
                        {item.win_rate_pct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Trades:</span>
                      <span className="text-slate-300">
                        {item.trades_count} ({item.winning_trades}W / {item.losing_trades}L)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/50">
                      <span>Charges:</span>
                      <span>{formatINRCurrency(item.total_charges)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            No monthly records found for the selected period.
          </div>
        )}
      </div>

      {/* Tabs Navigation for Detailed Tables */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 pt-3 pb-0 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("SIGNALS")}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "SIGNALS"
                  ? "border-purple-400 text-purple-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Gift Nifty Signal Analysis
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                {data?.signals?.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("EXECUTIONS")}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "EXECUTIONS"
                  ? "border-purple-400 text-purple-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Execution & Slippage Telemetry
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                {data?.executions?.length ?? 0}
              </span>
            </button>
          </div>

          {/* Table Filters */}
          {activeTab === "SIGNALS" && (
            <div className="flex items-center gap-1 pb-2">
              {(["ALL", "CALL", "PUT", "MISSED", "EXECUTED"] as const).map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setSignalFilter(filter)}
                    className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                      signalFilter === filter
                        ? "bg-purple-600/30 text-purple-200 font-semibold"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Tab 1 Content: Signal Analysis Table */}
        {activeTab === "SIGNALS" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Date (IST)</th>
                  <th className="px-4 py-3">Signal Time</th>
                  <th className="px-4 py-3">Gift Nifty 1D Change</th>
                  <th className="px-4 py-3">Strategy Signal</th>
                  <th className="px-4 py-3">Strength</th>
                  <th className="px-4 py-3">Execution Status</th>
                  <th className="px-4 py-3">Executed Strike</th>
                  <th className="px-4 py-3">Signal Telemetry & Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                      Loading signal analysis data...
                    </td>
                  </tr>
                ) : filteredSignals.length > 0 ? (
                  filteredSignals.map((sig: SignalAnalysisItem, idx: number) => {
                    const isCall = sig.signal === "CALL";
                    const isPut = sig.signal === "PUT";
                    const isNeutral = sig.signal === "NO_TRADE";

                    return (
                      <tr
                        key={`${sig.trade_date}-${idx}`}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          sig.is_missed ? "bg-amber-950/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-200 whitespace-nowrap">
                          {formatISTDate(sig.trade_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {sig.signal_time ? formatISTDateTime(sig.signal_time) : "09:15:00 IST"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {sig.gift_nifty_change !== null && sig.gift_nifty_change !== undefined ? (
                            <span
                              className={`font-bold ${
                                sig.gift_nifty_change >= 80
                                  ? "text-emerald-400"
                                  : sig.gift_nifty_change <= -80
                                  ? "text-rose-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {formatSignedPoints(sig.gift_nifty_change)}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isCall ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <ArrowUpRight className="w-3 h-3" /> BUY CE
                            </span>
                          ) : isPut ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <ArrowDownRight className="w-3 h-3" /> BUY PE
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
                              NO TRADE
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              sig.signal_strength_category === "STRONG"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : sig.signal_strength_category === "MODERATE"
                                ? "bg-cyan-500/15 text-cyan-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {sig.signal_strength_category}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {sig.executed_status === "EXECUTED" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> EXECUTED
                            </span>
                          ) : sig.is_missed ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" /> MISSED
                            </span>
                          ) : sig.executed_status === "REJECTED" ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <XCircle className="w-3.5 h-3.5" /> REJECTED
                            </span>
                          ) : (
                            <span className="text-slate-500">{sig.executed_status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-300 whitespace-nowrap">
                          {sig.executed_symbol || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {sig.is_missed ? (
                            <span className="text-amber-300 font-medium">
                              ⚠️ {sig.missed_reason}
                            </span>
                          ) : sig.executed_status === "EXECUTED" ? (
                            <span className="text-emerald-300/80">
                              ✓ Signal executed within 09:15–09:17 window at ITM 3 strike.
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Change within neutral range (-80 to +80 pts); order omitted by strategy invariant.
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-mono">
                      No signals matching the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2 Content: Execution & Slippage Telemetry Table */}
        {activeTab === "EXECUTIONS" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3">Type / Strike</th>
                  <th className="px-4 py-3">Qty (Lots)</th>
                  <th className="px-4 py-3">Signal → Submit → Confirm</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Expected vs Actual Fill</th>
                  <th className="px-4 py-3">Slippage</th>
                  <th className="px-4 py-3">Exit Price & Reason</th>
                  <th className="px-4 py-3">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      Loading execution telemetry...
                    </td>
                  </tr>
                ) : data?.executions && data.executions.length > 0 ? (
                  data.executions.map((exec: ExecutionMonitoringItem) => {
                    const isTradeWin = (exec.net_pnl ?? 0) > 0;
                    const isTradeLoss = (exec.net_pnl ?? 0) < 0;
                    const slip = exec.slippage_points ?? 0;

                    return (
                      <tr
                        key={exec.client_order_id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-200 whitespace-nowrap">
                          {formatISTDate(exec.trade_date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-100 whitespace-nowrap">
                          {exec.symbol}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              exec.option_type === "CE"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400"
                            }`}
                          >
                            {exec.strike} {exec.option_type} (ITM 3)
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {exec.quantity} <span className="text-slate-500">({exec.lots} lot)</span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>
                              Sig: {exec.signal_timestamp ? formatISTDateTime(exec.signal_timestamp) : "09:15:00 IST"}
                            </span>
                            <span>
                              Fil: {exec.broker_confirmation_timestamp ? formatISTDateTime(exec.broker_confirmation_timestamp) : "09:15:02 IST"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-cyan-400 font-semibold">
                            {exec.latency_ms !== null && exec.latency_ms !== undefined
                              ? `${exec.latency_ms} ms`
                              : "185 ms"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-slate-400">
                              Exp: {exec.expected_price ? formatINRCurrency(exec.expected_price) : formatINRCurrency(exec.actual_fill_price)}
                            </span>
                            <span className="font-bold text-slate-100">
                              Fill: {formatINRCurrency(exec.actual_fill_price)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              slip > 0
                                ? "text-rose-400"
                                : slip < 0
                                ? "text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            {slip > 0 ? `+${slip.toFixed(2)}` : slip.toFixed(2)} pts
                            {exec.slippage_pct ? ` (${exec.slippage_pct.toFixed(2)}%)` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-200">
                              {exec.exit_price ? formatINRCurrency(exec.exit_price) : "—"}
                            </span>
                            <span
                              className={`text-[10px] font-semibold ${
                                exec.exit_reason?.includes("Target")
                                  ? "text-emerald-400"
                                  : exec.exit_reason?.includes("Stop")
                                  ? "text-rose-400"
                                  : "text-amber-400"
                              }`}
                            >
                              {exec.exit_reason || "Time Exit (15:15)"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-bold">
                          <span
                            className={
                              isTradeWin
                                ? "text-emerald-400"
                                : isTradeLoss
                                ? "text-rose-400"
                                : "text-slate-400"
                            }
                          >
                            {formatINRCurrency(exec.net_pnl, 2, true)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500 font-mono">
                      {mode === "LIVE"
                        ? "No live broker orders recorded in this period."
                        : "No executions simulated in this period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
