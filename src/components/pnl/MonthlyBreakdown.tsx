"use client";

import React from "react";
import { formatINR } from "@/lib/utils";
import {
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import { Card, StatusBadge, EmptyState } from "@/components/ui/DesignSystem";

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
}: MonthlyBreakdownProps) {
  const safeRecords: DailyRecord[] = Array.isArray(records)
    ? records.filter(isValidDailyRecord)
    : [];

  return (
    <Card
      title="Daily Trading Journal Breakdown"
      subtitle="Session-by-session realized P&L summary"
      headerAction={
        <StatusBadge tone="neutral">
          {safeRecords.length} {safeRecords.length === 1 ? "session" : "sessions"}
        </StatusBadge>
      }
      noPadding
    >
      {isLoading && safeRecords.length === 0 ? (
        <div className="py-10 px-6 text-center text-xs text-slate-400 font-mono">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            Loading trading session breakdown...
          </span>
        </div>
      ) : safeRecords.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No closed trading sessions"
          description="No closed trading sessions recorded for this period yet."
        />
      ) : (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800">
              <tr className="text-xs font-medium text-slate-400">
                <th className="py-3 px-6">Date</th>
                <th className="py-3 px-6 text-right">Trades</th>
                <th className="py-3 px-6">Performance</th>
                <th className="py-3 px-6 text-right">Net session P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
              {safeRecords.map((r, idx) => {
                const isGreen = r.pnl >= 0;
                return (
                  <tr
                    key={`${r.date}-${idx}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-6 font-medium text-slate-200 whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-3 px-6 text-right text-slate-400 whitespace-nowrap">
                      {r.trades} {r.trades === 1 ? "trade" : "trades"}
                    </td>
                    <td className="py-3 px-6 whitespace-nowrap">
                      <StatusBadge tone={isGreen ? "success" : "danger"}>
                        {isGreen ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {isGreen ? "PROFIT" : "DRAWDOWN"}
                      </StatusBadge>
                    </td>
                    <td
                      className={`py-3 px-6 text-right font-semibold whitespace-nowrap ${
                        isGreen ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatINR(r.pnl, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
