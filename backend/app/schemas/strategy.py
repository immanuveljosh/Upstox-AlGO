from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field


class StrategyConfigData(BaseModel):
    id: str = "strat-gift-nifty-dir"
    name: str = "Gift Nifty Directional"
    underlying: str = "NIFTY"
    timeframe: str = "1-Day"
    description: str = (
        "Gift Nifty Directional: Buy ITM 3 Call if 1-Day Gift Nifty is +80 or higher; "
        "Buy ITM 3 Put if -80 or lower. Traded only between 09:15-09:17 AM IST. "
        "Max 1 trade/day. Stop Loss = 5% capital, Target = 6% capital."
    )
    status: Literal["RUNNING", "STOPPED"]
    mode: Literal["LIVE", "BACKTEST"]
    option_selection: str = "ITM 3"
    signal_threshold: float = 80.0
    trading_window: str = "09:15 AM - 09:17 AM IST"
    max_trades_per_day: int = 1
    trades_executed_today: int = 0
    total_capital: float = 200000.0
    stoploss_capital_pct: float = 5.0
    stoploss_amount: float = 10000.0
    target_capital_pct: float = 6.0
    target_amount: float = 12000.0
    lot_size: int = 25
    lots: int = 2
    total_qty: int = 50
    product: str = "MIS / I (Intraday)"


class StrategySettingsUpdate(BaseModel):
    lots: Optional[int] = Field(None, ge=1, le=50, description="Lot size multiplier")
    stoploss_capital_pct: Optional[float] = Field(None, ge=1.0, le=50.0, description="Stop loss % of capital (default 5%)")
    target_capital_pct: Optional[float] = Field(None, ge=1.0, le=50.0, description="Target % of capital (default 6%)")
    total_capital: Optional[float] = Field(None, ge=10000.0, description="Total trading capital")


class SignalEvaluationResult(BaseModel):
    timestamp: str
    gift_nifty_change: float
    signal: Literal["BUY_CALL", "BUY_PUT", "NEUTRAL_WAIT"]
    can_trade_now: bool
    reason: str
    underlying_spot: float
    selected_option_strike: Optional[int] = None
    selected_option_type: Optional[str] = None
    selected_symbol: Optional[str] = None


class ModeSwitchRequest(BaseModel):
    mode: Literal["LIVE", "BACKTEST"]
