"use client";

import React from "react";
import { formatINR } from "@/lib/utils";
import { Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface DailyRecord {
  date: string;
  pnl: number;
  trades: number;
}

interface MonthlyBreakdownProps {
  records: DailyRecord[];
}

export function MonthlyBreakdown({ records }: MonthlyBreakdownProps) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">
            Daily Trading Journal Breakdown
          </h4>
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {records.length} Trading Sessions
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Trades</th>
              <th className="py-3 px-4">Performance</th>
              <th className="py-3 px-4 text-right">Net Session P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {records.map((r, idx) => {
              const isGreen = r.pnl >= 0;
              return (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
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
                    className={`py-3 px-4 text-right font-mono font-bold ${
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
    </div>
  );
}

