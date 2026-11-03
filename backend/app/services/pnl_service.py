from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.models.trade import Trade
from backend.app.services.broker_service import broker_service


class PnlService:
    """Calculates realized trading P&L, win rate, and drawdown metrics from real closed trades."""

    async def get_pnl_summary(self, db: AsyncSession, period: str = "monthly") -> Dict[str, Any]:
        """
        Calculates P&L for monthly, 6-month, or yearly horizons.
        When broker connection is lost, returns connection_lost status and empty data.
        """
        # Connection check
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost. No P&L data available.",
            }

        now = datetime.utcnow()
        if period == "yearly":
            cutoff = now - timedelta(days=365)
        elif period == "sixMonth":
            cutoff = now - timedelta(days=180)
        else:
            cutoff = now - timedelta(days=30)

        stmt = select(Trade).where(Trade.exit_time >= cutoff).order_by(Trade.exit_time.asc())
        result = await db.execute(stmt)
        trades = result.scalars().all()

        if not trades:
            # Return empty baseline metrics when no trades yet in the selected horizon
            return {
                "connection_status": "connected",
                "data": {
                    "period": period,
                    "net_pnl": 0.0,
                    "gross_pnl": 0.0,
                    "brokerage_taxes": 0.0,
                    "win_rate": 0.0,
                    "profit_trades": 0,
                    "loss_trades": 0,
                    "total_trades": 0,
                    "max_drawdown": 0.0,
                    "max_drawdown_pct": 0.0,
                    "profit_factor": 0.0,
                    "equity_curve": [],
                    "daily_pnl": [],
                },
                "message": "P&L metrics computed.",
            }

        gross_pnl = sum(t.realized_pnl for t in trades)
        brokerage_taxes = len(trades) * 45.0  # ~Rs. 40-50 per option round-trip (brokerage + STT + GST)
        net_pnl = round(gross_pnl - brokerage_taxes, 2)

        profit_trades = [t for t in trades if t.realized_pnl > 0]
        loss_trades = [t for t in trades if t.realized_pnl <= 0]
        win_rate = round((len(profit_trades) / len(trades)) * 100, 1) if trades else 0.0

        total_profit = sum(t.realized_pnl for t in profit_trades)
        total_loss = abs(sum(t.realized_pnl for t in loss_trades))
        profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else 0.0

        # Equity curve & drawdown computation
        starting_capital = 200000.0
        current_equity = starting_capital
        peak_equity = starting_capital
        max_drawdown = 0.0

        equity_curve: List[Dict[str, Any]] = []
        daily_pnl_map: Dict[str, Dict[str, Any]] = {}

        for t in trades:
            current_equity += (t.realized_pnl - 45.0)
            if current_equity > peak_equity:
                peak_equity = current_equity
            dd = peak_equity - current_equity
            if dd > max_drawdown:
                max_drawdown = dd

            date_str = t.exit_time.strftime("%d %b")
            equity_curve.append({
                "date": date_str,
                "equity": round(current_equity, 2),
                "drawdown": round(-dd, 2),
            })

            if date_str not in daily_pnl_map:
                daily_pnl_map[date_str] = {"date": date_str, "pnl": 0.0, "trades": 0}
            daily_pnl_map[date_str]["pnl"] += t.realized_pnl
            daily_pnl_map[date_str]["trades"] += 1

        max_dd_pct = round((max_drawdown / peak_equity) * 100, 1) if peak_equity > 0 else 0.0

        return {
            "connection_status": "connected",
            "data": {
                "period": period,
                "net_pnl": net_pnl,
                "gross_pnl": round(gross_pnl, 2),
                "brokerage_taxes": round(brokerage_taxes, 2),
                "win_rate": win_rate,
                "profit_trades": len(profit_trades),
                "loss_trades": len(loss_trades),
                "total_trades": len(trades),
                "max_drawdown": round(max_drawdown, 2),
                "max_drawdown_pct": max_dd_pct,
                "profit_factor": profit_factor,
                "equity_curve": equity_curve,
                "daily_pnl": list(daily_pnl_map.values()),
            },
            "message": "P&L metrics computed.",
        }


pnl_service = PnlService()

