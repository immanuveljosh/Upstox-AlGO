"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { XCircle, Clock, Layers, AlertTriangle } from "lucide-react";
import { Card, EmptyState, StatusBadge } from "@/components/ui/DesignSystem";

export function PositionCard() {
  const { activePosition, closeActivePosition } = useTrading();

  if (!activePosition) {
    return (
      <Card
        title="Active position"
        subtitle="Intraday directional contract monitor"
        className="flex flex-col justify-between h-full"
      >
        <EmptyState
          icon={Layers}
          title="No open directional position"
          description="Waiting for the next 09:15–09:17 IST signal window or manual execution below."
        />
      </Card>
    );
  }

  const isCall = activePosition.type === "CE";
  const isProfit = activePosition.pnl >= 0;
  const isUnverified =
    activePosition.quoteStatus === "UNVERIFIED" || activePosition.isUnverified;
  const isStale =
    activePosition.quoteStatus === "STALE" || activePosition.isStale;

  const rawStopStatus = (activePosition.brokerStopStatus || "MISSING").toUpperCase();
  const brokerStopDisplay =
    rawStopStatus === "ACTIVE"
      ? "ACTIVE"
      : rawStopStatus === "TRIGGERED"
      ? "TRIGGERED"
      : "MISSING";

  const stopTone =
    brokerStopDisplay === "ACTIVE"
      ? "success"
      : brokerStopDisplay === "TRIGGERED"
      ? "info"
      : "warning";

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <StatusBadge tone={isCall ? "success" : "danger"}>
            {activePosition.type}
          </StatusBadge>
          <span className="font-mono">{activePosition.symbol}</span>
          <StatusBadge tone={stopTone} dot={brokerStopDisplay === "ACTIVE"}>
            Broker stop: {brokerStopDisplay}
          </StatusBadge>
        </span>
      }
      subtitle={`${activePosition.entryTime} • ${activePosition.lots} Lot(s) × ${
        activePosition.lotSize || 65
      } = ${activePosition.qty} Qty`}
      headerAction={
        activePosition.status === "PENDING_EXIT" ? (
          <StatusBadge tone="warning" dot>
            Exiting (awaiting fill)...
          </StatusBadge>
        ) : (
          <button
            type="button"
            onClick={closeActivePosition}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Square off</span>
          </button>
        )
      }
      className="flex flex-col justify-between h-full"
    >
      <div>
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
          <div>
            <span className="text-[13px] font-medium text-slate-400">
              Unrealized P&L
            </span>
            <div
              className={`text-2xl font-semibold font-mono tracking-tight tabular-nums flex items-baseline gap-2 mt-0.5 ${
                isProfit ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              <span>{formatINR(activePosition.pnl, true)}</span>
              <span className="text-xs font-mono font-medium">
                ({formatPercent(activePosition.pnlPercent, true)})
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              {isUnverified ? (
                <StatusBadge tone="danger">UNVERIFIED</StatusBadge>
              ) : isStale ? (
                <StatusBadge tone="warning">STALE</StatusBadge>
              ) : (
                <StatusBadge tone="success">LIVE</StatusBadge>
              )}
              <span className="text-xs font-medium text-slate-400">LTP</span>
            </div>
            <div className="text-lg font-semibold font-mono text-slate-100 tabular-nums mt-0.5">
              ₹{activePosition.ltp.toFixed(2)}
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              Avg buy: ₹{activePosition.buyPrice.toFixed(2)}
            </div>
          </div>
        </div>

        {isUnverified && (
          <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-rose-300">
                SL/Target protection inactive: quote unverified
              </span>
              <p className="text-xs text-rose-300/80 mt-0.5">
                {activePosition.quoteRejectReason ||
                  "Market feed timestamp is missing, future, or invalid. Automatic triggers suspended."}
              </p>
            </div>
          </div>
        )}

        {isStale && !isUnverified && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">
                SL/Target protection paused: quote stale (&gt;60s)
              </span>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Feed ticks are delayed. Automatic square-off is suspended until fresh market quotes resume.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs pt-4 border-t border-slate-800">
        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Stop loss</div>
          <div className="font-mono font-semibold text-rose-400 mt-0.5 tabular-nums">
            {activePosition.stoploss > 0
              ? `₹${activePosition.stoploss.toFixed(2)}`
              : activePosition.brokerStopTriggerPrice
              ? `₹${activePosition.brokerStopTriggerPrice.toFixed(2)}`
              : "5% Capital"}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Trailing SL</div>
          <div className="font-mono font-semibold text-amber-300 mt-0.5 tabular-nums">
            ₹{activePosition.trailingSl.toFixed(2)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Target</div>
          <div className="font-mono font-semibold text-emerald-400 mt-0.5 tabular-nums">
            ₹{activePosition.target.toFixed(2)}
          </div>
        </div>
      </div>
    </Card>
  );
}
