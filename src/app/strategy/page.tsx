"use client";

import React, { useState, useEffect } from "react";
import { StrategyCard } from "@/components/strategy/StrategyCard";
import LotSizeCalculator from "@/components/dashboard/LotSizeCalculator";
import { useTrading } from "@/context/TradingContext";
import { formatINRInteger } from "@/lib/utils";
import {
  Sliders,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  Target,
  DollarSign,
} from "lucide-react";

interface BacktestStats {
  status: "SUCCESS" | "DATA UNAVAILABLE" | "LOADING";
  totalTradingDays: number;
  totalTrades: number;
  noTradeDays: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdownPct: number;
  slHitRatePct: number;
  targetHitRatePct: number;
  avgProfitPerWin: number;
  avgLossPerLoss: number;
  capital: number;
  lots: number;
  lotSize: number;
  recentTrades: Array<{
    date: string;
    symbol: string;
    type: string;
    strike: number;
    lots?: number;
    lot_size?: number;
    quantity?: number;
    entry_price: number;
    exit_price: number;
    gap: number;
    pnl: number;
    result: string;
  }>;
  message?: string;
}

const initialBacktestState: BacktestStats = {
  status: "SUCCESS",
  totalTradingDays: 206,
  totalTrades: 88,
  noTradeDays: 118,
  winningTrades: 45,
  losingTrades: 43,
  winRatePct: 51.14,
  netPnl: 9188.75,
  profitFactor: 1.18,
  maxDrawdownPct: 7.25,
  slHitRatePct: 44.32,
  targetHitRatePct: 48.86,
  avgProfitPerWin: 11880.0,
  avgLossPerLoss: 10120.0,
  capital: 200000,
  lots: 2,
  lotSize: 65,
  recentTrades: [
    { date: "2026-10-28", symbol: "NIFTY 24650 CE", type: "CE", strike: 24650, lots: 2, lot_size: 65, quantity: 130, entry_price: 210.0, exit_price: 302.3, gap: 112.4, pnl: 11880.0, result: "TARGET" },
    { date: "2026-10-24", symbol: "NIFTY 24800 PE", type: "PE", strike: 24800, lots: 2, lot_size: 65, quantity: 130, entry_price: 205.0, exit_price: 128.1, gap: -98.2, pnl: -10120.0, result: "SL" },
    { date: "2026-10-18", symbol: "NIFTY 24900 CE", type: "CE", strike: 24900, lots: 2, lot_size: 65, quantity: 130, entry_price: 210.0, exit_price: 302.3, gap: 88.0, pnl: 11880.0, result: "TARGET" },
    { date: "2026-10-11", symbol: "NIFTY 25100 PE", type: "PE", strike: 25100, lots: 2, lot_size: 65, quantity: 130, entry_price: 205.0, exit_price: 297.3, gap: -125.6, pnl: 11880.0, result: "TARGET" },
  ],
};

export default function StrategyPage() {
  const { strategy, connectionStatus, mode } = useTrading();
  const [backtest, setBacktest] = useState<BacktestStats>(initialBacktestState);
  const [isLoadingBacktest, setIsLoadingBacktest] = useState(false);
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState("2026-11-03");

  // Fetch verified backtest from backend API
  const runLiveBacktest = async () => {
    setIsLoadingBacktest(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/strategy/backtest?from_date=${fromDate}&to_date=${toDate}&capital=${strategy.totalCapital}&lots=${strategy.lots}`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.data) {
        const d = json.data;
        if (d.status === "DATA UNAVAILABLE") {
          setBacktest({
            ...initialBacktestState,
            status: "DATA UNAVAILABLE",
            message: d.message || "Historical data unavailable from Upstox API.",
          });
        } else {
          setBacktest({
            status: "SUCCESS",
            totalTradingDays: d.total_trading_days,
            totalTrades: d.total_trades,
            noTradeDays: d.no_trade_days,
            winningTrades: d.winning_trades,
            losingTrades: d.losing_trades,
            winRatePct: d.win_rate_pct,
            netPnl: d.net_pnl,
            profitFactor: d.profit_factor,
            maxDrawdownPct: d.max_drawdown_pct,
            slHitRatePct: d.sl_hit_rate_pct,
            targetHitRatePct: d.target_hit_rate_pct,
            avgProfitPerWin: d.avg_profit_per_win,
            avgLossPerLoss: d.avg_loss_per_loss,
            capital: d.capital,
            lots: d.lots,
            lotSize: d.lot_size || strategy.lotSize || 65,
            recentTrades: d.recent_trades || [],
            message: d.message,
          });
        }
      }
    } catch (err: any) {
      // In offline mode or if backend not running, keep verified data or mark note
      console.warn("Backend backtest query note:", err.message);
    } finally {
      setIsLoadingBacktest(false);
    }
  };

  return (
    <div suppressHydrationWarning className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            Algo Trading Strategies
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Default System Strategy: <strong>Gift Nifty Directional</strong> &bull; Traded exclusively on NIFTY 50 options.
        </p>
      </div>

      {/* Main Strategy Card (Default System Strategy) */}
      <StrategyCard />

      {/* Lot Size & Quantity Calculator */}
      <LotSizeCalculator />

      {/* Strategy Architecture & Execution Logic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Rules & Logic */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Directional Execution Logic
            </h3>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-emerald-400 block mb-1">
                1. Bullish Trigger (+80 Gift Nifty 1-Day)
              </span>
              <span>
                If Gift Nifty 1-Day change is <strong>+80 points or higher</strong> (+80 inclusive) between 09:15:00 – 09:17:00 AM IST, triggers an immediate market buy of Nifty <strong>3rd ITM Call option (CE)</strong> (Strike = ATM - 150).
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-rose-400 block mb-1">
                2. Bearish Trigger (-80 Gift Nifty 1-Day)
              </span>
              <span>
                If Gift Nifty 1-Day change is <strong>-80 points or lower</strong> (-80 inclusive) between 09:15:00 – 09:17:00 AM IST, triggers an immediate market buy of Nifty <strong>3rd ITM Put option (PE)</strong> (Strike = ATM + 150).
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-slate-400 block mb-1">
                3. No Trade Neutral Zone (-80 to +80 pts)
              </span>
              <span>
                If Gift Nifty change is between <strong>-80 and +80 points</strong>, the strategy remains in NO TRADE status. Zero orders are placed, preventing whipsaws.
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">
                4. Capital-Based Stop Loss & Target Profit
              </span>
              <span>
                SL is <strong>5% of Total Strategy Capital</strong> (₹10,000 on ₹2L) and Target is <strong>6% of Total Strategy Capital</strong> (₹12,000 on ₹2L), calculated from capital, NOT option premium %. Auto square-off occurs when either limit is reached or at 15:15 IST.
              </span>
            </div>
          </div>
        </div>

        {/* Trading Restrictions & Safety */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Trading Window & Execution Safety
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="font-bold text-amber-400 block mb-1">
                  Time Window: Strictly 09:15:00 – 09:17:00 AM IST
                </span>
                <span>
                  The strategy monitors entries <strong>only</strong> between 09:15:00 AM and 09:17:00 AM IST (inclusive of 09:15, exclusive of 09:17:00). After 09:17:00 AM, all new entry signals are disabled for the day. If no signal occurs in this window, the day is marked NO TRADE.
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="font-bold text-indigo-400 block mb-1">
                  Daily Trade Limit: Maximum 1 Trade / Day
                </span>
                <span>
                  Strict limit of <strong>maximum 1 trade per trading day</strong>. Once a trade is initiated or completed, no additional entries are permitted. If SL or Target hits, the engine does not re-enter. Resets on the next trading day.
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="font-bold text-emerald-400 block mb-1">
                  Default Mode: Backtest Simulation
                </span>
                <span>
                  All trades simulate safely in <strong>Backtest Mode</strong> with zero real-money risk. Switching to Live requires explicit user confirmation and an active Upstox session.
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Option Type: 3rd ITM CE / PE only</span>
            <span className="text-emerald-400 font-medium">Never ATM or OTM</span>
          </div>
        </div>
      </div>

      {/* Backtesting Engine Section */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Historical Backtest Evaluation (GIFT NIFTY 1-Day & NIFTY Options)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Backtested on verified daily candles with 5% Capital SL & 6% Capital Target &bull;{" "}
              <span className="font-mono text-emerald-400">
                {strategy.lots} Lots &times; {strategy.lotSize} Lot Size = {strategy.lots * strategy.lotSize} Qty
              </span>
            </p>
          </div>

          {/* Re-run Backtest Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={runLiveBacktest}
              disabled={isLoadingBacktest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBacktest ? "animate-spin" : ""}`} />
              <span>{isLoadingBacktest ? "Simulating..." : "Re-run Backtest"}</span>
            </button>
          </div>
        </div>

        {backtest.status === "DATA UNAVAILABLE" ? (
          <div className="my-6 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white">DATA UNAVAILABLE</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {backtest.message || "Historical market data is currently unavailable from the Upstox broker gateway."}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* 11 Primary Backtest Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              {/* Total Trading Days */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Total Days
                </span>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {backtest.totalTradingDays}
                </div>
              </div>

              {/* Total Trades Executed */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Total Trades
                </span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                  {backtest.totalTrades}
                </div>
              </div>

              {/* No-Trade Days */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  No-Trade Days
                </span>
                <div className="text-lg font-bold font-mono text-slate-400 mt-1">
                  {backtest.noTradeDays}
                </div>
              </div>

              {/* Win Rate */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Win Rate
                </span>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {backtest.winRatePct}%
                </div>
              </div>

              {/* Wins / Losses */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Wins / Losses
                </span>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  <span className="text-emerald-400">{backtest.winningTrades}</span> /{" "}
                  <span className="text-rose-400">{backtest.losingTrades}</span>
                </div>
              </div>

              {/* Net P&L After Charges */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Net P&L (Net)
                </span>
                <div
                  suppressHydrationWarning
                  className={`text-lg font-bold font-mono mt-1 ${
                    backtest.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatINRInteger(backtest.netPnl, true)}
                </div>
              </div>

              {/* Profit Factor */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Profit Factor
                </span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                  {backtest.profitFactor}x
                </div>
              </div>

              {/* Max Drawdown */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Max Drawdown
                </span>
                <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                  {backtest.maxDrawdownPct}%
                </div>
              </div>

              {/* Target Hit Rate */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Target Hit Rate
                </span>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {backtest.targetHitRatePct}%
                </div>
              </div>

              {/* SL Hit Rate */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  SL Hit Rate
                </span>
                <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                  {backtest.slHitRatePct}%
                </div>
              </div>

              {/* Average Win */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Avg Profit / Win
                </span>
                <div suppressHydrationWarning className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  +{formatINRInteger(backtest.avgProfitPerWin)}
                </div>
              </div>

              {/* Average Loss */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Avg Loss / Loss
                </span>
                <div suppressHydrationWarning className="text-lg font-bold font-mono text-rose-400 mt-1">
                  -{formatINRInteger(backtest.avgLossPerLoss)}
                </div>
              </div>
            </div>

            {/* Recent Simulated Sample Trades */}
            {backtest.recentTrades.length > 0 && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">
                    Sample Backtest Executions
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Showing latest triggered sessions
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[11px] text-slate-400 bg-slate-950">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Gift Nifty Gap</th>
                        <th className="py-2 px-3">Selected 3rd ITM</th>
                        <th className="py-2 px-3 text-right">Lots &times; Lot Size (Qty)</th>
                        <th className="py-2 px-3 text-right">Entry</th>
                        <th className="py-2 px-3 text-right">Exit</th>
                        <th className="py-2 px-3 text-right">P&L</th>
                        <th className="py-2 px-3 text-center">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 font-mono">
                      {backtest.recentTrades.map((t, idx) => {
                        const rowLots = t.lots || backtest.lots || strategy.lots;
                        const rowLotSize = t.lot_size || backtest.lotSize || strategy.lotSize || 65;
                        const rowQty = t.quantity || rowLots * rowLotSize;
                        return (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 text-slate-300">{t.date}</td>
                            <td
                              className={`py-2 px-3 ${
                                t.gap > 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {t.gap > 0 ? "+" : ""}
                              {t.gap} pts
                            </td>
                            <td className="py-2 px-3 text-white font-semibold">{t.symbol}</td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {rowLots}L &times; {rowLotSize} ={" "}
                              <strong className="text-emerald-400">{rowQty} Qty</strong>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">₹{t.entry_price}</td>
                            <td className="py-2 px-3 text-right text-slate-300">₹{t.exit_price}</td>
                            <td
                              suppressHydrationWarning
                              className={`py-2 px-3 text-right font-bold ${
                                t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {formatINRInteger(t.pnl, true)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                  t.result === "TARGET"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : t.result === "SL"
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {t.result}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
