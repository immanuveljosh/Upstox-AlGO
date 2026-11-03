"use client";

import React from "react";
import { useTrading } from "@/context/TradingContext";
import { AlertOctagon } from "lucide-react";

export function KillSwitchButton() {
  const { openKillSwitchModal, connectionStatus } = useTrading();
  const isConnected = connectionStatus === "CONNECTED";

  return (
    <button
      onClick={openKillSwitchModal}
      disabled={!isConnected}
      title={
        isConnected
          ? "Emergency Exit All Positions (Kill Switch)"
          : "Kill switch disabled: broker offline"
      }
      className={`group relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-md ${
        isConnected
          ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60 hover:shadow-rose-900 cursor-pointer active:scale-95"
          : "bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
      }`}
    >
      <AlertOctagon className={`w-4 h-4 ${isConnected ? "text-white animate-pulse" : "text-slate-500"}`} />
      <span>Kill Switch</span>
    </button>
  );
}

