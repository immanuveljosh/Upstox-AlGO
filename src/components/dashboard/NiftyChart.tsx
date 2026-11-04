"use client";

import React, { useState, useEffect } from "react";
import { useTrading } from "@/context/TradingContext";
import { CandleData } from "@/types/trading";
import { DisconnectedNotice } from "@/components/ui/DisconnectedNotice";
import {
  BarChart2,
  Activity,
  Layers,
} from "lucide-react";

export function NiftyChart() {
  const { connectionStatus, niftyPrice, niftyChange, niftyChangePct } = useTrading();
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);

  const isConnected = connectionStatus === "CONNECTED";

  useEffect(() => {
    if (!isConnected) return;
    let isSubscribed = true;

    async function fetchCandles() {
      try {
        const toDate = new Date().toISOString().split("T")[0];
        const res = await fetch(
          `http://localhost:8000/api/v1/market/historical-candles?interval=1minute&to_date=${toDate}`
        );
        if (res.ok && isSubscribed) {
          const json = await res.json();
          if (Array.isArray(json.data) && json.data.length > 0) {
            setCandles(
              json.data.slice(-30).map((c: any) => ({
                time: c.time ? c.time.substring(11, 16) : "",
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
                vwap: (Number(c.high) + Number(c.low) + Number(c.close)) / 3,
                volume: Number(c.volume) || 0,
              }))
            );
          }
        }
      } catch {
        // Handled silently
      }
    }

    fetchCandles();
    const interval = setInterval(fetchCandles, 15000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isConnected, timeframe]);

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col h-[420px] justify-center items-center">
        <DisconnectedNotice moduleName="Intraday Nifty Spot Chart" />
      </div>
    );
  }

  const hasCandles = candles.length > 1;

  if (!hasCandles) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col h-[340px] justify-between">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              NIFTY 50 Live Market Feed
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
            Upstox Live Quote
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="font-mono text-3xl font-extrabold text-white tracking-tight">
            ₹{niftyPrice ? niftyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
          </div>
          <div
            className={`font-mono text-xs font-semibold mt-1 ${
              niftyChange >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {niftyChange >= 0 ? `+${niftyChange.toFixed(2)}` : niftyChange.toFixed(2)} pts (
            {niftyChangePct >= 0 ? `+${niftyChangePct.toFixed(2)}` : niftyChangePct.toFixed(2)}%)
          </div>
          <p className="text-xs text-slate-400 mt-3 max-w-sm">
            Live spot quotes streaming directly from NSE via Upstox API. Intraday candle charts compile automatically from market ticks.
          </p>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800 pt-3">
          <span>Source: Upstox v2 API</span>
          <span>Feed: Real-Time NSE_INDEX</span>
        </div>
      </div>
    );
  }

  const minPrice = Math.min(...candles.map((c) => c.low)) - 10;
  const maxPrice = Math.max(...candles.map((c) => c.high)) + 10;
  const priceRange = Math.max(1, maxPrice - minPrice);

  const chartHeight = 240;
  const chartWidth = 720;
  const candleWidth = chartWidth / candles.length;

  const getY = (val: number) => {
    return chartHeight - ((val - minPrice) / priceRange) * chartHeight;
  };

  const hoveredCandle =
    hoveredCandleIndex !== null ? candles[hoveredCandleIndex] : candles[candles.length - 1];

  const vwapPoints = candles
    .map((c, i) => `${i * candleWidth + candleWidth / 2},${getY(c.vwap)}`)
    .join(" ");

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 md:p-5 flex flex-col">
      {/* Chart Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              NIFTY 50 Intraday Chart
            </h3>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span>O: {hoveredCandle.open.toFixed(1)}</span>
            <span>H: {hoveredCandle.high.toFixed(1)}</span>
            <span>L: {hoveredCandle.low.toFixed(1)}</span>
            <span
              className={
                hoveredCandle.close >= hoveredCandle.open
                  ? "text-emerald-400 font-bold"
                  : "text-rose-400 font-bold"
              }
            >
              C: {hoveredCandle.close.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Timeframe & Overlays */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            {["1m", "5m", "15m"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded font-mono text-[11px] transition-all ${
                  timeframe === tf
                    ? "bg-slate-800 text-emerald-400 font-bold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowVwap(!showVwap)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
              showVwap
                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            VWAP
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative mt-4 h-[240px] w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {candles.map((candle, idx) => {
            const isGreen = candle.close >= candle.open;
            const x = idx * candleWidth;
            const centerX = x + candleWidth / 2;
            const openY = getY(candle.open);
            const closeY = getY(candle.close);
            const highY = getY(candle.high);
            const lowY = getY(candle.low);
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(openY - closeY));
            const barWidth = Math.max(3, candleWidth * 0.7);

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredCandleIndex(idx)}
                onMouseLeave={() => setHoveredCandleIndex(null)}
                className="cursor-crosshair group"
              >
                <line
                  x1={centerX}
                  y1={highY}
                  x2={centerX}
                  y2={lowY}
                  stroke={isGreen ? "#10b981" : "#ef4444"}
                  strokeWidth="1.2"
                />
                <rect
                  x={centerX - barWidth / 2}
                  y={bodyY}
                  width={barWidth}
                  height={bodyHeight}
                  fill={isGreen ? "#10b981" : "#ef4444"}
                  rx="1"
                />
              </g>
            );
          })}

          {showVwap && (
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              points={vwapPoints}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
