import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.models.order import Order
from backend.app.services.upstox_client import upstox_client
from backend.app.services.broker_service import broker_service
from backend.app.services.strategy_service import strategy_service, format_ist_display
from backend.app.strategy.nifty_directional import IST, capital_risk_limits, ist_now
from backend.app.core.exceptions import ModeRestrictionException, RiskLimitBreachedException
from backend.app.core.logging import logger, log_critical_action


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

        # 1. Kill switch active check
        if config.is_kill_switch_active:
            raise RiskLimitBreachedException(
                "Kill Switch is currently active. All trading is locked. Reset Kill Switch in Settings."
            )

        # 2. Daily 1-trade limit enforcement for Nifty Directional strategy
        today_date = ist_now().strftime("%Y-%m-%d")
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()

        if config.trades_executed_today >= config.max_trades_per_day:
            raise RiskLimitBreachedException(
                "Maximum daily limit reached: Only 1 trade per day is permitted by the Nifty Directional strategy."
            )

        # 3. Mode validation: Orders can ONLY be placed in LIVE mode
        if config.mode != "LIVE":
            raise ModeRestrictionException(
                "Order placement is disabled in BACKTEST mode. Backtesting is strictly for historical strategy analysis. Switch to LIVE mode to place real orders with Upstox."
            )

        # 4. Verify live Upstox connection
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost. Cannot place live orders.",
            }

        token_record = await broker_service.get_or_create_token_record(db)

        # 5. Fetch real contract metadata & dynamically resolve ITM 3 strike from option chain
        meta = await strategy_service.fetch_instrument_metadata(
            db=db,
            strike=strike,
            option_type=option_type,
        )
        resolved_strike = int(meta.get("strike_price") or strike or 0)
        actual_lot_size = int(meta.get("lot_size") or config.lot_size or 65)
        freeze_quantity = int(meta.get("freeze_quantity") or 1755)
        instrument_key = meta.get("instrument_key") or ""

        actual_lots = lots if (lots and lots > 0) else config.lots
        qty = actual_lots * actual_lot_size
        symbol = meta.get("trading_symbol") or f"NIFTY {resolved_strike} {option_type}"
        client_order_id = f"UPX-{uuid.uuid4().hex[:8].upper()}"

        # Validate quantity against broker and NSE exchange rules
        qty_validation = strategy_service.calculate_and_validate_quantity(
            lots=actual_lots,
            lot_size=actual_lot_size,
            freeze_quantity=freeze_quantity,
            option_premium=price if price > 0 else 0.0,
            available_capital=config.total_capital,
            raw_quantity=qty,
        )
        if not qty_validation["is_valid"]:
            raise RiskLimitBreachedException(
                f"Order quantity validation failed: {qty_validation['message']}"
            )

        # Capital Risk limits (4% SL, 5% Target of total strategy capital)
        sl_amount, target_amount = capital_risk_limits(
            config.total_capital,
            config.stoploss_capital_pct,
            config.target_capital_pct,
        )

        upstox_payload = {
            "quantity": qty,
            "product": "I",
            "validity": "DAY",
            "price": price if order_type == "LIMIT" else 0.0,
            "tag": "nifty_dir",
            "instrument_token": instrument_key,
            "order_type": order_type,
            "transaction_type": "BUY",
            "disclosed_quantity": 0,
            "trigger_price": trigger_price if order_type == "SL" else 0.0,
            "is_amo": False,
        }

        try:
            resp = await upstox_client.place_order(token_record.access_token, upstox_payload)
            upstox_order_id = resp.get("data", {}).get("order_id")
            if not upstox_order_id:
                raise RuntimeError("Upstox OMS did not return an order_id.")
            status = "PLACED"
            reject_reason = None

            config.last_trade_date = today_date
            config.trades_executed_today += 1
            await db.commit()

            log_critical_action(
                "PLACE_ORDER_SUCCESS",
                {
                    "symbol": symbol,
                    "strike": resolved_strike,
                    "selection": "ITM 3",
                    "lots": actual_lots,
                    "qty": qty,
                    "order_id": client_order_id,
                    "upstox_id": upstox_order_id,
                    "sl_amount_4pct": sl_amount,
                    "target_amount_5pct": target_amount,
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

        db_order = Order(
            client_order_id=client_order_id,
            upstox_order_id=upstox_order_id,
            symbol=symbol,
            strike=resolved_strike,
            option_type=option_type,
            lots=actual_lots,
            qty=qty,
            order_type=order_type,
            price=price if price > 0 else 0.0,
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
                "lot_size": actual_lot_size,
                "qty": db_order.qty,
                "instrument_key": instrument_key,
                "price": db_order.price,
                "status": db_order.status,
                "mode": db_order.mode,
                "product": "I (Intraday)",
                "stoploss_capital_4pct": f"₹{sl_amount:,.2f}",
                "target_capital_5pct": f"₹{target_amount:,.2f}",
                "reject_reason": db_order.reject_reason,
                "time": format_ist_display(ist_now()) or db_order.placed_at.strftime("%H:%M:%S"),
            },
            "message": f"Order {status.lower()} for {symbol} (ITM 3).",
        }

    async def get_orders(
        self, db: AsyncSession, status_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch orders directly from Upstox live order book reconciled with local database."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": [],
                "message": msg or "Broker connection lost. No data available.",
            }

        token_record = await broker_service.get_or_create_token_record(db)
        items: List[Dict[str, Any]] = []
        seen_order_ids = set()

        try:
            upstox_orders = await upstox_client.get_orders(token_record.access_token)
            for uo in upstox_orders:
                oid = str(uo.get("order_id") or "")
                if not oid:
                    continue
                seen_order_ids.add(oid)
                ts = uo.get("trading_symbol") or uo.get("tradingsymbol") or "NIFTY"
                opt_type = "CE" if "CE" in ts else ("PE" if "PE" in ts else "CE")
                strike_val = 0
                for part in ts.replace("NIFTY", " ").replace("CE", " ").replace("PE", " ").split():
                    if part.isdigit() and len(part) >= 5:
                        strike_val = int(part)

                qty_val = int(uo.get("quantity") or 65)
                lots_val = max(1, int(round(qty_val / 65)))

                raw_status = str(uo.get("status") or "").upper()
                if raw_status in ["COMPLETE", "FILLED"]:
                    norm_status = "CLOSED"
                elif raw_status in ["REJECTED", "CANCELLED"]:
                    norm_status = "REJECTED"
                else:
                    norm_status = "PLACED"

                time_str = str(uo.get("order_timestamp") or "")[-8:] or ist_now().strftime("%H:%M:%S")

                items.append({
                    "id": oid,
                    "client_order_id": oid,
                    "upstox_order_id": oid,
                    "time": time_str,
                    "symbol": ts,
                    "strike": strike_val,
                    "type": opt_type,
                    "lots": lots_val,
                    "lot_size": 65,
                    "qty": qty_val,
                    "price": float(uo.get("average_price") or uo.get("price") or 0.0),
                    "status": norm_status,
                    "mode": "LIVE",
                    "pnl": 0.0,
                    "exit_price": float(uo.get("average_price") or 0.0),
                    "exit_time": None,
                    "reject_reason": uo.get("status_message") or uo.get("status_message_raw"),
                })
        except Exception as exc:
            logger.warning(f"Note fetching live Upstox orders: {exc}")

        stmt = select(Order).order_by(desc(Order.placed_at))
        result = await db.execute(stmt)
        db_orders = result.scalars().all()

        for o in db_orders:
            if o.upstox_order_id and o.upstox_order_id in seen_order_ids:
                continue
            if o.client_order_id in seen_order_ids:
                continue

            items.append({
                "id": o.client_order_id,
                "client_order_id": o.client_order_id,
                "upstox_order_id": o.upstox_order_id,
                "time": o.placed_at.strftime("%H:%M:%S"),
                "symbol": o.symbol,
                "strike": o.strike,
                "type": o.option_type,
                "lots": o.lots,
                "lot_size": int(round(o.qty / o.lots)) if o.lots and o.lots > 0 else 65,
                "qty": o.qty,
                "price": o.price,
                "status": o.status,
                "mode": o.mode,
                "pnl": o.realized_pnl,
                "exit_price": o.exit_price,
                "exit_time": o.exit_time.strftime("%H:%M:%S") if o.exit_time else None,
                "reject_reason": o.reject_reason,
            })

        if status_filter and status_filter != "ALL":
            items = [item for item in items if item["status"] == status_filter.upper()]

        return {
            "connection_status": "connected",
            "data": items,
            "message": f"Retrieved {len(items)} orders.",
        }

    async def get_positions(self, db: AsyncSession) -> Dict[str, Any]:
        """Fetch real open intraday positions from Upstox portfolio."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": [],
                "message": msg or "Broker connection lost.",
            }

        token_record = await broker_service.get_or_create_token_record(db)
        try:
            positions = await upstox_client.get_positions(token_record.access_token)
            return {
                "connection_status": "connected",
                "data": positions,
                "message": f"Retrieved {len(positions)} live positions.",
            }
        except Exception as exc:
            return {
                "connection_status": "connection_lost",
                "data": [],
                "message": str(exc),
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

        try:
            await upstox_client.cancel_order(token_record.access_token, order_id)
        except Exception as exc:
            logger.warning(f"Upstox cancel order note: {str(exc)}")

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
