import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from backend.app.models.order import Order
from backend.app.services.upstox_client import upstox_client
from backend.app.services.broker_service import broker_service
from backend.app.services.strategy_service import strategy_service, format_ist_display
from backend.app.strategy.nifty_directional import IST, capital_risk_limits, ist_now
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

            # 5. Verify live Upstox connection
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
                "exit_status": o.exit_status,
                "instrument_key": o.instrument_key,
                "exit_upstox_order_id": o.exit_upstox_order_id,
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
