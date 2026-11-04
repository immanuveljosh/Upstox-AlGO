import { Order, PnlSummary } from "@/types/trading";
import { DailyRecord } from "@/components/pnl/MonthlyBreakdown";
import { EquityPoint } from "@/components/pnl/EquityCurveChart";

export function createEmptyPnlSummary(
  period: "monthly" | "sixMonth" | "yearly" = "monthly"
): PnlSummary {
  return {
    period,
    netPnl: 0.0,
    grossPnl: 0.0,
    brokerageTaxes: 0.0,
    winRate: 0.0,
    profitTrades: 0,
    lossTrades: 0,
    maxDrawdown: 0.0,
    maxDrawdownPct: 0.0,
    avgWin: 0.0,
    avgLoss: 0.0,
    profitFactor: 0.0,
    equityCurve: [],
    dailyPnl: [],
  };
}

/**
 * Safely normalizes a backend `/api/v1/pnl/summary` payload (supporting both
 * snake_case and camelCase keys) into a strictly typed `PnlSummary` object
 * with guaranteed `dailyPnl` and `equityCurve` arrays.
 */
export function normalizePnlSummary(
  raw: unknown,
  fallbackPeriod: "monthly" | "sixMonth" | "yearly" = "monthly"
): PnlSummary {
  const empty = createEmptyPnlSummary(fallbackPeriod);
  if (!raw || typeof raw !== "object") {
    return empty;
  }

  const d = raw as Record<string, unknown>;
  const rawDaily = Array.isArray(d.dailyPnl)
    ? d.dailyPnl
    : Array.isArray(d.daily_pnl)
    ? d.daily_pnl
    : [];

  const rawEquity = Array.isArray(d.equityCurve)
    ? d.equityCurve
    : Array.isArray(d.equity_curve)
    ? d.equity_curve
    : [];

  const dailyPnl: DailyRecord[] = rawDaily
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      date: String(item.date ?? "").trim(),
      pnl: Number(item.pnl ?? 0),
      trades: Number(item.trades ?? 0),
    }))
    .filter((item) => item.date.length > 0 && !Number.isNaN(item.pnl) && !Number.isNaN(item.trades));

  const equityCurve: EquityPoint[] = rawEquity
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      date: String(item.date ?? "").trim(),
      equity: Number(item.equity ?? 0),
      drawdown: Number(item.drawdown ?? 0),
    }))
    .filter(
      (item) =>
        item.date.length > 0 &&
        !Number.isNaN(item.equity) &&
        !Number.isNaN(item.drawdown)
    );

  const periodVal =
    d.period === "monthly" || d.period === "sixMonth" || d.period === "yearly"
      ? d.period
      : fallbackPeriod;

  return {
    period: periodVal,
    netPnl: Number(d.netPnl ?? d.net_pnl ?? 0) || 0,
    grossPnl: Number(d.grossPnl ?? d.gross_pnl ?? 0) || 0,
    brokerageTaxes: Number(d.brokerageTaxes ?? d.brokerage_taxes ?? 0) || 0,
    winRate: Number(d.winRate ?? d.win_rate ?? 0) || 0,
    profitTrades: Number(d.profitTrades ?? d.profit_trades ?? 0) || 0,
    lossTrades: Number(d.lossTrades ?? d.loss_trades ?? 0) || 0,
    maxDrawdown: Number(d.maxDrawdown ?? d.max_drawdown ?? 0) || 0,
    maxDrawdownPct: Number(d.maxDrawdownPct ?? d.max_drawdown_pct ?? 0) || 0,
    avgWin: Number(d.avgWin ?? d.avg_win ?? 0) || 0,
    avgLoss: Number(d.avgLoss ?? d.avg_loss ?? 0) || 0,
    profitFactor: Number(d.profitFactor ?? d.profit_factor ?? 0) || 0,
    equityCurve,
    dailyPnl,
  };
}

/**
 * Aggregates closed orders into DailyRecord trading sessions when orders are present.
 */
export function deriveDailyRecordsFromOrders(
  orders: Order[] | null | undefined
): DailyRecord[] {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const byDate = new Map<string, { pnl: number; trades: number }>();

  for (const order of orders) {
    if (!order || order.status !== "CLOSED") continue;
    const rawTime = String(order.exitTime || order.time || "").trim();
    const dateKey =
      rawTime.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(rawTime)
        ? rawTime.slice(0, 10)
        : rawTime.split(",")[0]?.trim() || "Today";
    const pnlVal = Number(order.pnl ?? 0) || 0;
    const prev = byDate.get(dateKey) || { pnl: 0, trades: 0 };
    byDate.set(dateKey, {
      pnl: Math.round((prev.pnl + pnlVal) * 100) / 100,
      trades: prev.trades + 1,
    });
  }

  return Array.from(byDate.entries()).map(([date, stats]) => ({
    date,
    pnl: stats.pnl,
    trades: stats.trades,
  }));
}

