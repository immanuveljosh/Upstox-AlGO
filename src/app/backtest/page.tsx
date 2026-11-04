"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import {
  BacktestDurationCode,
  BacktestResult,
  BacktestDay,
} from "@/types/trading";
import {
  formatINRCurrency,
  formatISTDate,
  formatISTDateTime,
  formatSignedPoints,
} from "@/lib/format";
import {
  History,
  Play,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Filter,
  RefreshCw,
} from "lucide-react";

const DURATION_OPTIONS: { code: BacktestDurationCode; label: string }[] = [
  { code: "1M", label: "1 Month" },
  { code: "3M", label: "3 Months" },
  { code: "6M", label: "6 Months" },
  { code: "1Y", label: "1 Year" },
  { code: "CUSTOM", label: "Custom Date Range" },
];

type RowFilter = "ALL" | "EXECUTED" | "SIGNALS" | "NO_TRADE";

export default function BacktestPage() {
  const { strategy, addToast } = useTrading();

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
  const [capitalInput, setCapitalInput] = useState<number>(
    strategy.totalCapital || 200000
  );
  const [lotsInput, setLotsInput] = useState<number>(strategy.lots || 1);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [rowFilter, setRowFilter] = useState<RowFilter>("ALL");

  useEffect(() => {
    setCapitalInput(strategy.totalCapital || 200000);
    setLotsInput(strategy.lots || 1);
  }, [strategy.totalCapital, strategy.lots]);

  const executeBacktest = useCallback(
    async (
      durationCode: BacktestDurationCode,
      fromDate?: string,
      toDate?: string,
      cap?: number,
      lotsVal?: number
    ) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("duration", durationCode);
        params.set("capital", String(cap ?? capitalInput));
        params.set("lots", String(lotsVal ?? lotsInput));
        if (durationCode === "CUSTOM") {
          if (fromDate) params.set("from_date", fromDate);
          if (toDate) params.set("to_date", toDate);
        }

        const res = await fetch(
          `http://localhost:8000/api/v1/strategy/backtest?${params.toString()}`
        );
        const json = await res.json();
        if (res.ok && json.data) {
          setResult(json.data as BacktestResult);
        } else {
          addToast({
            type: "error",
            title: "Backtest Error",
            message: json.message || "Could not execute historical backtest.",
          });
        }
      } catch {
        addToast({
          type: "error",
          title: "Backend Offline",
          message:
            "Could not reach FastAPI backtest engine at http://localhost:8000.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [capitalInput, lotsInput, addToast]
  );

  // Run initial 3-Month backtest on page mount
  useEffect(() => {
    executeBacktest("3M");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunClick = () => {
    if (selectedDuration === "CUSTOM" && customStartDate > customEndDate) {
      addToast({
        type: "warning",
        title: "Invalid Date Range",
        message: "Start Date cannot be after End Date.",
      });
      return;
    }
    executeBacktest(
      selectedDuration,
      selectedDuration === "CUSTOM" ? customStartDate : undefined,
      selectedDuration === "CUSTOM" ? customEndDate : undefined,
      capitalInput,
      lotsInput
    );
  };

  const handleExportCsv = () => {
    if (!result) return;
    if (result.run_id) {
      window.open(
        `http://localhost:8000/api/v1/strategy/backtest/runs/${result.run_id}/export.csv`,
        "_blank"
      );
      return;
    }
  };

  const allDays: BacktestDay[] = result?.days || [];
  const filteredDays = allDays.filter((d) => {
    if (rowFilter === "EXECUTED") {
      return (
        d.result === "PROFIT" ||
        d.result === "LOSS" ||
        d.result === "BREAK EVEN"
      );
    }
    if (rowFilter === "SIGNALS") {
      return d.signal === "CALL" || d.signal === "PUT";
    }
    if (rowFilter === "NO_TRADE") {
      return d.signal === "NO TRADE";
    }
    return true;
  });

  const overallResult = result?.overall_result || "DATA UNAVAILABLE";
  const bannerStyle =
    overallResult === "PROFIT"
      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
      : overallResult === "LOSS"
      ? "bg-rose-950/30 border-rose-500/40 text-rose-300"
      : overallResult === "BREAK EVEN"
      ? "bg-slate-900 border-slate-700 text-slate-200"
      : "bg-amber-950/25 border-amber-500/40 text-amber-300";

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <History className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Strategy Backtest &amp; Historical Performance
            </h1>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Nifty Directional
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Historical verification using real Upstox NIFTY 50 &amp; option
            candles &bull; Zero fabricated premiums &bull; Exact{" "}
            <span className="font-mono text-slate-300">Asia/Kolkata</span>{" "}
            intraday entry/exit timestamps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/strategy"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>Strategy Overview</span>
          </Link>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!result || allDays.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Backtest Controls & Duration Selector Panel */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 border-b border-slate-800">
          {/* Duration Segmented Selector */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Select Historical Duration
            </span>
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              {DURATION_OPTIONS.map((opt) => {
                const active = selectedDuration === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setSelectedDuration(opt.code)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Range Pickers */}
          {selectedDuration === "CUSTOM" && (
            <div className="flex flex-wrap items-end gap-3 bg-slate-950/90 p-3 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Capital, Lots & RUN BACKTEST CTA */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Initial Capital (₹)
              </label>
              <input
                type="number"
                min={10000}
                step={10000}
                value={capitalInput}
                onChange={(e) =>
                  setCapitalInput(Math.max(10000, Number(e.target.value) || 200000))
                }
                className="w-36 h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 font-mono text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Lots (1L = {result?.lot_size || strategy.lotSize || 65})
              </label>
              <input
                type="number"
                min={1}
                max={27}
                value={lotsInput}
                onChange={(e) =>
                  setLotsInput(
                    Math.max(1, Math.min(27, parseInt(e.target.value, 10) || 1))
                  )
                }
                className="w-20 h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono text-xs font-bold text-white text-center focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleRunClick}
              disabled={isLoading}
              className="h-9 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>RUNNING BACKTEST...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RUN BACKTEST</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Strategy Parameters Metadata Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Strategy Name
            </span>
            <strong className="font-mono text-white">Nifty Directional</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Selected Period
            </span>
            <strong className="font-mono text-emerald-400">
              {result?.duration_label ||
                DURATION_OPTIONS.find((d) => d.code === selectedDuration)?.label}
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Start Date
            </span>
            <strong className="font-mono text-white">
              {result?.start_date ? formatISTDate(result.start_date) : "—"}
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              End Date
            </span>
            <strong className="font-mono text-white">
              {result?.end_date ? formatISTDate(result.end_date) : "—"}
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Stop Loss (4%)
            </span>
            <strong className="font-mono text-rose-400">
              -
              {formatINRCurrency(
                result?.config?.stoploss_amount ?? capitalInput * 0.04,
                0
              )}
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Target (5%)
            </span>
            <strong className="font-mono text-emerald-400">
              +
              {formatINRCurrency(
                result?.config?.target_amount ?? capitalInput * 0.05,
                0
              )}
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Option Selection
            </span>
            <strong className="font-mono text-cyan-300">ITM 3 (Chain)</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-500 block">
              Signal Thresholds
            </span>
            <strong className="font-mono text-white">
              &ge;+80 CE / &le;-80 PE
            </strong>
          </div>
        </div>
      </div>

      {/* Overall Result Banner */}
      {result && (
        <div
          className={`rounded-xl border p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${bannerStyle}`}
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-slate-950/70 border border-current font-bold">
                OVERALL RESULT: {overallResult}
              </span>
              <span className="text-xs font-mono text-slate-300">
                {result.duration_label} ({formatISTDate(result.start_date)} &rarr;{" "}
                {formatISTDate(result.end_date)})
              </span>
            </div>
            <p className="text-xs text-slate-200/90 mt-1">{result.message}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/90 shrink-0">
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">
                Initial Capital
              </span>
              <span className="text-sm font-mono font-bold text-white tabular-nums">
                {formatINRCurrency(result.initial_capital, 0)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">
                Net Profit / Loss
              </span>
              <span
                className={`text-sm font-mono font-black tabular-nums ${
                  result.net_pnl > 0
                    ? "text-emerald-400"
                    : result.net_pnl < 0
                    ? "text-rose-400"
                    : "text-slate-200"
                }`}
              >
                {formatINRCurrency(result.net_pnl, 2, true)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">
                Final Capital
              </span>
              <span className="text-sm font-mono font-bold text-white tabular-nums">
                {formatINRCurrency(result.final_capital, 2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">
                Net ROI %
              </span>
              <span
                className={`text-sm font-mono font-black tabular-nums ${
                  result.roi_pct > 0
                    ? "text-emerald-400"
                    : result.roi_pct < 0
                    ? "text-rose-400"
                    : "text-slate-200"
                }`}
              >
                {result.roi_pct > 0 ? "+" : ""}
                {result.roi_pct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 14 Required Summary Cards */}
      {result && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <SummaryMetricCard
            label="1. Initial Capital"
            value={formatINRCurrency(result.initial_capital, 0)}
            sub={`Lots: ${result.lots} (${result.total_qty} Qty)`}
          />
          <SummaryMetricCard
            label="2. Final Capital"
            value={formatINRCurrency(result.final_capital, 2)}
            sub={`After ${result.total_trades} trade(s)`}
            tone={
              result.final_capital > result.initial_capital
                ? "positive"
                : result.final_capital < result.initial_capital
                ? "negative"
                : "neutral"
            }
          />
          <SummaryMetricCard
            label="3. Total Trades"
            value={String(result.total_trades)}
            sub={`${result.total_trading_days} Trading Days`}
          />
          <SummaryMetricCard
            label="4. Winning Trades"
            value={String(result.winning_trades)}
            sub={`Target Exits: ${result.summary?.target_exits ?? 0}`}
            tone="positive"
          />
          <SummaryMetricCard
            label="5. Losing Trades"
            value={String(result.losing_trades)}
            sub={`SL Exits: ${result.summary?.sl_exits ?? 0}`}
            tone="negative"
          />
          <SummaryMetricCard
            label="6. No Trade Days"
            value={String(result.no_trade_days)}
            sub={
              result.data_unavailable_days > 0
                ? `${result.data_unavailable_days} Data Unavail.`
                : "Within -80 to +80"
            }
          />
          <SummaryMetricCard
            label="7. Win Rate"
            value={`${result.win_rate_pct.toFixed(2)}%`}
            sub={`${result.winning_trades}W / ${result.losing_trades}L`}
            tone={result.win_rate_pct >= 50 ? "positive" : "neutral"}
          />
          <SummaryMetricCard
            label="8. Gross Profit"
            value={formatINRCurrency(result.gross_profit, 2, true)}
            sub="Winning trades gross"
            tone="positive"
          />
          <SummaryMetricCard
            label="9. Gross Loss"
            value={formatINRCurrency(-Math.abs(result.gross_loss), 2, true)}
            sub="Losing trades gross"
            tone="negative"
          />
          <SummaryMetricCard
            label="10. Total Charges"
            value={formatINRCurrency(result.total_charges, 2)}
            sub="Brokerage + STT + GST"
          />
          <SummaryMetricCard
            label="11. Net Profit / Loss"
            value={formatINRCurrency(result.net_pnl, 2, true)}
            sub="Gross P&L - Charges"
            tone={
              result.net_pnl > 0
                ? "positive"
                : result.net_pnl < 0
                ? "negative"
                : "neutral"
            }
          />
          <SummaryMetricCard
            label="12. ROI %"
            value={`${result.roi_pct > 0 ? "+" : ""}${result.roi_pct.toFixed(2)}%`}
            sub="Return on Capital"
            tone={
              result.roi_pct > 0
                ? "positive"
                : result.roi_pct < 0
                ? "negative"
                : "neutral"
            }
          />
          <SummaryMetricCard
            label="13. Max Drawdown"
            value={formatINRCurrency(result.max_drawdown_amount, 2)}
            sub={`${result.max_drawdown_pct.toFixed(2)}% peak-to-trough`}
            tone={result.max_drawdown_amount > 0 ? "negative" : "neutral"}
          />
          <SummaryMetricCard
            label="14. Profit Factor"
            value={
              result.profit_factor !== null &&
              result.profit_factor !== undefined
                ? result.profit_factor.toFixed(2)
                : "—"
            }
            sub="Net Wins / Net Losses"
            tone={
              (result.profit_factor ?? 0) > 1
                ? "positive"
                : (result.profit_factor ?? 0) > 0
                ? "negative"
                : "neutral"
            }
          />
        </div>
      )}

      {/* Equity Curve Visualization */}
      {result && result.equity_curve && result.equity_curve.length > 1 && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">
                Historical Equity Curve ({result.duration_label})
              </h2>
              <p className="text-[11px] text-slate-400">
                Cumulative strategy capital trajectory after brokerage &amp;
                statutory transaction charges.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-300">
              Start: {formatINRCurrency(result.initial_capital, 0)} &rarr; End:{" "}
              <strong
                className={
                  result.final_capital >= result.initial_capital
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                {formatINRCurrency(result.final_capital, 2)}
              </strong>
            </span>
          </div>

          <div className="h-36 w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 flex items-end gap-1 overflow-x-auto">
            {result.equity_curve.map((pt, idx) => {
              const equities = result.equity_curve.map((p) => p.equity);
              const minEq = Math.min(...equities, result.initial_capital * 0.95);
              const maxEq = Math.max(...equities, result.initial_capital * 1.05);
              const span = Math.max(1, maxEq - minEq);
              const heightPct = Math.max(
                10,
                Math.min(100, ((pt.equity - minEq) / span) * 100)
              );
              const isGain = pt.equity >= result.initial_capital;
              return (
                <div
                  key={`${pt.date}-${idx}`}
                  title={`${pt.date}: ${formatINRCurrency(pt.equity, 2)} (Day P&L: ${formatINRCurrency(pt.pnl, 2, true)})`}
                  className="flex-1 min-w-[6px] h-full flex items-end group"
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t transition-all ${
                      pt.pnl > 0
                        ? "bg-emerald-500/80 group-hover:bg-emerald-400"
                        : pt.pnl < 0
                        ? "bg-rose-500/80 group-hover:bg-rose-400"
                        : isGain
                        ? "bg-emerald-500/35"
                        : "bg-slate-700"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Historical Trade Table (15 Required Columns) */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Detailed Historical Trade Table
            </h2>
            <p className="text-[11px] text-slate-400">
              All trading days in selected range with Gift Nifty 1-Day change,
              ITM 3 contract strike, IST entry/exit timestamps, charges, and
              net P&amp;L.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(
              [
                { id: "ALL", label: `All Days (${allDays.length})` },
                {
                  id: "EXECUTED",
                  label: `Executed Trades (${result?.total_trades ?? 0})`,
                },
                {
                  id: "SIGNALS",
                  label: `Signal Days (${
                    allDays.filter(
                      (d) => d.signal === "CALL" || d.signal === "PUT"
                    ).length
                  })`,
                },
                {
                  id: "NO_TRADE",
                  label: `No Trade (${result?.no_trade_days ?? 0})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRowFilter(tab.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                  rowFilter === tab.id
                    ? "bg-slate-800 text-emerald-400 border border-slate-700"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/90 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                <th className="py-3 px-3 whitespace-nowrap">1. Trade Date</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  2. Gift Nifty Change
                </th>
                <th className="py-3 px-3 whitespace-nowrap">3. Signal</th>
                <th className="py-3 px-3 whitespace-nowrap">4. Option Type</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  5. Strike
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  6. Entry Date &amp; Time
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  7. Entry Price
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  8. Exit Date &amp; Time
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  9. Exit Price
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  10. Quantity
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  11. Gross P&amp;L
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  12. Charges
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-right">
                  13. Net P&amp;L
                </th>
                <th className="py-3 px-3 whitespace-nowrap">14. Exit Reason</th>
                <th className="py-3 px-3 whitespace-nowrap">15. Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {filteredDays.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="py-10 text-center text-slate-400 text-xs"
                  >
                    {isLoading
                      ? "Evaluating historical candles..."
                      : "No historical rows match the selected filter."}
                  </td>
                </tr>
              ) : (
                filteredDays.map((row) => {
                  const isCall = row.signal === "CALL";
                  const isPut = row.signal === "PUT";
                  const isProfit = row.result === "PROFIT";
                  const isLoss = row.result === "LOSS";
                  const isNoTrade = row.result === "NO TRADE";

                  return (
                    <tr
                      key={row.trade_date}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Trade Date */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-white font-semibold">
                        {formatISTDate(row.trade_date)}
                      </td>

                      {/* 2. Gift Nifty Change */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-bold ${
                          row.gift_nifty_change === null ||
                          row.gift_nifty_change === undefined
                            ? "text-slate-500"
                            : row.gift_nifty_change >= 80
                            ? "text-emerald-400"
                            : row.gift_nifty_change <= -80
                            ? "text-rose-400"
                            : "text-slate-300"
                        }`}
                      >
                        {formatSignedPoints(row.gift_nifty_change)}
                      </td>

                      {/* 3. Signal */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isCall
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : isPut
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {row.signal}
                        </span>
                      </td>

                      {/* 4. Option Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.option_type ? (
                          <span
                            className={`font-bold ${
                              row.option_type === "CE"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {row.option_type}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* 5. Strike */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.strike ? row.strike : "—"}
                      </td>

                      {/* 6. Entry Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {formatISTDateTime(
                          row.entry_time,
                          row.entry_time_display
                        )}
                      </td>

                      {/* 7. Entry Price */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.entry_price !== null &&
                        row.entry_price !== undefined
                          ? formatINRCurrency(row.entry_price, 2)
                          : "—"}
                      </td>

                      {/* 8. Exit Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {formatISTDateTime(row.exit_time, row.exit_time_display)}
                      </td>

                      {/* 9. Exit Price */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.exit_price !== null && row.exit_price !== undefined
                          ? formatINRCurrency(row.exit_price, 2)
                          : "—"}
                      </td>

                      {/* 10. Quantity */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.quantity !== null && row.quantity !== undefined
                          ? row.quantity
                          : "—"}
                      </td>

                      {/* 11. Gross P&L */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-semibold ${
                          row.gross_pnl === null || row.gross_pnl === undefined
                            ? "text-slate-500"
                            : row.gross_pnl > 0
                            ? "text-emerald-400"
                            : row.gross_pnl < 0
                            ? "text-rose-400"
                            : "text-slate-300"
                        }`}
                      >
                        {row.gross_pnl !== null && row.gross_pnl !== undefined
                          ? formatINRCurrency(row.gross_pnl, 2, true)
                          : "—"}
                      </td>

                      {/* 12. Charges */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-400">
                        {row.charges !== null && row.charges !== undefined
                          ? formatINRCurrency(row.charges, 2)
                          : "—"}
                      </td>

                      {/* 13. Net P&L */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-bold ${
                          row.net_pnl === null || row.net_pnl === undefined
                            ? "text-slate-500"
                            : row.net_pnl > 0
                            ? "text-emerald-400"
                            : row.net_pnl < 0
                            ? "text-rose-400"
                            : "text-slate-300"
                        }`}
                      >
                        {row.net_pnl !== null && row.net_pnl !== undefined
                          ? formatINRCurrency(row.net_pnl, 2, true)
                          : "—"}
                      </td>

                      {/* 14. Exit Reason */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.exit_reason ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              row.exit_reason === "Target"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : row.exit_reason === "SL"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                            }`}
                          >
                            {row.exit_reason}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* 15. Result */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          title={row.note || ""}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isProfit
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                              : isLoss
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
                              : isNoTrade
                              ? "bg-slate-800 text-slate-400 border-slate-700"
                              : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                          }`}
                        >
                          {row.result}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryMetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-white";

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5 flex flex-col justify-between">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div
        className={`text-base font-black font-mono tabular-nums my-1.5 ${valueColor}`}
      >
        {value}
      </div>
      <span className="text-[10px] font-mono text-slate-500 truncate">
        {sub}
      </span>
    </div>
  );
}

