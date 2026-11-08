"use client";

import React from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import { formatINRInteger, formatIndianNumber } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { Card } from "@/components/ui/DesignSystem";

export function ManualOrderPanel() {
  const {
    niftyPrice,
    executeManualOrder,
    connectionStatus,
    strategy,
    instrumentMetadata,
    mode,
  } = useTrading();

  const isConnected = connectionStatus === "CONNECTED";
  const hasSpot = niftyPrice > 0;

  const selectedLots = strategy.lots || 1;
  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;

  const atmStrike = hasSpot ? Math.round(niftyPrice / 50) * 50 : null;
  const itm3CallStrike = atmStrike ? atmStrike - 150 : null;
  const itm3PutStrike = atmStrike ? atmStrike + 150 : null;

  const totalQty = selectedLots * actualLotSize;
  const isValidLots = Number.isInteger(selectedLots) && selectedLots >= 1;
  const isMultipleOfLotSize = totalQty > 0 && totalQty % actualLotSize === 0;
  const isWithinFreezeLimit = totalQty <= freezeQty;
  const isQuantityValid =
    isValidLots && isMultipleOfLotSize && isWithinFreezeLimit;

  const handleBuy = (type: "CE" | "PE") => {
    executeManualOrder(type, selectedLots);
  };

  const isDisabled =
    (!isConnected && mode === "LIVE") ||
    strategy.dailyTradeCount >= strategy.maxDailyTrades ||
    !isQuantityValid;

  return (
    <Card
      title="Nifty directional execution (ITM 3)"
      subtitle={`1 lot = ${actualLotSize} units • Window 09:15–09:17 IST • Max 1 trade/day`}
      headerAction={
        <div className="text-right">
          <span className="text-xs text-slate-400 block">Spot / ATM</span>
          <span className="text-xs font-mono font-semibold text-slate-200 tabular-nums">
            {isConnected && hasSpot
              ? `${niftyPrice.toFixed(1)} / ${atmStrike}`
              : "--"}
          </span>
        </div>
      }
      className="flex flex-col justify-between h-full"
    >
      <div className="space-y-4">
        {/* Read-only Position Quantity Summary (Editable in Settings) */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[13px] font-medium text-slate-300 block">
                Configured position quantity
              </span>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {selectedLots} {selectedLots === 1 ? "lot" : "lots"} &times;{" "}
                {actualLotSize} units ={" "}
                <strong className="text-slate-100">{totalQty} Qty</strong>
              </span>
            </div>

            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-emerald-400 transition-colors shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Edit in Settings</span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
            {isQuantityValid ? (
              <span className="text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Valid order size (&le; {formatIndianNumber(freezeQty)} freeze)
              </span>
            ) : (
              <span className="text-amber-300 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Exceeds freeze limit ({freezeQty} qty)
              </span>
            )}
            <span suppressHydrationWarning className="text-slate-400 tabular-nums">
              SL ({strategy.stoplossPercent}%):{" "}
              {formatINRInteger(strategy.stoplossAmount)} &bull; Target (
              {strategy.targetPercent}%):{" "}
              {formatINRInteger(strategy.targetAmount)}
            </span>
          </div>
        </div>

        {/* 1-Click Buy Buttons: ITM 3 Call vs ITM 3 Put */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleBuy("CE")}
            disabled={isDisabled}
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              isDisabled
                ? "bg-slate-950 border-slate-800 opacity-50 cursor-not-allowed"
                : "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-emerald-400">
                BUY ITM 3 CALL
              </span>
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>

            <div className="mt-2">
              <div className="text-base font-semibold font-mono text-slate-100 tabular-nums">
                {itm3CallStrike
                  ? `NIFTY ${itm3CallStrike} CE`
                  : "NIFTY ITM 3 CE"}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1 flex items-center justify-between tabular-nums">
                <span>{totalQty} Qty</span>
                <span>Signal &ge; +80 pts</span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleBuy("PE")}
            disabled={isDisabled}
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              isDisabled
                ? "bg-slate-950 border-slate-800 opacity-50 cursor-not-allowed"
                : "bg-rose-500/10 hover:bg-rose-500/15 border-rose-500/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-rose-400">
                BUY ITM 3 PUT
              </span>
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            </div>

            <div className="mt-2">
              <div className="text-base font-semibold font-mono text-slate-100 tabular-nums">
                {itm3PutStrike ? `NIFTY ${itm3PutStrike} PE` : "NIFTY ITM 3 PE"}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1 flex items-center justify-between tabular-nums">
                <span>{totalQty} Qty</span>
                <span>Signal &le; -80 pts</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>
          Daily trade count:{" "}
          <strong className="font-mono text-slate-200">
            {strategy.dailyTradeCount} / {strategy.maxDailyTrades}
          </strong>
        </span>
        <span>Auto square-off: 15:15 IST</span>
      </div>
    </Card>
  );
}
