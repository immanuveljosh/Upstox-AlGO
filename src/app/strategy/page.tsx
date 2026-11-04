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
  Compass,
  Play,
  Square,
  Clock,
  ShieldCheck,
  History,
  Save,
  Upload,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";

export default function StrategyPage() {
  const {
    strategy,
    strategyStatus,
    refreshStrategyStatus,
    recordGiftNiftyChange,
    toggleStrategy,
    updateStrategyLots,
    updateCapital,
    updateRiskSettings,
    mode,
    niftyPrice,
    instrumentMetadata,
    addToast,
  } = useTrading();

  const [capitalInput, setCapitalInput] = useState<string>(
    String(strategy.totalCapital || 200000)
  );
  const [slInput, setSlInput] = useState<string>(
    String(strategy.stoplossPercent || 4.0)
  );
  const [targetInput, setTargetInput] = useState<string>(
    String(strategy.targetPercent || 5.0)
  );
  const [giftChangeInput, setGiftChangeInput] = useState<string>("");
  const [giftDateInput, setGiftDateInput] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  );
  const [csvText, setCsvText] = useState<string>("");
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    setCapitalInput(String(strategy.totalCapital || 200000));
    setSlInput(String(strategy.stoplossPercent || 4.0));
    setTargetInput(String(strategy.targetPercent || 5.0));
    if (
      strategy.giftNiftyChange !== null &&
      strategy.giftNiftyChange !== undefined
    ) {
      setGiftChangeInput(String(strategy.giftNiftyChange));
    }
  }, [
    strategy.totalCapital,
    strategy.stoplossPercent,
    strategy.targetPercent,
    strategy.giftNiftyChange,
  ]);

  const actualLotSize = strategy.lotSize || instrumentMetadata.lotSize || 65;
  const freezeQty = instrumentMetadata.freezeQuantity || 1755;
  const maxLots = Math.floor(freezeQty / actualLotSize);
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

  const handleSaveCapitalAndRisk = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = Number(capitalInput);
    const sl = Number(slInput);
    const tgt = Number(targetInput);
    if (!isNaN(cap) && cap >= 10000) {
      updateCapital(cap);
    }
    if (!isNaN(sl) && sl > 0 && !isNaN(tgt) && tgt > 0) {
      updateRiskSettings(sl, tgt);
    }
  };

  const handleRecordGiftNifty = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(giftChangeInput);
    if (isNaN(val)) {
      addToast({
        type: "warning",
        title: "Invalid Input",
        message: "Enter a numeric Gift Nifty 1-Day change in points (e.g. 95 or -85).",
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

  const signalBadgeStyle =
    currentSignal === "CALL"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
      : currentSignal === "PUT"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
      : currentSignal === "NO TRADE"
      ? "bg-slate-800 text-slate-300 border-slate-700"
      : "bg-amber-500/15 text-amber-300 border-amber-500/30";

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Nifty Directional
            </h1>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              DEFAULT STRATEGY
            </span>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Underlying: NIFTY ONLY
            </span>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              Option Selection: ITM 3
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Signal Source: <strong>Gift Nifty (1 Day)</strong> &bull; Thresholds:{" "}
            <strong className="text-emerald-400">&ge; +80 pts = CALL (CE)</strong>{" "}
            | <strong className="text-rose-400">&le; -80 pts = PUT (PE)</strong>{" "}
            | Between -80 and +80 = <strong>NO TRADE</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>

          <Link
            href="/backtest"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span>Strategy Backtest (1M–1Y)</span>
          </Link>

          <button
            type="button"
            onClick={toggleStrategy}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
              strategy.status === "RUNNING"
                ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-sm"
            }`}
          >
            {strategy.status === "RUNNING" ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>STOP STRATEGY</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START STRATEGY</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Primary Strategy Overview KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Gift Nifty Signal Card */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Gift Nifty Signal (1D)
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${signalBadgeStyle}`}
            >
              {currentSignal}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div
              className={`text-2xl font-black font-mono tabular-nums ${
                giftNiftyPts === null || giftNiftyPts === undefined
                  ? "text-amber-300 text-base"
                  : giftNiftyPts >= 80
                  ? "text-emerald-400"
                  : giftNiftyPts <= -80
                  ? "text-rose-400"
                  : "text-slate-200"
              }`}
            >
              {giftNiftyPts !== null && giftNiftyPts !== undefined ? (
                <span className="inline-flex items-center gap-1">
                  {giftNiftyPts >= 80 && <TrendingUp className="w-5 h-5" />}
                  {giftNiftyPts <= -80 && <TrendingDown className="w-5 h-5" />}
                  {formatSignedPoints(giftNiftyPts)}
                </span>
              ) : (
                "DATA UNAVAILABLE"
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              Contract:{" "}
              <strong className="text-white">
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

        {/* 2. Current Strategy Status & Trading Window */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Trading Window (IST)
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                windowState === "OPEN"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : windowState === "PRE_WINDOW"
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {windowState}
            </span>
          </div>

          <div className="my-2.5">
            <div className="text-lg font-black font-mono text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>09:15:00 – 09:17:00 IST</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              09:15:00 inclusive &bull; 09:17:00 exclusive &bull; Square-off 15:15 IST
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
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
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Today&apos;s Trade Status
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
              {strategy.dailyTradeCount} / {strategy.maxDailyTrades} Trade
            </span>
          </div>

          <div className="my-2.5">
            <div className="text-lg font-bold font-mono text-white">
              {todayTradeStatus.replace(/_/g, " ")}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {strategyStatus?.reason ||
                "Maximum 1 trade per calendar trading day enforced."}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Max Trades/Day: 1</span>
            <span>
              {strategyStatus?.timestamp_ist
                ? formatISTDateTime(strategyStatus.timestamp_ist)
                : "Asia/Kolkata"}
            </span>
          </div>
        </div>

        {/* 4. Capital, Stop Loss (4%) & Target (5%) Summary */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Capital &amp; Risk Limits
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              SL {strategy.stoplossPercent}% / TGT {strategy.targetPercent}%
            </span>
          </div>

          <div className="my-2.5">
            <div className="text-xl font-black font-mono text-white tabular-nums">
              {formatINRCurrency(strategy.totalCapital, 0)}
            </div>
            <div className="flex items-center justify-between text-xs font-mono mt-1.5">
              <span className="text-rose-400">
                SL ({strategy.stoplossPercent}%): -
                {formatINRCurrency(strategy.stoplossAmount, 0)}
              </span>
              <span className="text-emerald-400">
                Target ({strategy.targetPercent}%): +
                {formatINRCurrency(strategy.targetAmount, 0)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              Lot Size: <strong className="text-emerald-400">{actualLotSize}</strong>
            </span>
            <span>
              Order Qty:{" "}
              <strong className="text-white">
                {strategy.lots}L &times; {actualLotSize} = {totalQty} Qty
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Strategy Configuration & Gift Nifty Input Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Capital, Risk & Lot Size Configuration */}
        <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Strategy Capital, Risk &amp; Lot Size Configuration
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              1 Lot = {actualLotSize} Units (Validated)
            </span>
          </div>

          <form onSubmit={handleSaveCapitalAndRisk} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Total Strategy Capital (₹)
                </label>
                <input
                  type="number"
                  min={10000}
                  step={5000}
                  value={capitalInput}
                  onChange={(e) => setCapitalInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-700 px-3 font-mono text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 font-mono">
                  Default: ₹2,00,000
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Stop Loss (% of Capital)
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={25}
                  step={0.5}
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-700 px-3 font-mono text-xs font-bold text-rose-400 focus:outline-none focus:border-rose-500"
                />
                <span className="text-[10px] text-rose-400/80 font-mono">
                  Max Loss:{" "}
                  {formatINRCurrency(
                    (Number(capitalInput) || 0) * ((Number(slInput) || 0) / 100),
                    0
                  )}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Target Profit (% of Capital)
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={50}
                  step={0.5}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-700 px-3 font-mono text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-emerald-400/80 font-mono">
                  Target:{" "}
                  {formatINRCurrency(
                    (Number(capitalInput) || 0) *
                      ((Number(targetInput) || 0) / 100),
                    0
                  )}
                </span>
              </div>
            </div>

            {/* Lot Size & Quantity Selector */}
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold">
                  Order Lots &times; Validated NIFTY Lot Size ({actualLotSize})
                </span>
                <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded">
                  {strategy.lots} {strategy.lots === 1 ? "Lot" : "Lots"} &times;{" "}
                  {actualLotSize} = {totalQty} Quantity
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateStrategyLots(Math.max(1, strategy.lots - 1))
                    }
                    disabled={strategy.lots <= 1}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center border border-slate-700 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxLots}
                    value={strategy.lots}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n) && n >= 1 && n <= maxLots) {
                        updateStrategyLots(n);
                      }
                    }}
                    className="w-full h-8 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-xs font-bold text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateStrategyLots(Math.min(maxLots, strategy.lots + 1))
                    }
                    disabled={strategy.lots >= maxLots}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center justify-center border border-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="col-span-7 grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 5].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updateStrategyLots(preset)}
                      className={`py-1.5 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                        strategy.lots === preset
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/50"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {preset}L = {preset * actualLotSize}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid multiple of {actualLotSize} (Freeze limit:{" "}
                  {freezeQty.toLocaleString("en-IN")} units)
                </span>
                <span>
                  SL/Qty: ₹{(strategy.stoplossAmount / totalQty).toFixed(2)} |
                  Tgt/Qty: ₹{(strategy.targetAmount / totalQty).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Capital &amp; Risk Settings</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Gift Nifty 1-Day Observation & CSV Import */}
        <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white">
              Gift Nifty 1-Day Signal Observation
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Record daily Gift Nifty change in points (used when Upstox Global
              Index feed is offline) or import historical CSV observations.
            </p>
          </div>

          <form onSubmit={handleRecordGiftNifty} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Trade Date (IST)
                </label>
                <input
                  type="date"
                  value={giftDateInput}
                  onChange={(e) => setGiftDateInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-700 px-3 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Gift Nifty 1D Change (Pts)
                </label>
                <input
                  type="number"
                  step="0.05"
                  placeholder="e.g. +95 or -85"
                  value={giftChangeInput}
                  onChange={(e) => setGiftChangeInput(e.target.value)}
                  className="w-full h-9 rounded-lg bg-slate-950 border border-slate-700 px-3 font-mono text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span>Save Gift Nifty Observation</span>
            </button>
          </form>

          <form
            onSubmit={handleImportCsv}
            className="pt-3 border-t border-slate-800 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300">
                Bulk CSV Import (date,change_points)
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                YYYY-MM-DD,pts
              </span>
            </div>
            <textarea
              rows={3}
              placeholder={"date,change_points\n2026-11-03,95.5\n2026-11-04,-88.0"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2.5 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isImportingCsv || !csvText.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {isImportingCsv
                  ? "Importing Observations..."
                  : "Import Historical Gift Nifty CSV"}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
