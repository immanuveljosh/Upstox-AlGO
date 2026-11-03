"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { formatINR } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Zap, ShieldCheck } from "lucide-react";

export function ManualOrderPanel() {
  const { niftyPrice, executeManualOrder, connectionStatus, strategy } = useTrading();
  const [selectedLots, setSelectedLots] = useState<number>(strategy.lots || 2);

  const isConnected = connectionStatus === "CONNECTED";

  // ATM Strike nearest 50
  const atmStrike = Math.round(niftyPrice / 50) * 50;
  const estimatedCallPremium = 148.5;
  const estimatedPutPremium = 134.2;

  const totalQty = selectedLots * 25;
  const estCallMargin = estimatedCallPremium * totalQty;
  const estPutMargin = estimatedPutPremium * totalQty;

  const handleBuy = (type: "CE" | "PE") => {
    executeManualOrder(type, selectedLots);
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Directional Manual Order</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              1-Click ATM Nifty Option Buy (Intraday Market Execution)
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              ATM Strike
            </span>
            <div className="text-sm font-bold font-mono text-cyan-400">
              {isConnected ? `${atmStrike}` : "—"}
            </div>
          </div>
        </div>

        {/* Quick Lot Multiplier Selection */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium text-[11px]">
              Execute Lots ({selectedLots} Lots = {totalQty} Qty)
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 5].map((lots) => (
              <button
                key={lots}
                type="button"
                onClick={() => setSelectedLots(lots)}
                className={`py-1.5 rounded-lg font-mono text-xs font-semibold transition-all ${
                  selectedLots === lots
                    ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                }`}
              >
                {lots} {lots === 1 ? "Lot" : "Lots"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Buy Buttons */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {/* BUY CALL (CE) */}
        <button
          onClick={() => handleBuy("CE")}
          disabled={!isConnected}
          className={`group flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
            isConnected
              ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 cursor-pointer active:scale-98 shadow-sm hover:shadow-emerald-950/40"
              : "bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed opacity-50"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <span>Buy Call (CE)</span>
          </div>
          <div className="font-mono text-[11px] text-slate-300 mt-1">
            {atmStrike} CE @ ~₹{estimatedCallPremium.toFixed(1)}
          </div>
          <div className="text-[10px] text-emerald-400/80 font-mono mt-0.5">
            Est. Margin: {formatINR(estCallMargin)}
          </div>
        </button>

        {/* BUY PUT (PE) */}
        <button
          onClick={() => handleBuy("PE")}
          disabled={!isConnected}
          className={`group flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
            isConnected
              ? "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-400 cursor-pointer active:scale-98 shadow-sm hover:shadow-rose-950/40"
              : "bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed opacity-50"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
            <span>Buy Put (PE)</span>
          </div>
          <div className="font-mono text-[11px] text-slate-300 mt-1">
            {atmStrike} PE @ ~₹{estimatedPutPremium.toFixed(1)}
          </div>
          <div className="text-[10px] text-rose-400/80 font-mono mt-0.5">
            Est. Margin: {formatINR(estPutMargin)}
          </div>
        </button>
      </div>
    </div>
  );
}

