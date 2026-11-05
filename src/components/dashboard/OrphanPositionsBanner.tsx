"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertCircle, ShieldAlert, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { formatINR } from "@/lib/utils";

export function OrphanPositionsBanner() {
  const { strategyStatus, refreshStrategyStatus } = useTrading();
  const orphans = strategyStatus?.orphan_positions || [];

  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!orphans || orphans.length === 0) return null;

  const handleAdopt = async (token: string) => {
    setBusyToken(token);
    setActionMessage(null);
    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/adopt-orphan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_token: token }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || "Adopted position successfully.");
        await refreshStrategyStatus();
      } else {
        setActionMessage(data.detail || data.message || "Failed to adopt position.");
      }
    } catch (e) {
      setActionMessage(`Network error: ${String(e)}`);
    } finally {
      setBusyToken(null);
    }
  };

  const handleSquareOff = async (token: string) => {
    if (!confirm("Are you sure you want to immediately square off this broker position at market?")) {
      return;
    }
    setBusyToken(token);
    setActionMessage(null);
    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/square-off-orphan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_token: token }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || "Square-off order routed to Upstox.");
        await refreshStrategyStatus();
      } else {
        setActionMessage(data.detail || data.message || "Square-off failed.");
      }
    } catch (e) {
      setActionMessage(`Network error: ${String(e)}`);
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/70 to-amber-900/50 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
              ORPHAN POSITIONS DETECTED ({orphans.length})
            </span>
          </div>

          <p className="text-xs text-amber-200/90 mt-1">
            Upstox holds open intraday positions not currently tracked by this desk. To prevent accidental liquidation, they will NOT be closed automatically without your explicit action below.
          </p>

          {actionMessage && (
            <div className="mt-2 text-xs font-mono text-amber-100 bg-amber-950/90 border border-amber-500/40 p-2 rounded">
              {actionMessage}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {orphans.map((pos) => {
              const isBusy = busyToken === pos.instrument_token;
              const isProfit = pos.pnl >= 0;
              return (
                <div
                  key={pos.instrument_token}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-950/80 border border-amber-500/30"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs text-white">
                      {pos.trading_symbol}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Qty: <strong className="text-white">{pos.quantity}</strong>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Avg: ₹{pos.buy_price.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        isProfit ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      P&L: {formatINR(pos.pnl, true)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      disabled={isBusy}
                      onClick={() => handleAdopt(pos.instrument_token)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{isBusy ? "Processing..." : "Adopt into Desk"}</span>
                    </button>

                    <button
                      disabled={isBusy}
                      onClick={() => handleSquareOff(pos.instrument_token)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Square Off</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

