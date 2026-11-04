"use client";

import React from "react";
import { OrderTable } from "@/components/orders/OrderTable";
import { useTrading } from "@/context/TradingContext";
import { ClipboardList, ArrowDownToLine, RefreshCw } from "lucide-react";

export default function OrdersPage() {
  const { orders, connectionStatus, strategy } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";
  const actualLotSize = strategy.lotSize || 65;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Orders & Trade Execution Log
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit trail of intraday Nifty Call/Put order entries, square-offs, and broker rejects.
          </p>
        </div>

        {isConnected && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              NIFTY Lot Size: <strong className="text-emerald-400">{actualLotSize}</strong> &bull;{" "}
              Active Config:{" "}
              <strong className="text-white">
                {strategy.lots}L &times; {actualLotSize} = {strategy.lots * actualLotSize} Qty
              </strong>
            </span>
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
              Total Recorded: <strong className="text-white">{orders.length}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Main Orders Table */}
      <OrderTable />
    </div>
  );
}

