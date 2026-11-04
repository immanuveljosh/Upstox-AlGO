"use client";

import React, { useState } from "react";
import { formatINR } from "@/lib/utils";

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface EquityCurveChartProps {
  data?: EquityPoint[] | null;
}

function isValidEquityPoint(item: unknown): item is EquityPoint {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    typeof candidate.equity === "number" &&
    !Number.isNaN(candidate.equity) &&
    typeof candidate.drawdown === "number" &&
    !Number.isNaN(candidate.drawdown)
  );
}

export function EquityCurveChart({ data = [] }: EquityCurveChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const safeData: EquityPoint[] = Array.isArray(data)
    ? data.filter(isValidEquityPoint)
    : [];

  if (safeData.length === 0) {
    return (
      <div className="w-full py-10 text-center text-xs text-slate-500 font-mono">
        No equity curve points recorded for this period yet.
      </div>
    );
  }

  const equities = safeData.map((d) => d.equity);
  const minEquity = Math.min(...equities) * 0.96;
  const maxEquity = Math.max(...equities) * 1.04;
  const range = Math.max(1, maxEquity - minEquity);

  const width = 800;
  const height = 260;
  const step = safeData.length > 1 ? width / (safeData.length - 1) : width / 2;

  const getY = (val: number) => {
    return height - ((val - minEquity) / range) * (height - 40) - 20;
  };

  const points =
    safeData.length > 1
      ? safeData.map((d, i) => `${i * step},${getY(d.equity)}`).join(" ")
      : `0,${getY(safeData[0].equity)} ${width},${getY(safeData[0].equity)}`;

  const areaPoints = `${points} ${width},${height} 0,${height}`;

  const activeIdx =
    hoveredIndex !== null && hoveredIndex < safeData.length
      ? hoveredIndex
      : safeData.length - 1;
  const hoveredPoint = safeData[activeIdx];

  return (
    <div className="relative w-full flex flex-col">
      {/* Chart Meta */}
      <div className="flex items-center justify-between pb-3 text-xs">
        <span className="text-slate-400 font-medium">
          Cumulative Account Equity Curve
        </span>
        <div className="font-mono flex items-center gap-3">
          <span className="text-slate-400">
            Current:{" "}
            <strong className="text-emerald-400">
              {formatINR(hoveredPoint.equity)}
            </strong>
          </span>
          {hoveredPoint.drawdown < 0 && (
            <span className="text-rose-400 text-[11px]">
              DD: {formatINR(hoveredPoint.drawdown)}
            </span>
          )}
          <span className="text-slate-500 text-[11px]">
            ({hoveredPoint.date})
          </span>
        </div>
      </div>

      <div className="relative w-full h-[240px] select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((r) => {
            const y = height * r;
            return (
              <line
                key={r}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })}

          {/* Shaded Area */}
          <polygon fill="url(#equityGradient)" points={areaPoints} />

          {/* Main Line */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Interactive Data points */}
          {safeData.map((d, i) => {
            const cx = safeData.length > 1 ? i * step : width / 2;
            const cy = getY(d.equity);
            const isHovered = activeIdx === i;

            return (
              <g
                key={`${d.date}-${i}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill="#030712"
                  stroke="#10b981"
                  strokeWidth={isHovered ? 3 : 2}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Dates axis */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
        {safeData.map((d, idx) => (
          <span
            key={`${d.date}-${idx}`}
            className={idx % 2 === 0 ? "block" : "hidden sm:block"}
          >
            {d.date}
          </span>
        ))}
      </div>
    </div>
  );
}
