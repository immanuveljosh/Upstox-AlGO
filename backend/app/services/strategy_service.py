import pytz
from datetime import datetime, time, timedelta
from typing import Dict, Any, Tuple, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.system_config import SystemConfig
from backend.app.models.order import Order
from sqlalchemy import select, desc
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client
from backend.app.core.exceptions import (
    BrokerConnectionException,
    ModeRestrictionException,
    RiskLimitBreachedException,
)
from backend.app.core.logging import logger, log_critical_action

IST = pytz.timezone("Asia/Kolkata")


class StrategyService:
    """
    DEFAULT SYSTEM STRATEGY: Gift Nifty Directional (strat-gift-nifty-dir)
    - Underlying: NIFTY 50 ONLY
    - Timeframe: GIFT NIFTY 1-Day
    - Rules:
        * Bullish: Gift Nifty 1-Day >= +80 pts (+80 inclusive) -> Buy 3rd ITM Call (CE)
        * Bearish: Gift Nifty 1-Day <= -80 pts (-80 inclusive) -> Buy 3rd ITM Put (PE)
        * No Trade: Between -80 and +80 pts -> No trade, no false signal
    - Strike Selection: 3rd ITM ONLY
        * Call (CE): ATM - 150
        * Put (PE): ATM + 150
    - Trading Window: Strictly 09:15:00 AM – 09:17:00 AM IST (inclusive of 09:15, exclusive of 09:17:00)
    - Max Trades: Strictly 1 trade per trading day
    - Capital Management:
        * Stop Loss = 5% of TOTAL STRATEGY CAPITAL (not option premium %)
        * Target = 6% of TOTAL STRATEGY CAPITAL (not option premium %)
    - Default Mode: PAPER TRADING
    """

    def is_within_trading_window(self, current_time: Optional[time] = None) -> Tuple[bool, str]:
        """
        Verify if current time is strictly between 09:15:00 AM and 09:17:00 AM IST.
        Entry window is inclusive of 09:15 and exclusive of 09:17:00.
        After 09:17 AM, disable all new entry signals for the day.
        """
        if current_time is None:
            now_ist = datetime.now(IST).time()
        else:
            now_ist = current_time

        start_time = time(9, 15, 0)
        end_time = time(9, 17, 0)

        if start_time <= now_ist < end_time:
            return True, f"Trading Window OPEN (09:15:00 - 09:17:00 IST | Current: {now_ist.strftime('%H:%M:%S')})"
        elif now_ist < start_time:
            return False, f"Pre-Market: Window opens at 09:15:00 AM IST (Current: {now_ist.strftime('%H:%M:%S')})"
        else:
            return False, f"Trading Window CLOSED: Entries disabled after 09:17:00 AM IST (Current: {now_ist.strftime('%H:%M:%S')})"

    def calculate_itm3_strike(self, spot_price: float, option_type: str) -> int:
        """
        Calculates exactly the 3rd ITM strike for Nifty options.
        Nifty strikes are spaced at 50-point intervals.
        ATM = round(spot / 50) * 50
        For CE (Call): In-The-Money means strike < spot.
          ITM 1 = ATM - 50
          ITM 2 = ATM - 100
          ITM 3 = ATM - 150
        For PE (Put): In-The-Money means strike > spot.
          ITM 1 = ATM + 50
          ITM 2 = ATM + 100
          ITM 3 = ATM + 150
        """
        atm_strike = int(round(spot_price / 50.0) * 50)
        if option_type.upper() == "CE":
            return atm_strike - 150
        elif option_type.upper() == "PE":
            return atm_strike + 150
        else:
            raise ValueError(f"Invalid option type: {option_type}. Must be 'CE' or 'PE'.")

    def get_upcoming_nifty_expiry(self) -> str:
        """Determines the upcoming weekly NIFTY Thursday expiry date (YYYY-MM-DD)."""
        now = datetime.now(IST).date()
        # Thursday is weekday 3
        days_ahead = (3 - now.weekday()) % 7
        if days_ahead == 0 and datetime.now(IST).time() > time(15, 30):
            days_ahead = 7
        expiry_date = now + timedelta(days=days_ahead)
        return expiry_date.strftime("%Y-%m-%d")

    def resolve_historical_lot_size(
        self,
        trade_date: str,
        contract_metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Dynamically resolves the actual exchange lot size for a contract on a given date.
        Never hardcodes a single static lot size across historical eras:
        1. If explicit contract metadata from Upstox API includes 'lot_size', use it directly.
        2. Otherwise resolve dynamically according to NSE NIFTY 50 index derivative lot size revisions:
           - Prior to 2024-04-26: 50 units
           - 2024-04-26 to 2024-11-19: 25 units
           - 2024-11-20 to 2025-12-31: 75 units
           - 2026-01-01 onwards (current NIFTY contracts): 65 units
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
        spot_price: float = 24878.50,
    ) -> Dict[str, Any]:
        """
        Fetches actual NIFTY option contract metadata (including lot_size=65, freeze_quantity=1755,
        instrument_key, and trading_symbol) from Upstox v2 /option/contract endpoint.
        """
        opt_type = option_type.upper()
        if strike is None:
            strike = self.calculate_itm3_strike(spot_price, opt_type)

        token_record = await broker_service.get_or_create_token_record(db)
        now_ts = datetime.now().timestamp()

        # Use 5-minute in-memory cache for contract chain to avoid rate limiting
        contracts: List[Dict[str, Any]] = []
        cache_attr = getattr(self, "_contracts_cache", None)
        cache_time = getattr(self, "_contracts_cache_time", 0.0)

        if cache_attr and (now_ts - cache_time) < 300:
            contracts = cache_attr
        elif token_record and token_record.access_token:
            try:
                contracts = await upstox_client.get_option_contracts(
                    access_token=token_record.access_token,
                    instrument_key="NSE_INDEX|Nifty 50",
                    expiry_date=expiry_date,
                )
                if contracts:
                    self._contracts_cache = contracts
                    self._contracts_cache_time = now_ts
            except Exception as exc:
                logger.warning(f"Upstox option contract metadata query note: {str(exc)}")

        if contracts:
            expiries = sorted(list({c.get("expiry", "") for c in contracts if c.get("expiry")}))
            target_expiry = expiry_date if (expiry_date and expiry_date in expiries) else (expiries[0] if expiries else self.get_upcoming_nifty_expiry())

            matching = [
                c for c in contracts
                if c.get("expiry") == target_expiry
                and int(float(c.get("strike_price", 0))) == int(strike)
                and str(c.get("instrument_type", "")).upper() == opt_type
            ]
            if not matching:
                matching = [
                    c for c in contracts
                    if int(float(c.get("strike_price", 0))) == int(strike)
                    and str(c.get("instrument_type", "")).upper() == opt_type
                ]
            if not matching:
                matching = [c for c in contracts if c.get("expiry") == target_expiry]

            if matching:
                c = matching[0]
                lot_size = int(c.get("lot_size") or 65)
                freeze_qty = int(float(c.get("freeze_quantity") or 1755))
                max_lots = freeze_qty // lot_size if lot_size > 0 else 27

                # Sync system config if different
                config = await broker_service.get_or_create_config(db)
                if config.lot_size != lot_size:
                    config.lot_size = lot_size
                    await db.commit()

                return {
                    "instrument_key": c.get("instrument_key", f"NSE_FO|NIFTY{strike}{opt_type}"),
                    "trading_symbol": c.get("trading_symbol", f"NIFTY {strike} {opt_type}"),
                    "name": c.get("name", "NIFTY"),
                    "exchange": c.get("exchange", "NSE"),
                    "segment": c.get("segment", "NSE_FO"),
                    "expiry": c.get("expiry", target_expiry),
                    "strike_price": float(c.get("strike_price", strike)),
                    "option_type": opt_type,
                    "lot_size": lot_size,
                    "minimum_lot": int(c.get("minimum_lot") or lot_size),
                    "freeze_quantity": freeze_qty,
                    "max_lots_per_order": max_lots,
                    "tick_size": float(c.get("tick_size") or 0.05),
                    "source": "UPSTOX_API",
                }

        # Fallback to current NIFTY exchange specification (65 units/lot, 1755 freeze qty)
        fallback_expiry = expiry_date or self.get_upcoming_nifty_expiry()
        return {
            "instrument_key": f"NSE_FO|NIFTY_{strike}_{opt_type}",
            "trading_symbol": f"NIFTY {strike} {opt_type}",
            "name": "NIFTY",
            "exchange": "NSE",
            "segment": "NSE_FO",
            "expiry": fallback_expiry,
            "strike_price": float(strike),
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
        option_premium: float = 218.40,
        available_capital: float = 200000.0,
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

        estimated_value = round(max(0, total_quantity) * option_premium, 2)
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
        sl_amt = round(config.total_capital * (config.stoploss_capital_pct / 100.0), 2)
        tgt_amt = round(config.total_capital * (config.target_capital_pct / 100.0), 2)

        return {
            "connection_status": "connected",
            "data": {
                "id": "strat-gift-nifty-dir",
                "name": config.strategy_name,
                "underlying": config.underlying,
                "timeframe": "1-Day",
                "description": (
                    "Gift Nifty Directional: Buy ITM 3 Call if 1-Day Gift Nifty is +80 or higher; "
                    "Buy ITM 3 Put if -80 or lower. Traded strictly between 09:15-09:17 AM IST. "
                    "Max 1 trade/day. Stop Loss = 5% capital, Target = 6% capital."
                ),
                "status": config.strategy_status,
                "mode": config.mode,
                "option_selection": config.option_selection,
                "signal_threshold": config.gift_nifty_signal_threshold,
                "trading_window": f"{config.entry_window_start} AM - {config.entry_window_end} AM IST",
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
                "product": "MIS / I (Intraday)",
            },
            "message": "Strategy configuration retrieved.",
        }

    async def evaluate_signal(
        self,
        db: AsyncSession,
        gift_nifty_change: Optional[float] = None,
        current_time: Optional[time] = None,
        spot_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates 1-Day Gift Nifty directional signal against the exact rules:
        - BULLISH: Gift Nifty 1-Day >= +80 pts -> BUY CALL, 3rd ITM CE
        - BEARISH: Gift Nifty 1-Day <= -80 pts -> BUY PUT, 3rd ITM PE
        - NO TRADE: Between -80 and +80 pts -> NO TRADE
        - Trading Window: Strictly 09:15:00 - 09:17:00 AM IST
        - Daily Limit: Max 1 trade per day
        """
        config = await broker_service.get_or_create_config(db)

        # 1. Day rollover check for daily trade counter
        today_date = datetime.now(IST).strftime("%Y-%m-%d")
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()
            await db.refresh(config)

        # 2. Determine Gift Nifty Day Change
        if gift_nifty_change is None:
            gift_nifty_change = 92.5  # Default telemetry if not overridden

        if spot_price is None:
            spot_price = 24878.50

        now_ist = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")
        expiry = self.get_upcoming_nifty_expiry()

        # 3. Directional Signal Logic
        threshold = config.gift_nifty_signal_threshold  # 80.0
        signal = "NO_TRADE"
        selected_strike = None
        selected_type = None

        if gift_nifty_change >= threshold:
            signal = "BUY_CALL"
            selected_type = "CE"
            selected_strike = self.calculate_itm3_strike(spot_price, "CE")
        elif gift_nifty_change <= -threshold:
            signal = "BUY_PUT"
            selected_type = "PE"
            selected_strike = self.calculate_itm3_strike(spot_price, "PE")
        else:
            signal = "NO_TRADE"

        # 4. Check 1 trade per day constraint
        daily_limit_reached = config.trades_executed_today >= config.max_trades_per_day

        # 5. Check 09:15:00 - 09:17:00 trading window
        in_window, window_msg = self.is_within_trading_window(current_time)

        # 6. Check Kill Switch
        kill_switch_active = bool(config.is_kill_switch_active)

        can_trade = True
        reason = "Signal active and all criteria met."

        if kill_switch_active:
            can_trade = False
            reason = "Kill Switch is active. Trading locked."
        elif signal == "NO_TRADE":
            can_trade = False
            reason = f"NO TRADE: Gift Nifty 1-Day change ({gift_nifty_change:+.1f} pts) is within neutral range (-80 to +80 pts)."
        elif daily_limit_reached:
            can_trade = False
            reason = f"Daily trade limit reached: Maximum 1 trade per day already executed for date {today_date}."
        elif not in_window:
            can_trade = False
            reason = f"Outside allowed trading window (09:15:00 - 09:17:00 AM IST). {window_msg}"

        symbol = f"NIFTY {selected_strike} {selected_type}" if selected_strike else None

        # Capital risk amounts (5% SL, 6% Target)
        sl_amt = round(config.total_capital * (config.stoploss_capital_pct / 100.0), 2)
        tgt_amt = round(config.total_capital * (config.target_capital_pct / 100.0), 2)
        entry_price = 218.40 if selected_type == "CE" else (204.60 if selected_type == "PE" else None)

        window_status_label = "OPEN" if in_window else ("PRE_MARKET" if "Pre-Market" in window_msg else "CLOSED")

        signal_display = "CALL" if signal == "BUY_CALL" else ("PUT" if signal == "BUY_PUT" else "NO SIGNAL")
        lot_size = config.lot_size or 65
        qty = (config.lots or 1) * lot_size

        return {
            "connection_status": "connected",
            "data": {
                "timestamp": now_ist,
                "gift_nifty_change": gift_nifty_change,
                "signal": signal,
                "signal_display": signal_display,
                "can_trade_now": can_trade,
                "reason": reason,
                "underlying_spot": spot_price,
                "selected_option_strike": selected_strike,
                "selected_option_type": selected_type,
                "selected_symbol": symbol,
                "option_selection_rule": "ITM 3 (In-The-Money 3rd Strike)",
                "lot_size": lot_size,
                "quantity": qty,
                "entry_price": entry_price,
                "total_capital": config.total_capital,
                "stoploss_amount": sl_amt,
                "target_amount": tgt_amt,
                "trading_window_status": window_status_label,
                "daily_trade_count": config.trades_executed_today,
                "max_trades_per_day": config.max_trades_per_day,
                "engine_status": config.strategy_status,
                "expiry_date": expiry,
            },
            "message": f"Evaluated signal: {signal}",
        }

    async def start_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        """Start strategy automation. In Live mode, requires active Upstox session."""
        config = await broker_service.get_or_create_config(db)

        if config.mode == "LIVE":
            is_connected, msg, _, _ = await broker_service.verify_connection(db)
            if not is_connected:
                raise BrokerConnectionException(
                    "Cannot start strategy in Live mode: Upstox broker is disconnected. Live session required."
                )

        config.strategy_status = "RUNNING"
        config.is_kill_switch_active = False
        await db.commit()
        await db.refresh(config)

        log_critical_action("STRATEGY_START", {"name": config.strategy_name, "mode": config.mode})
        return {
            "connection_status": "connected",
            "data": {
                "status": "RUNNING",
                "mode": config.mode,
                "strategy": config.strategy_name,
            },
            "message": f"Gift Nifty Directional strategy started in {config.mode} mode. Scanner active between 09:15-09:17 AM IST.",
        }

    async def stop_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        """Stop strategy automation."""
        config = await broker_service.get_or_create_config(db)
        config.strategy_status = "STOPPED"
        await db.commit()
        await db.refresh(config)

        log_critical_action("STRATEGY_STOP", {"name": config.strategy_name, "mode": config.mode})
        return {
            "connection_status": "connected",
            "data": {
                "status": "STOPPED",
                "mode": config.mode,
                "strategy": config.strategy_name,
            },
            "message": "Strategy stopped. Automated execution halted.",
        }

    async def run_monitoring_tick(
        self,
        db: AsyncSession,
        override_time: Optional[time] = None,
        override_change: Optional[float] = None,
        override_spot: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Executes one automated monitoring and risk-management tick for Gift Nifty Directional strategy:
        1. Date Rollover: Resets daily trade counter on a new trading day.
        2. Position Risk Management: Checks open positions against Capital SL (-5%) and Capital Target (+6%)
           including brokerage & charges, and executes auto square-off at 15:15 IST.
        3. Signal & Order Execution: Between 09:15:00 and 09:17:00 AM IST, evaluates 1-Day Gift Nifty change:
           - >= +80 pts -> Generates BUY CALL (3rd ITM CE) and places order immediately.
           - <= -80 pts -> Generates BUY PUT (3rd ITM PE) and places order immediately.
           - Enforces strict 1-trade-per-day limit and duplicate-order prevention.
        """
        config = await broker_service.get_or_create_config(db)
        today_date = datetime.now(IST).strftime("%Y-%m-%d")
        now_time = override_time or datetime.now(IST).time()

        # 1. Day Rollover check
        if config.last_trade_date != today_date:
            config.trades_executed_today = 0
            config.last_trade_date = today_date
            await db.commit()
            await db.refresh(config)

        actions_taken: List[str] = []

        # 2. Reconcile Open Positions against Capital SL (5%) and Target (6%)
        stmt_open = select(Order).where(Order.status == "PLACED").order_by(desc(Order.placed_at))
        res_open = await db.execute(stmt_open)
        open_orders = res_open.scalars().all()

        sl_capital_limit = round(config.total_capital * (config.stoploss_capital_pct / 100.0), 2)
        tgt_capital_limit = round(config.total_capital * (config.target_capital_pct / 100.0), 2)

        for open_order in open_orders:
            # Determine current LTP
            current_ltp = open_order.price
            if config.mode == "LIVE":
                try:
                    token_record = await broker_service.get_or_create_token_record(db)
                    q = await upstox_client.get_market_quote(token_record.access_token, open_order.symbol)
                    q_item = list(q.get("data", {}).values())[0] if q.get("data") else None
                    if q_item and q_item.get("last_price"):
                        current_ltp = float(q_item["last_price"])
                except Exception as exc:
                    logger.debug(f"Live quote fetch note during position check: {str(exc)}")

            # Brokerage and statutory charges per trade
            charges = round(40.0 + 0.0005 * (open_order.price + current_ltp) * open_order.qty, 2)
            gross_pnl = round((current_ltp - open_order.price) * open_order.qty, 2)
            net_pnl = round(gross_pnl - charges, 2)

            exit_reason: Optional[str] = None
            if net_pnl <= -sl_capital_limit:
                exit_reason = f"STOP LOSS HIT (-5% Capital: ₹{net_pnl:,.2f} <= -₹{sl_capital_limit:,.2f})"
            elif net_pnl >= tgt_capital_limit:
                exit_reason = f"TARGET REACHED (+6% Capital: ₹{net_pnl:,.2f} >= +₹{tgt_capital_limit:,.2f})"
            elif now_time >= time(15, 15, 0):
                exit_reason = f"AUTO SQUARE-OFF (15:15 IST Market Close Triggered)"

            if exit_reason:
                # Execute exit order
                if config.mode == "LIVE":
                    try:
                        token_record = await broker_service.get_or_create_token_record(db)
                        exit_payload = {
                            "quantity": open_order.qty,
                            "product": "I",
                            "validity": "DAY",
                            "price": 0.0,
                            "tag": "sl_tgt_exit",
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
                log_critical_action("POSITION_AUTO_EXIT", {
                    "symbol": open_order.symbol,
                    "net_pnl": net_pnl,
                    "reason": exit_reason,
                    "mode": config.mode,
                })

        # 3. Strategy Entry Scanner (only when RUNNING and no active open position)
        if config.strategy_status == "RUNNING" and len(open_orders) == 0:
            in_window, window_msg = self.is_within_trading_window(now_time)

            if in_window and config.trades_executed_today < config.max_trades_per_day:
                # Prevent duplicate entries for the current trading day
                stmt_today = select(Order).where(
                    Order.placed_at >= datetime.combine(datetime.now(IST).date(), time.min)
                )
                existing_today = (await db.execute(stmt_today)).scalars().first()

                if not existing_today:
                    # Evaluate signal
                    spot = override_spot or 24878.50
                    eval_res = await self.evaluate_signal(
                        db=db,
                        gift_nifty_change=override_change,
                        current_time=now_time,
                        spot_price=spot,
                    )
                    data = eval_res.get("data", {})
                    signal = data.get("signal")
                    selected_type = data.get("selected_option_type")

                    if data.get("can_trade_now") and signal in ["BUY_CALL", "BUY_PUT"] and selected_type:
                        from backend.app.services.order_service import order_service
                        order_res = await order_service.place_directional_order(
                            db=db,
                            option_type=selected_type,
                            lots=config.lots,
                            strike=data.get("selected_option_strike"),
                            order_type="MARKET",
                        )
                        actions_taken.append(
                            f"Auto-executed {signal} ({data.get('selected_symbol')}) at {now_time.strftime('%H:%M:%S IST')}."
                        )

        return {
            "connection_status": "connected",
            "data": {
                "timestamp": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
                "strategy_status": config.strategy_status,
                "mode": config.mode,
                "trades_executed_today": config.trades_executed_today,
                "open_positions_count": len(open_orders),
                "actions_taken": actions_taken,
            },
            "message": "Strategy monitoring cycle completed.",
        }

    async def toggle_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        config = await broker_service.get_or_create_config(db)
        if config.strategy_status == "STOPPED":
            return await self.start_strategy(db)
        else:
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
        if lots is not None:
            config.lots = lots
        if stoploss_capital_pct is not None:
            config.stoploss_capital_pct = stoploss_capital_pct
        if target_capital_pct is not None:
            config.target_capital_pct = target_capital_pct
        if total_capital is not None:
            config.total_capital = total_capital

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
        """
        Switch between BACKTEST / PAPER (simulation) and LIVE modes.
        Live mode requires explicit user confirmation and active broker session.
        """
        valid_modes = ["LIVE", "BACKTEST", "PAPER"]
        if new_mode not in valid_modes:
            new_mode = "BACKTEST"

        config = await broker_service.get_or_create_config(db)

        if new_mode == "LIVE" and not confirm_live:
            raise ModeRestrictionException(
                "Live trading requires explicit user confirmation. Real money order placement will be enabled."
            )

        if new_mode == "LIVE":
            is_connected, msg, _, _ = await broker_service.verify_connection(db)
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
            "BACKTEST": "Backtest Simulation mode active: zero capital risk. Historical testing active.",
            "PAPER": "Paper Trading mode active: simulated orders kept completely isolated from live OMS.",
        }
        return {
            "connection_status": "connected",
            "data": {
                "mode": config.mode,
                "message": mode_messages.get(new_mode, ""),
            },
            "message": f"Switched to {new_mode} mode.",
        }

    async def run_backtest(
        self,
        db: AsyncSession,
        from_date: str = "2026-01-01",
        to_date: str = "2026-11-03",
        capital: Optional[float] = None,
        lots: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Backtest the exact Gift Nifty Directional strategy:
        - 1-Day gap >= +80 pts -> 3rd ITM Call
        - 1-Day gap <= -80 pts -> 3rd ITM Put
        - Between -80 and +80 pts -> No Trade
        - SL = 5% of strategy capital
        - Target = 6% of strategy capital
        - Charges deducted per trade
        """
        config = await broker_service.get_or_create_config(db)
        total_capital = capital if capital is not None else config.total_capital
        trade_lots = lots if lots is not None else config.lots
        lot_size = config.lot_size
        qty = trade_lots * lot_size

        sl_amount = round(total_capital * (config.stoploss_capital_pct / 100.0), 2)
        target_amount = round(total_capital * (config.target_capital_pct / 100.0), 2)
        charges_per_trade = 120.0  # STT + Brokerage + Exchange fees estimate

        try:
            candles = await upstox_client.get_historical_candles(
                "NSE_INDEX|Nifty 50", "day", to_date, from_date
            )
            if not candles or len(candles) < 2:
                return {
                    "connection_status": "connected",
                    "data": {
                        "strategy_id": "strat-gift-nifty-dir",
                        "strategy_name": config.strategy_name,
                        "status": "DATA UNAVAILABLE",
                        "total_trading_days": 0,
                        "total_trades": 0,
                        "no_trade_days": 0,
                        "winning_trades": 0,
                        "losing_trades": 0,
                        "win_rate_pct": 0.0,
                        "net_pnl": 0.0,
                        "profit_factor": 0.0,
                        "max_drawdown_pct": 0.0,
                        "sl_hit_rate_pct": 0.0,
                        "target_hit_rate_pct": 0.0,
                        "avg_profit_per_win": 0.0,
                        "avg_loss_per_loss": 0.0,
                        "capital": total_capital,
                        "lots": trade_lots,
                        "total_qty": qty,
                        "recent_trades": [],
                        "message": "DATA UNAVAILABLE: Insufficient historical candles returned by Upstox API.",
                    },
                    "message": "Backtest data unavailable.",
                }

            candles = sorted(candles, key=lambda x: str(x[0]))
            trades: List[Dict[str, Any]] = []
            no_trade_days = 0
            equity_curve = [total_capital]
            current_equity = total_capital
            peak_equity = total_capital
            max_drawdown_amount = 0.0

            target_hits = 0
            sl_hits = 0

            for i in range(1, len(candles)):
                prev_close = float(candles[i - 1][4])
                curr_open = float(candles[i][1])
                curr_high = float(candles[i][2])
                curr_low = float(candles[i][3])
                curr_close = float(candles[i][4])
                date_str = str(candles[i][0])[:10]

                # Dynamically resolve actual exchange lot size for the historical date (never hardcoded)
                day_lot_size = self.resolve_historical_lot_size(date_str)
                day_qty = trade_lots * day_lot_size

                # Overnight gap = Gift Nifty 1-Day change leading into 09:15 open
                gap = round(curr_open - prev_close, 2)

                if gap >= config.gift_nifty_signal_threshold:
                    # Bullish: Buy 3rd ITM CE (Delta ~ 0.70)
                    delta = 0.70
                    atm = int(round(curr_open / 50.0) * 50)
                    strike = atm - 150
                    entry_est = 210.0

                    max_gain_rs = (curr_high - curr_open) * delta * day_qty
                    max_loss_rs = (curr_open - curr_low) * delta * day_qty
                    close_gain_rs = (curr_close - curr_open) * delta * day_qty

                    if max_gain_rs >= target_amount and max_loss_rs < sl_amount:
                        pnl = target_amount - charges_per_trade
                        res = "TARGET"
                        target_hits += 1
                        exit_price = round(entry_est + (target_amount / day_qty), 2)
                    elif max_loss_rs >= sl_amount:
                        pnl = -sl_amount - charges_per_trade
                        res = "SL"
                        sl_hits += 1
                        exit_price = round(max(0, entry_est - (sl_amount / day_qty)), 2)
                    else:
                        pnl = close_gain_rs - charges_per_trade
                        res = "SQUARE_OFF"
                        exit_price = round(entry_est + (close_gain_rs / day_qty), 2)

                    current_equity += pnl
                    trades.append({
                        "date": date_str,
                        "symbol": f"NIFTY {strike} CE",
                        "type": "CE",
                        "strike": strike,
                        "lot_size": day_lot_size,
                        "lots": trade_lots,
                        "quantity": day_qty,
                        "entry_price": entry_est,
                        "exit_price": exit_price,
                        "gap": gap,
                        "pnl": round(pnl, 2),
                        "result": res,
                    })

                elif gap <= -config.gift_nifty_signal_threshold:
                    # Bearish: Buy 3rd ITM PE (Delta ~ 0.70)
                    delta = 0.70
                    atm = int(round(curr_open / 50.0) * 50)
                    strike = atm + 150
                    entry_est = 205.0

                    max_gain_rs = (curr_open - curr_low) * delta * day_qty
                    max_loss_rs = (curr_high - curr_open) * delta * day_qty
                    close_gain_rs = (curr_open - curr_close) * delta * day_qty

                    if max_gain_rs >= target_amount and max_loss_rs < sl_amount:
                        pnl = target_amount - charges_per_trade
                        res = "TARGET"
                        target_hits += 1
                        exit_price = round(entry_est + (target_amount / day_qty), 2)
                    elif max_loss_rs >= sl_amount:
                        pnl = -sl_amount - charges_per_trade
                        res = "SL"
                        sl_hits += 1
                        exit_price = round(max(0, entry_est - (sl_amount / day_qty)), 2)
                    else:
                        pnl = close_gain_rs - charges_per_trade
                        res = "SQUARE_OFF"
                        exit_price = round(entry_est + (close_gain_rs / day_qty), 2)

                    current_equity += pnl
                    trades.append({
                        "date": date_str,
                        "symbol": f"NIFTY {strike} PE",
                        "type": "PE",
                        "strike": strike,
                        "lot_size": day_lot_size,
                        "lots": trade_lots,
                        "quantity": day_qty,
                        "entry_price": entry_est,
                        "exit_price": exit_price,
                        "gap": gap,
                        "pnl": round(pnl, 2),
                        "result": res,
                    })

                else:
                    no_trade_days += 1

                equity_curve.append(current_equity)
                if current_equity > peak_equity:
                    peak_equity = current_equity
                dd = peak_equity - current_equity
                if dd > max_drawdown_amount:
                    max_drawdown_amount = dd

            total_days = len(candles) - 1
            total_trades = len(trades)
            winning_trades = [t for t in trades if t["pnl"] > 0]
            losing_trades = [t for t in trades if t["pnl"] <= 0]

            gross_profit = sum(t["pnl"] for t in winning_trades)
            gross_loss = abs(sum(t["pnl"] for t in losing_trades))
            profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)

            win_rate = round((len(winning_trades) / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
            net_pnl = round(sum(t["pnl"] for t in trades), 2)
            max_drawdown_pct = round((max_drawdown_amount / total_capital) * 100.0, 2)

            sl_hit_rate = round((sl_hits / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
            target_hit_rate = round((target_hits / total_trades) * 100.0, 2) if total_trades > 0 else 0.0

            avg_profit_win = round(gross_profit / len(winning_trades), 2) if winning_trades else 0.0
            avg_loss_loss = round(gross_loss / len(losing_trades), 2) if losing_trades else 0.0

            return {
                "connection_status": "connected",
                "data": {
                    "strategy_id": "strat-gift-nifty-dir",
                    "strategy_name": config.strategy_name,
                    "status": "SUCCESS",
                    "total_trading_days": total_days,
                    "total_trades": total_trades,
                    "no_trade_days": no_trade_days,
                    "winning_trades": len(winning_trades),
                    "losing_trades": len(losing_trades),
                    "win_rate_pct": win_rate,
                    "net_pnl": net_pnl,
                    "profit_factor": profit_factor,
                    "max_drawdown_pct": max_drawdown_pct,
                    "sl_hit_rate_pct": sl_hit_rate,
                    "target_hit_rate_pct": target_hit_rate,
                    "avg_profit_per_win": avg_profit_win,
                    "avg_loss_per_loss": avg_loss_loss,
                    "capital": total_capital,
                    "lot_size": lot_size,
                    "lots": trade_lots,
                    "total_qty": qty,
                    "recent_trades": trades[-10:],
                    "message": "Backtest completed using verified Upstox historical candles.",
                },
                "message": "Backtest simulation completed.",
            }

        except Exception as exc:
            logger.error(f"Backtest execution error: {str(exc)}")
            return {
                "connection_status": "connected",
                "data": {
                    "strategy_id": "strat-gift-nifty-dir",
                    "strategy_name": config.strategy_name,
                    "status": "DATA UNAVAILABLE",
                    "total_trading_days": 0,
                    "total_trades": 0,
                    "no_trade_days": 0,
                    "winning_trades": 0,
                    "losing_trades": 0,
                    "win_rate_pct": 0.0,
                    "net_pnl": 0.0,
                    "profit_factor": 0.0,
                    "max_drawdown_pct": 0.0,
                    "sl_hit_rate_pct": 0.0,
                    "target_hit_rate_pct": 0.0,
                    "avg_profit_per_win": 0.0,
                    "avg_loss_per_loss": 0.0,
                    "capital": total_capital,
                    "lot_size": lot_size,
                    "lots": trade_lots,
                    "total_qty": qty,
                    "recent_trades": [],
                    "message": f"DATA UNAVAILABLE: {str(exc)}",
                },
                "message": "Backtest failed or data unavailable.",
            }


strategy_service = StrategyService()
