import asyncio
import json
import uuid
from datetime import datetime, time
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from backend.app.models.order import Order
from backend.app.models.broker_token import BrokerToken
from backend.app.services.upstox_client import upstox_client
from backend.app.services.broker_service import broker_service
from backend.app.services.strategy_service import strategy_service, format_ist_display
from backend.app.strategy.nifty_directional import (
    IST,
    capital_risk_limits,
    ist_now,
    price_for_net_pnl,
    round_to_tick,
    calculate_option_charges,
)
from backend.app.core.config import settings
from backend.app.core.exceptions import ModeRestrictionException, RiskLimitBreachedException
from backend.app.core.logging import logger, log_critical_action



class OrderService:
    """Handles real Upstox order placement, cancellation, and retrieval."""

    _order_lock: Optional[asyncio.Lock] = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._order_lock is None:
            cls._order_lock = asyncio.Lock()
        return cls._order_lock

    async def place_directional_order(
        self,
        db: AsyncSession,
        option_type: str,
        lots: Optional[int] = None,
        strike: Optional[int] = None,
        order_type: str = "MARKET",
        price: float = 0.0,
        trigger_price: float = 0.0,
        current_time: Optional[time] = None,
    ) -> Dict[str, Any]:
        async with self._get_lock():
            config = await broker_service.get_or_create_config(db)

            # 1. Mode validation: Orders can ONLY be placed in LIVE mode
            if config.mode != "LIVE":
                raise ModeRestrictionException(
                    "Order placement is disabled in BACKTEST mode. Backtesting is strictly for historical strategy analysis. Switch to LIVE mode to place real orders with Upstox."
                )

            # 2. Kill switch active check
            if config.is_kill_switch_active:
                raise RiskLimitBreachedException(
                    "Kill Switch is currently active. All trading is locked. Reset Kill Switch in Settings."
                )

            # 3. Daily 1-trade limit enforcement for Nifty Directional strategy
            today_date = ist_now().strftime("%Y-%m-%d")
            if config.last_trade_date != today_date:
                config.trades_executed_today = 0
                config.last_trade_date = today_date
                await db.commit()
                await db.refresh(config)

            if config.trades_executed_today >= config.max_trades_per_day:
                raise RiskLimitBreachedException(
                    f"Maximum daily limit reached: Only {config.max_trades_per_day} trade per day is permitted by the Nifty Directional strategy."
                )

            # 4. Check if an active open order already exists
            stmt_active = select(Order).where(Order.status.in_(["PLACED", "PENDING_EXIT"]))
            active_order = (await db.execute(stmt_active)).scalars().first()
            if active_order:
                raise RiskLimitBreachedException(
                    f"An open position already exists ({active_order.symbol}, order {active_order.client_order_id}). Only 1 active position allowed."
                )

            # 5. Trading Window Enforcement: Strictly 09:15:00 to 09:17:00 AM IST
            now_time = current_time if current_time is not None else ist_now().time()
            in_window, win_msg = strategy_service.is_within_trading_window(now_time)
            if not in_window:
                raise RiskLimitBreachedException(
                    f"Order placement outside trading window (09:15:00 – 09:17:00 IST) is blocked: {win_msg}"
                )

            # 6. Verify live Upstox connection
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

            # Atomic trade slot reservation before broker order dispatch
            config.last_trade_date = today_date
            config.trades_executed_today += 1
            await db.commit()
            await db.refresh(config)

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
                upstox_order_id = (resp.get("data") or {}).get("order_id")
                if not upstox_order_id:
                    raise RuntimeError("Upstox OMS did not return an order_id.")
                status = "PLACED"
                reject_reason = None

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

                # Safely release the trade reservation since broker rejected order
                config.trades_executed_today = max(0, config.trades_executed_today - 1)
                await db.commit()

                log_critical_action(
                    "PLACE_ORDER_REJECTED",
                    {
                        "symbol": symbol,
                        "lots": actual_lots,
                        "qty": qty,
                        "reason": reject_reason,
                    },
                )

            now_utc = datetime.utcnow()
            db_order = Order(
                client_order_id=client_order_id,
                upstox_order_id=upstox_order_id,
                instrument_key=instrument_key,
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
                placed_at=now_utc,
                signal_time=now_utc,
                broker_confirmed_at=now_utc if upstox_order_id else None,
                expected_price=price if price > 0 else None,
                slippage=0.0,
            )
            db.add(db_order)
            await db.commit()
            await db.refresh(db_order)

            # Check fill status and place broker-side stop-loss
            if status == "PLACED":
                if config.mode == "LIVE" and upstox_order_id:
                    fill_confirmed = False
                    try:
                        hist = await upstox_client.get_order_history(token_record.access_token, upstox_order_id)
                        latest = hist[0] if hist else {}
                        if str(latest.get("status") or "").lower() == "complete":
                            fill_confirmed = True
                            fill_qty = int(latest.get("filled_quantity") or qty)
                            fill_px = float(latest.get("average_price") or db_order.price)
                            db_order.qty = fill_qty
                            db_order.price = fill_px
                            await db.commit()
                    except Exception as e:
                        logger.debug(f"Initial fill check note: {e}")

                    if fill_confirmed:
                        await self.place_broker_stop_loss(
                            db=db,
                            order=db_order,
                            fill_price=db_order.price,
                            filled_qty=db_order.qty,
                        )
                    else:
                        db_order.broker_stop_status = "PENDING_ENTRY_FILL"
                        await db.commit()
                elif config.mode != "LIVE":
                    # Paper / Backtest mode
                    await self.place_broker_stop_loss(
                        db=db,
                        order=db_order,
                        fill_price=db_order.price or 100.0,
                        filled_qty=db_order.qty,
                    )

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
                    "instrument_key": db_order.instrument_key or instrument_key,
                    "price": db_order.price,
                    "status": db_order.status,
                    "mode": db_order.mode,
                    "product": "I (Intraday)",
                    "stoploss_capital_4pct": f"₹{sl_amount:,.2f}",
                    "target_capital_5pct": f"₹{target_amount:,.2f}",
                    "reject_reason": db_order.reject_reason,
                    "time": format_ist_display(ist_now()) or db_order.placed_at.strftime("%H:%M:%S"),
                    "broker_stop_order_id": db_order.broker_stop_order_id,
                    "broker_stop_status": db_order.broker_stop_status,
                    "broker_stop_trigger_price": db_order.broker_stop_trigger_price,
                    "broker_stop_limit_price": db_order.broker_stop_limit_price,
                },
                "message": f"Order {status.lower()} for {symbol} (ITM 3).",
            }

    async def place_broker_stop_loss(
        self,
        db: AsyncSession,
        order: Order,
        fill_price: float,
        filled_qty: int,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Places a broker-side Stop-Loss Limit (SL) order on Upstox OMS for the exact filled quantity.
        Calculates the charge-adjusted stop price for 5% capital loss.
        Sets trigger_price to calculated SL price and limit price with a safe buffer
        (BROKER_STOP_LIMIT_BUFFER_PCT, default 5%) to guarantee execution in fast markets.
        Retries once if initial placement fails; on persistent failure, alerts loudly and
        falls back to software monitoring.
        """
        config = await broker_service.get_or_create_config(db)
        today_date = ist_now().strftime("%Y-%m-%d")
        sl_capital_amt, _ = capital_risk_limits(
            config.total_capital, config.stoploss_capital_pct, config.target_capital_pct
        )
        raw_sl_px = price_for_net_pnl(fill_price, filled_qty, today_date, -sl_capital_amt)
        trigger_px = round_to_tick(raw_sl_px)
        buffer_pct = getattr(settings, "BROKER_STOP_LIMIT_BUFFER_PCT", 0.05)
        limit_px = round_to_tick(max(0.05, trigger_px * (1.0 - buffer_pct)))

        if order.mode != "LIVE":
            # Paper / Backtest mode simulation
            order.broker_stop_order_id = f"SIM-SL-{uuid.uuid4().hex[:8].upper()}"
            order.broker_stop_status = "ACTIVE"
            order.broker_stop_trigger_price = trigger_px
            order.broker_stop_limit_price = limit_px
            await db.commit()
            return True, order.broker_stop_order_id, None

        token_record = await broker_service.get_or_create_token_record(db)
        if not token_record or not token_record.access_token:
            order.broker_stop_status = "FAILED"
            await db.commit()
            return False, None, "No broker access token available"

        stop_payload = {
            "quantity": filled_qty,
            "product": "I",
            "validity": "DAY",
            "price": limit_px,
            "tag": "nifty_dir_sl",
            "instrument_token": order.instrument_key,
            "order_type": "SL",
            "transaction_type": "SELL",
            "disclosed_quantity": 0,
            "trigger_price": trigger_px,
            "is_amo": False,
        }

        stop_order_id = None
        last_error = None

        # Retry once on failure
        for attempt in range(2):
            try:
                resp = await upstox_client.place_order(token_record.access_token, stop_payload)
                if isinstance(resp, dict):
                    stop_order_id = (resp.get("data") or {}).get("order_id")
                else:
                    stop_order_id = getattr(getattr(resp, "data", None), "order_id", None)
                if stop_order_id:
                    break
                else:
                    last_error = "Upstox OMS did not return order_id for SL"
            except Exception as exc:
                last_error = str(exc)
                logger.warning(f"Broker SL placement attempt {attempt + 1} failed for {order.symbol}: {last_error}")
                if attempt == 0:
                    await asyncio.sleep(1.0)

        if stop_order_id:
            order.broker_stop_order_id = stop_order_id
            order.broker_stop_status = "ACTIVE"
            order.broker_stop_trigger_price = trigger_px
            order.broker_stop_limit_price = limit_px
            await db.commit()

            log_critical_action(
                "BROKER_STOP_PLACED",
                {
                    "client_order_id": order.client_order_id,
                    "broker_stop_order_id": stop_order_id,
                    "symbol": order.symbol,
                    "qty": filled_qty,
                    "trigger_price": trigger_px,
                    "limit_price": limit_px,
                },
            )
            return True, stop_order_id, None
        else:
            order.broker_stop_status = "FAILED"
            alert_msg = (
                f"CRITICAL: Broker Stop-Loss placement failed for {order.symbol} ({last_error})! "
                f"Position is protected ONLY by local software monitoring. Re-place stop or exit manually if leaving computer."
            )
            config.critical_alert = alert_msg
            await db.commit()

            log_critical_action(
                "BROKER_STOP_PLACEMENT_FAILED",
                {
                    "client_order_id": order.client_order_id,
                    "symbol": order.symbol,
                    "error": last_error,
                },
            )
            await strategy_service._send_telegram_alert(f"🚨 UPSTOX ALGO CRITICAL ALERT\n{alert_msg}")

            if getattr(settings, "AUTO_EXIT_ON_BROKER_STOP_FAILURE", False):
                logger.warning(f"AUTO_EXIT_ON_BROKER_STOP_FAILURE is enabled: squaring off {order.symbol} immediately.")
            return False, None, last_error

    async def cancel_broker_stop_if_active(
        self,
        db: AsyncSession,
        order: Order,
        token_record: Optional[BrokerToken] = None,
    ) -> Tuple[bool, str]:
        """
        Safely cancels the broker-side stop loss order before placing any exit order.
        Never allows both stop-loss and manual/target exit to sell the position simultaneously.

        Returns:
            (can_proceed_with_exit: bool, reason: str)
            - If can_proceed_with_exit is True: stop is cancelled (or none existed). Safe to send exit order.
            - If can_proceed_with_exit is False: stop has ALREADY TRIGGERED / FILLED at broker.
              Do NOT send another exit order (position is already closed).
        """
        if not order.broker_stop_order_id or order.broker_stop_status in ("CANCELLED", "TRIGGERED", "CLOSED"):
            return True, "NO_ACTIVE_STOP"

        if order.mode != "LIVE" or order.broker_stop_order_id.startswith("SIM-"):
            order.broker_stop_status = "CANCELLED"
            await db.commit()
            return True, "CANCELLED_SIMULATED"

        if not token_record:
            token_record = await broker_service.get_or_create_token_record(db)

        if not token_record or not token_record.access_token:
            return True, "NO_TOKEN"

        # 1. Check if stop order already executed / triggered at Upstox OMS
        try:
            hist = await upstox_client.get_order_history(token_record.access_token, order.broker_stop_order_id)
            latest = hist[0] if hist else {}
            h_status = str(latest.get("status") or "").lower()

            if h_status in ("complete", "filled"):
                # Broker stop has ALREADY triggered and executed!
                order.broker_stop_status = "TRIGGERED"
                order.status = "CLOSED"
                order.exit_status = "CONFIRMED_EXIT"
                order.exit_time = datetime.utcnow()
                order.exit_price = float(latest.get("average_price") or order.broker_stop_trigger_price or order.price)
                order.exit_reason = "Broker Stop Triggered"
                today_date = ist_now().strftime("%Y-%m-%d")
                charges = calculate_option_charges(order.price, order.exit_price, order.qty, today_date)["total"]
                order.realized_pnl = round((order.exit_price - order.price) * order.qty - charges, 2)
                await db.commit()

                log_critical_action(
                    "BROKER_STOP_ALREADY_TRIGGERED",
                    {
                        "client_order_id": order.client_order_id,
                        "broker_stop_order_id": order.broker_stop_order_id,
                        "exit_price": order.exit_price,
                        "realized_pnl": order.realized_pnl,
                    },
                )
                return False, "ALREADY_TRIGGERED"
        except Exception as exc:
            logger.warning(f"Error checking broker stop status for {order.broker_stop_order_id}: {exc}")

        # 2. Stop has not executed yet -> Cancel it at Upstox OMS
        cancel_success = False
        try:
            await upstox_client.cancel_order(token_record.access_token, order.broker_stop_order_id)
            cancel_success = True
        except Exception as exc:
            err_str = str(exc)
            if any(term in err_str.lower() for term in ("already cancelled", "cancelled order", "not found")):
                cancel_success = True
            elif any(term in err_str.lower() for term in ("already executed", "complete", "filled")):
                # Executed just as cancel was dispatched
                order.broker_stop_status = "TRIGGERED"
                order.status = "CLOSED"
                order.exit_status = "CONFIRMED_EXIT"
                order.exit_time = datetime.utcnow()
                order.exit_reason = "Broker Stop Triggered"
                today_date = ist_now().strftime("%Y-%m-%d")
                charges = calculate_option_charges(order.price, order.exit_price or order.price, order.qty, today_date)["total"]
                order.realized_pnl = round(((order.exit_price or order.price) - order.price) * order.qty - charges, 2)
                await db.commit()
                return False, "ALREADY_TRIGGERED"
            else:
                logger.error(f"Failed to cancel broker stop order {order.broker_stop_order_id}: {err_str}")

        if cancel_success:
            order.broker_stop_status = "CANCELLED"
            await db.commit()
            log_critical_action(
                "BROKER_STOP_CANCELLED",
                {
                    "client_order_id": order.client_order_id,
                    "broker_stop_order_id": order.broker_stop_order_id,
                },
            )
            return True, "CANCELLED"

        # Verify status once more
        try:
            hist = await upstox_client.get_order_history(token_record.access_token, order.broker_stop_order_id)
            latest = hist[0] if hist else {}
            h_status = str(latest.get("status") or "").lower()
            if h_status in ("complete", "filled"):
                order.broker_stop_status = "TRIGGERED"
                order.status = "CLOSED"
                order.exit_status = "CONFIRMED_EXIT"
                order.exit_time = datetime.utcnow()
                order.exit_reason = "Broker Stop Triggered"
                await db.commit()
                return False, "ALREADY_TRIGGERED"
            elif h_status in ("cancelled", "rejected"):
                order.broker_stop_status = "CANCELLED"
                await db.commit()
                return True, "CANCELLED"
        except Exception:
            pass

        return True, "CANCEL_ATTEMPTED"

    async def adjust_broker_stop_quantity(
        self,
        db: AsyncSession,
        order: Order,
        new_qty: int,
    ) -> bool:
        """
        Adjusts broker stop loss order quantity when position experiences a partial fill or reconciliation.
        Cancels existing stop and places a new stop for the exact remaining open quantity.
        """
        if not order.broker_stop_order_id or order.broker_stop_status != "ACTIVE":
            return False

        if order.mode != "LIVE" or order.broker_stop_order_id.startswith("SIM-"):
            return True

        token_record = await broker_service.get_or_create_token_record(db)
        if not token_record or not token_record.access_token:
            return False

        # Cancel current stop
        try:
            await upstox_client.cancel_order(token_record.access_token, order.broker_stop_order_id)
            order.broker_stop_status = "CANCELLED"
            await db.commit()
        except Exception as exc:
            logger.warning(f"Could not cancel old stop order before quantity adjustment: {exc}")

        # Place new stop with new quantity
        success, new_stop_id, _ = await self.place_broker_stop_loss(
            db=db,
            order=order,
            fill_price=order.price,
            filled_qty=new_qty,
        )
        return success

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
                "exit_status": o.exit_status,
                "instrument_key": o.instrument_key,
                "exit_upstox_order_id": o.exit_upstox_order_id,
                "broker_stop_order_id": o.broker_stop_order_id,
                "broker_stop_status": o.broker_stop_status or ("ACTIVE" if o.broker_stop_order_id else "MISSING"),
                "broker_stop_trigger_price": o.broker_stop_trigger_price,
                "broker_stop_limit_price": o.broker_stop_limit_price,
            })

        if status_filter and status_filter != "ALL":
            sf = status_filter.upper()
            if sf in ("OPEN", "PLACED"):
                items = [item for item in items if item["status"] in ("PLACED", "PENDING_EXIT")]
            else:
                items = [item for item in items if item["status"] == sf]

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

        # 1. Resolve internal client_order_id to actual upstox_order_id
        stmt = select(Order).where(or_(Order.client_order_id == order_id, Order.upstox_order_id == order_id))
        result = await db.execute(stmt)
        db_order = result.scalars().first()

        if db_order:
            if db_order.status == "CANCELLED":
                return {
                    "connection_status": "connected",
                    "data": {"order_id": order_id, "status": "CANCELLED"},
                    "message": f"Order {order_id} is already cancelled.",
                }
            if db_order.status in ("CLOSED", "FILLED", "COMPLETE"):
                return {
                    "connection_status": "connected",
                    "data": {"order_id": order_id, "status": db_order.status},
                    "message": f"Order {order_id} has already executed ({db_order.status}) and cannot be cancelled.",
                }
            broker_order_id = db_order.upstox_order_id
        else:
            broker_order_id = order_id if not order_id.startswith("UPX-") else None

        if not broker_order_id:
            return {
                "connection_status": "connected",
                "data": {"order_id": order_id, "status": db_order.status if db_order else "REJECTED"},
                "message": f"Cannot cancel order {order_id}: No associated Upstox broker order ID found.",
            }

        # Cancel broker stop first if active
        if db_order and db_order.broker_stop_order_id:
            await self.cancel_broker_stop_if_active(db, db_order, token_record)

        # 2. Send the correct broker order ID to Upstox
        cancel_success = False
        cancel_error = None
        try:
            await upstox_client.cancel_order(token_record.access_token, broker_order_id)
            cancel_success = True
        except Exception as exc:
            err_str = str(exc)
            cancel_error = err_str
            logger.warning(f"Upstox cancel order error for {broker_order_id}: {err_str}")
            # If broker indicates order is already cancelled, reconcile local DB status
            if any(term in err_str.lower() for term in ("already cancelled", "cancelled order", "already been cancelled")):
                cancel_success = True
            elif any(term in err_str.lower() for term in ("already executed", "complete", "filled")):
                if db_order:
                    db_order.status = "CLOSED"
                    await db.commit()
                return {
                    "connection_status": "connected",
                    "data": {"order_id": order_id, "status": "CLOSED"},
                    "message": f"Order {order_id} has already executed on Upstox and cannot be cancelled.",
                }

        # 3. Update local cancellation status ONLY after broker confirmation
        if cancel_success:
            if db_order:
                db_order.status = "CANCELLED"
                db_order.exit_time = datetime.utcnow()
                await db.commit()
            log_critical_action("CANCEL_ORDER_SUCCESS", {"order_id": order_id, "upstox_id": broker_order_id})
            return {
                "connection_status": "connected",
                "data": {"order_id": order_id, "status": "CANCELLED"},
                "message": f"Order {order_id} cancelled successfully.",
            }
        else:
            log_critical_action("CANCEL_ORDER_FAILED", {"order_id": order_id, "upstox_id": broker_order_id, "error": cancel_error})
            return {
                "connection_status": "connected",
                "data": {"order_id": order_id, "status": db_order.status if db_order else "FAILED"},
                "message": f"Failed to cancel order with Upstox: {cancel_error}",
            }

    async def get_orphan_positions(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Retrieves all unmatched broker positions (orphan positions) on Upstox.
        """
        config = await broker_service.get_or_create_config(db)
        orphans: List[Dict[str, Any]] = []

        if config.mode == "LIVE":
            token_record = await broker_service.get_or_create_token_record(db)
            if token_record and token_record.access_token and token_record.is_valid:
                try:
                    live_positions = await upstox_client.get_positions(token_record.access_token)
                    stmt_open = select(Order).where(Order.status.in_(["PLACED", "PENDING_EXIT"]))
                    db_orders = (await db.execute(stmt_open)).scalars().all()
                    matched_tokens = {str(o.instrument_key or "") for o in db_orders if o.instrument_key}

                    for pos in live_positions:
                        qty = int(pos.get("quantity") or 0)
                        tok = str(pos.get("instrument_token") or "")
                        if qty != 0 and tok not in matched_tokens:
                            orphans.append({
                                "instrument_token": tok,
                                "trading_symbol": pos.get("trading_symbol") or pos.get("symbol") or "Unknown",
                                "quantity": qty,
                                "product": pos.get("product") or "I",
                                "pnl": float(pos.get("pnl") or 0.0),
                                "buy_price": float(pos.get("buy_price") or pos.get("average_price") or 0.0),
                                "last_price": float(pos.get("last_price") or 0.0),
                            })
                    config.orphan_positions_json = json.dumps(orphans) if orphans else None
                    await db.commit()
                except Exception as exc:
                    logger.warning(f"Error fetching live orphan positions: {str(exc)}")

        if not orphans and config.orphan_positions_json:
            try:
                orphans = json.loads(config.orphan_positions_json)
            except Exception:
                orphans = []

        warning_msg = (
            f"WARNING: {len(orphans)} orphan position(s) detected on broker. Explicit confirmation required to adopt or square off."
            if orphans else None
        )

        return {
            "connection_status": "connected",
            "data": {
                "orphan_positions": orphans,
                "count": len(orphans),
                "warning": warning_msg,
            },
            "message": f"Found {len(orphans)} orphan position(s).",
        }

    async def adopt_orphan_position(self, db: AsyncSession, instrument_token: str) -> Dict[str, Any]:
        """
        Explicitly adopts an orphan broker position into the local automated strategy database.
        """
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker not connected. Cannot adopt orphan position.",
            }

        token_record = await broker_service.get_or_create_token_record(db)
        positions = await upstox_client.get_positions(token_record.access_token)
        matching_pos = next(
            (p for p in positions if str(p.get("instrument_token") or "") == str(instrument_token)),
            None,
        )

        if not matching_pos or int(matching_pos.get("quantity") or 0) == 0:
            return {
                "connection_status": "connected",
                "data": None,
                "message": f"No active broker position found for instrument {instrument_token}.",
            }

        qty = int(matching_pos.get("quantity") or 0)
        symbol = matching_pos.get("trading_symbol") or matching_pos.get("symbol") or "NIFTY-OPT"
        avg_price = float(matching_pos.get("buy_price") or matching_pos.get("average_price") or 0.0)
        option_type = "CE" if "CE" in symbol.upper() else ("PE" if "PE" in symbol.upper() else "EQ")
        lots = max(1, qty // 65)

        strike = int(matching_pos.get("strike_price") or 0)
        if strike == 0:
            import re
            m = re.search(r"(\d{5})", symbol)
            strike = int(m.group(1)) if m else 24000

        client_order_id = f"UPX-ADP-{uuid.uuid4().hex[:8].upper()}"
        adopted_order = Order(
            client_order_id=client_order_id,
            upstox_order_id=None,
            symbol=symbol,
            option_type=option_type,
            strike=strike,
            lots=lots,
            qty=qty,
            price=avg_price,
            expected_price=avg_price,
            status="PLACED",
            placed_at=datetime.utcnow(),
            order_type="MARKET",
            instrument_key=str(instrument_token),
            exit_status=None,
        )
        db.add(adopted_order)

        # Update cached orphan positions
        config = await broker_service.get_or_create_config(db)
        if config.orphan_positions_json:
            try:
                current_orphans = json.loads(config.orphan_positions_json)
                updated_orphans = [o for o in current_orphans if str(o.get("instrument_token")) != str(instrument_token)]
                config.orphan_positions_json = json.dumps(updated_orphans) if updated_orphans else None
            except Exception:
                pass

        await db.commit()
        await db.refresh(adopted_order)

        log_critical_action("ORPHAN_POSITION_ADOPTED", {"client_order_id": client_order_id, "symbol": symbol, "qty": qty})
        return {
            "connection_status": "connected",
            "data": {
                "client_order_id": adopted_order.client_order_id,
                "symbol": adopted_order.symbol,
                "quantity": adopted_order.qty,
                "status": adopted_order.status,
            },
            "message": f"Successfully adopted orphan position {symbol} (Qty: {qty}) into active strategy tracking.",
        }

    async def square_off_orphan_position(self, db: AsyncSession, instrument_token: str) -> Dict[str, Any]:
        """
        Explicitly squares off an orphan broker position on Upstox.
        """
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker not connected. Cannot square off orphan position.",
            }

        token_record = await broker_service.get_or_create_token_record(db)
        positions = await upstox_client.get_positions(token_record.access_token)
        matching_pos = next(
            (p for p in positions if str(p.get("instrument_token") or "") == str(instrument_token)),
            None,
        )

        if not matching_pos or int(matching_pos.get("quantity") or 0) == 0:
            return {
                "connection_status": "connected",
                "data": None,
                "message": f"No active broker position found for instrument {instrument_token}.",
            }

        qty = int(matching_pos.get("quantity") or 0)
        symbol = matching_pos.get("trading_symbol") or matching_pos.get("symbol") or "Unknown"
        txn_type = "SELL" if qty > 0 else "BUY"

        payload = {
            "quantity": abs(qty),
            "product": matching_pos.get("product") or "I",
            "validity": "DAY",
            "price": 0.0,
            "tag": "orphan_sqoff",
            "instrument_token": str(instrument_token),
            "order_type": "MARKET",
            "transaction_type": txn_type,
            "disclosed_quantity": 0,
            "trigger_price": 0.0,
            "is_amo": False,
        }

        try:
            resp = await upstox_client.place_order(token_record.access_token, payload)
            exit_order_id = (resp.get("data") or {}).get("order_id")
        except Exception as exc:
            return {
                "connection_status": "connected",
                "data": None,
                "message": f"Failed to place square-off order for orphan position {symbol}: {str(exc)}",
            }

        # Update cached orphan positions
        config = await broker_service.get_or_create_config(db)
        if config.orphan_positions_json:
            try:
                current_orphans = json.loads(config.orphan_positions_json)
                updated_orphans = [o for o in current_orphans if str(o.get("instrument_token")) != str(instrument_token)]
                config.orphan_positions_json = json.dumps(updated_orphans) if updated_orphans else None
            except Exception:
                pass
        await db.commit()

        log_critical_action("ORPHAN_POSITION_SQUARED_OFF", {"symbol": symbol, "qty": qty, "exit_order_id": exit_order_id})
        return {
            "connection_status": "connected",
            "data": {
                "symbol": symbol,
                "quantity": abs(qty),
                "exit_order_id": exit_order_id,
            },
            "message": f"Successfully routed square-off order for orphan position {symbol} ({exit_order_id}).",
        }


order_service = OrderService()
