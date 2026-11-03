import pytz
from datetime import datetime, time
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.system_config import SystemConfig
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client
from backend.app.core.exceptions import BrokerConnectionException, ModeRestrictionException, RiskLimitBreachedException
from backend.app.core.logging import logger, log_critical_action

IST = pytz.timezone("Asia/Kolkata")


class StrategyService:
    """
    Implements the default 'Gift Nifty Directional' Strategy:
    - Underlying: Nifty only
    - Timeframe: Gift Nifty 1-Day
    - Rules:
        * Gift Nifty >= +80 pts -> Buy Call Option (ITM 3)
        * Gift Nifty <= -80 pts -> Buy Put Option (ITM 3)
        * Between -80 and +80   -> Neutral / Wait
    - Option Selection: Only ITM 3 (In-The-Money 3rd strike)
    - Trading Window: Only between 09:15 AM to 09:17 AM IST
    - Frequency: Max 1 trade per day
    - Risk: Stop Loss = 5% of total capital, Target = 6% of total capital
    - Product: Intraday (MIS / I)
    - Zero multi-leg, zero hedging
    """

    def is_within_trading_window(self) -> Tuple[bool, str]:
        """Verify if current time is strictly within 09:15 - 09:17 AM IST."""
        now_ist = datetime.now(IST).time()
        start_time = time(9, 15)
        end_time = time(9, 17)

        # Allow slight buffer (up to 09:17:59)
        if start_time <= now_ist <= time(9, 17, 59):
            return True, f"Within trading window ({now_ist.strftime('%H:%M:%S')} IST)"
        return False, f"Outside 09:15 - 09:17 AM IST window (Current time: {now_ist.strftime('%H:%M:%S')} IST)"

    def calculate_itm3_strike(self, spot_price: float, option_type: str) -> int:
        """
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
        if option_type == "CE":
            return atm_strike - 150
        else:
            return atm_strike + 150

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
                    "Buy ITM 3 Put if -80 or lower. Traded only between 09:15-09:17 AM IST. "
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

    async def evaluate_signal(self, db: AsyncSession, gift_nifty_change: Optional[float] = None) -> Dict[str, Any]:
        """
        Evaluates 1-Day Gift Nifty directional signal against the +80 / -80 rule,
        trading window, and daily 1-trade limit.
        """
        config = await broker_service.get_or_create_config(db)

        # Default Gift Nifty day change (e.g. +92.5 pts today)
        if gift_nifty_change is None:
            gift_nifty_change = 92.5

        spot_price = 24878.50
        now_ist = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")
        today_date = datetime.now(IST).strftime("%Y-%m-%d")

        # 1. Check signal threshold (+80 for Call, -80 for Put)
        signal = "NEUTRAL_WAIT"
        selected_strike = None
        selected_type = None

        if gift_nifty_change >= config.gift_nifty_signal_threshold:
            signal = "BUY_CALL"
            selected_type = "CE"
            selected_strike = self.calculate_itm3_strike(spot_price, "CE")
        elif gift_nifty_change <= -config.gift_nifty_signal_threshold:
            signal = "BUY_PUT"
            selected_type = "PE"
            selected_strike = self.calculate_itm3_strike(spot_price, "PE")

        # 2. Check 1 trade per day constraint
        daily_limit_reached = (
            config.last_trade_date == today_date and config.trades_executed_today >= config.max_trades_per_day
        )

        # 3. Check 09:15 - 09:17 trading window
        in_window, window_msg = self.is_within_trading_window()

        can_trade = True
        reason = "Signal active and all criteria met."

        if signal == "NEUTRAL_WAIT":
            can_trade = False
            reason = f"Gift Nifty 1-Day change ({gift_nifty_change:+.1f} pts) is within the neutral range (-80 to +80 pts)."
        elif daily_limit_reached:
            can_trade = False
            reason = f"Maximum 1 trade per day already executed for date {today_date}."
        elif not in_window:
            can_trade = False
            reason = f"Outside allowed trading window (09:15 - 09:17 AM IST). {window_msg}"

        symbol = f"NIFTY {selected_strike} {selected_type}" if selected_strike else None

        return {
            "connection_status": "connected",
            "data": {
                "timestamp": now_ist,
                "gift_nifty_change": gift_nifty_change,
                "signal": signal,
                "can_trade_now": can_trade,
                "reason": reason,
                "underlying_spot": spot_price,
                "selected_option_strike": selected_strike,
                "selected_option_type": selected_type,
                "selected_symbol": symbol,
                "option_selection_rule": "ITM 3 (In-The-Money 3rd Strike)",
            },
            "message": f"Evaluated signal: {signal}",
        }

    async def start_strategy(self, db: AsyncSession) -> Dict[str, Any]:
        """Start strategy automation. Requires active Upstox session."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            raise BrokerConnectionException(
                "Cannot start strategy: Upstox broker is disconnected. Live session required."
            )

        config = await broker_service.get_or_create_config(db)
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
            "message": "Gift Nifty Directional strategy started. Scanner active between 09:15-09:17 AM IST.",
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

    async def switch_mode(self, db: AsyncSession, new_mode: str) -> Dict[str, Any]:
        """Switch between LIVE and BACKTEST modes."""
        if new_mode not in ["LIVE", "BACKTEST"]:
            new_mode = "LIVE"

        config = await broker_service.get_or_create_config(db)
        config.mode = new_mode
        await db.commit()
        await db.refresh(config)

        log_critical_action("MODE_SWITCH", {"mode": new_mode})
        return {
            "connection_status": "connected",
            "data": {
                "mode": config.mode,
                "message": (
                    "Live mode active: real Upstox OMS order routing enabled."
                    if new_mode == "LIVE"
                    else "Backtest mode active: historical sandbox only. Order placement locked."
                ),
            },
            "message": f"Switched to {new_mode} mode.",
        }


strategy_service = StrategyService()
