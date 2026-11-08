"use client";

import React from "react";

export type BadgeTone = "success" | "danger" | "warning" | "neutral" | "info";

export function StatusBadge({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  const styles: Record<BadgeTone, string> = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    info: "bg-slate-800 text-slate-200 border-slate-700",
    neutral: "bg-slate-800/80 text-slate-400 border-slate-700/80",
  };

  const dotColors: Record<BadgeTone, string> = {
    success: "bg-emerald-400",
    danger: "bg-rose-400",
    warning: "bg-amber-400",
    info: "bg-slate-300",
    neutral: "bg-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-medium border ${styles[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[tone]}`} />}
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[13px] text-slate-400 leading-relaxed max-w-3xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  headerAction,
  children,
  className = "",
  noPadding = false,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`rounded-xl bg-slate-900 border border-slate-800 ${
        noPadding ? "overflow-hidden" : "p-6"
      } ${className}`}
    >
      {(title || headerAction) && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
            noPadding
              ? "px-6 py-4 border-b border-slate-800"
              : "pb-4 mb-4 border-b border-slate-800"
          }`}
        >
          <div>
            {title && (
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-[13px] text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueColors = {
    default: "text-slate-100",
    positive: "text-emerald-400",
    negative: "text-rose-400",
    warning: "text-amber-300",
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-medium text-slate-400">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-slate-500 shrink-0" />}
      </div>
      <div
        suppressHydrationWarning
        className={`text-2xl font-semibold font-mono tracking-tight tabular-nums ${valueColors[tone]}`}
      >
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-slate-400 mt-1.5 font-mono truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center flex flex-col items-center justify-center">
      {Icon && (
        <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-3">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {description && (
        <p className="text-[13px] text-slate-400 max-w-md mt-1 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

