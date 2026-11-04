"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Database,
  Minus,
  Plus,
} from "lucide-react";
import { formatIndianNumber } from "@/lib/utils";

interface LotSizeCalculatorProps {
  compact?: boolean;
  selectedLots?: number;
  onLotsChange?: (lots: number) => void;
  optionType?: "CE" | "PE";
}

export default function LotSizeCalculator({
  compact = false,
  selectedLots,
  onLotsChange,
  optionType,
}: LotSizeCalculatorProps) {
  const { strategy, instrumentMetadata, niftyPrice, updateStrategyLots } =
    useTrading();

  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;
  const maxLots = Math.floor(freezeQty / actualLotSize); // 27 lots = 1,755 qty

  const currentLots = selectedLots !== undefined ? selectedLots : strategy.lots;
  const [inputValue, setInputValue] = useState<string>(String(currentLots));

  useEffect(() => {
    setInputValue(String(currentLots));
  }, [currentLots]);

  const parsedLots = Math.max(0, Math.floor(Number(inputValue) || 0));
  const totalQuantity = parsedLots * actualLotSize;

  // Determine active contract symbol from live spot when available
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

  // Validation checks against broker & exchange rules
  const isPositiveWholeLots = Number.isInteger(parsedLots) && parsedLots >= 1;
  const isExactMultiple =
    totalQuantity > 0 && totalQuantity % actualLotSize === 0;
  const isWithinFreezeLimit = totalQuantity <= freezeQty;
  const isValidOrder =
    isPositiveWholeLots && isExactMultiple && isWithinFreezeLimit;

  const applyLots = (newLots: number) => {
    const clamped = Math.max(1, Math.min(maxLots, newLots));
    setInputValue(String(clamped));
    if (onLotsChange) {
      onLotsChange(clamped);
    } else {
      updateStrategyLots(clamped);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= maxLots) {
      if (onLotsChange) {
        onLotsChange(num);
      } else {
        updateStrategyLots(num);
      }
    }
  };

  const slPoints =
    totalQuantity > 0
      ? (strategy.stoplossAmount / totalQuantity).toFixed(1)
      : "0.0";
  const targetPoints =
    totalQuantity > 0
      ? (strategy.targetAmount / totalQuantity).toFixed(1)
      : "0.0";

  return (
    <div
      className="bg-upstox-card border border-upstox-border rounded-xl p-4 flex flex-col gap-3.5"
      suppressHydrationWarning
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-upstox-border/70 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-upstox-accent/15 border border-upstox-accent/30 flex items-center justify-center">
            <Calculator className="w-4 h-4 text-upstox-accent" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              Lot Size &amp; Quantity Calculator
            </h3>
            <p className="text-[10px] text-slate-400">
              Nifty Directional • Validated Upstox Contract Lot Size
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
          <Database className="w-3 h-3" />1 LOT = {actualLotSize} QTY
        </span>
      </div>

      {/* Selected Instrument & Exchange Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
        <div>
          <div className="text-[10px] text-slate-500 uppercase">
            Selected Contract
          </div>
          <div className="text-xs font-bold font-mono text-white mt-0.5">
            {contractSymbol}
          </div>
          <div className="text-[10px] text-upstox-accent font-mono">
            ITM 3 • {instrumentMetadata.source}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">
            Exchange Lot Size
          </div>
          <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
            {actualLotSize} Units / Lot
          </div>
          <div className="text-[10px] text-slate-500">
            {instrumentMetadata.exchange} ({instrumentMetadata.segment})
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">
            Number of Lots
          </div>
          <div className="text-xs font-bold font-mono text-white mt-0.5">
            {parsedLots} {parsedLots === 1 ? "Lot" : "Lots"}
          </div>
          <div className="text-[10px] text-slate-500">
            Max {maxLots} Lots / Order
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">
            Total Order Qty
          </div>
          <div className="text-sm font-black font-mono text-upstox-accent mt-0.5">
            {totalQuantity} Qty
          </div>
          <div className="text-[10px] text-slate-500">
            Freeze: {formatIndianNumber(freezeQty)} Qty
          </div>
        </div>
      </div>

      {/* Editable Number of Lots Selector + Live Formula Box */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Editable Number of Lots Input */}
        <div className="md:col-span-5 bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-upstox-accent" />
              Number of Lots
            </label>
            <span className="text-[10px] font-mono text-slate-500">
              1–{maxLots} Lots
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyLots(parsedLots - 1)}
              disabled={parsedLots <= 1}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center transition-colors border border-slate-700"
              title="Decrease 1 Lot (-65 Qty)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={maxLots}
              value={inputValue}
              onChange={handleInputChange}
              aria-label="Number of Lots"
              className="w-full h-8 bg-slate-950 border border-slate-700 focus:border-upstox-accent rounded-lg text-center font-mono text-sm font-bold text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => applyLots(parsedLots + 1)}
              disabled={parsedLots >= maxLots}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center transition-colors border border-slate-700"
              title="Increase 1 Lot (+65 Qty)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Lot Presets: 1=65, 2=130, 3=195, 5=325 */}
          <div className="grid grid-cols-4 gap-1 mt-2">
            {[1, 2, 3, 5].map((preset) => {
              const presetQty = preset * actualLotSize;
              const active = parsedLots === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyLots(preset)}
                  className={`py-1 px-1.5 rounded text-[10px] font-mono font-semibold border transition-all ${
                    active
                      ? "bg-upstox-accent/20 border-upstox-accent text-white"
                      : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  {preset}L={presetQty}
                </button>
              );
            })}
          </div>
        </div>

        {/* Formula Calculation Display */}
        <div className="md:col-span-7 bg-gradient-to-br from-upstox-accent/10 via-slate-900/90 to-slate-900 border border-upstox-accent/30 rounded-lg p-3 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Automatic Quantity Formula
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              Total Qty = Lots &times; Lot Size
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between bg-slate-950/80 border border-slate-800/90 rounded-lg px-3 py-2">
            <div className="text-xs font-mono text-slate-300">
              <span className="text-white font-bold">{parsedLots}</span>{" "}
              {parsedLots === 1 ? "Lot" : "Lots"} &times;{" "}
              <span className="text-emerald-400 font-bold">
                {actualLotSize}
              </span>{" "}
              units/lot
            </div>
            <div className="text-base font-black font-mono text-white">
              = <span className="text-upstox-accent">{totalQuantity}</span>{" "}
              <span className="text-xs font-normal text-slate-400">Qty</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
            <span>
              Ref: 1L={actualLotSize} • 2L={actualLotSize * 2} • 3L=
              {actualLotSize * 3}
            </span>
            <span>
              Capital:{" "}
              <strong className="text-white">
                ₹{formatIndianNumber(strategy.totalCapital)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Risk & Validation Footer */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-upstox-border/60 text-[11px]">
          <div className="flex items-center gap-1.5">
            {isValidOrder ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-medium">
                  Exchange Validated:
                </span>
                <span className="text-slate-400 font-mono">
                  {totalQuantity} Qty is an exact multiple of {actualLotSize}{" "}
                  (&le; {formatIndianNumber(freezeQty)} freeze limit)
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-medium">
                  Quantity Validation Warning:
                </span>
                <span className="text-slate-400 font-mono">
                  Must be 1–{maxLots} lots
                </span>
              </>
            )}
          </div>

          <div className="text-[11px] font-mono text-slate-400">
            SL ({strategy.stoplossPercent}%):{" "}
            <strong className="text-rose-400">-{slPoints} pts</strong> | Target
            ({strategy.targetPercent}%):{" "}
            <strong className="text-emerald-400">+{targetPoints} pts</strong>
          </div>
        </div>
      )}
    </div>
  );
}
