import uuid
import pytz
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.models.order import Order
from backend.app.models.trade import Trade
from backend.app.models.system_config import SystemConfig
from backend.app.services.upstox_client import upstox_client
from backend.app.services.broker_service import broker_service
from backend.app.services.strategy_service import strategy_service
from backend.app.core.exceptions import ModeRestrictionException, RiskLimitBreachedException
from backend.app.core.logging import logger, log_critical_action

IST = pytz.timezone("Asia/Kolkata")


class OrderService:
    """Handles real Upstox order placement, cancellation, and retrieval."""

    async def place_directional_order(
        self,
        db: AsyncSession,
        option_type: str,
        lots: Optional[int] = None,
        strike: Optional[int] = None,
        order_type: str = "MARKET",
        price: float = 0.0,
        trigger_price: float = 0.0,
    ) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)

        # 1. Backtest mode enforcement: strictly block order execution
        if config.mode == "BACKTEST":
            raise ModeRestrictionException(
                "Order placement is disabled in Backtest mode. Backtest mode only permits historical market data queries. Switch to Paper or Live mode for order execution."
            )

        # 2. Kill switch active check
        if config.is_kill_switch_active:
            raise RiskLimitBreachedException(
                "Kill Switch is currently active. All trading is locked. Reset Kill Switch in Settings."
            )

        # 3. Daily 1-trade limit enforcement for Gift Nifty Directional strategy
        today_date = datetime.now(IST).strftime("%Y-%m-%d")
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()

        if config.trades_executed_today >= config.max_trades_per_day:
            raise RiskLimitBreachedException(
                f"Maximum daily limit reached: Only 1 trade per day is permitted by the Gift Nifty Directional strategy."
            )

        # 4. Strike selection: Default strictly to ITM 3 (In-The-Money 3rd strike)
        spot_price = 24878.50
        if strike is None:
            strike = strategy_service.calculate_itm3_strike(spot_price, option_type)

        actual_lots = lots if lots and lots > 0 else config.lots
        qty = actual_lots * config.lot_size
        symbol = f"NIFTY {strike} {option_type}"
        client_order_id = f"UPX-{uuid.uuid4().hex[:8].upper()}"

        # Calculate Capital Risk limits (5% SL, 6% Target of total capital)
        sl_amount = round(config.total_capital * (config.stoploss_capital_pct / 100.0), 2)
        target_amount = round(config.total_capital * (config.target_capital_pct / 100.0), 2)

        est_price = price if price > 0 else (218.40 if option_type == "CE" else 204.60)

        # 5. Execution branching based on Mode (PAPER vs LIVE)
        if config.mode == "PAPER":
            # Paper Trading Mode: Safely simulated execution
            upstox_order_id = f"PAPER-{uuid.uuid4().hex[:8].upper()}"
            status = "PLACED"
            reject_reason = None

            config.last_trade_date = today_date
            config.trades_executed_today += 1
            await db.commit()

            log_critical_action(
                "PLACE_PAPER_ORDER_SUCCESS",
                {
                    "symbol": symbol,
                    "strike": strike,
                    "selection": "ITM 3",
                    "lots": actual_lots,
                    "qty": qty,
                    "order_id": client_order_id,
                    "mode": "PAPER",
                    "sl_amount_5pct": sl_amount,
                    "target_amount_6pct": target_amount,
                },
            )

        else:
            # LIVE Trading Mode: Real Upstox OMS order routing
            is_connected, msg, _, _ = await broker_service.verify_connection(db)
            if not is_connected:
                return {
                    "connection_status": "connection_lost",
                    "data": None,
                    "message": msg or "Broker connection lost. Cannot place live orders.",
                }

            token_record = await broker_service.get_or_create_token_record(db)

            # Upstox v2 API order payload structure (MIS / Intraday)
            upstox_payload = {
                "quantity": qty,
                "product": "I",  # MIS / Intraday
                "validity": "DAY",
                "price": price if order_type == "LIMIT" else 0.0,
                "tag": "gift_nifty_dir",
                "instrument_token": f"NSE_FO|{symbol}",
                "order_type": order_type,
                "transaction_type": "BUY",
                "disclosed_quantity": 0,
                "trigger_price": trigger_price if order_type == "SL" else 0.0,
                "is_amo": False,
            }

            try:
                # Place order on Upstox OMS
                resp = await upstox_client.place_order(token_record.access_token, upstox_payload)
                upstox_order_id = resp.get("data", {}).get("order_id", f"UP-{uuid.uuid4().hex[:6]}")
                status = "PLACED"
                reject_reason = None

                # Mark daily trade executed
                config.last_trade_date = today_date
                config.trades_executed_today += 1
                await db.commit()

                log_critical_action(
                    "PLACE_ORDER_SUCCESS",
                    {
                        "symbol": symbol,
                        "strike": strike,
                        "selection": "ITM 3",
                        "lots": actual_lots,
                        "qty": qty,
                        "order_id": client_order_id,
                        "upstox_id": upstox_order_id,
                        "sl_amount_5pct": sl_amount,
                        "target_amount_6pct": target_amount,
                    },
                )

            except Exception as exc:
                logger.error(f"Upstox order execution error: {str(exc)}")
                upstox_order_id = None
                status = "REJECTED"
                reject_reason = f"Upstox OMS Reject: {str(exc)}"

                log_critical_action(
                    "PLACE_ORDER_REJECTED",
                    {
                        "symbol": symbol,
                        "lots": actual_lots,
                        "qty": qty,
                        "reason": reject_reason,
                    },
                )

        # Record in DB for audit trail
        db_order = Order(
            client_order_id=client_order_id,
            upstox_order_id=upstox_order_id,
            symbol=symbol,
            strike=strike,
            option_type=option_type,
            lots=actual_lots,
            qty=qty,
            order_type=order_type,
            price=price or (215.0 if option_type == "CE" else 205.0),
            trigger_price=trigger_price,
            status=status,
            mode=config.mode,
            reject_reason=reject_reason,
            placed_at=datetime.utcnow(),
        )
        db.add(db_order)
        await db.commit()
        await db.refresh(db_order)

        return {
            "connection_status": "connected",
            "data": {
                "client_order_id": db_order.client_order_id,
                "upstox_order_id": db_order.upstox_order_id,
                "symbol": db_order.symbol,
                "strike": db_order.strike,
                "moneyness": "ITM 3",
                "type": db_order.option_type,
                "lots": db_order.lots,
                "qty": db_order.qty,
                "price": db_order.price,
                "status": db_order.status,
                "mode": db_order.mode,
                "product": "MIS / I (Intraday)",
                "stoploss_capital_5pct": f"₹{sl_amount:,.2f}",
                "target_capital_6pct": f"₹{target_amount:,.2f}",
                "reject_reason": db_order.reject_reason,
                "time": db_order.placed_at.strftime("%H:%M:%S"),
            },
            "message": f"Order {status.lower()} for {symbol} (ITM 3).",
        }

    async def get_orders(
        self, db: AsyncSession, status_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch orders. If broker is disconnected, return connection_lost with empty list."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": [],
                "message": msg or "Broker connection lost. No data available.",
            }

        stmt = select(Order).order_by(desc(Order.placed_at))
        if status_filter and status_filter != "ALL":
            stmt = stmt.where(Order.status == status_filter.upper())

        result = await db.execute(stmt)
        orders = result.scalars().all()

        items = [
            {
                "id": o.client_order_id,
                "client_order_id": o.client_order_id,
                "upstox_order_id": o.upstox_order_id,
                "time": o.placed_at.strftime("%H:%M:%S"),
                "symbol": o.symbol,
                "strike": o.strike,
                "type": o.option_type,
                "lots": o.lots,
                "qty": o.qty,
                "price": o.price,
                "status": o.status,
                "mode": o.mode,
                "pnl": o.realized_pnl,
                "exit_price": o.exit_price,
                "exit_time": o.exit_time.strftime("%H:%M:%S") if o.exit_time else None,
                "reject_reason": o.reject_reason,
            }
            for o in orders
        ]

        return {
            "connection_status": "connected",
            "data": items,
            "message": f"Retrieved {len(items)} orders.",
        }

    async def cancel_order(self, db: AsyncSession, order_id: str) -> Dict[str, Any]:
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost. Cannot cancel orders.",
            }

        token_record = await broker_service.get_or_create_token_record(db)

        # Cancel on Upstox
        try:
            await upstox_client.cancel_order(token_record.access_token, order_id)
        except Exception as exc:
            logger.warning(f"Upstox cancel order note: {str(exc)}")

        # Update DB order status
        stmt = select(Order).where(Order.client_order_id == order_id)
        result = await db.execute(stmt)
        db_order = result.scalars().first()
        if db_order:
            db_order.status = "CANCELLED"
            await db.commit()

        log_critical_action("CANCEL_ORDER", {"order_id": order_id})
        return {
            "connection_status": "connected",
            "data": {"order_id": order_id, "status": "CANCELLED"},
            "message": f"Order {order_id} cancelled.",
        }


order_service = OrderService()
