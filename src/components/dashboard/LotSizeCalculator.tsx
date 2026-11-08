"use client";

import React from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import { CheckCircle2, AlertTriangle, Settings } from "lucide-react";
import { formatIndianNumber } from "@/lib/utils";
import { Card } from "@/components/ui/DesignSystem";

interface LotSizeCalculatorProps {
  compact?: boolean;
  selectedLots?: number;
  onLotsChange?: (lots: number) => void;
  optionType?: "CE" | "PE";
}

export default function LotSizeCalculator({
  compact = false,
  selectedLots,
  optionType,
}: LotSizeCalculatorProps) {
  const { strategy, instrumentMetadata, niftyPrice } = useTrading();

  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;
  const maxLots = Math.floor(freezeQty / actualLotSize);

  const currentLots = selectedLots !== undefined ? selectedLots : strategy.lots || 1;
  const parsedLots = Math.max(1, Math.floor(Number(currentLots) || 1));
  const totalQuantity = parsedLots * actualLotSize;

  const hasSpot = niftyPrice > 0;
  const atmStrike = hasSpot ? Math.round(niftyPrice / 50) * 50 : null;
  const effectiveType =
    optionType || (strategy.signal === "BEARISH" ? "PE" : "CE");
  const itm3Strike = atmStrike
    ? effectiveType === "CE"
      ? atmStrike - 150
      : atmStrike + 150
    : null;
  const contractSymbol = itm3Strike
    ? `NIFTY ${itm3Strike} ${effectiveType}`
    : `NIFTY ITM 3 ${effectiveType}`;

  const isPositiveWholeLots = Number.isInteger(parsedLots) && parsedLots >= 1;
  const isExactMultiple =
    totalQuantity > 0 && totalQuantity % actualLotSize === 0;
  const isWithinFreezeLimit = totalQuantity <= freezeQty;
  const isValidOrder =
    isPositiveWholeLots && isExactMultiple && isWithinFreezeLimit;

  const slPoints =
    totalQuantity > 0
      ? (strategy.stoplossAmount / totalQuantity).toFixed(1)
      : "0.0";
  const targetPoints =
    totalQuantity > 0
      ? (strategy.targetAmount / totalQuantity).toFixed(1)
      : "0.0";

  return (
    <Card
      title="Lot size & quantity calculator"
      subtitle="Read-only contract sizing helper synced with Settings"
      headerAction={
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-emerald-400 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Edit in Settings</span>
        </Link>
      }
      className="flex flex-col justify-between h-full"
    >
      <div className="space-y-4" suppressHydrationWarning>
        {/* Selected Instrument & Exchange Metadata Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 border border-slate-800 rounded-lg p-3.5">
          <div>
            <div className="text-xs text-slate-400">Selected contract</div>
            <div className="text-sm font-semibold font-mono text-slate-100 mt-0.5">
              {contractSymbol}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              ITM 3 &bull; {instrumentMetadata.exchange}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Exchange lot size</div>
            <div className="text-sm font-semibold font-mono text-emerald-400 mt-0.5 tabular-nums">
              {actualLotSize} units
            </div>
            <div className="text-xs text-slate-400">
              {instrumentMetadata.segment}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Configured lots</div>
            <div className="text-sm font-semibold font-mono text-slate-100 mt-0.5 tabular-nums">
              {parsedLots} {parsedLots === 1 ? "lot" : "lots"}
            </div>
            <div className="text-xs text-slate-400">
              Max {maxLots} lots
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Total order qty</div>
            <div className="text-sm font-semibold font-mono text-slate-100 mt-0.5 tabular-nums">
              {totalQuantity} Qty
            </div>
            <div className="text-xs text-slate-400 tabular-nums">
              Freeze: {formatIndianNumber(freezeQty)}
            </div>
          </div>
        </div>

        {/* Formula & Reference Box */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Automatic quantity formula</span>
            <span className="font-mono">Total Qty = Lots &times; Lot Size</span>
          </div>

          <div className="flex items-baseline justify-between bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2.5">
            <div className="text-xs font-mono text-slate-300 tabular-nums">
              <strong className="text-slate-100">{parsedLots}</strong>{" "}
              {parsedLots === 1 ? "lot" : "lots"} &times;{" "}
              <strong className="text-emerald-400">{actualLotSize}</strong>{" "}
              units/lot
            </div>
            <div className="text-base font-semibold font-mono text-slate-100 tabular-nums">
              = {totalQuantity}{" "}
              <span className="text-xs font-normal text-slate-400">Qty</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              Ref: 1L={actualLotSize} &bull; 2L={actualLotSize * 2} &bull; 3L=
              {actualLotSize * 3} &bull; 5L={actualLotSize * 5}
            </span>
            <span>
              Capital:{" "}
              <strong className="text-slate-200">
                ₹{formatIndianNumber(strategy.totalCapital)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            {isValidOrder ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-medium">
                  Exchange validated:
                </span>
                <span className="text-slate-400 font-mono tabular-nums">
                  {totalQuantity} Qty (&le; {formatIndianNumber(freezeQty)}{" "}
                  freeze)
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-300 font-medium">
                  Must be 1–{maxLots} lots
                </span>
              </>
            )}
          </div>

          <div className="text-xs font-mono text-slate-400 tabular-nums">
            SL ({strategy.stoplossPercent}%):{" "}
            <strong className="text-rose-400">-{slPoints} pts</strong> &bull;{" "}
            Target ({strategy.targetPercent}%):{" "}
            <strong className="text-emerald-400">+{targetPoints} pts</strong>
          </div>
        </div>
      )}
    </Card>
  );
}
