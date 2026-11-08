"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTrading } from "@/context/TradingContext";
import {
  formatINRCurrency,
  formatISTDateTime,
  formatSignedPoints,
} from "@/lib/format";
import {
  Play,
  Square,
  Clock,
  History,
  Save,
  Upload,
  CheckCircle2,
  RefreshCw,
  Settings,
} from "lucide-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui/DesignSystem";

export default function StrategyPage() {
  const {
    strategy,
    strategyStatus,
    refreshStrategyStatus,
    recordGiftNiftyChange,
    toggleStrategy,
    mode,
    niftyPrice,
    instrumentMetadata,
    addToast,
  } = useTrading();

  const [giftChangeInput, setGiftChangeInput] = useState<string>("");
  const [giftDateInput, setGiftDateInput] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  );
  const [csvText, setCsvText] = useState<string>("");
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (
      strategy.giftNiftyChange !== null &&
      strategy.giftNiftyChange !== undefined
    ) {
      setGiftChangeInput(String(strategy.giftNiftyChange));
    }
  }, [strategy.giftNiftyChange]);

  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;
  const totalQty = strategy.lots * actualLotSize;

  const currentSignal =
    strategyStatus?.signal || strategy.signalLabel || "DATA UNAVAILABLE";
  const giftNiftyPts =
    strategyStatus?.gift_nifty?.change_points ?? strategy.giftNiftyChange;
  const windowState = strategyStatus?.window_status || "CLOSED";
  const todayTradeStatus =
    strategyStatus?.today_trade_status || "DATA_UNAVAILABLE";

  const atmStrike = niftyPrice > 0 ? Math.round(niftyPrice / 50) * 50 : null;
  const dynamicStrike =
    strategyStatus?.selected_strike ||
    (atmStrike
      ? currentSignal === "CALL"
        ? atmStrike - 150
        : currentSignal === "PUT"
        ? atmStrike + 150
        : null
      : null);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshStrategyStatus();
    setIsRefreshing(false);
  };

  const handleRecordGiftNifty = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(giftChangeInput);
    if (isNaN(val)) {
      addToast({
        type: "warning",
        title: "Invalid Input",
        message:
          "Enter a numeric Gift Nifty 1-Day change in points (e.g. 95 or -85).",
      });
      return;
    }
    await recordGiftNiftyChange(val, giftDateInput);
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    setIsImportingCsv(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/strategy/gift-nifty/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv_text: csvText }),
        }
      );
      const json = await res.json();
      if (res.ok && json.data) {
        addToast({
          type: "success",
          title: "Gift Nifty CSV Imported",
          message: `Imported ${json.data.imported} new and updated ${json.data.updated} observations.`,
        });
        setCsvText("");
        await refreshStrategyStatus();
      } else {
        addToast({
          type: "error",
          title: "CSV Import Failed",
          message: json.message || "Could not parse Gift Nifty CSV.",
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Backend Unreachable",
        message: "Failed to upload Gift Nifty CSV.",
      });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const signalTone =
    currentSignal === "CALL"
      ? "success"
      : currentSignal === "PUT"
      ? "danger"
      : currentSignal === "NO TRADE"
      ? "neutral"
      : "warning";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nifty Directional"
        badge={<StatusBadge tone="success">ITM 3</StatusBadge>}
        subtitle={
          <>
            Signal source: <strong>Gift Nifty (1-Day change)</strong> &bull;{" "}
            <span className="text-emerald-400">&ge; +80 pts = Call (CE)</span>{" "}
            &bull; <span className="text-rose-400">&le; -80 pts = Put (PE)</span>{" "}
            &bull; Between -80 and +80 = No trade
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>

            <Link
              href="/backtest"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Run Backtest</span>
            </Link>

            <button
              type="button"
              onClick={toggleStrategy}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                strategy.status === "RUNNING"
                  ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400"
              }`}
            >
              {strategy.status === "RUNNING" ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop strategy</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start strategy</span>
                </>
              )}
            </button>
          </>
        }
      />

      {/* Row 1: 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Gift Nifty Signal Card */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-400">
              Gift Nifty signal (1D)
            </span>
            <StatusBadge tone={signalTone}>{currentSignal}</StatusBadge>
          </div>

          <div
            className={`my-2.5 text-2xl font-semibold font-mono tabular-nums ${
              giftNiftyPts === null || giftNiftyPts === undefined
                ? "text-slate-400 text-base"
                : giftNiftyPts >= 80
                ? "text-emerald-400"
                : giftNiftyPts <= -80
                ? "text-rose-400"
                : "text-slate-100"
            }`}
          >
            {giftNiftyPts !== null && giftNiftyPts !== undefined
              ? formatSignedPoints(giftNiftyPts)
              : "--"}
          </div>

          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>
              Contract:{" "}
              <strong className="text-slate-200">
                {currentSignal === "CALL"
                  ? dynamicStrike
                    ? `NIFTY ${dynamicStrike} CE`
                    : "NIFTY ITM 3 CE"
                  : currentSignal === "PUT"
                  ? dynamicStrike
                    ? `NIFTY ${dynamicStrike} PE`
                    : "NIFTY ITM 3 PE"
                  : "NO TRADE"}
              </strong>
            </span>
            <span>{strategyStatus?.gift_nifty?.source || "1D Pts"}</span>
          </div>
        </div>

        {/* 2. Trading Window (IST) */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-400">
              Trading window (IST)
            </span>
            <StatusBadge
              tone={
                windowState === "OPEN"
                  ? "success"
                  : windowState === "PRE_WINDOW"
                  ? "info"
                  : "neutral"
              }
            >
              {windowState}
            </StatusBadge>
          </div>

          <div className="my-2.5">
            <div className="text-lg font-semibold font-mono text-slate-100 flex items-center gap-1.5 tabular-nums">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>09:15:00 – 09:17:00</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Auto square-off at 15:15 IST
            </p>
          </div>

          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>
              Engine:{" "}
              <strong
                className={
                  strategy.status === "RUNNING"
                    ? "text-emerald-400"
                    : "text-slate-300"
                }
              >
                {strategy.status}
              </strong>
            </span>
            <span>Mode: {mode}</span>
          </div>
        </div>

        {/* 3. Today's Trade Status */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-400">
              Today&apos;s trade status
            </span>
            <StatusBadge tone="neutral">
              {strategy.dailyTradeCount} / {strategy.maxDailyTrades}
            </StatusBadge>
          </div>

          <div className="my-2.5">
            <div className="text-lg font-semibold font-mono text-slate-100">
              {todayTradeStatus.replace(/_/g, " ")}
            </div>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              {strategyStatus?.reason ||
                "Maximum 1 trade per calendar trading day enforced."}
            </p>
          </div>

          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Max 1 trade/day</span>
            <span>
              {strategyStatus?.timestamp_ist
                ? formatISTDateTime(strategyStatus.timestamp_ist)
                : "Asia/Kolkata"}
            </span>
          </div>
        </div>

        {/* 4. Capital & Risk Summary */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-400">
              Capital &amp; risk limits
            </span>
            <StatusBadge tone="neutral">
              SL {strategy.stoplossPercent}% / Tgt {strategy.targetPercent}%
            </StatusBadge>
          </div>

          <div className="my-2.5">
            <div className="text-2xl font-semibold font-mono text-slate-100 tabular-nums">
              {formatINRCurrency(strategy.totalCapital, 0)}
            </div>
            <div className="flex items-center justify-between text-xs font-mono mt-1 tabular-nums">
              <span className="text-rose-400">
                SL: -{formatINRCurrency(strategy.stoplossAmount, 0)}
              </span>
              <span className="text-emerald-400">
                Target: +{formatINRCurrency(strategy.targetAmount, 0)}
              </span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
            <span>Lot size: {actualLotSize}</span>
            <span>
              {strategy.lots}L &times; {actualLotSize} = {totalQty} Qty
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Read-Only Strategy Parameters Summary & Gift Nifty Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Read-Only Strategy Configuration Summary (Editable in Settings) */}
        <Card
          title="Strategy parameters & risk configuration"
          subtitle="Configured capital, stop-loss, target, and lot quantity"
          headerAction={
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-emerald-400 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Edit in Settings</span>
            </Link>
          }
          className="lg:col-span-7 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 block">
                  Total strategy capital
                </span>
                <div className="text-lg font-semibold font-mono text-slate-100 mt-1 tabular-nums">
                  {formatINRCurrency(strategy.totalCapital, 0)}
                </div>
                <span className="text-xs text-slate-500 mt-1 block">
                  Allocated base equity
                </span>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 block">
                  Stop loss ({strategy.stoplossPercent}%)
                </span>
                <div className="text-lg font-semibold font-mono text-rose-400 mt-1 tabular-nums">
                  -{formatINRCurrency(strategy.stoplossAmount, 0)}
                </div>
                <span className="text-xs text-slate-500 font-mono mt-1 block tabular-nums">
                  ₹{(strategy.stoplossAmount / totalQty).toFixed(2)} / unit
                </span>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 block">
                  Target profit ({strategy.targetPercent}%)
                </span>
                <div className="text-lg font-semibold font-mono text-emerald-400 mt-1 tabular-nums">
                  +{formatINRCurrency(strategy.targetAmount, 0)}
                </div>
                <span className="text-xs text-slate-500 font-mono mt-1 block tabular-nums">
                  ₹{(strategy.targetAmount / totalQty).toFixed(2)} / unit
                </span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[13px] font-medium text-slate-300 block">
                  Position quantity (lots &times; lot size)
                </span>
                <span className="text-xs text-slate-400 font-mono mt-0.5 block tabular-nums">
                  {strategy.lots} {strategy.lots === 1 ? "lot" : "lots"} &times;{" "}
                  {actualLotSize} units ={" "}
                  <strong className="text-slate-100">{totalQty} Qty</strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Validated (&le; {freezeQty.toLocaleString("en-IN")} freeze)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Underlying: NIFTY 50 Index Options</span>
            <span>Strike selection: Dynamic ITM 3</span>
          </div>
        </Card>

        {/* Right: Gift Nifty 1-Day Observation & CSV Import */}
        <Card
          title="Gift Nifty 1-Day observation"
          subtitle="Record daily Gift Nifty change or import historical CSV"
          className="lg:col-span-5 space-y-4"
        >
          <form onSubmit={handleRecordGiftNifty} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Trade date (IST)
                </label>
                <input
                  type="date"
                  value={giftDateInput}
                  onChange={(e) => setGiftDateInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Gift Nifty 1D change (pts)
                </label>
                <input
                  type="number"
                  step="0.05"
                  placeholder="e.g. +95 or -85"
                  value={giftChangeInput}
                  onChange={(e) => setGiftChangeInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 font-mono text-xs font-semibold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span>Save Gift Nifty observation</span>
            </button>
          </form>

          <form
            onSubmit={handleImportCsv}
            className="pt-4 border-t border-slate-800 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Bulk CSV import (date,change_points)
              </label>
              <span className="text-xs font-mono text-slate-500">
                YYYY-MM-DD,pts
              </span>
            </div>
            <textarea
              rows={3}
              placeholder={"date,change_points\n2026-11-03,95.5\n2026-11-04,-88.0"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isImportingCsv || !csvText.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {isImportingCsv
                  ? "Importing observations..."
                  : "Import historical Gift Nifty CSV"}
              </span>
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
