"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { Order, OrderStatus } from "@/types/trading";
import { formatINR } from "@/lib/utils";
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

export function OrderTable() {
  const { orders } = useTrading();
  const [activeTab, setActiveTab] = useState<OrderStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const safeOrders: Order[] = Array.isArray(orders) ? orders : [];

  const filteredOrders = safeOrders.filter((order) => {
    if (!order || typeof order !== "object") return false;
    const matchesTab = activeTab === "ALL" ? true : order.status === activeTab;
    const symbolText = String(order.symbol || "").toLowerCase();
    const idText = String(order.id || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = symbolText.includes(query) || idText.includes(query);
    return matchesTab && matchesSearch;
  });

  const counts = {
    ALL: safeOrders.length,
    PLACED: safeOrders.filter((o) => o?.status === "PLACED").length,
    CLOSED: safeOrders.filter((o) => o?.status === "CLOSED").length,
    REJECTED: safeOrders.filter((o) => o?.status === "REJECTED").length,
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col">
      {/* Controls & Tabs */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["ALL", "PLACED", "CLOSED", "REJECTED"] as const).map((tab) => {
            const count = counts[tab];
            const label =
              tab === "ALL"
                ? "All Orders"
                : tab === "PLACED"
                ? "Placed Orders"
                : tab === "CLOSED"
                ? "Closed Orders"
                : "Rejected Orders";

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab
                    ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-950"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    activeTab === tab
                      ? "bg-slate-900 text-slate-200"
                      : "bg-slate-950 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search symbol or Order ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Symbol</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Lots &times; Lot Size</th>
              <th className="py-3 px-4 text-right">Total Qty</th>
              <th className="py-3 px-4 text-right">Price</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-xs">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  No orders found in this view.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order, idx) => {
                const isCall = order.type === "CE";
                const safePrice = Number(order.price ?? 0);
                const safeLots = Number(order.lots ?? 1);
                const safeQty = Number(order.qty ?? 65);
                const safeLotSize =
                  order.lotSize ||
                  Math.round(safeQty / Math.max(1, safeLots)) ||
                  65;

                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Clock className="w-3 h-3" />
                    PLACED
                  </span>
                );

                if (order.status === "CLOSED") {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      CLOSED
                    </span>
                  );
                } else if (order.status === "REJECTED") {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <AlertTriangle className="w-3 h-3" />
                      REJECTED
                    </span>
                  );
                }

                return (
                  <tr
                    key={order.id || `order-${idx}`}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {order.time || "—"}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {order.id || "—"}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-100">
                        {order.symbol || "—"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          isCall
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {order.type}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {safeLots} {safeLots === 1 ? "Lot" : "Lots"} &times;{" "}
                      <span className="text-emerald-400">{safeLotSize}</span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {safeQty}{" "}
                      <span className="text-[10px] font-normal text-slate-400">
                        Qty
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                      ₹{safePrice.toFixed(2)}
                      {order.exitPrice !== undefined &&
                        order.exitPrice !== null && (
                          <div className="text-[10px] text-slate-500">
                            Exit: ₹{Number(order.exitPrice).toFixed(2)}
                          </div>
                        )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {statusBadge}
                      {order.rejectReason && (
                        <div className="text-[10px] text-rose-400/90 text-left mt-1 line-clamp-1 max-w-xs">
                          {order.rejectReason}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold">
                      {order.pnl !== undefined &&
                      order.pnl !== null &&
                      order.status !== "REJECTED" ? (
                        <span
                          className={
                            order.pnl >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {formatINR(order.pnl, true)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
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
