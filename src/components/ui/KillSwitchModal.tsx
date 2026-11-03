"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertOctagon, X, ShieldAlert, ArrowRight, Check } from "lucide-react";
import { formatINR } from "@/lib/utils";

export function KillSwitchModal() {
  const {
    isKillSwitchModalOpen,
    closeKillSwitchModal,
    executeKillSwitch,
    activePosition,
    strategy,
    connectionStatus,
  } = useTrading();

  const [confirmedChecked, setConfirmedChecked] = useState(false);

  if (!isKillSwitchModalOpen) return null;

  const isConnected = connectionStatus === "CONNECTED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-rose-500/40 rounded-xl shadow-2xl shadow-rose-950/50 overflow-hidden">
        {/* Header alert stripe */}
        <div className="bg-rose-500/20 border-b border-rose-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Emergency Exit All Positions?
              </h2>
              <p className="text-xs text-rose-300">
                Broker Execution Guard • Irreversible Immediate Order
              </p>
            </div>
          </div>
          <button
            onClick={closeKillSwitchModal}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs text-rose-200/90 leading-relaxed space-y-1.5">
            <div className="font-semibold text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              What will happen immediately:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
              <li>
                Send instant <strong className="text-white">MARKET SQUARE-OFF</strong> orders for all open Nifty CE/PE positions to Upstox OMS.
              </li>
              <li>Cancel all pending limit, stoploss, and target orders.</li>
              <li>
                Stop strategy automation (<strong className="text-white">{strategy.name}</strong>).
              </li>
              <li>Lock trading until manually re-enabled.</li>
            </ul>
          </div>

          {/* Current Impact Preview */}
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-4">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">
              Positions to Liquidate
            </div>
            {activePosition ? (
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono font-bold text-white">
                    {activePosition.symbol}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">
                    ({activePosition.lots} Lots / {activePosition.qty} Qty)
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono font-bold ${
                      activePosition.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatINR(activePosition.pnl, true)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    LTP: ₹{activePosition.ltp.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-1">
                No active open positions. Kill switch will cancel pending orders and halt the strategy.
              </div>
            )}
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={confirmedChecked}
              onChange={(e) => setConfirmedChecked(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500 w-4 h-4"
            />
            <span className="text-xs text-slate-300">
              I understand this will instantly exit all intraday trades at current market bid/ask without trailing or limit buffers.
            </span>
          </label>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between">
          <button
            onClick={closeKillSwitchModal}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel & Return
          </button>

          <button
            disabled={!confirmedChecked || !isConnected}
            onClick={executeKillSwitch}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg ${
              confirmedChecked && isConnected
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 cursor-pointer"
                : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
            }`}
          >
            <span>Execute Kill Switch</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

