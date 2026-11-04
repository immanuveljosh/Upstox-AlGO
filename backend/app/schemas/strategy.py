from typing import Literal, Optional, Dict, Any, List
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
    status: Literal["RUNNING", "STOPPED", "PAUSED"]
    mode: Literal["PAPER", "LIVE", "BACKTEST"]
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
    signal: str  # BULLISH / BUY_CALL, BEARISH / BUY_PUT, NO_TRADE
    can_trade_now: bool
    reason: str
    underlying_spot: float
    selected_option_strike: Optional[int] = None
    selected_option_type: Optional[str] = None
    selected_symbol: Optional[str] = None
    option_selection_rule: str = "ITM 3 (In-The-Money 3rd Strike)"
    entry_price: Optional[float] = None
    total_capital: float = 200000.0
    stoploss_amount: float = 10000.0
    target_amount: float = 12000.0
    trading_window_status: str = "CLOSED"
    daily_trade_count: int = 0
    max_trades_per_day: int = 1
    engine_status: str = "STOPPED"
    expiry_date: Optional[str] = None


class ModeSwitchRequest(BaseModel):
    mode: Literal["PAPER", "LIVE", "BACKTEST"]
    confirm_live: Optional[bool] = False


class BacktestTradeRecord(BaseModel):
    date: str
    symbol: str
    type: str
    strike: int
    entry_price: float
    exit_price: float
    pnl: float
    result: str  # TARGET, SL, SQUARE_OFF


class BacktestResultData(BaseModel):
    strategy_id: str = "strat-gift-nifty-dir"
    strategy_name: str = "Gift Nifty Directional"
    status: str = "SUCCESS"  # SUCCESS or DATA UNAVAILABLE
    total_trading_days: int
    total_trades: int
    no_trade_days: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    net_pnl: float
    profit_factor: float
    max_drawdown_pct: float
    sl_hit_rate_pct: float
    target_hit_rate_pct: float
    avg_profit_per_win: float
    avg_loss_per_loss: float
    capital: float
    lots: int
    total_qty: int
    recent_trades: List[Dict[str, Any]] = []
    message: Optional[str] = None
