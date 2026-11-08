"use client";

import React from "react";
import Link from "next/link";
import { OrderTable } from "@/components/orders/OrderTable";
import { useTrading } from "@/context/TradingContext";
import { LineChart, ArrowRight } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/ui/DesignSystem";

export default function OrdersPage() {
  const { orders, strategy } = useTrading();
  const safeOrders = Array.isArray(orders) ? orders : [];
  const actualLotSize = strategy.lotSize || 65;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders & Execution Log"
        badge={<StatusBadge tone="neutral">{safeOrders.length} orders</StatusBadge>}
        subtitle="Real-time audit trail of intraday Nifty Call/Put order entries, square-offs, and broker rejections."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 tabular-nums">
              Lot size: <strong className="text-emerald-400">{actualLotSize}</strong> &bull;{" "}
              Config:{" "}
              <strong className="text-slate-100">
                {strategy.lots}L &times; {actualLotSize} ={" "}
                {strategy.lots * actualLotSize} Qty
              </strong>
            </span>

            <Link
              href="/pnl"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-emerald-400 transition-colors"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>See daily breakdown in P&amp;L</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      />

      {/* Main Orders Table */}
      <OrderTable />
    </div>
  );
}
