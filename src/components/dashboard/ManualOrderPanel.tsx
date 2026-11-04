"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Zap, ShieldCheck } from "lucide-react";

export function ManualOrderPanel() {
  const { niftyPrice, executeManualOrder, connectionStatus, strategy, mode } = useTrading();
  const [selectedLots, setSelectedLots] = useState<number>(strategy.lots || 2);

  const isConnected = connectionStatus === "CONNECTED";

  // Nifty ATM & 3rd ITM Strike Selection
  const atmStrike = Math.round(niftyPrice / 50) * 50;
  const itm3CallStrike = atmStrike - 150;
  const itm3PutStrike = atmStrike + 150;

  const estimatedCallPremium = 218.4;
  const estimatedPutPremium = 204.6;

  const totalQty = selectedLots * 25;
  const estCallMargin = estimatedCallPremium * totalQty;
  const estPutMargin = estimatedPutPremium * totalQty;

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
              1-Click 3rd In-The-Money Nifty Option Buy [{mode} Mode]
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

        {/* Quick Lot Multiplier Selection */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium text-[11px]">
              Trade Quantity ({selectedLots} Lots = {totalQty} Qty)
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              SL: ₹{strategy.stoplossAmount.toLocaleString()} &bull; Target: ₹{strategy.targetAmount.toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 5].map((lots) => (
              <button
                key={lots}
                type="button"
                onClick={() => setSelectedLots(lots)}
                className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  selectedLots === lots
                    ? "bg-slate-700 text-emerald-400 border border-emerald-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                {lots} {lots === 1 ? "Lot" : "Lots"}
              </button>
            ))}
          </div>
        </div>

        {/* 1-Click Buy Buttons: 3rd ITM Call vs 3rd ITM Put */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* 3rd ITM Call (Bullish) */}
          <button
            type="button"
            onClick={() => handleBuy("CE")}
            disabled={(!isConnected && mode === "LIVE") || strategy.dailyTradeCount >= strategy.maxDailyTrades}
            className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              (!isConnected && mode === "LIVE") || strategy.dailyTradeCount >= strategy.maxDailyTrades
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

            <div className="mt-2">
              <div className="text-base font-bold font-mono text-white">
                NIFTY {itm3CallStrike} CE
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>LTP: ~₹{estimatedCallPremium.toFixed(1)}</span>
                <span className="font-mono text-emerald-400/90 font-medium">
                  {formatINR(estCallMargin)}
                </span>
              </div>
            </div>
          </button>

          {/* 3rd ITM Put (Bearish) */}
          <button
            type="button"
            onClick={() => handleBuy("PE")}
            disabled={(!isConnected && mode === "LIVE") || strategy.dailyTradeCount >= strategy.maxDailyTrades}
            className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              (!isConnected && mode === "LIVE") || strategy.dailyTradeCount >= strategy.maxDailyTrades
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

            <div className="mt-2">
              <div className="text-base font-bold font-mono text-white">
                NIFTY {itm3PutStrike} PE
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>LTP: ~₹{estimatedPutPremium.toFixed(1)}</span>
                <span className="font-mono text-rose-400/90 font-medium">
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
          <span>Product: <strong>MIS (Intraday)</strong></span>
        </div>
        <span>Max 1 Trade/Day Limit Enforced</span>
      </div>
    </div>
  );
}
