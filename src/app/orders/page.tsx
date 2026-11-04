"use client";

import React, { useState, useEffect, useCallback } from "react";
import { OrderTable } from "@/components/orders/OrderTable";
import {
  MonthlyBreakdown,
  DailyRecord,
} from "@/components/pnl/MonthlyBreakdown";
import {
  deriveDailyRecordsFromOrders,
  normalizePnlSummary,
} from "@/lib/pnlNormalizer";
import { useTrading } from "@/context/TradingContext";
import { ClipboardList } from "lucide-react";

export default function OrdersPage() {
  const { orders, strategy } = useTrading();
  const safeOrders = Array.isArray(orders) ? orders : [];
  const actualLotSize = strategy.lotSize || 65;

  const [apiRecords, setApiRecords] = useState<DailyRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const fetchSessionBreakdown = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionError(null);
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/pnl/summary?period=monthly"
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (json && (json.message || json.detail)) ||
          `Failed to load trading session breakdown (HTTP ${res.status}).`;
        setSessionError(String(msg));
        setApiRecords([]);
        return;
      }

      if (json && json.data) {
        const normalized = normalizePnlSummary(json.data, "monthly");
        setApiRecords(
          Array.isArray(normalized.dailyPnl) ? normalized.dailyPnl : []
        );
      } else {
        setApiRecords([]);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Unable to reach P&L session breakdown service.";
      setSessionError(`Session Breakdown API Error: ${msg}`);
      setApiRecords([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessionBreakdown();
  }, [fetchSessionBreakdown]);

  const orderDerivedRecords = deriveDailyRecordsFromOrders(safeOrders);
  const effectiveRecords: DailyRecord[] =
    apiRecords.length > 0 ? apiRecords : orderDerivedRecords;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Orders &amp; Trade Execution Log
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit trail of intraday Nifty Call/Put order entries,
            square-offs, and broker rejects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
            NIFTY Lot Size:{" "}
            <strong className="text-emerald-400">{actualLotSize}</strong> &bull;{" "}
            Active Config:{" "}
            <strong className="text-white">
              {strategy.lots}L &times; {actualLotSize} ={" "}
              {strategy.lots * actualLotSize} Qty
            </strong>
          </span>
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            Total Recorded:{" "}
            <strong className="text-white">{safeOrders.length}</strong>
          </span>
        </div>
      </div>

      {/* Main Orders Table */}
      <OrderTable />

      {/* Daily Trading Journal / Monthly Session Breakdown */}
      <MonthlyBreakdown
        records={effectiveRecords}
        isLoading={isLoadingSessions}
        error={sessionError}
      />
    </div>
  );
}
