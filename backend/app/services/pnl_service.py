from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.trade import Trade
from backend.app.models.order import Order
from backend.app.services.broker_service import broker_service


class PnlService:
    """Calculates realized trading P&L, win rate, and drawdown metrics from real closed trades."""

    @staticmethod
    def _build_summary_payload(
        period: str,
        net_pnl: float = 0.0,
        gross_pnl: float = 0.0,
        brokerage_taxes: float = 0.0,
        win_rate: float = 0.0,
        profit_trades: int = 0,
        loss_trades: int = 0,
        total_trades: int = 0,
        max_drawdown: float = 0.0,
        max_drawdown_pct: float = 0.0,
        avg_win: float = 0.0,
        avg_loss: float = 0.0,
        profit_factor: float = 0.0,
        equity_curve: List[Dict[str, Any]] | None = None,
        daily_pnl: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        safe_equity = list(equity_curve) if isinstance(equity_curve, list) else []
        safe_daily = list(daily_pnl) if isinstance(daily_pnl, list) else []
        return {
            "period": period,
            # snake_case
            "net_pnl": net_pnl,
            "gross_pnl": gross_pnl,
            "brokerage_taxes": brokerage_taxes,
            "win_rate": win_rate,
            "profit_trades": profit_trades,
            "loss_trades": loss_trades,
            "total_trades": total_trades,
            "max_drawdown": max_drawdown,
            "max_drawdown_pct": max_drawdown_pct,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "profit_factor": profit_factor,
            "equity_curve": safe_equity,
            "daily_pnl": safe_daily,
            # camelCase (frontend PnlSummary contract)
            "netPnl": net_pnl,
            "grossPnl": gross_pnl,
            "brokerageTaxes": brokerage_taxes,
            "winRate": win_rate,
            "profitTrades": profit_trades,
            "lossTrades": loss_trades,
            "totalTrades": total_trades,
            "maxDrawdown": max_drawdown,
            "maxDrawdownPct": max_drawdown_pct,
            "avgWin": avg_win,
            "avgLoss": avg_loss,
            "profitFactor": profit_factor,
            "equityCurve": safe_equity,
            "dailyPnl": safe_daily,
        }

    async def get_pnl_summary(self, db: AsyncSession, period: str = "monthly") -> Dict[str, Any]:
        """
        Calculates P&L for monthly, 6-month, or yearly horizons.
        Always returns a structured PnlSummaryData payload with guaranteed arrays
        for `daily_pnl` / `dailyPnl` and `equity_curve` / `equityCurve`.
        """
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        conn_status = "connected" if is_connected else "connection_lost"

        now = datetime.utcnow()
        if period == "yearly":
            cutoff = now - timedelta(days=365)
        elif period == "sixMonth":
            cutoff = now - timedelta(days=180)
        else:
            cutoff = now - timedelta(days=30)

        stmt = select(Trade).where(Trade.exit_time >= cutoff).order_by(Trade.exit_time.asc())
        result = await db.execute(stmt)
        trades = list(result.scalars().all())

        # Also check closed Order records if Trade table is empty
        session_items: List[Dict[str, Any]] = []
        if trades:
            for t in trades:
                session_items.append({
                    "exit_time": t.exit_time or now,
                    "realized_pnl": float(t.realized_pnl or 0.0),
                })
        else:
            stmt_orders = (
                select(Order)
                .where(Order.status == "CLOSED")
                .where(Order.placed_at >= cutoff)
                .order_by(Order.placed_at.asc())
            )
            closed_orders = (await db.execute(stmt_orders)).scalars().all()
            for o in closed_orders:
                if o.realized_pnl is not None:
                    session_items.append({
                        "exit_time": o.exit_time or o.placed_at or now,
                        "realized_pnl": float(o.realized_pnl),
                    })

        if not session_items:
            return {
                "connection_status": conn_status,
                "data": self._build_summary_payload(period=period),
                "message": (
                    "P&L metrics computed (0 closed trades in period)."
                    if is_connected
                    else (msg or "No closed trades recorded in selected period.")
                ),
            }

        gross_pnl = sum(item["realized_pnl"] for item in session_items)
        brokerage_taxes = len(session_items) * 45.0
        net_pnl = round(gross_pnl - brokerage_taxes, 2)

        profit_items = [item for item in session_items if item["realized_pnl"] > 0]
        loss_items = [item for item in session_items if item["realized_pnl"] <= 0]
        win_rate = round((len(profit_items) / len(session_items)) * 100, 1) if session_items else 0.0

        total_profit = sum(item["realized_pnl"] for item in profit_items)
        total_loss = abs(sum(item["realized_pnl"] for item in loss_items))
        avg_win = round(total_profit / len(profit_items), 2) if profit_items else 0.0
        avg_loss = round(total_loss / len(loss_items), 2) if loss_items else 0.0
        profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else 0.0

        config = await broker_service.get_or_create_config(db)
        starting_capital = float(config.total_capital or 200000.0)
        current_equity = starting_capital
        peak_equity = starting_capital
        max_drawdown = 0.0

        equity_curve: List[Dict[str, Any]] = []
        daily_pnl_map: Dict[str, Dict[str, Any]] = {}

        for item in session_items:
            pnl_val = item["realized_pnl"]
            exit_dt: datetime = item["exit_time"]
            current_equity += pnl_val - 45.0
            if current_equity > peak_equity:
                peak_equity = current_equity
            dd = peak_equity - current_equity
            if dd > max_drawdown:
                max_drawdown = dd

            date_str = exit_dt.strftime("%d %b %Y")
            equity_curve.append({
                "date": date_str,
                "equity": round(current_equity, 2),
                "drawdown": round(-dd, 2),
            })

            if date_str not in daily_pnl_map:
                daily_pnl_map[date_str] = {"date": date_str, "pnl": 0.0, "trades": 0}
            daily_pnl_map[date_str]["pnl"] = round(daily_pnl_map[date_str]["pnl"] + pnl_val, 2)
            daily_pnl_map[date_str]["trades"] += 1

        max_dd_pct = round((max_drawdown / peak_equity) * 100, 1) if peak_equity > 0 else 0.0

        return {
            "connection_status": conn_status,
            "data": self._build_summary_payload(
                period=period,
                net_pnl=net_pnl,
                gross_pnl=round(gross_pnl, 2),
                brokerage_taxes=round(brokerage_taxes, 2),
                win_rate=win_rate,
                profit_trades=len(profit_items),
                loss_trades=len(loss_items),
                total_trades=len(session_items),
                max_drawdown=round(max_drawdown, 2),
                max_drawdown_pct=max_dd_pct,
                avg_win=avg_win,
                avg_loss=avg_loss,
                profit_factor=profit_factor,
                equity_curve=equity_curve,
                daily_pnl=list(daily_pnl_map.values()),
            ),
            "message": "P&L metrics computed.",
        }


pnl_service = PnlService()
