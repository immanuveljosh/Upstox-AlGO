"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR, formatINRInteger, formatIndianNumber } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ShieldCheck,
  Minus,
  Plus,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export function ManualOrderPanel() {
  const {
    niftyPrice,
    executeManualOrder,
    connectionStatus,
    strategy,
    instrumentMetadata,
    stats,
    mode,
  } = useTrading();
  const [selectedLots, setSelectedLots] = useState<number>(strategy.lots || 2);

  useEffect(() => {
    setSelectedLots(strategy.lots || 2);
  }, [strategy.lots]);

  const isConnected = connectionStatus === "CONNECTED";

  // Actual exchange lot size from Upstox instrument metadata (65 units per lot for NIFTY)
  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;
  const maxLots = Math.floor(freezeQty / actualLotSize); // 27 lots = 1,755 qty

  // Nifty ATM & 3rd ITM Strike Selection
  const atmStrike = Math.round(niftyPrice / 50) * 50;
  const itm3CallStrike = atmStrike - 150;
  const itm3PutStrike = atmStrike + 150;

  const estimatedCallPremium = 218.4;
  const estimatedPutPremium = 204.6;

  // Automatic calculation: Total Quantity = Number of Lots × Actual Lot Size
  const totalQty = selectedLots * actualLotSize;
  const estCallMargin = estimatedCallPremium * totalQty;
  const estPutMargin = estimatedPutPremium * totalQty;

  // Broker & Exchange Quantity Validation
  const isValidLots = Number.isInteger(selectedLots) && selectedLots >= 1;
  const isMultipleOfLotSize = totalQty > 0 && totalQty % actualLotSize === 0;
  const isWithinFreezeLimit = totalQty <= freezeQty;
  const isWithinMargin = Math.max(estCallMargin, estPutMargin) <= stats.marginAvailable;
  const isQuantityValid =
    isValidLots && isMultipleOfLotSize && isWithinFreezeLimit && isWithinMargin;

  const handleLotsChange = (nextLots: number) => {
    if (isNaN(nextLots)) return;
    const clamped = Math.max(1, Math.min(maxLots, Math.floor(nextLots)));
    setSelectedLots(clamped);
  };

  const handleBuy = (type: "CE" | "PE") => {
    executeManualOrder(type, selectedLots);
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Directional Execution (3rd ITM Only)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              NIFTY 50 Lot Size: <strong className="text-emerald-400 font-mono">{actualLotSize} units/lot</strong> &bull; [{mode} Mode]
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Nifty Spot / ATM
            </span>
            <div className="text-sm font-bold font-mono text-cyan-400">
              {isConnected ? `${niftyPrice.toFixed(1)} / ${atmStrike}` : "—"}
            </div>
          </div>
        </div>

        {/* Editable Lot Size & Quantity Calculator Section */}
        <div className="mt-3.5 p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold text-[11px]">
              Number of Lots &times; Lot Size ({actualLotSize})
            </span>
            <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
              {selectedLots} {selectedLots === 1 ? "Lot" : "Lots"} &times; {actualLotSize} = {totalQty} Qty
            </span>
          </div>

          {/* Editable Number of Lots Input + Quick Presets */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleLotsChange(selectedLots - 1)}
                disabled={selectedLots <= 1}
                className="w-7 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center border border-slate-700 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={maxLots}
                value={selectedLots}
                onChange={(e) => handleLotsChange(parseInt(e.target.value, 10))}
                aria-label="Editable Number of Lots"
                className="w-full h-8 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg text-center font-mono text-xs font-bold text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleLotsChange(selectedLots + 1)}
                disabled={selectedLots >= maxLots}
                className="w-7 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center border border-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="col-span-7 grid grid-cols-4 gap-1">
              {[1, 2, 3, 5].map((lots) => (
                <button
                  key={lots}
                  type="button"
                  onClick={() => setSelectedLots(lots)}
                  className={`py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    selectedLots === lots
                      ? "bg-slate-800 text-emerald-400 border border-emerald-500/60 shadow-sm"
                      : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                  }`}
                >
                  {lots}L={lots * actualLotSize}
                </button>
              ))}
            </div>
          </div>

          {/* Exchange Validation & Risk Row */}
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[10px] font-mono">
            {isQuantityValid ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Total Order Qty: <strong>{totalQty} units</strong> (Valid ≤ {formatIndianNumber(freezeQty)})
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {!isWithinFreezeLimit
                  ? `Exceeds freeze limit (${freezeQty} qty)`
                  : "Margin exceeds available capital"}
              </span>
            )}
            <span suppressHydrationWarning className="text-slate-400">
              SL: {formatINRInteger(strategy.stoplossAmount)} &bull; Tgt: {formatINRInteger(strategy.targetAmount)}
            </span>
          </div>
        </div>

        {/* 1-Click Buy Buttons: 3rd ITM Call vs 3rd ITM Put */}
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          {/* 3rd ITM Call (Bullish) */}
          <button
            type="button"
            onClick={() => handleBuy("CE")}
            disabled={
              (!isConnected && mode === "LIVE") ||
              strategy.dailyTradeCount >= strategy.maxDailyTrades ||
              !isQuantityValid
            }
            className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              (!isConnected && mode === "LIVE") ||
              strategy.dailyTradeCount >= strategy.maxDailyTrades ||
              !isQuantityValid
                ? "bg-slate-950/60 border-slate-800 opacity-50 cursor-not-allowed"
                : "bg-emerald-950/20 hover:bg-emerald-900/30 border-emerald-800/40 hover:border-emerald-500/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                BUY 3rd ITM CALL
              </span>
              <ArrowUpRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>

            <div className="mt-1.5">
              <div className="text-base font-bold font-mono text-white">
                NIFTY {itm3CallStrike} CE
              </div>
              <div className="text-[10px] font-mono text-emerald-300/90 mt-0.5">
                Order Qty: <strong>{totalQty} Qty</strong> ({selectedLots} &times; {actualLotSize})
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>LTP: ~₹{estimatedCallPremium.toFixed(1)}</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {formatINR(estCallMargin)}
                </span>
              </div>
            </div>
          </button>

          {/* 3rd ITM Put (Bearish) */}
          <button
            type="button"
            onClick={() => handleBuy("PE")}
            disabled={
              (!isConnected && mode === "LIVE") ||
              strategy.dailyTradeCount >= strategy.maxDailyTrades ||
              !isQuantityValid
            }
            className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              (!isConnected && mode === "LIVE") ||
              strategy.dailyTradeCount >= strategy.maxDailyTrades ||
              !isQuantityValid
                ? "bg-slate-950/60 border-slate-800 opacity-50 cursor-not-allowed"
                : "bg-rose-950/20 hover:bg-rose-900/30 border-rose-800/40 hover:border-rose-500/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-rose-400 uppercase tracking-wider">
                BUY 3rd ITM PUT
              </span>
              <ArrowDownRight className="w-4 h-4 text-rose-400 group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform" />
            </div>

            <div className="mt-1.5">
              <div className="text-base font-bold font-mono text-white">
                NIFTY {itm3PutStrike} PE
              </div>
              <div className="text-[10px] font-mono text-rose-300/90 mt-0.5">
                Order Qty: <strong>{totalQty} Qty</strong> ({selectedLots} &times; {actualLotSize})
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>LTP: ~₹{estimatedPutPremium.toFixed(1)}</span>
                <span className="font-mono text-rose-400 font-semibold">
                  {formatINR(estPutMargin)}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Product: <strong>MIS</strong> &bull; 1 Lot = <strong>{actualLotSize} Qty</strong>
          </span>
        </div>
        <span>Max 1 Trade/Day Limit Enforced</span>
      </div>
    </div>
  );
}
