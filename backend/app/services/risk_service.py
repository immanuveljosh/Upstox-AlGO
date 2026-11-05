from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.order import Order
from backend.app.models.system_config import SystemConfig
from backend.app.services.upstox_client import upstox_client
from backend.app.services.broker_service import broker_service
from backend.app.core.exceptions import BrokerConnectionException
from backend.app.core.logging import logger, log_critical_action


class RiskService:
    """Risk management engine, 4% SL / 5% Target capital rules, and Kill Switch executor."""

    async def execute_kill_switch(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Emergency Exit All Positions (Kill Switch).
        Only works when broker connection is active.
        Immediately liquidates all open intraday positions and cancels pending orders.
        """
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            raise BrokerConnectionException(
                "Kill switch failed: Upstox broker is disconnected. Cannot route emergency square-off orders."
            )

        token_record = await broker_service.get_or_create_token_record(db)
        config = await broker_service.get_or_create_config(db)

        closed_symbols: List[str] = []
        positions_closed_count = 0
        orders_cancelled_count = 0

        # Liquidate positions on Upstox
        try:
            positions = await upstox_client.get_positions(token_record.access_token)
            for pos in positions:
                net_qty = pos.get("quantity", 0)
                symbol = pos.get("trading_symbol", "")
                if net_qty != 0:
                    txn_type = "SELL" if net_qty > 0 else "BUY"
                    square_off_payload = {
                        "quantity": abs(net_qty),
                        "product": pos.get("product", "I"),
                        "validity": "DAY",
                        "price": 0.0,
                        "tag": "KILL_SWITCH",
                        "instrument_token": pos.get("instrument_token", ""),
                        "order_type": "MARKET",
                        "transaction_type": txn_type,
                        "disclosed_quantity": 0,
                        "trigger_price": 0.0,
                        "is_amo": False,
                    }
                    try:
                        await upstox_client.place_order(token_record.access_token, square_off_payload)
                        positions_closed_count += 1
                        closed_symbols.append(symbol)
                    except Exception as err:
                        logger.error(f"Failed to square off position {symbol}: {str(err)}")
        except Exception as exc:
            logger.warning(f"Could not retrieve positions for square-off: {str(exc)}")

        # Cancel pending orders in local DB & Upstox
        stmt = select(Order).where(Order.status.in_(["PLACED", "PENDING_EXIT"]))
        result = await db.execute(stmt)
        placed_orders = result.scalars().all()
        for o in placed_orders:
            o.status = "CANCELLED"
            o.exit_time = datetime.utcnow()
            orders_cancelled_count += 1
            if o.upstox_order_id:
                try:
                    await upstox_client.cancel_order(token_record.access_token, o.upstox_order_id)
                except Exception:
                    pass

        # Halt Strategy and set Kill Switch active
        config.strategy_status = "STOPPED"
        config.is_kill_switch_active = True
        await db.commit()

        log_critical_action(
            "KILL_SWITCH_TRIGGERED",
            {
                "positions_closed": positions_closed_count,
                "orders_cancelled": orders_cancelled_count,
                "closed_symbols": closed_symbols,
                "strategy_status": "STOPPED",
            },
        )

        return {
            "connection_status": "connected",
            "data": {
                "triggered": True,
                "positions_closed": positions_closed_count,
                "orders_cancelled": orders_cancelled_count,
                "strategy_stopped": True,
                "closed_symbols": closed_symbols,
                "summary": f"Emergency liquidation complete. {positions_closed_count} positions closed, {orders_cancelled_count} pending orders cancelled. Strategy halted.",
            },
            "message": "KILL SWITCH EXECUTED SUCCESSFULLY.",
        }

    async def get_risk_limits(self, db: AsyncSession) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        sl_amt = round(config.total_capital * (config.stoploss_capital_pct / 100.0), 2)
        tgt_amt = round(config.total_capital * (config.target_capital_pct / 100.0), 2)

        return {
            "connection_status": "connected",
            "data": {
                "total_capital": config.total_capital,
                "stoploss_capital_pct": config.stoploss_capital_pct,
                "stoploss_amount": sl_amt,
                "target_capital_pct": config.target_capital_pct,
                "target_amount": tgt_amt,
                "max_trades_per_day": config.max_trades_per_day,
                "trades_executed_today": config.trades_executed_today,
                "circuit_breaker_triggered": config.is_kill_switch_active,
            },
            "message": "Risk limits retrieved.",
        }

    async def update_risk_limits(
        self,
        db: AsyncSession,
        total_capital: Optional[float] = None,
        stoploss_capital_pct: Optional[float] = None,
        target_capital_pct: Optional[float] = None,
        max_trades_per_day: Optional[int] = None,
    ) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        if total_capital is not None:
            config.total_capital = total_capital
        if stoploss_capital_pct is not None:
            config.stoploss_capital_pct = stoploss_capital_pct
        if target_capital_pct is not None:
            config.target_capital_pct = target_capital_pct
        if max_trades_per_day is not None:
            config.max_trades_per_day = max_trades_per_day

        await db.commit()
        await db.refresh(config)

        log_critical_action(
            "UPDATE_RISK_LIMITS",
            {
                "capital": config.total_capital,
                "sl_pct": config.stoploss_capital_pct,
                "target_pct": config.target_capital_pct,
            },
        )
        return await self.get_risk_limits(db)


risk_service = RiskService()
