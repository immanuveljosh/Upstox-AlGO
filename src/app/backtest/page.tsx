"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import { BacktestDurationCode, BacktestResult } from "@/types/trading";
import { formatINRCurrency, formatISTDate } from "@/lib/format";
import {
  Play,
  Download,
  Compass,
  RefreshCw,
  TableProperties,
  ArrowRight,
} from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
  StatusBadge,
} from "@/components/ui/DesignSystem";

const DURATION_OPTIONS: { code: BacktestDurationCode; label: string }[] = [
  { code: "1M", label: "1 Month" },
  { code: "3M", label: "3 Months" },
  { code: "6M", label: "6 Months" },
  { code: "1Y", label: "1 Year" },
  { code: "CUSTOM", label: "Custom Date Range" },
];

export default function BacktestPage() {
  const { strategy, addToast, backtestResult, setBacktestResult } = useTrading();

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
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const result = backtestResult;

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
          setBacktestResult(json.data as BacktestResult);
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
    [capitalInput, lotsInput, addToast, setBacktestResult]
  );

  // Run initial 3-Month backtest on page mount only if no result exists in shared context
  useEffect(() => {
    if (!backtestResult) {
      executeBacktest("3M");
    }
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
    }
  };

  const allDays = result?.days || [];
  const overallResult = result?.overall_result || "DATA UNAVAILABLE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Strategy Backtest"
        badge={<StatusBadge tone="neutral">Nifty Directional</StatusBadge>}
        subtitle="Historical verification using real Upstox NIFTY 50 and option candles with Asia/Kolkata intraday entry/exit timestamps."
        actions={
          <>
            <Link
              href="/strategy"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Strategy Overview</span>
            </Link>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!result || allDays.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-medium border border-slate-800 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>

            <Link
              href="/trade-history"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors"
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>View Detailed Trades</span>
            </Link>
          </>
        }
      />

      {/* Backtest Controls & Duration Selector Panel */}
      <Card
        title="Backtest parameters"
        subtitle="Select historical period, initial capital, and lot quantity"
      >
        <div className="space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-400 block">
                Historical duration
              </span>
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {DURATION_OPTIONS.map((opt) => {
                  const active = selectedDuration === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => setSelectedDuration(opt.code)}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? "bg-emerald-500 text-slate-950 font-semibold"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDuration === "CUSTOM" && (
              <div className="flex flex-wrap items-end gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    End date
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Initial capital (₹)
                </label>
                <input
                  type="number"
                  min={10000}
                  step={10000}
                  value={capitalInput}
                  onChange={(e) =>
                    setCapitalInput(
                      Math.max(10000, Number(e.target.value) || 200000)
                    )
                  }
                  className="w-36 h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs font-semibold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Lots (1L = {result?.lot_size || strategy.lotSize || 65})
                </label>
                <input
                  type="number"
                  min={1}
                  max={27}
                  value={lotsInput}
                  onChange={(e) =>
                    setLotsInput(
                      Math.max(
                        1,
                        Math.min(27, parseInt(e.target.value, 10) || 1)
                      )
                    )
                  }
                  className="w-20 h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs font-semibold text-slate-100 text-center focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={handleRunClick}
                disabled={isLoading}
                className="h-9 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run backtest</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block">Selected period</span>
              <strong className="font-mono text-slate-100 mt-0.5 block">
                {result?.duration_label ||
                  DURATION_OPTIONS.find((d) => d.code === selectedDuration)
                    ?.label}
                {result?.start_date
                  ? ` (${formatISTDate(result.start_date)} – ${formatISTDate(
                      result.end_date
                    )})`
                  : ""}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block">
                Stop loss ({result?.config?.stoploss_pct ?? 5}%)
              </span>
              <strong className="font-mono text-rose-400 mt-0.5 block tabular-nums">
                -
                {formatINRCurrency(
                  result?.config?.stoploss_amount ??
                    capitalInput * ((result?.config?.stoploss_pct ?? 5) / 100),
                  0
                )}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block">
                Target profit ({result?.config?.target_pct ?? 6}%)
              </span>
              <strong className="font-mono text-emerald-400 mt-0.5 block tabular-nums">
                +
                {formatINRCurrency(
                  result?.config?.target_amount ??
                    capitalInput * ((result?.config?.target_pct ?? 6) / 100),
                  0
                )}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block">Signal thresholds</span>
              <strong className="font-mono text-slate-200 mt-0.5 block">
                &ge; +80 CE / &le; -80 PE (ITM 3)
              </strong>
            </div>
          </div>
        </div>
      </Card>

      {/* Overall Result Banner */}
      {result && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge
                tone={
                  overallResult === "PROFIT"
                    ? "success"
                    : overallResult === "LOSS"
                    ? "danger"
                    : "neutral"
                }
              >
                OVERALL RESULT: {overallResult}
              </StatusBadge>
              <span className="text-xs font-mono text-slate-400">
                {result.duration_label} ({formatISTDate(result.start_date)} &rarr;{" "}
                {formatISTDate(result.end_date)})
              </span>
            </div>
            <p className="text-[13px] text-slate-300">{result.message}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/trade-history"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <TableProperties className="w-4 h-4 text-emerald-400" />
              <span>View Detailed Trades ({allDays.length} days)</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </div>
      )}

      {/* Summary KPI Cards: Grouped into clean sections with max 4 cards per row */}
      {result && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-100">
              Capital &amp; return summary
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Initial capital"
                value={formatINRCurrency(result.initial_capital, 0)}
                subtext={`Lots: ${result.lots} (${result.total_qty} Qty)`}
              />
              <StatCard
                label="Final capital"
                value={formatINRCurrency(result.final_capital, 2)}
                subtext={`After ${result.total_trades} trade(s)`}
                tone={
                  result.final_capital > result.initial_capital
                    ? "positive"
                    : result.final_capital < result.initial_capital
                    ? "negative"
                    : "default"
                }
              />
              <StatCard
                label="Net profit / loss"
                value={formatINRCurrency(result.net_pnl, 2, true)}
                subtext="Gross P&L minus charges"
                tone={
                  result.net_pnl > 0
                    ? "positive"
                    : result.net_pnl < 0
                    ? "negative"
                    : "default"
                }
              />
              <StatCard
                label="Net ROI %"
                value={`${
                  result.roi_pct > 0 ? "+" : ""
                }${result.roi_pct.toFixed(2)}%`}
                subtext="Return on capital"
                tone={
                  result.roi_pct > 0
                    ? "positive"
                    : result.roi_pct < 0
                    ? "negative"
                    : "default"
                }
              />
              <StatCard
                label="Gross profit"
                value={formatINRCurrency(result.gross_profit, 2, true)}
                subtext="Winning trades gross"
                tone="positive"
              />
              <StatCard
                label="Gross loss"
                value={formatINRCurrency(-Math.abs(result.gross_loss), 2, true)}
                subtext="Losing trades gross"
                tone="negative"
              />
              <StatCard
                label="Max drawdown"
                value={formatINRCurrency(result.max_drawdown_amount, 2)}
                subtext={`${result.max_drawdown_pct.toFixed(
                  2
                )}% peak-to-trough`}
                tone={result.max_drawdown_amount > 0 ? "negative" : "default"}
              />
              <StatCard
                label="Profit factor"
                value={
                  result.profit_factor !== null &&
                  result.profit_factor !== undefined
                    ? result.profit_factor.toFixed(2)
                    : "--"
                }
                subtext="Net wins / net losses"
                tone={
                  (result.profit_factor ?? 0) > 1
                    ? "positive"
                    : (result.profit_factor ?? 0) > 0
                    ? "negative"
                    : "default"
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-100">
              Execution &amp; signal statistics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total trades"
                value={String(result.total_trades)}
                subtext={`${result.total_trading_days} trading days`}
              />
              <StatCard
                label="Winning trades"
                value={String(result.winning_trades)}
                subtext={`Target exits: ${result.summary?.target_exits ?? 0}`}
                tone="positive"
              />
              <StatCard
                label="Losing trades"
                value={String(result.losing_trades)}
                subtext={`SL exits: ${result.summary?.sl_exits ?? 0}`}
                tone="negative"
              />
              <StatCard
                label="Win rate"
                value={`${result.win_rate_pct.toFixed(2)}%`}
                subtext={`${result.winning_trades}W / ${result.losing_trades}L`}
                tone={result.win_rate_pct >= 50 ? "positive" : "default"}
              />
              <StatCard
                label="No trade days"
                value={String(result.no_trade_days)}
                subtext={
                  result.data_unavailable_days > 0
                    ? `${result.data_unavailable_days} data unavailable`
                    : "Within -80 to +80 pts"
                }
              />
              <StatCard
                label="Total charges"
                value={formatINRCurrency(result.total_charges, 2)}
                subtext="Brokerage + STT + GST"
              />
            </div>
          </div>
        </div>
      )}

      {/* Equity Curve Visualization */}
      {result && result.equity_curve && result.equity_curve.length > 1 && (
        <Card
          title={`Historical equity curve (${result.duration_label})`}
          subtitle="Cumulative strategy capital trajectory after brokerage and statutory transaction charges"
          headerAction={
            <span className="text-xs font-mono text-slate-300 tabular-nums">
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
          }
        >
          <div className="h-40 w-full bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-end gap-1 overflow-x-auto">
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
                  title={`${pt.date}: ${formatINRCurrency(
                    pt.equity,
                    2
                  )} (Day P&L: ${formatINRCurrency(pt.pnl, 2, true)})`}
                  className="flex-1 min-w-[6px] h-full flex items-end group"
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t transition-colors ${
                      pt.pnl > 0
                        ? "bg-emerald-500/80 group-hover:bg-emerald-400"
                        : pt.pnl < 0
                        ? "bg-rose-500/80 group-hover:bg-rose-400"
                        : isGain
                        ? "bg-emerald-500/30"
                        : "bg-slate-700"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
