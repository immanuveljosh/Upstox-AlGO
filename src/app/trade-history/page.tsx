"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import { BacktestDay } from "@/types/trading";
import {
  formatINRCurrency,
  formatISTDate,
  formatISTDateTime,
  formatSignedPoints,
} from "@/lib/format";
import {
  Download,
  History,
  TableProperties,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  PageHeader,
  Card,
  EmptyState,
  StatusBadge,
} from "@/components/ui/DesignSystem";

type RowFilter = "ALL" | "EXECUTED" | "SIGNALS" | "NO_TRADE";
const PAGE_SIZE = 25;

export default function TradeHistoryPage() {
  const { backtestResult } = useTrading();
  const [rowFilter, setRowFilter] = useState<RowFilter>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);

  const result = backtestResult;
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

  useEffect(() => {
    setCurrentPage(1);
  }, [rowFilter, result]);

  const totalPages = Math.max(1, Math.ceil(filteredDays.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedDays = filteredDays.slice(startIndex, startIndex + PAGE_SIZE);

  const handleExportCsv = () => {
    if (!result) return;
    if (result.run_id) {
      window.open(
        `http://localhost:8000/api/v1/strategy/backtest/runs/${result.run_id}/export.csv`,
        "_blank"
      );
    }
  };

  if (!result || allDays.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Trade History"
          subtitle="Detailed historical session log with Gift Nifty signals, ITM 3 contract strikes, IST entry/exit timestamps, and net P&L."
        />

        <Card>
          <EmptyState
            icon={TableProperties}
            title="No backtest trade history loaded"
            description="Run a historical backtest first to inspect session-by-session Gift Nifty signals, strikes, charges, and realized P&L."
            action={
              <Link
                href="/backtest"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors"
              >
                <History className="w-4 h-4" />
                <span>Run a backtest</span>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade History"
        badge={
          <StatusBadge tone="neutral">
            {result.duration_label} ({formatISTDate(result.start_date)} &rarr;{" "}
            {formatISTDate(result.end_date)})
          </StatusBadge>
        }
        subtitle="All trading days in selected backtest range with Gift Nifty 1-Day change, ITM 3 contract strike, IST entry/exit timestamps, charges, and net P&L."
        actions={
          <>
            <Link
              href="/backtest"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Back to Backtest</span>
            </Link>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>
          </>
        }
      />

      {/* Detailed Historical Trade Table (15 Required Columns) */}
      <Card
        title="Detailed Historical Trade Table"
        subtitle={`Showing ${
          filteredDays.length === 0 ? 0 : startIndex + 1
        }–${Math.min(startIndex + PAGE_SIZE, filteredDays.length)} of ${
          filteredDays.length
        } matching sessions`}
        headerAction={
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(
              [
                { id: "ALL", label: `All Days (${allDays.length})` },
                {
                  id: "EXECUTED",
                  label: `Executed Trades (${result.total_trades ?? 0})`,
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
                  label: `No Trade (${result.no_trade_days ?? 0})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRowFilter(tab.id)}
                className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
                  rowFilter === tab.id
                    ? "bg-slate-800 text-emerald-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
        noPadding
      >
        {/* Scrollable container inside the card with sticky header */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800">
              <tr className="text-xs font-medium text-slate-400 font-mono">
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
              {paginatedDays.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="py-10 text-center text-slate-400 text-xs font-sans"
                  >
                    No historical rows match the selected filter.
                  </td>
                </tr>
              ) : (
                paginatedDays.map((row) => {
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
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-100 font-medium">
                        {formatISTDate(row.trade_date)}
                      </td>

                      {/* 2. Gift Nifty Change */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-semibold ${
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
                        <StatusBadge
                          tone={
                            isCall ? "success" : isPut ? "danger" : "neutral"
                          }
                        >
                          {row.signal}
                        </StatusBadge>
                      </td>

                      {/* 4. Option Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.option_type ? (
                          <span
                            className={`font-semibold ${
                              row.option_type === "CE"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {row.option_type}
                          </span>
                        ) : (
                          <span className="text-slate-500">--</span>
                        )}
                      </td>

                      {/* 5. Strike */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.strike ? row.strike : "--"}
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
                          : "--"}
                      </td>

                      {/* 8. Exit Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {formatISTDateTime(row.exit_time, row.exit_time_display)}
                      </td>

                      {/* 9. Exit Price */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.exit_price !== null && row.exit_price !== undefined
                          ? formatINRCurrency(row.exit_price, 2)
                          : "--"}
                      </td>

                      {/* 10. Quantity */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-200">
                        {row.quantity !== null && row.quantity !== undefined
                          ? row.quantity
                          : "--"}
                      </td>

                      {/* 11. Gross P&L */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-medium ${
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
                          : "--"}
                      </td>

                      {/* 12. Charges */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right text-slate-400">
                        {row.charges !== null && row.charges !== undefined
                          ? formatINRCurrency(row.charges, 2)
                          : "--"}
                      </td>

                      {/* 13. Net P&L */}
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap text-right font-semibold ${
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
                          : "--"}
                      </td>

                      {/* 14. Exit Reason */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.exit_reason ? (
                          <StatusBadge
                            tone={
                              row.exit_reason === "Target"
                                ? "success"
                                : row.exit_reason === "SL"
                                ? "danger"
                                : "info"
                            }
                          >
                            {row.exit_reason}
                          </StatusBadge>
                        ) : (
                          <span className="text-slate-500">--</span>
                        )}
                      </td>

                      {/* 15. Result */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <StatusBadge
                          tone={
                            isProfit
                              ? "success"
                              : isLoss
                              ? "danger"
                              : isNoTrade
                              ? "neutral"
                              : "warning"
                          }
                        >
                          {row.result}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls (25 rows per page) */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono tabular-nums">
              Page {safePage} of {totalPages} ({filteredDays.length} total rows)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 font-medium transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 font-medium transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

