"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { Order, OrderStatus } from "@/types/trading";
import { formatINR } from "@/lib/utils";
import { Search, ClipboardList } from "lucide-react";
import { Card, StatusBadge, EmptyState } from "@/components/ui/DesignSystem";

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
    <Card noPadding>
      {/* Controls & Tabs */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["ALL", "PLACED", "CLOSED", "REJECTED"] as const).map((tab) => {
            const count = counts[tab];
            const label =
              tab === "ALL"
                ? "All orders"
                : tab === "PLACED"
                ? "Placed"
                : tab === "CLOSED"
                ? "Closed"
                : "Rejected";

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "bg-slate-800 text-slate-100 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-950 border border-transparent"
                }`}
              >
                <span>{label}</span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search symbol or Order ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders found"
          description={
            searchQuery
              ? "No orders match your search filter."
              : "Intraday order entries and square-offs will appear here."
          }
        />
      ) : (
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800">
              <tr className="text-xs font-medium text-slate-400">
                <th className="py-3 px-4 whitespace-nowrap">Time</th>
                <th className="py-3 px-4 whitespace-nowrap">Order ID</th>
                <th className="py-3 px-4 whitespace-nowrap">Symbol</th>
                <th className="py-3 px-4 whitespace-nowrap">Type</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  Lots &times; Lot size
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  Total qty
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  Price
                </th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  P&amp;L
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-mono tabular-nums">
              {filteredOrders.map((order, idx) => {
                const isCall = order.type === "CE";
                const safePrice = Number(order.price ?? 0);
                const safeLots = Number(order.lots ?? 1);
                const safeQty = Number(order.qty ?? 65);
                const safeLotSize =
                  order.lotSize ||
                  Math.round(safeQty / Math.max(1, safeLots)) ||
                  65;

                const rawStatus = String(order.status || "PLACED");
                const statusTone =
                  rawStatus === "CLOSED"
                    ? "success"
                    : rawStatus === "REJECTED" ||
                      rawStatus === "FAILED_EXIT"
                    ? "danger"
                    : rawStatus === "PENDING_EXIT"
                    ? "warning"
                    : "info";

                return (
                  <tr
                    key={order.id || `order-${idx}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {order.time || "--"}
                    </td>

                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {order.id || "--"}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-100 whitespace-nowrap">
                      {order.symbol || "--"}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge tone={isCall ? "success" : "danger"}>
                        {order.type}
                      </StatusBadge>
                    </td>

                    <td className="py-3 px-4 text-right text-slate-300 whitespace-nowrap">
                      {safeLots} &times; {safeLotSize}
                    </td>

                    <td className="py-3 px-4 text-right font-semibold text-slate-100 whitespace-nowrap">
                      {safeQty} Qty
                    </td>

                    <td className="py-3 px-4 text-right text-slate-200 whitespace-nowrap">
                      ₹{safePrice.toFixed(2)}
                      {order.exitPrice !== undefined &&
                        order.exitPrice !== null && (
                          <div className="text-xs text-slate-500">
                            Exit: ₹{Number(order.exitPrice).toFixed(2)}
                          </div>
                        )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge tone={statusTone}>{order.status}</StatusBadge>
                      {order.rejectReason && (
                        <div className="text-xs text-rose-400 mt-1 max-w-xs truncate font-sans">
                          {order.rejectReason}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">
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
                        <span className="text-slate-500">--</span>
                      )}
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
