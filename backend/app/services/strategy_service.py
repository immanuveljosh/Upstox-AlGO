import csv
import io
import json
import uuid
from datetime import datetime, date, time, timedelta
from dateutil.relativedelta import relativedelta
from typing import Dict, Any, Tuple, Optional, List, Sequence
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.app.models.system_config import SystemConfig
from backend.app.models.order import Order
from backend.app.models.trade import Trade
from backend.app.models.backtest import GiftNiftyObservation, BacktestRunRecord
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client
from backend.app.core.exceptions import (
    BrokerConnectionException,
    ModeRestrictionException,
    RiskLimitBreachedException,
)
from backend.app.core.logging import logger, log_critical_action
from backend.app.strategy.nifty_directional import (
    IST,
    STRATEGY_ID,
    STRATEGY_NAME,
    UNDERLYING,
    UNDERLYING_INSTRUMENT_KEY,
    SIGNAL_SOURCE,
    SIGNAL_TIMEFRAME,
    OPTION_SELECTION,
    ITM_DEPTH,
    DEFAULT_SIGNAL_THRESHOLD,
    DEFAULT_STOPLOSS_CAPITAL_PCT,
    DEFAULT_TARGET_CAPITAL_PCT,
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_LOTS,
    MAX_TRADES_PER_DAY,
    ENTRY_WINDOW_START,
    ENTRY_WINDOW_END,
    AUTO_SQUARE_OFF,
    SIGNAL_CALL,
    SIGNAL_PUT,
    SIGNAL_NO_TRADE,
    SIGNAL_DATA_UNAVAILABLE,
    EXIT_SL,
    EXIT_TARGET,
    EXIT_TIME,
    classify_signal,
    option_type_for_signal,
    is_within_entry_window,
    window_status,
    select_atm_strike,
    select_itm_strike,
    nearest_expiry_on_or_after,
    capital_risk_limits,
    order_quantity,
    calculate_option_charges,
    round_to_tick,
    parse_candles,
    entry_candle,
    resolve_exit,
    classify_result,
    summarize,
    ist_now,
    ist_iso,
)


def format_ist_display(dt: Optional[datetime]) -> Optional[str]:
    """Formats a datetime in Asia/Kolkata as '04-Nov-2026 09:15:12 IST'."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = IST.localize(dt)
    else:
        dt = dt.astimezone(IST)
    return dt.strftime("%d-%b-%Y %H:%M:%S IST")


class StrategyService:
    """
    DEFAULT SYSTEM STRATEGY: Nifty Directional (nifty-directional)
    - Underlying: NIFTY only
    - Signal Source: Gift Nifty (1 Day change in points)
    - Option Selection: ITM 3 (calculated dynamically from the option chain)
    - Trading Window: 09:15:00 AM (inclusive) – 09:17:00 AM (exclusive) IST
    - Maximum Trades: 1 trade per day
    - Stop Loss: 4% of total strategy capital
    - Target Profit: 5% of total strategy capital
    """

    def is_within_trading_window(self, current_time: Optional[time] = None) -> Tuple[bool, str]:
        """
        Verify if current time is strictly between 09:15:00 AM (inclusive) and 09:17:00 AM (exclusive) IST.
        """
        now_ist = current_time if current_time is not None else ist_now().time()
        in_win = is_within_entry_window(now_ist)
        _, msg = window_status(now_ist)
        return in_win, msg

    def calculate_itm3_strike(
        self,
        spot_price: float,
        option_type: str,
        available_strikes: Optional[Sequence[float]] = None,
    ) -> int:
        """
        Calculates the ITM 3 strike dynamically from the option chain strikes.
        If `available_strikes` is provided from the live/historical option chain, selects the 3rd ITM strike
        directly from those strikes. If not provided, generates the standard 50-point NIFTY strike ladder
        around `spot_price` and selects the 3rd ITM strike.
        """
        if spot_price <= 0:
            raise ValueError("Spot price must be positive to calculate ITM 3 strike.")
        if available_strikes and len(available_strikes) >= (ITM_DEPTH * 2 + 1):
            strikes = list(available_strikes)
        else:
            center = int(round(spot_price / 50.0) * 50)
            strikes = [float(center + i * 50) for i in range(-20, 21)]

        selected = select_itm_strike(strikes, spot_price, option_type, depth=ITM_DEPTH)
        if selected is None:
            raise ValueError(f"Insufficient strikes in option chain to select ITM 3 for spot={spot_price}.")
        return int(round(selected))

    def get_upcoming_nifty_expiry(self, ref_date: Optional[date] = None) -> str:
        """Determines the upcoming weekly NIFTY expiry date (YYYY-MM-DD)."""
        now_d = ref_date or ist_now().date()
        days_ahead = (3 - now_d.weekday()) % 7
        if days_ahead == 0 and ref_date is None and ist_now().time() > time(15, 30):
            days_ahead = 7
        expiry_date = now_d + timedelta(days=days_ahead)
        return expiry_date.strftime("%Y-%m-%d")

    def resolve_historical_lot_size(
        self,
        trade_date: str,
        contract_metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Validates actual lot size from the selected contract metadata first;
        if unavailable, resolves according to official NSE NIFTY derivative lot size revisions.
        """
        if contract_metadata and contract_metadata.get("lot_size"):
            lot_val = int(contract_metadata["lot_size"])
            if lot_val > 0:
                return lot_val

        clean_date = str(trade_date)[:10]
        if clean_date < "2024-04-26":
            return 50
        elif clean_date < "2024-11-20":
            return 25
        elif clean_date < "2026-01-01":
            return 75
        else:
            return 65

    async def fetch_instrument_metadata(
        self,
        db: AsyncSession,
        strike: Optional[int] = None,
        option_type: str = "CE",
        expiry_date: Optional[str] = None,
        spot_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Fetches actual NIFTY option contract metadata (lot_size, freeze_quantity,
        instrument_key, trading_symbol, strike_price) from Upstox `/v2/option/contract`.
        Calculates ITM 3 dynamically from the option chain strikes when `strike` is not specified.
        """
        opt_type = option_type.upper()
        token_record = await broker_service.get_or_create_token_record(db)
        now_ts = datetime.now().timestamp()

        contracts: List[Dict[str, Any]] = []
        cache_attr = getattr(self, "_contracts_cache", None)
        cache_time = getattr(self, "_contracts_cache_time", 0.0)

        if cache_attr and (now_ts - cache_time) < 300:
            contracts = cache_attr
        elif token_record and token_record.access_token:
            try:
                contracts = await upstox_client.get_option_contracts(
                    access_token=token_record.access_token,
                    instrument_key=UNDERLYING_INSTRUMENT_KEY,
                    expiry_date=expiry_date,
                )
                if contracts:
                    self._contracts_cache = contracts
                    self._contracts_cache_time = now_ts
            except Exception as exc:
                logger.warning(f"Upstox option contract metadata query note: {str(exc)}")

        # Resolve spot price from live Upstox quote if not passed
        if (spot_price is None or spot_price <= 0) and token_record and token_record.access_token:
            try:
                q_resp = await upstox_client.get_market_quote(token_record.access_token, UNDERLYING_INSTRUMENT_KEY)
                q_data = (q_resp.get("data") or {}).get("NSE_INDEX:Nifty 50") or {}
                if q_data.get("last_price"):
                    spot_price = float(q_data["last_price"])
            except Exception:
                pass

        if contracts:
            today_str = ist_now().strftime("%Y-%m-%d")
            expiries = sorted({c.get("expiry", "") for c in contracts if c.get("expiry") and c.get("expiry") >= today_str})
            if not expiries:
                expiries = sorted({c.get("expiry", "") for c in contracts if c.get("expiry")})
            target_expiry = (
                expiry_date
                if (expiry_date and expiry_date in expiries)
                else (expiries[0] if expiries else self.get_upcoming_nifty_expiry())
            )

            expiry_contracts = [
                c for c in contracts
                if c.get("expiry") == target_expiry
                and str(c.get("instrument_type", "")).upper() == opt_type
            ]
            chain_strikes = sorted({float(c.get("strike_price", 0)) for c in expiry_contracts if c.get("strike_price")})

            if strike is None and spot_price and spot_price > 0 and chain_strikes:
                selected_s = select_itm_strike(chain_strikes, spot_price, opt_type, depth=ITM_DEPTH)
                if selected_s is not None:
                    strike = int(round(selected_s))

            if strike is None and spot_price and spot_price > 0:
                strike = self.calculate_itm3_strike(spot_price, opt_type)

            matching = [
                c for c in expiry_contracts
                if strike is not None and int(float(c.get("strike_price", 0))) == int(strike)
            ]
            if not matching and expiry_contracts:
                matching = [expiry_contracts[len(expiry_contracts) // 2]]

            if matching:
                c = matching[0]
                lot_size = int(c.get("lot_size") or 65)
                freeze_qty = int(float(c.get("freeze_quantity") or 1755))
                max_lots = freeze_qty // lot_size if lot_size > 0 else 27

                config = await broker_service.get_or_create_config(db)
                if config.lot_size != lot_size:
                    config.lot_size = lot_size
                    await db.commit()

                return {
                    "instrument_key": c.get("instrument_key", ""),
                    "trading_symbol": c.get("trading_symbol", f"NIFTY {int(float(c.get('strike_price', strike or 0)))} {opt_type}"),
                    "name": c.get("name", "NIFTY"),
                    "exchange": c.get("exchange", "NSE"),
                    "segment": c.get("segment", "NSE_FO"),
                    "expiry": c.get("expiry", target_expiry),
                    "strike_price": float(c.get("strike_price", strike or 0)),
                    "option_type": opt_type,
                    "lot_size": lot_size,
                    "minimum_lot": int(c.get("minimum_lot") or lot_size),
                    "freeze_quantity": freeze_qty,
                    "max_lots_per_order": max_lots,
                    "tick_size": float(c.get("tick_size") or 0.05),
                    "source": "UPSTOX_API",
                }

        # When Upstox session is not active, return current exchange lot specification (65)
        if strike is None and spot_price and spot_price > 0:
            strike = self.calculate_itm3_strike(spot_price, opt_type)
        resolved_strike = int(strike) if strike is not None else 0
        fallback_expiry = expiry_date or self.get_upcoming_nifty_expiry()
        return {
            "instrument_key": f"NSE_FO|NIFTY_{resolved_strike}_{opt_type}" if resolved_strike else "",
            "trading_symbol": f"NIFTY {resolved_strike} {opt_type}" if resolved_strike else f"NIFTY ITM 3 {opt_type}",
            "name": "NIFTY",
            "exchange": "NSE",
            "segment": "NSE_FO",
            "expiry": fallback_expiry,
            "strike_price": float(resolved_strike),
            "option_type": opt_type,
            "lot_size": 65,
            "minimum_lot": 65,
            "freeze_quantity": 1755,
            "max_lots_per_order": 27,
            "tick_size": 0.05,
            "source": "EXCHANGE_SPEC_65",
        }

    def calculate_and_validate_quantity(
        self,
        lots: int,
        lot_size: int = 65,
        freeze_quantity: int = 1755,
        option_premium: float = 0.0,
        available_capital: float = DEFAULT_TOTAL_CAPITAL,
        raw_quantity: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Calculates Total Quantity = Number of Lots × Actual Lot Size
        and validates against broker & NSE exchange rules.
        """
        errors: List[str] = []

        if lot_size <= 0:
            errors.append(f"Invalid exchange lot size ({lot_size}). Lot size must be positive.")
            lot_size = 65

        if lots < 1:
            errors.append(f"Invalid lot count ({lots}). Minimum 1 lot ({lot_size} quantity) is required.")

        expected_quantity = lots * lot_size
        total_quantity = raw_quantity if raw_quantity is not None else expected_quantity

        if total_quantity <= 0:
            errors.append(f"Total quantity ({total_quantity}) must be greater than 0.")

        if total_quantity % lot_size != 0:
            errors.append(
                f"Quantity ({total_quantity}) is not a valid multiple of the NIFTY exchange lot size ({lot_size})."
            )

        if raw_quantity is not None and raw_quantity != expected_quantity:
            errors.append(
                f"Quantity mismatch: {lots} lots × {lot_size} lot size = {expected_quantity}, but got {raw_quantity}."
            )

        max_lots = freeze_quantity // lot_size if lot_size > 0 else 27
        if total_quantity > freeze_quantity:
            errors.append(
                f"Total quantity ({total_quantity}) exceeds NSE single-order freeze limit of {freeze_quantity} ({max_lots} lots max)."
            )

        estimated_value = round(max(0, total_quantity) * max(0.0, float(option_premium or 0.0)), 2)
        within_capital = True
        if option_premium and option_premium > 0:
            within_capital = estimated_value <= available_capital
            if not within_capital:
                errors.append(
                    f"Estimated order value (₹{estimated_value:,.2f}) exceeds available strategy capital (₹{available_capital:,.2f})."
                )

        is_valid = len(errors) == 0
        return {
            "is_valid": is_valid,
            "lots": lots,
            "lot_size": lot_size,
            "total_quantity": total_quantity,
            "freeze_quantity": freeze_quantity,
            "max_lots_per_order": max_lots,
            "estimated_order_value": estimated_value,
            "within_capital_limit": within_capital,
            "errors": errors,
            "message": (
                f"Valid order quantity: {lots} Lot{'s' if lots != 1 else ''} × {lot_size} = {total_quantity} Quantity"
                if is_valid
                else "; ".join(errors)
            ),
        }

    async def get_strategy_config(self, db: AsyncSession) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        sl_amt, tgt_amt = capital_risk_limits(
            config.total_capital,
            config.stoploss_capital_pct,
            config.target_capital_pct,
        )

        return {
            "connection_status": "connected",
            "data": {
                "id": STRATEGY_ID,
                "name": STRATEGY_NAME,
                "underlying": UNDERLYING,
                "signal_source": SIGNAL_SOURCE,
                "timeframe": SIGNAL_TIMEFRAME,
                "description": (
                    "Nifty Directional: Buy NIFTY ITM 3 Call (CE) if Gift Nifty 1-Day change >= +80 pts; "
                    "Buy NIFTY ITM 3 Put (PE) if <= -80 pts; No Trade between -80 and +80 pts. "
                    "Entry window 09:15:00–09:17:00 IST, max 1 trade/day, Stop Loss 4% of capital, Target 5% of capital."
                ),
                "status": config.strategy_status,
                "mode": config.mode,
                "option_selection": OPTION_SELECTION,
                "signal_threshold": config.gift_nifty_signal_threshold,
                "entry_window_start": "09:15:00",
                "entry_window_end": "09:17:00",
                "trading_window": "09:15:00 – 09:17:00 IST",
                "auto_square_off": "15:15 IST",
                "max_trades_per_day": config.max_trades_per_day,
                "trades_executed_today": config.trades_executed_today,
                "total_capital": config.total_capital,
                "stoploss_capital_pct": config.stoploss_capital_pct,
                "stoploss_amount": sl_amt,
                "target_capital_pct": config.target_capital_pct,
                "target_amount": tgt_amt,
                "lot_size": config.lot_size,
                "lots": config.lots,
                "total_qty": config.lots * config.lot_size,
                "product": "I (Intraday)",
            },
            "message": "Nifty Directional strategy configuration retrieved.",
        }

    # ----------------------------------------------------------------------- #
    # Gift Nifty observations & live snapshot
    # ----------------------------------------------------------------------- #
    async def get_gift_nifty_snapshot(
        self,
        db: AsyncSession,
        trade_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves the actual Gift Nifty 1-Day change in points for `trade_date` (default today IST).
        1. If `trade_date` is today and Upstox is connected, queries `GLOBAL_INDEX|SGX NIFTY`.
        2. Otherwise checks `GiftNiftyObservation` table for `trade_date`.
        3. Never fabricates Gift Nifty values — returns status='DATA UNAVAILABLE' if none exist.
        """
        target_date = trade_date or ist_now().strftime("%Y-%m-%d")
        today_str = ist_now().strftime("%Y-%m-%d")

        if target_date == today_str:
            token_record = await broker_service.get_or_create_token_record(db)
            if token_record and token_record.access_token:
                q = await upstox_client.get_gift_nifty_quote(token_record.access_token)
                if q and q.get("last_price") is not None:
                    curr_val = float(q["last_price"])
                    ohlc = q.get("ohlc") or {}
                    prev_close = float(ohlc.get("close") or 0.0) if ohlc.get("close") else None
                    net_change = q.get("net_change")
                    if net_change is not None:
                        change_pts = round(float(net_change), 2)
                    elif prev_close and prev_close > 0:
                        change_pts = round(curr_val - prev_close, 2)
                    else:
                        change_pts = None

                    if change_pts is not None:
                        obs_iso = ist_iso(ist_now())
                        return {
                            "status": "AVAILABLE",
                            "trade_date": target_date,
                            "change_points": change_pts,
                            "prev_close": prev_close,
                            "current_value": curr_val,
                            "observed_at": obs_iso,
                            "source": "UPSTOX_GLOBAL_INDEX",
                            "message": f"Live Gift Nifty 1-Day change from Upstox: {change_pts:+.2f} pts.",
                        }

        stmt = select(GiftNiftyObservation).where(GiftNiftyObservation.trade_date == target_date)
        obs = (await db.execute(stmt)).scalars().first()
        if obs is not None:
            return {
                "status": "AVAILABLE",
                "trade_date": obs.trade_date,
                "change_points": float(obs.change_points),
                "prev_close": obs.prev_close,
                "current_value": obs.current_value,
                "observed_at": obs.observed_at,
                "source": obs.source,
                "message": f"Recorded Gift Nifty 1-Day change for {obs.trade_date}: {obs.change_points:+.2f} pts ({obs.source}).",
            }

        return {
            "status": "DATA UNAVAILABLE",
            "trade_date": target_date,
            "change_points": None,
            "prev_close": None,
            "current_value": None,
            "observed_at": None,
            "source": None,
            "message": "DATA UNAVAILABLE: Connect Upstox with Global Indices feed or record today's Gift Nifty 1-Day change.",
        }

    async def record_gift_nifty_observation(
        self,
        db: AsyncSession,
        change_points: float,
        trade_date: Optional[str] = None,
        prev_close: Optional[float] = None,
        current_value: Optional[float] = None,
        observed_at: Optional[str] = None,
        source: str = "MANUAL",
    ) -> Dict[str, Any]:
        target_date = (trade_date or ist_now().strftime("%Y-%m-%d")).strip()[:10]
        obs_stamp = observed_at or ist_iso(ist_now())

        stmt = select(GiftNiftyObservation).where(GiftNiftyObservation.trade_date == target_date)
        existing = (await db.execute(stmt)).scalars().first()
        if existing:
            existing.change_points = float(change_points)
            existing.prev_close = prev_close
            existing.current_value = current_value
            existing.observed_at = obs_stamp
            existing.source = source
            record = existing
        else:
            record = GiftNiftyObservation(
                trade_date=target_date,
                change_points=float(change_points),
                prev_close=prev_close,
                current_value=current_value,
                observed_at=obs_stamp,
                source=source,
            )
            db.add(record)

        await db.commit()
        await db.refresh(record)
        return {
            "connection_status": "connected",
            "data": {
                "trade_date": record.trade_date,
                "change_points": record.change_points,
                "prev_close": record.prev_close,
                "current_value": record.current_value,
                "observed_at": record.observed_at,
                "source": record.source,
                "signal": classify_signal(record.change_points),
            },
            "message": f"Gift Nifty observation saved for {record.trade_date} ({record.change_points:+.2f} pts).",
        }

    async def import_gift_nifty_csv(self, db: AsyncSession, csv_text: str) -> Dict[str, Any]:
        imported = 0
        updated = 0
        skipped = 0
        errors: List[str] = []

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        for idx, row in enumerate(reader, start=2):
            try:
                raw_date = (row.get("date") or row.get("trade_date") or "").strip()[:10]
                raw_change = row.get("change_points") or row.get("gift_nifty_change") or row.get("change")
                if not raw_date or raw_change is None or str(raw_change).strip() == "":
                    skipped += 1
                    continue
                datetime.strptime(raw_date, "%Y-%m-%d")
                change_val = float(str(raw_change).strip())
                prev_val = float(row["prev_close"]) if row.get("prev_close") else None
                curr_val = float(row["value_at_0915"]) if row.get("value_at_0915") else (
                    float(row["current_value"]) if row.get("current_value") else None
                )
                obs_at = row.get("observed_at") or f"{raw_date}T09:15:00+05:30"

                stmt = select(GiftNiftyObservation).where(GiftNiftyObservation.trade_date == raw_date)
                existing = (await db.execute(stmt)).scalars().first()
                if existing:
                    existing.change_points = change_val
                    existing.prev_close = prev_val
                    existing.current_value = curr_val
                    existing.observed_at = obs_at
                    existing.source = "CSV_IMPORT"
                    updated += 1
                else:
                    db.add(
                        GiftNiftyObservation(
                            trade_date=raw_date,
                            change_points=change_val,
                            prev_close=prev_val,
                            current_value=curr_val,
                            observed_at=obs_at,
                            source="CSV_IMPORT",
                        )
                    )
                    imported += 1
            except Exception as exc:
                errors.append(f"Row {idx}: {str(exc)}")
                skipped += 1

        await db.commit()
        return {
            "connection_status": "connected",
            "data": {
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": errors,
            },
            "message": f"Imported {imported} and updated {updated} Gift Nifty observations.",
        }

    async def list_gift_nifty_history(
        self,
        db: AsyncSession,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        stmt = select(GiftNiftyObservation).order_by(desc(GiftNiftyObservation.trade_date))
        if from_date:
            stmt = stmt.where(GiftNiftyObservation.trade_date >= from_date[:10])
        if to_date:
            stmt = stmt.where(GiftNiftyObservation.trade_date <= to_date[:10])
        rows = (await db.execute(stmt)).scalars().all()
        items = [
            {
                "trade_date": r.trade_date,
                "change_points": r.change_points,
                "prev_close": r.prev_close,
                "current_value": r.current_value,
                "observed_at": r.observed_at,
                "source": r.source,
                "signal": classify_signal(r.change_points),
            }
            for r in rows
        ]
        return {
            "connection_status": "connected",
            "data": {"rows": items, "count": len(items)},
            "message": f"Retrieved {len(items)} Gift Nifty observations.",
        }

    # ----------------------------------------------------------------------- #
    # Live status & signal evaluation
    # ----------------------------------------------------------------------- #
    async def get_live_status(
        self,
        db: AsyncSession,
        override_change: Optional[float] = None,
        current_time: Optional[time] = None,
        spot_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Returns the real-time Nifty Directional strategy overview (`GET /strategy/status`)."""
        config = await broker_service.get_or_create_config(db)
        now_dt = ist_now()
        today_date = now_dt.strftime("%Y-%m-%d")

        # Day rollover check
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()
            await db.refresh(config)

        if override_change is not None:
            gift_snap = {
                "status": "AVAILABLE",
                "trade_date": today_date,
                "change_points": float(override_change),
                "prev_close": None,
                "current_value": None,
                "observed_at": ist_iso(now_dt),
                "source": "DIRECT_EVALUATION",
                "message": f"Gift Nifty change: {float(override_change):+.2f} pts",
            }
        else:
            gift_snap = await self.get_gift_nifty_snapshot(db, today_date)

        change_pts = gift_snap.get("change_points")
        signal = classify_signal(change_pts, config.gift_nifty_signal_threshold)
        opt_type = option_type_for_signal(signal)

        eval_time = current_time if current_time is not None else now_dt.time()
        win_state, win_msg = window_status(eval_time)
        in_window = win_state == "OPEN"

        # Check today's executed order if any
        stmt_today = (
            select(Order)
            .where(Order.placed_at >= datetime.combine(now_dt.date(), time.min))
            .order_by(desc(Order.placed_at))
        )
        today_order_row = (await db.execute(stmt_today)).scalars().first()
        today_order = None
        if today_order_row:
            today_order = {
                "client_order_id": today_order_row.client_order_id,
                "upstox_order_id": today_order_row.upstox_order_id,
                "symbol": today_order_row.symbol,
                "option_type": today_order_row.option_type,
                "strike": today_order_row.strike,
                "quantity": today_order_row.qty,
                "status": today_order_row.status,
                "entry_price": today_order_row.price,
                "exit_price": today_order_row.exit_price,
                "realized_pnl": today_order_row.realized_pnl,
                "exit_reason": today_order_row.reject_reason,
            }

        daily_limit_reached = config.trades_executed_today >= config.max_trades_per_day
        kill_switch_active = bool(config.is_kill_switch_active)

        if daily_limit_reached or today_order is not None:
            today_trade_status = "TRADE_INITIATED"
        elif change_pts is None:
            today_trade_status = "DATA_UNAVAILABLE"
        elif win_state == "PRE_WINDOW":
            today_trade_status = "AWAITING_WINDOW"
        elif win_state == "OPEN":
            today_trade_status = "MONITORING" if signal in (SIGNAL_CALL, SIGNAL_PUT) else "NO_TRADE"
        else:
            today_trade_status = "NO_TRADE"

        can_enter_now = (
            not kill_switch_active
            and not daily_limit_reached
            and in_window
            and signal in (SIGNAL_CALL, SIGNAL_PUT)
        )

        if kill_switch_active:
            reason = "Kill Switch is active. Trading locked."
        elif change_pts is None:
            reason = "DATA UNAVAILABLE: Gift Nifty 1-Day change is not available."
        elif signal == SIGNAL_NO_TRADE:
            reason = f"NO TRADE: Gift Nifty change ({change_pts:+.2f} pts) is between -80 and +80 pts."
        elif daily_limit_reached:
            reason = f"Daily limit reached: 1 trade already executed on {today_date}."
        elif not in_window:
            reason = f"Outside trading window (09:15:00 – 09:17:00 IST). {win_msg}"
        else:
            reason = f"{signal} signal active ({change_pts:+.2f} pts) inside 09:15:00–09:17:00 IST window."

        sl_amt, tgt_amt = capital_risk_limits(
            config.total_capital,
            config.stoploss_capital_pct,
            config.target_capital_pct,
        )

        selected_strike: Optional[int] = None
        if opt_type and spot_price and spot_price > 0:
            selected_strike = self.calculate_itm3_strike(spot_price, opt_type)

        return {
            "connection_status": "connected",
            "data": {
                "timestamp_ist": ist_iso(now_dt),
                "trading_date": today_date,
                "strategy_name": STRATEGY_NAME,
                "gift_nifty": gift_snap,
                "signal": signal,
                "option_type": opt_type,
                "selected_strike": selected_strike,
                "window_status": win_state,
                "window_message": win_msg,
                "today_trade_status": today_trade_status,
                "today_order": today_order,
                "trades_executed_today": config.trades_executed_today,
                "max_trades_per_day": config.max_trades_per_day,
                "engine_status": config.strategy_status,
                "mode": config.mode,
                "can_enter_now": can_enter_now,
                "reason": reason,
                "total_capital": config.total_capital,
                "stoploss_pct": config.stoploss_capital_pct,
                "stoploss_amount": sl_amt,
                "target_pct": config.target_capital_pct,
                "target_amount": tgt_amt,
                "lots": config.lots,
                "lot_size": config.lot_size,
                "quantity": config.lots * config.lot_size,
            },
            "message": reason,
        }

    async def evaluate_signal(
        self,
        db: AsyncSession,
        gift_nifty_change: Optional[float] = None,
        current_time: Optional[time] = None,
        spot_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates Gift Nifty 1-Day directional signal against Nifty Directional rules:
        - >= +80 pts -> CALL (BUY_CALL, CE, ITM 3)
        - <= -80 pts -> PUT (BUY_PUT, PE, ITM 3)
        - Between -80 and +80 pts -> NO TRADE (NO_TRADE)
        - Trading Window: 09:15:00 (inclusive) – 09:17:00 (exclusive) IST
        - Max 1 trade per day, resets on new trading day
        - Capital SL = 4%, Target = 5%
        """
        status_res = await self.get_live_status(
            db=db,
            override_change=gift_nifty_change,
            current_time=current_time,
            spot_price=spot_price,
        )
        d = status_res["data"]
        sig = d["signal"]
        legacy_signal = (
            "BUY_CALL"
            if sig == SIGNAL_CALL
            else ("BUY_PUT" if sig == SIGNAL_PUT else "NO_TRADE")
        )
        signal_display = sig if sig in (SIGNAL_CALL, SIGNAL_PUT) else "NO TRADE"
        opt_type = d["option_type"]
        strike = d["selected_strike"]
        symbol = f"NIFTY {strike} {opt_type}" if (strike and opt_type) else None

        win_map = {"OPEN": "OPEN", "PRE_WINDOW": "PRE_MARKET", "CLOSED": "CLOSED"}

        return {
            "connection_status": "connected",
            "data": {
                "timestamp": format_ist_display(ist_now()) or d["timestamp_ist"],
                "gift_nifty_change": d["gift_nifty"]["change_points"],
                "signal": legacy_signal,
                "signal_display": signal_display,
                "can_trade_now": d["can_enter_now"],
                "reason": d["reason"],
                "underlying_spot": spot_price,
                "selected_option_strike": strike,
                "selected_option_type": opt_type,
                "selected_symbol": symbol,
                "option_selection_rule": "ITM 3 (Dynamic from Option Chain)",
                "lot_size": d["lot_size"],
                "quantity": d["quantity"],
                "entry_price": None,
                "total_capital": d["total_capital"],
                "stoploss_capital_pct": d["stoploss_pct"],
                "stoploss_amount": d["stoploss_amount"],
                "target_capital_pct": d["target_pct"],
                "target_amount": d["target_amount"],
                "trading_window_status": win_map.get(d["window_status"], "CLOSED"),
                "daily_trade_count": d["trades_executed_today"],
                "max_trades_per_day": d["max_trades_per_day"],
                "engine_status": d["engine_status"],
                "expiry_date": self.get_upcoming_nifty_expiry(),
            },
            "message": f"Evaluated signal: {signal_display}",
        }

    # ----------------------------------------------------------------------- #
    # Lifecycle & automated monitoring
    # ----------------------------------------------------------------------- #
    async def start_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        """Start strategy automation. In Live mode, requires active Upstox session."""
        config = await broker_service.get_or_create_config(db)

        if config.mode == "LIVE":
            is_connected, _, _, _ = await broker_service.verify_connection(db)
            if not is_connected:
                raise BrokerConnectionException(
                    "Cannot start strategy in Live mode: Upstox broker is disconnected. Live session required."
                )

        config.strategy_status = "RUNNING"
        config.is_kill_switch_active = False
        await db.commit()
        await db.refresh(config)

        log_critical_action("STRATEGY_START", {"name": STRATEGY_NAME, "mode": config.mode})
        return {
            "connection_status": "connected",
            "data": {
                "status": "RUNNING",
                "mode": config.mode,
                "strategy": STRATEGY_NAME,
            },
            "message": f"{STRATEGY_NAME} started in {config.mode} mode. Monitoring 09:15:00–09:17:00 IST.",
        }

    async def stop_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        """Stop strategy automation."""
        config = await broker_service.get_or_create_config(db)
        config.strategy_status = "STOPPED"
        await db.commit()
        await db.refresh(config)

        log_critical_action("STRATEGY_STOP", {"name": STRATEGY_NAME, "mode": config.mode})
        return {
            "connection_status": "connected",
            "data": {
                "status": "STOPPED",
                "mode": config.mode,
                "strategy": STRATEGY_NAME,
            },
            "message": "Nifty Directional strategy stopped. Automated execution halted.",
        }

    async def toggle_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        if config.strategy_status == "STOPPED":
            return await self.start_strategy(db)
        return await self.stop_strategy(db)

    async def update_settings(
        self,
        db: AsyncSession,
        lots: Optional[int] = None,
        stoploss_capital_pct: Optional[float] = None,
        target_capital_pct: Optional[float] = None,
        total_capital: Optional[float] = None,
    ) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        if lots is not None and lots >= 1:
            config.lots = int(lots)
        if stoploss_capital_pct is not None and stoploss_capital_pct > 0:
            config.stoploss_capital_pct = float(stoploss_capital_pct)
        if target_capital_pct is not None and target_capital_pct > 0:
            config.target_capital_pct = float(target_capital_pct)
        if total_capital is not None and total_capital > 0:
            config.total_capital = float(total_capital)

        await db.commit()
        await db.refresh(config)

        log_critical_action(
            "UPDATE_STRATEGY_SETTINGS",
            {
                "lots": config.lots,
                "sl_pct": config.stoploss_capital_pct,
                "target_pct": config.target_capital_pct,
                "capital": config.total_capital,
            },
        )
        return await self.get_strategy_config(db)

    async def switch_mode(self, db: AsyncSession, new_mode: str, confirm_live: bool = False) -> Dict[str, Any]:
        """Switch between BACKTEST and LIVE modes."""
        if new_mode == "PAPER":
            new_mode = "BACKTEST"
        if new_mode not in ("LIVE", "BACKTEST"):
            new_mode = "BACKTEST"

        config = await broker_service.get_or_create_config(db)

        if new_mode == "LIVE" and not confirm_live:
            raise ModeRestrictionException(
                "Live trading requires explicit user confirmation. Real money order placement will be enabled."
            )

        if new_mode == "LIVE":
            is_connected, _, _, _ = await broker_service.verify_connection(db)
            if not is_connected:
                raise BrokerConnectionException(
                    "Cannot switch to Live mode: Upstox broker is not connected. Authenticate with broker first."
                )

        config.mode = new_mode
        await db.commit()
        await db.refresh(config)

        log_critical_action("MODE_SWITCH", {"mode": new_mode})
        mode_messages = {
            "LIVE": "Live Trading mode active: real Upstox OMS order routing enabled.",
            "BACKTEST": "Backtest mode active: historical strategy checking only, zero live orders.",
        }
        return {
            "connection_status": "connected",
            "data": {
                "mode": config.mode,
                "message": mode_messages.get(new_mode, ""),
            },
            "message": f"Switched to {new_mode} mode.",
        }

    async def run_monitoring_tick(
        self,
        db: AsyncSession,
        override_time: Optional[time] = None,
        override_change: Optional[float] = None,
        override_spot: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Executes one automated monitoring and risk-management tick for Nifty Directional:
        1. Date Rollover: Resets daily trade counter on a new trading day.
        2. Position Risk Management: Checks open positions against Capital SL (-4%) and Capital Target (+5%)
           including brokerage & statutory charges, and executes auto square-off at 15:15 IST.
        3. Signal & Order Execution: Strictly between 09:15:00 and 09:17:00 AM IST in LIVE mode,
           evaluates Gift Nifty 1-Day change:
           - >= +80 pts -> BUY CALL (ITM 3 CE)
           - <= -80 pts -> BUY PUT (ITM 3 PE)
           - Enforces strict 1-trade-per-day limit and duplicate-order prevention.
        """
        config = await broker_service.get_or_create_config(db)
        today_date = ist_now().strftime("%Y-%m-%d")
        now_time = override_time or ist_now().time()

        # 1. Day Rollover check
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()
            await db.refresh(config)

        actions_taken: List[str] = []

        # 2. Reconcile Open Positions against Capital SL (4%) and Target (5%)
        stmt_open = select(Order).where(Order.status == "PLACED").order_by(desc(Order.placed_at))
        open_orders = (await db.execute(stmt_open)).scalars().all()

        sl_capital_limit, tgt_capital_limit = capital_risk_limits(
            config.total_capital,
            config.stoploss_capital_pct,
            config.target_capital_pct,
        )

        for open_order in open_orders:
            current_ltp = open_order.price
            if config.mode == "LIVE":
                try:
                    token_record = await broker_service.get_or_create_token_record(db)
                    if token_record and token_record.access_token:
                        q = await upstox_client.get_market_quote(token_record.access_token, open_order.symbol)
                        q_item = list(q.get("data", {}).values())[0] if q.get("data") else None
                        if q_item and q_item.get("last_price"):
                            current_ltp = float(q_item["last_price"])
                except Exception as exc:
                    logger.debug(f"Live quote fetch note during position check: {str(exc)}")

            if current_ltp <= 0 or open_order.price <= 0:
                continue

            charges_dict = calculate_option_charges(open_order.price, current_ltp, open_order.qty, today_date)
            charges = charges_dict["total"]
            gross_pnl = round((current_ltp - open_order.price) * open_order.qty, 2)
            net_pnl = round(gross_pnl - charges, 2)

            exit_reason: Optional[str] = None
            if net_pnl <= -sl_capital_limit:
                exit_reason = f"SL ({config.stoploss_capital_pct}% Capital: ₹{net_pnl:,.2f} <= -₹{sl_capital_limit:,.2f})"
            elif net_pnl >= tgt_capital_limit:
                exit_reason = f"TARGET ({config.target_capital_pct}% Capital: ₹{net_pnl:,.2f} >= +₹{tgt_capital_limit:,.2f})"
            elif now_time >= AUTO_SQUARE_OFF:
                exit_reason = "TIME_EXIT (15:15 IST Auto Square-Off)"

            if exit_reason:
                if config.mode == "LIVE":
                    try:
                        token_record = await broker_service.get_or_create_token_record(db)
                        if token_record and token_record.access_token:
                            exit_payload = {
                                "quantity": open_order.qty,
                                "product": "I",
                                "validity": "DAY",
                                "price": 0.0,
                                "tag": "nifty_dir_exit",
                                "instrument_token": f"NSE_FO|{open_order.symbol}",
                                "order_type": "MARKET",
                                "transaction_type": "SELL",
                                "disclosed_quantity": 0,
                                "trigger_price": 0.0,
                                "is_amo": False,
                            }
                            await upstox_client.place_order(token_record.access_token, exit_payload)
                    except Exception as err:
                        logger.error(f"Live position square-off API note: {str(err)}")

                open_order.status = "CLOSED"
                open_order.exit_price = current_ltp
                open_order.exit_time = datetime.utcnow()
                open_order.realized_pnl = net_pnl
                open_order.reject_reason = exit_reason
                await db.commit()
                actions_taken.append(f"Position {open_order.symbol} closed: {exit_reason}")
                log_critical_action(
                    "POSITION_AUTO_EXIT",
                    {
                        "symbol": open_order.symbol,
                        "net_pnl": net_pnl,
                        "reason": exit_reason,
                        "mode": config.mode,
                    },
                )

        # 3. Strategy Entry Scanner (only when RUNNING, LIVE mode, and no active open position)
        if config.strategy_status == "RUNNING" and config.mode == "LIVE" and len(open_orders) == 0:
            in_window, _ = self.is_within_trading_window(now_time)

            if in_window and config.trades_executed_today < config.max_trades_per_day:
                stmt_today = select(Order).where(
                    Order.placed_at >= datetime.combine(ist_now().date(), time.min)
                )
                existing_today = (await db.execute(stmt_today)).scalars().first()

                if not existing_today:
                    eval_res = await self.evaluate_signal(
                        db=db,
                        gift_nifty_change=override_change,
                        current_time=now_time,
                        spot_price=override_spot,
                    )
                    data = eval_res.get("data", {})
                    signal = data.get("signal")
                    selected_type = data.get("selected_option_type")

                    if data.get("can_trade_now") and signal in ("BUY_CALL", "BUY_PUT") and selected_type:
                        from backend.app.services.order_service import order_service

                        await order_service.place_directional_order(
                            db=db,
                            option_type=selected_type,
                            lots=config.lots,
                            strike=data.get("selected_option_strike"),
                            order_type="MARKET",
                        )
                        actions_taken.append(
                            f"Auto-executed {signal} ({selected_type}) at {now_time.strftime('%H:%M:%S IST')}."
                        )

        return {
            "connection_status": "connected",
            "data": {
                "timestamp": format_ist_display(ist_now()),
                "strategy_status": config.strategy_status,
                "mode": config.mode,
                "trades_executed_today": config.trades_executed_today,
                "open_positions_count": len(open_orders),
                "actions_taken": actions_taken,
            },
            "message": "Strategy monitoring cycle completed.",
        }

    # ----------------------------------------------------------------------- #
    # Backtest Engine (Historical Strategy Checking)
    # ----------------------------------------------------------------------- #
    def calculate_duration_dates(
        self,
        duration: Optional[str] = "3M",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> Tuple[str, str, str, str]:
        """
        Calculates (start_date, end_date, duration_label, duration_code).
        Supported durations:
        - 1M: 1 Month
        - 2M: 2 Months
        - 3M: 3 Months
        - 6M: 6 Months
        - 1Y: 1 Year
        - 2Y: 2 Years
        - CUSTOM: Custom Date Range
        """
        today = ist_now().date()
        end_d = today

        if to_date and to_date.strip():
            try:
                end_d = datetime.strptime(to_date.strip()[:10], "%Y-%m-%d").date()
            except Exception:
                end_d = today

        dur = (duration or "").upper().strip()
        if not dur and from_date:
            dur = "CUSTOM"
        elif not dur:
            dur = "3M"

        if dur == "1M":
            start_d = end_d - relativedelta(months=1)
            label = "1 Month"
            code = "1M"
        elif dur == "2M":
            start_d = end_d - relativedelta(months=2)
            label = "2 Months"
            code = "2M"
        elif dur == "3M":
            start_d = end_d - relativedelta(months=3)
            label = "3 Months"
            code = "3M"
        elif dur == "6M":
            start_d = end_d - relativedelta(months=6)
            label = "6 Months"
            code = "6M"
        elif dur == "1Y":
            start_d = end_d - relativedelta(years=1)
            label = "1 Year"
            code = "1Y"
        elif dur == "2Y":
            start_d = end_d - relativedelta(years=2)
            label = "2 Years"
            code = "2Y"
        elif dur == "CUSTOM" or from_date:
            if from_date and from_date.strip():
                try:
                    start_d = datetime.strptime(from_date.strip()[:10], "%Y-%m-%d").date()
                except Exception:
                    start_d = end_d - relativedelta(months=3)
            else:
                start_d = end_d - relativedelta(months=3)
            label = "Custom Date Range"
            code = "CUSTOM"
        else:
            start_d = end_d - relativedelta(months=3)
            label = "3 Months"
            code = "3M"

        if start_d > end_d:
            start_d, end_d = end_d, start_d

        return start_d.strftime("%Y-%m-%d"), end_d.strftime("%Y-%m-%d"), label, code

    async def _resolve_historical_option_trade(
        self,
        trade_date: str,
        spot_at_entry: float,
        option_type: str,
        trade_lots: int,
        sl_amount: float,
        target_amount: float,
        access_token: Optional[str],
        active_contracts: List[Dict[str, Any]],
        expired_expiries: List[str],
        expired_contracts_cache: Dict[str, List[Dict[str, Any]]],
        supplied_contracts: Optional[List[Dict[str, Any]]] = None,
        supplied_option_candles: Optional[List[Sequence[Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Resolves the real historical NIFTY option contract (ITM 3 from chain),
        validates its actual lot size, fetches 1-minute historical option candles,
        and simulates the exact intraday trade from 09:15:00 to 15:15:00 IST.
        Never invents option premiums or fabricates trades when data is missing.
        """
        opt_type = option_type.upper()

        # 1. Resolve expiry and option chain contracts for `trade_date`
        chain_contracts: List[Dict[str, Any]] = []
        target_expiry: Optional[str] = None
        is_expired_contract = False

        if supplied_contracts:
            chain_contracts = [
                c for c in supplied_contracts
                if str(c.get("instrument_type") or c.get("option_type") or "").upper() == opt_type
            ]
            if chain_contracts:
                target_expiry = chain_contracts[0].get("expiry")
        else:
            # Check active contracts first
            active_expiries = sorted({c.get("expiry", "") for c in active_contracts if c.get("expiry", "") >= trade_date})
            if active_expiries:
                near_active = active_expiries[0]
                # Only use active expiry if within 10 calendar days of trade_date (same weekly cycle)
                d_trade = datetime.strptime(trade_date, "%Y-%m-%d").date()
                d_exp = datetime.strptime(near_active, "%Y-%m-%d").date()
                if 0 <= (d_exp - d_trade).days <= 10:
                    target_expiry = near_active
                    chain_contracts = [
                        c for c in active_contracts
                        if c.get("expiry") == target_expiry
                        and str(c.get("instrument_type", "")).upper() == opt_type
                    ]

            # Check expired instruments if not covered by active contracts
            if not chain_contracts and access_token and expired_expiries:
                exp_candidate = nearest_expiry_on_or_after(expired_expiries, trade_date)
                if exp_candidate:
                    target_expiry = exp_candidate
                    is_expired_contract = True
                    if target_expiry not in expired_contracts_cache:
                        expired_contracts_cache[target_expiry] = await upstox_client.get_expired_option_contracts(
                            access_token=access_token,
                            instrument_key=UNDERLYING_INSTRUMENT_KEY,
                            expiry_date=target_expiry,
                        )
                    chain_contracts = [
                        c for c in expired_contracts_cache.get(target_expiry, [])
                        if str(c.get("instrument_type", "")).upper() == opt_type
                    ]

        # 2. Select ITM 3 strike dynamically from chain strikes (or 50-pt NIFTY grid for display when chain unavailable)
        chain_strikes = sorted({float(c.get("strike_price", 0)) for c in chain_contracts if c.get("strike_price")})
        if chain_strikes:
            selected_strike_f = select_itm_strike(chain_strikes, spot_at_entry, opt_type, depth=ITM_DEPTH)
            selected_strike = int(round(selected_strike_f)) if selected_strike_f is not None else self.calculate_itm3_strike(spot_at_entry, opt_type)
        else:
            selected_strike = self.calculate_itm3_strike(spot_at_entry, opt_type)

        matched_contract = next(
            (c for c in chain_contracts if int(round(float(c.get("strike_price", 0)))) == selected_strike),
            None,
        )

        # 3. Fetch 1-minute historical option candles
        raw_opt_candles: List[Sequence[Any]] = []
        if supplied_option_candles is not None:
            raw_opt_candles = list(supplied_option_candles)
        elif matched_contract:
            inst_key = matched_contract.get("expired_instrument_key") or matched_contract.get("instrument_key")
            if inst_key:
                if is_expired_contract and access_token:
                    raw_opt_candles = await upstox_client.get_expired_historical_candles(
                        access_token=access_token,
                        expired_instrument_key=inst_key,
                        interval="1minute",
                        to_date=trade_date,
                        from_date=trade_date,
                    )
                else:
                    raw_opt_candles = await upstox_client.get_historical_candles(
                        instrument_key=inst_key,
                        interval="1minute",
                        to_date=trade_date,
                        from_date=trade_date,
                        access_token=access_token,
                    )

        if not raw_opt_candles:
            return {
                "status": "DATA_UNAVAILABLE",
                "strike": selected_strike,
                "expiry": target_expiry,
                "trading_symbol": (
                    matched_contract.get("trading_symbol")
                    if matched_contract
                    else f"NIFTY {selected_strike} {opt_type}"
                ),
                "instrument_key": (
                    (matched_contract.get("expired_instrument_key") or matched_contract.get("instrument_key"))
                    if matched_contract
                    else None
                ),
                "note": (
                    "DATA UNAVAILABLE: Historical 1-minute NIFTY option contract candles unavailable from Upstox "
                    f"for {trade_date} (NIFTY {selected_strike} {opt_type}). No option premiums or trades were fabricated."
                ),
            }

        parsed = [c for c in parse_candles(raw_opt_candles) if c.ts.strftime("%Y-%m-%d") == trade_date]
        entry_c = entry_candle(parsed)
        if entry_c is None:
            return {
                "status": "DATA_UNAVAILABLE",
                "strike": selected_strike,
                "expiry": target_expiry,
                "trading_symbol": (
                    matched_contract.get("trading_symbol")
                    if matched_contract
                    else f"NIFTY {selected_strike} {opt_type}"
                ),
                "instrument_key": (
                    (matched_contract.get("expired_instrument_key") or matched_contract.get("instrument_key"))
                    if matched_contract
                    else None
                ),
                "note": f"DATA UNAVAILABLE: No option candle inside 09:15:00–09:17:00 IST on {trade_date}.",
            }

        lot_size = self.resolve_historical_lot_size(trade_date, matched_contract)
        quantity = order_quantity(trade_lots, lot_size)
        entry_px = round_to_tick(entry_c.open)

        exit_res = resolve_exit(
            candles=parsed,
            entry=entry_c,
            entry_price=entry_px,
            quantity=quantity,
            trade_date=trade_date,
            stoploss_amount=sl_amount,
            target_amount=target_amount,
        )
        if exit_res is None:
            return {
                "status": "DATA_UNAVAILABLE",
                "strike": selected_strike,
                "expiry": target_expiry,
                "trading_symbol": (
                    matched_contract.get("trading_symbol")
                    if matched_contract
                    else f"NIFTY {selected_strike} {opt_type}"
                ),
                "instrument_key": (
                    (matched_contract.get("expired_instrument_key") or matched_contract.get("instrument_key"))
                    if matched_contract
                    else None
                ),
                "note": f"DATA UNAVAILABLE: Incomplete intraday option candles after entry on {trade_date}.",
            }

        gross_pnl = round((exit_res.exit_price - entry_px) * quantity, 2)
        charges_breakdown = calculate_option_charges(entry_px, exit_res.exit_price, quantity, trade_date)
        charges = charges_breakdown["total"]
        net_pnl = round(gross_pnl - charges, 2)

        return {
            "status": "EXECUTED",
            "strike": selected_strike,
            "expiry": target_expiry or (matched_contract.get("expiry") if matched_contract else None),
            "trading_symbol": (
                matched_contract.get("trading_symbol")
                if matched_contract
                else f"NIFTY {selected_strike} {opt_type}"
            ),
            "instrument_key": (
                (matched_contract.get("expired_instrument_key") or matched_contract.get("instrument_key"))
                if matched_contract
                else None
            ),
            "entry_dt": entry_c.ts,
            "entry_price": entry_px,
            "exit_dt": exit_res.exit_time,
            "exit_price": exit_res.exit_price,
            "lots": trade_lots,
            "lot_size": lot_size,
            "quantity": quantity,
            "gross_pnl": gross_pnl,
            "charges": charges,
            "net_pnl": net_pnl,
            "exit_reason": exit_res.exit_reason,
            "result": classify_result(net_pnl),
            "note": exit_res.note,
        }

    async def run_backtest(
        self,
        db: AsyncSession,
        duration: Optional[str] = "3M",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        capital: Optional[float] = None,
        lots: Optional[int] = None,
        nifty_daily_candles: Optional[List[Sequence[Any]]] = None,
        gift_nifty_by_date: Optional[Dict[str, float]] = None,
        contracts_by_date: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        option_candles_by_date: Optional[Dict[str, List[Sequence[Any]]]] = None,
    ) -> Dict[str, Any]:
        """
        Backtest the Nifty Directional strategy over the selected duration:
        - Signal: Gift Nifty 1-Day change >= +80 pts -> CALL (CE), <= -80 pts -> PUT (PE), between -> NO TRADE
        - Option selection: ITM 3 dynamically from the option chain
        - Entry window: 09:15:00 – 09:17:00 IST (1 trade max per day)
        - Capital-based Risk Management: Stop Loss = 4% of strategy capital, Target = 5% of strategy capital
        - Uses real historical data from Upstox. Never invents option premiums or fabricates trades.
        """
        config = await broker_service.get_or_create_config(db)
        total_capital = float(capital) if (capital is not None and capital > 0) else config.total_capital
        trade_lots = int(lots) if (lots is not None and lots >= 1) else config.lots
        sl_pct = config.stoploss_capital_pct
        target_pct = config.target_capital_pct
        sl_amount, target_amount = capital_risk_limits(total_capital, sl_pct, target_pct)
        threshold = config.gift_nifty_signal_threshold

        start_date, end_date, duration_label, duration_code = self.calculate_duration_dates(
            duration=duration, from_date=from_date, to_date=to_date
        )
        run_id = f"bt-{uuid.uuid4().hex[:10]}"
        created_iso = ist_iso(ist_now()) or datetime.utcnow().isoformat()

        bt_config_block = {
            "strategy_name": STRATEGY_NAME,
            "initial_capital": total_capital,
            "lots": trade_lots,
            "stoploss_pct": sl_pct,
            "stoploss_amount": sl_amount,
            "target_pct": target_pct,
            "target_amount": target_amount,
            "option_selection": OPTION_SELECTION,
            "signal_threshold": threshold,
            "trading_window": "09:15:00 – 09:17:00 IST",
            "auto_square_off": "15:15 IST",
            "charges_model": "Upstox F&O: ₹20/order brokerage + STT + NSE txn + SEBI + stamp + GST",
        }

        try:
            token_record = await broker_service.get_or_create_token_record(db)
            access_token = (
                token_record.access_token
                if (token_record and token_record.is_valid and token_record.access_token)
                else None
            )

            if nifty_daily_candles is not None:
                candles = list(nifty_daily_candles)
            else:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
                fetch_start = (start_dt - relativedelta(days=10)).strftime("%Y-%m-%d")
                candles = await upstox_client.get_historical_candles(
                    UNDERLYING_INSTRUMENT_KEY, "day", end_date, fetch_start, access_token=access_token
                )

            if not candles or len(candles) < 2:
                empty_summary = summarize([], total_capital, start_date)
                payload = self._build_backtest_payload(
                    run_id=run_id,
                    status="DATA UNAVAILABLE",
                    duration_code=duration_code,
                    duration_label=duration_label,
                    start_date=start_date,
                    end_date=end_date,
                    created_at=created_iso,
                    config_block=bt_config_block,
                    summary=empty_summary,
                    days=[],
                    data_issues=[
                        f"DATA UNAVAILABLE: Historical NIFTY 50 candles could not be retrieved from Upstox for {start_date} to {end_date}."
                    ],
                    lot_size=config.lot_size,
                    message=f"DATA UNAVAILABLE: Historical market data could not be retrieved for {duration_label} ({start_date} to {end_date}).",
                )
                await self._persist_backtest_run(db, payload)
                return {
                    "connection_status": "connected",
                    "data": payload,
                    "message": payload["message"],
                }

            candles = sorted(candles, key=lambda x: str(x[0]))

            # Load stored Gift Nifty observations in range
            obs_stmt = (
                select(GiftNiftyObservation)
                .where(GiftNiftyObservation.trade_date >= start_date)
                .where(GiftNiftyObservation.trade_date <= end_date)
            )
            obs_rows = (await db.execute(obs_stmt)).scalars().all()
            obs_map: Dict[str, GiftNiftyObservation] = {r.trade_date: r for r in obs_rows}

            # Load active & expired option contract metadata if token is available
            active_contracts: List[Dict[str, Any]] = []
            expired_expiries: List[str] = []
            expired_contracts_cache: Dict[str, List[Dict[str, Any]]] = {}

            if access_token and contracts_by_date is None:
                try:
                    active_contracts = await upstox_client.get_option_contracts(
                        access_token=access_token,
                        instrument_key=UNDERLYING_INSTRUMENT_KEY,
                    )
                except Exception as exc:
                    logger.debug(f"Backtest active contracts query note: {exc}")
                try:
                    expired_expiries = await upstox_client.get_expired_expiries(
                        access_token=access_token,
                        instrument_key=UNDERLYING_INSTRUMENT_KEY,
                    )
                except Exception as exc:
                    logger.debug(f"Backtest expired expiries query note: {exc}")

            days: List[Dict[str, Any]] = []
            data_issues: List[str] = []

            for i in range(1, len(candles)):
                prev_close = float(candles[i - 1][4])
                curr_open = float(candles[i][1])
                date_str = str(candles[i][0])[:10]

                if date_str < start_date or date_str > end_date:
                    continue

                # Determine Gift Nifty 1-Day change in points for `date_str`
                if gift_nifty_by_date and date_str in gift_nifty_by_date:
                    change_pts: Optional[float] = round(float(gift_nifty_by_date[date_str]), 2)
                    gn_source: Optional[str] = "SUPPLIED"
                elif date_str in obs_map:
                    change_pts = round(float(obs_map[date_str].change_points), 2)
                    gn_source = obs_map[date_str].source
                else:
                    # Actual overnight NIFTY 50 opening change at 09:15 IST from verified Upstox daily candle
                    change_pts = round(curr_open - prev_close, 2)
                    gn_source = "UPSTOX_NIFTY_OPEN_GAP"

                signal = classify_signal(change_pts, threshold)
                opt_type = option_type_for_signal(signal)

                if signal == SIGNAL_NO_TRADE:
                    days.append({
                        "trade_date": date_str,
                        "gift_nifty_change": change_pts,
                        "gift_nifty_source": gn_source,
                        "signal": SIGNAL_NO_TRADE,
                        "option_type": None,
                        "strike": None,
                        "expiry": None,
                        "trading_symbol": None,
                        "instrument_key": None,
                        "spot_at_entry": curr_open,
                        "entry_time": None,
                        "entry_time_display": None,
                        "entry_price": None,
                        "exit_time": None,
                        "exit_time_display": None,
                        "exit_price": None,
                        "lots": None,
                        "lot_size": None,
                        "quantity": None,
                        "gross_pnl": None,
                        "charges": None,
                        "net_pnl": None,
                        "exit_reason": None,
                        "result": "NO TRADE",
                        "note": f"Gift Nifty change ({change_pts:+.2f} pts) within neutral zone (-80 to +80 pts).",
                    })
                    continue

                if signal == SIGNAL_DATA_UNAVAILABLE or opt_type is None:
                    msg = f"{date_str}: Gift Nifty 1-Day change unavailable."
                    data_issues.append(msg)
                    days.append({
                        "trade_date": date_str,
                        "gift_nifty_change": None,
                        "gift_nifty_source": None,
                        "signal": SIGNAL_DATA_UNAVAILABLE,
                        "option_type": None,
                        "strike": None,
                        "expiry": None,
                        "trading_symbol": None,
                        "instrument_key": None,
                        "spot_at_entry": curr_open,
                        "entry_time": None,
                        "entry_time_display": None,
                        "entry_price": None,
                        "exit_time": None,
                        "exit_time_display": None,
                        "exit_price": None,
                        "lots": None,
                        "lot_size": None,
                        "quantity": None,
                        "gross_pnl": None,
                        "charges": None,
                        "net_pnl": None,
                        "exit_reason": None,
                        "result": SIGNAL_DATA_UNAVAILABLE,
                        "note": msg,
                    })
                    continue

                # Signal is CALL or PUT -> resolve historical option contract & intraday 1-min candles
                day_contracts = contracts_by_date.get(date_str) if contracts_by_date else None
                day_opt_candles = option_candles_by_date.get(date_str) if option_candles_by_date else None

                trade_outcome = await self._resolve_historical_option_trade(
                    trade_date=date_str,
                    spot_at_entry=curr_open,
                    option_type=opt_type,
                    trade_lots=trade_lots,
                    sl_amount=sl_amount,
                    target_amount=target_amount,
                    access_token=access_token,
                    active_contracts=active_contracts,
                    expired_expiries=expired_expiries,
                    expired_contracts_cache=expired_contracts_cache,
                    supplied_contracts=day_contracts,
                    supplied_option_candles=day_opt_candles,
                )

                if trade_outcome["status"] != "EXECUTED":
                    issue_note = trade_outcome.get("note") or f"{date_str}: Historical option candles unavailable."
                    data_issues.append(issue_note)
                    days.append({
                        "trade_date": date_str,
                        "gift_nifty_change": change_pts,
                        "gift_nifty_source": gn_source,
                        "signal": signal,
                        "option_type": opt_type,
                        "strike": trade_outcome.get("strike"),
                        "expiry": trade_outcome.get("expiry"),
                        "trading_symbol": trade_outcome.get("trading_symbol"),
                        "instrument_key": trade_outcome.get("instrument_key"),
                        "spot_at_entry": curr_open,
                        "entry_time": None,
                        "entry_time_display": None,
                        "entry_price": None,
                        "exit_time": None,
                        "exit_time_display": None,
                        "exit_price": None,
                        "lots": None,
                        "lot_size": None,
                        "quantity": None,
                        "gross_pnl": None,
                        "charges": None,
                        "net_pnl": None,
                        "exit_reason": None,
                        "result": SIGNAL_DATA_UNAVAILABLE,
                        "note": issue_note,
                    })
                    continue

                entry_dt: datetime = trade_outcome["entry_dt"]
                exit_dt: datetime = trade_outcome["exit_dt"]
                days.append({
                    "trade_date": date_str,
                    "gift_nifty_change": change_pts,
                    "gift_nifty_source": gn_source,
                    "signal": signal,
                    "option_type": opt_type,
                    "strike": trade_outcome["strike"],
                    "expiry": trade_outcome["expiry"],
                    "trading_symbol": trade_outcome["trading_symbol"],
                    "instrument_key": trade_outcome["instrument_key"],
                    "spot_at_entry": curr_open,
                    "entry_time": ist_iso(entry_dt),
                    "entry_time_display": format_ist_display(entry_dt),
                    "entry_price": trade_outcome["entry_price"],
                    "exit_time": ist_iso(exit_dt),
                    "exit_time_display": format_ist_display(exit_dt),
                    "exit_price": trade_outcome["exit_price"],
                    "lots": trade_outcome["lots"],
                    "lot_size": trade_outcome["lot_size"],
                    "quantity": trade_outcome["quantity"],
                    "gross_pnl": trade_outcome["gross_pnl"],
                    "charges": trade_outcome["charges"],
                    "net_pnl": trade_outcome["net_pnl"],
                    "exit_reason": trade_outcome["exit_reason"],
                    "result": trade_outcome["result"],
                    "note": trade_outcome.get("note"),
                })

            summary = summarize(days, total_capital, start_date)

            if summary.total_trading_days == 0:
                bt_status = "DATA UNAVAILABLE"
                msg = f"DATA UNAVAILABLE: No trading days found in range {start_date} to {end_date}."
            elif summary.data_unavailable_days > 0 and summary.total_trades == 0:
                bt_status = "DATA UNAVAILABLE"
                msg = (
                    f"DATA UNAVAILABLE: {summary.data_unavailable_days} signal day(s) in {duration_label} "
                    f"({start_date} to {end_date}) lacked historical NIFTY option candle data from Upstox. "
                    "Connect an Upstox account with Expired Instruments access to compute option P&L."
                )
            elif summary.data_unavailable_days > 0:
                bt_status = "INCOMPLETE"
                msg = (
                    f"INCOMPLETE BACKTEST: {summary.total_trades} trade(s) evaluated, "
                    f"but {summary.data_unavailable_days} signal day(s) lacked historical option candles."
                )
            else:
                bt_status = "COMPLETE"
                msg = (
                    f"{duration_label} backtest completed ({start_date} to {end_date}): "
                    f"{summary.total_trades} trade(s), {summary.no_trade_days} no-trade day(s), "
                    f"Net P&L ₹{summary.net_pnl:,.2f} ({summary.overall_result})."
                )

            payload = self._build_backtest_payload(
                run_id=run_id,
                status=bt_status,
                duration_code=duration_code,
                duration_label=duration_label,
                start_date=start_date,
                end_date=end_date,
                created_at=created_iso,
                config_block=bt_config_block,
                summary=summary,
                days=days,
                data_issues=data_issues,
                lot_size=config.lot_size,
                message=msg,
            )
            await self._persist_backtest_run(db, payload)
            return {
                "connection_status": "connected",
                "data": payload,
                "message": msg,
            }

        except Exception as exc:
            logger.error(f"Backtest execution error: {str(exc)}")
            empty_summary = summarize([], total_capital, start_date)
            payload = self._build_backtest_payload(
                run_id=run_id,
                status="DATA UNAVAILABLE",
                duration_code=duration_code,
                duration_label=duration_label,
                start_date=start_date,
                end_date=end_date,
                created_at=created_iso,
                config_block=bt_config_block,
                summary=empty_summary,
                days=[],
                data_issues=[f"DATA UNAVAILABLE: {str(exc)}"],
                lot_size=config.lot_size,
                message=f"DATA UNAVAILABLE: {str(exc)}",
            )
            return {
                "connection_status": "connected",
                "data": payload,
                "message": "Backtest failed or historical data unavailable.",
            }

    def _build_backtest_payload(
        self,
        run_id: str,
        status: str,
        duration_code: str,
        duration_label: str,
        start_date: str,
        end_date: str,
        created_at: str,
        config_block: Dict[str, Any],
        summary: Any,
        days: List[Dict[str, Any]],
        data_issues: List[str],
        lot_size: int,
        message: str,
    ) -> Dict[str, Any]:
        summary_dict = summary.as_dict()
        executed_trades = [d for d in days if d.get("result") in ("PROFIT", "LOSS", "BREAK EVEN")]
        return {
            "run_id": run_id,
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "status": status,
            "duration": duration_label,
            "duration_label": duration_label,
            "duration_code": duration_code,
            "start_date": start_date,
            "end_date": end_date,
            "created_at": created_at,
            "config": config_block,
            "summary": summary_dict,
            # Top-level convenience fields
            "initial_capital": summary_dict["initial_capital"],
            "final_capital": summary_dict["final_capital"],
            "total_trading_days": summary_dict["total_trading_days"],
            "total_trades": summary_dict["total_trades"],
            "winning_trades": summary_dict["winning_trades"],
            "losing_trades": summary_dict["losing_trades"],
            "no_trade_days": summary_dict["no_trade_days"],
            "data_unavailable_days": summary_dict["data_unavailable_days"],
            "win_rate_pct": summary_dict["win_rate_pct"],
            "gross_profit": summary_dict["gross_profit"],
            "gross_loss": summary_dict["gross_loss"],
            "total_charges": summary_dict["total_charges"],
            "net_pnl": summary_dict["net_pnl"],
            "roi_pct": summary_dict["roi_pct"],
            "max_drawdown_amount": summary_dict["max_drawdown_amount"],
            "max_drawdown_pct": summary_dict["max_drawdown_pct"],
            "profit_factor": summary_dict["profit_factor"],
            "overall_result": summary_dict["overall_result"],
            "capital": summary_dict["initial_capital"],
            "lots": config_block["lots"],
            "lot_size": lot_size,
            "total_qty": config_block["lots"] * lot_size,
            "days": days,
            "trades": executed_trades,
            "equity_curve": summary.equity_curve,
            "data_issues": data_issues,
            "message": message,
        }

    async def _persist_backtest_run(self, db: AsyncSession, payload: Dict[str, Any]) -> None:
        try:
            rec = BacktestRunRecord(
                run_id=payload["run_id"],
                strategy_name=STRATEGY_NAME,
                duration_code=payload["duration_code"],
                duration_label=payload["duration_label"],
                start_date=payload["start_date"],
                end_date=payload["end_date"],
                status=payload["status"],
                initial_capital=float(payload["initial_capital"]),
                lots=int(payload["lots"]),
                net_pnl=float(payload["net_pnl"]),
                roi_pct=float(payload["roi_pct"]),
                total_trades=int(payload["total_trades"]),
                overall_result=str(payload["overall_result"]),
                payload_json=json.dumps(payload),
            )
            db.add(rec)
            await db.commit()
        except Exception as exc:
            logger.warning(f"Could not persist backtest run {payload.get('run_id')}: {exc}")

    async def list_backtest_runs(self, db: AsyncSession, limit: int = 20) -> Dict[str, Any]:
        stmt = select(BacktestRunRecord).order_by(desc(BacktestRunRecord.executed_at)).limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        items = [
            {
                "run_id": r.run_id,
                "strategy_name": r.strategy_name,
                "duration_code": r.duration_code,
                "duration_label": r.duration_label,
                "start_date": r.start_date,
                "end_date": r.end_date,
                "status": r.status,
                "initial_capital": r.initial_capital,
                "lots": r.lots,
                "net_pnl": r.net_pnl,
                "roi_pct": r.roi_pct,
                "total_trades": r.total_trades,
                "overall_result": r.overall_result,
                "created_at": ist_iso(r.executed_at),
            }
            for r in rows
        ]
        return {
            "connection_status": "connected",
            "data": items,
            "message": f"Retrieved {len(items)} stored backtest runs.",
        }

    async def get_backtest_run(self, db: AsyncSession, run_id: str) -> Optional[Dict[str, Any]]:
        stmt = select(BacktestRunRecord).where(BacktestRunRecord.run_id == run_id)
        rec = (await db.execute(stmt)).scalars().first()
        if not rec:
            return None
        return json.loads(rec.payload_json)

    def export_backtest_csv(self, payload: Dict[str, Any]) -> str:
        """Generates a CSV string containing every historical day in the backtest."""
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Trade Date",
            "Gift Nifty Change (Pts)",
            "Signal",
            "Option Type",
            "Strike",
            "Expiry",
            "Trading Symbol",
            "Entry Date & Time (IST)",
            "Entry Price",
            "Exit Date & Time (IST)",
            "Exit Price",
            "Quantity",
            "Gross P&L",
            "Charges",
            "Net P&L",
            "Exit Reason",
            "Result",
            "Note",
        ])
        for d in payload.get("days", []):
            writer.writerow([
                d.get("trade_date", ""),
                d.get("gift_nifty_change", ""),
                d.get("signal", ""),
                d.get("option_type") or "",
                d.get("strike") or "",
                d.get("expiry") or "",
                d.get("trading_symbol") or "",
                d.get("entry_time_display") or d.get("entry_time") or "",
                d.get("entry_price") if d.get("entry_price") is not None else "",
                d.get("exit_time_display") or d.get("exit_time") or "",
                d.get("exit_price") if d.get("exit_price") is not None else "",
                d.get("quantity") if d.get("quantity") is not None else "",
                d.get("gross_pnl") if d.get("gross_pnl") is not None else "",
                d.get("charges") if d.get("charges") is not None else "",
                d.get("net_pnl") if d.get("net_pnl") is not None else "",
                d.get("exit_reason") or "",
                d.get("result") or "",
                d.get("note") or "",
            ])
        return buf.getvalue()


strategy_service = StrategyService()
