"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { mockIntradayCandles } from "@/lib/mockData";
import { DisconnectedNotice } from "@/components/ui/DisconnectedNotice";
import {
  Maximize2,
  TrendingUp,
  BarChart2,
  Layers,
  Clock,
  Activity,
} from "lucide-react";

export function NiftyChart() {
  const { connectionStatus, niftyPrice, activePosition } = useTrading();
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);

  const isConnected = connectionStatus === "CONNECTED";

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col h-[420px] justify-center items-center">
        <DisconnectedNotice moduleName="Intraday Nifty Spot Chart" />
      </div>
    );
  }

  const candles = mockIntradayCandles;
  const minPrice = Math.min(...candles.map((c) => c.low)) - 10;
  const maxPrice = Math.max(...candles.map((c) => c.high)) + 10;
  const priceRange = maxPrice - minPrice;

  const chartHeight = 240;
  const chartWidth = 720;
  const candleWidth = chartWidth / candles.length;

  const getY = (val: number) => {
    return chartHeight - ((val - minPrice) / priceRange) * chartHeight;
  };

  const hoveredCandle =
    hoveredCandleIndex !== null ? candles[hoveredCandleIndex] : candles[candles.length - 1];

  // Calculate VWAP path
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
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            {["1m", "5m", "15m", "1h"].map((tf) => (
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

          {/* VWAP toggle */}
          <button
            onClick={() => setShowVwap(!showVwap)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
              showVwap
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-slate-950 border-slate-800 text-slate-500"
            }`}
          >
            VWAP
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full h-[260px] mt-4 select-none">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const y = chartHeight * ratio;
            const priceLevel = maxPrice - ratio * priceRange;
            return (
              <g key={ratio}>
                <line
                  x1="0"
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={chartWidth - 5}
                  y={y - 4}
                  textAnchor="end"
                  fill="#475569"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {priceLevel.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* VWAP indicator line */}
          {showVwap && (
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              points={vwapPoints}
              opacity="0.85"
            />
          )}

          {/* Active strike marker */}
          {activePosition && (
            <g>
              <line
                x1="0"
                y1={getY(activePosition.strike)}
                x2={chartWidth}
                y2={getY(activePosition.strike)}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <rect
                x="6"
                y={getY(activePosition.strike) - 10}
                width="110"
                height="18"
                rx="3"
                fill="#083344"
                stroke="#06b6d4"
              />
              <text
                x="12"
                y={getY(activePosition.strike) + 3}
                fill="#22d3ee"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                STRIKE {activePosition.strike}
              </text>
            </g>
          )}

          {/* Candlesticks */}
          {candles.map((candle, idx) => {
            const x = idx * candleWidth + candleWidth / 2;
            const isGreen = candle.close >= candle.open;
            const openY = getY(candle.open);
            const closeY = getY(candle.close);
            const highY = getY(candle.high);
            const lowY = getY(candle.low);
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
            const color = isGreen ? "#10b981" : "#ef4444";

            return (
              <g
                key={candle.time}
                className="cursor-crosshair group"
                onMouseEnter={() => setHoveredCandleIndex(idx)}
              >
                {/* Candle Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1.2"
                />
                {/* Candle Body */}
                <rect
                  x={x - candleWidth * 0.35}
                  y={bodyY}
                  width={candleWidth * 0.7}
                  height={bodyHeight}
                  fill={isGreen ? "#10b981" : "#ef4444"}
                  rx="1"
                />
              </g>
            );
          })}
        </svg>

        {/* Live LTP indicator bar */}
        <div
          className="absolute right-0 flex items-center pr-2 pointer-events-none transition-all duration-300"
          style={{
            top: `${Math.max(10, Math.min(chartHeight - 20, getY(niftyPrice)))}px`,
          }}
        >
          <div className="h-px w-full bg-emerald-500/50 absolute left-0" />
          <span className="relative z-10 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[11px] shadow-sm">
            {niftyPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Timeline X-Axis */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
        <span>09:15</span>
        <span>10:00</span>
        <span>10:45</span>
        <span>11:30</span>
        <span>12:15</span>
        <span>13:00</span>
        <span>13:45</span>
        <span>14:30</span>
        <span className="text-emerald-400 font-bold">15:30 (Market Close)</span>
      </div>
    </div>
  );
}

