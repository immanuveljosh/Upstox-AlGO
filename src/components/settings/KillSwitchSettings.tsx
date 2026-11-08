"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertOctagon, Power, Flame, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui/DesignSystem";

export function KillSwitchSettings() {
  const {
    strategy,
    toggleStrategy,
    closeActivePosition,
    activePosition,
    addToast,
  } = useTrading();
  const [isSquaringOff, setIsSquaringOff] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<
    "stop_strategy" | "square_off" | null
  >(null);

  const isRunning = strategy.status === "RUNNING";

  const handleEmergencySquareOff = async () => {
    setIsSquaringOff(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/exit-all", {
        method: "POST",
      });
      const json = await res.json();
      if (
        res.ok &&
        (json.status === "success" || json.connection_status === "connected")
      ) {
        addToast({
          type: "warning",
          title: "Emergency Square-Off Complete",
          message:
            json.message ||
            "All active positions squared off at market price.",
        });
        if (activePosition) {
          closeActivePosition();
        }
      } else {
        addToast({
          type: "error",
          title: "Square-Off Failed",
          message: json.message || "Failed to execute emergency square-off.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to contact trading desk server.";
      addToast({
        type: "error",
        title: "Square-Off Error",
        message,
      });
    } finally {
      setIsSquaringOff(false);
      setConfirmDialog(null);
    }
  };

  const handleStrategyAction = () => {
    if (isRunning) {
      setConfirmDialog("stop_strategy");
    } else {
      toggleStrategy();
    }
  };

  const confirmStopStrategy = () => {
    toggleStrategy();
    setConfirmDialog(null);
  };

  return (
    <>
      <section className="rounded-xl bg-slate-900 border border-rose-500/30 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                Danger zone
              </h2>
              <p className="text-[13px] text-slate-400">
                Immediate strategy execution halt and emergency market liquidation safeguards.
              </p>
            </div>
          </div>
          <StatusBadge tone="danger">SAFETY CIRCUIT</StatusBadge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strategy Automation Engine Switch */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-slate-200 block">
                Strategy automation engine
              </span>
              <span className="text-xs text-slate-400 mt-1 block">
                Status:{" "}
                <strong
                  className={isRunning ? "text-emerald-400" : "text-amber-300"}
                >
                  {isRunning
                    ? "RUNNING (Active monitoring)"
                    : "STOPPED (Paused)"}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleStrategyAction}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                isRunning
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isRunning ? "Stop Strategy" : "Start Strategy"}</span>
            </button>
          </div>

          {/* Emergency Market Square-Off */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-slate-200 block">
                Emergency market square-off
              </span>
              <span className="text-xs text-slate-400 mt-1 block">
                Active position:{" "}
                <strong
                  className={
                    activePosition ? "text-slate-100 font-mono" : "text-slate-400"
                  }
                >
                  {activePosition
                    ? `${activePosition.symbol} (${activePosition.qty} qty)`
                    : "None"}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setConfirmDialog("square_off")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Square Off All</span>
            </button>
          </div>
        </div>
      </section>

      {/* Confirmation Dialog Modal for Danger Zone Actions */}
      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-rose-500/30 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {confirmDialog === "square_off"
                    ? "Confirm emergency square-off?"
                    : "Stop strategy automation engine?"}
                </h3>
                <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">
                  {confirmDialog === "square_off"
                    ? "This will immediately submit market exit orders for all open positions and cancel pending orders."
                    : "Stopping the strategy engine will pause automated entry checks during the 09:15–09:17 IST window."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {confirmDialog === "square_off" ? (
                <button
                  type="button"
                  onClick={handleEmergencySquareOff}
                  disabled={isSquaringOff}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isSquaringOff ? "Closing..." : "Confirm Liquidate"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirmStopStrategy}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Confirm Stop Strategy
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
