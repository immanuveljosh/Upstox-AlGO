"use client";

import React, { useState } from "react";
import { formatINR } from "@/lib/utils";

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

interface EquityCurveChartProps {
  data: EquityPoint[];
}

export function EquityCurveChart({ data }: EquityCurveChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const minEquity = Math.min(...data.map((d) => d.equity)) * 0.96;
  const maxEquity = Math.max(...data.map((d) => d.equity)) * 1.04;
  const range = maxEquity - minEquity;

  const width = 800;
  const height = 260;
  const step = width / (data.length - 1);

  const getY = (val: number) => {
    return height - ((val - minEquity) / range) * (height - 40) - 20;
  };

  const points = data.map((d, i) => `${i * step},${getY(d.equity)}`).join(" ");

  // Closed area polygon for emerald fill
  const areaPoints = `${points} ${width},${height} 0,${height}`;

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : data[data.length - 1];

  return (
    <div className="relative w-full flex flex-col">
      {/* Chart Meta */}
      <div className="flex items-center justify-between pb-3 text-xs">
        <span className="text-slate-400 font-medium">Cumulative Account Equity Curve</span>
        <div className="font-mono flex items-center gap-3">
          <span className="text-slate-400">
            Current: <strong className="text-emerald-400">{formatINR(hoveredPoint.equity)}</strong>
          </span>
          {hoveredPoint.drawdown < 0 && (
            <span className="text-rose-400 text-[11px]">
              DD: {formatINR(hoveredPoint.drawdown)}
            </span>
          )}
          <span className="text-slate-500 text-[11px]">({hoveredPoint.date})</span>
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
          {data.map((d, i) => {
            const cx = i * step;
            const cy = getY(d.equity);
            const isHovered = hoveredIndex === i;

            return (
              <g
                key={d.date}
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
        {data.map((d, idx) => (
          <span key={idx} className={idx % 2 === 0 ? "block" : "hidden sm:block"}>
            {d.date}
          </span>
        ))}
      </div>
    </div>
  );
}

