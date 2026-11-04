"use client";

import React from "react";
import { formatINR } from "@/lib/utils";
import {
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export interface DailyRecord {
  date: string;
  pnl: number;
  trades: number;
}

export interface MonthlyBreakdownProps {
  records?: DailyRecord[] | null;
  isLoading?: boolean;
  error?: string | null;
}

function isValidDailyRecord(item: unknown): item is DailyRecord {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    candidate.date.trim().length > 0 &&
    typeof candidate.pnl === "number" &&
    !Number.isNaN(candidate.pnl) &&
    typeof candidate.trades === "number" &&
    !Number.isNaN(candidate.trades)
  );
}

export function MonthlyBreakdown({
  records = [],
  isLoading = false,
  error = null,
}: MonthlyBreakdownProps) {
  const safeRecords: DailyRecord[] = Array.isArray(records)
    ? records.filter(isValidDailyRecord)
    : [];

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">
            Daily Trading Journal Breakdown
          </h4>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {safeRecords.length} Trading{" "}
          {safeRecords.length === 1 ? "Session" : "Sessions"}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-2 text-xs text-rose-300"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Trades</th>
              <th className="py-3 px-4">Performance</th>
              <th className="py-3 px-4 text-right">Net Session P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {isLoading && safeRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 px-4 text-center text-slate-400 font-mono"
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    Loading trading session breakdown...
                  </span>
                </td>
              </tr>
            ) : safeRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 px-4 text-center text-slate-500 font-mono"
                >
                  No closed trading sessions recorded for this period.
                </td>
              </tr>
            ) : (
              safeRecords.map((r, idx) => {
                const isGreen = r.pnl >= 0;
                return (
                  <tr
                    key={`${r.date}-${idx}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">
                      {r.date}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {r.trades} {r.trades === 1 ? "trade" : "trades"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          isGreen
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {isGreen ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {isGreen ? "PROFIT" : "DRAWDOWN"}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                        isGreen ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatINR(r.pnl, true)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
