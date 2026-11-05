from typing import Literal, Optional, Dict, Any, List
from pydantic import BaseModel, Field


class StrategyConfigData(BaseModel):
    id: str = "nifty-directional"
    name: str = "Nifty Directional"
    underlying: str = "NIFTY"
    signal_source: str = "GIFT NIFTY"
    timeframe: str = "1 Day"
    description: str = (
        "Nifty Directional: Buy NIFTY ITM 3 Call (CE) if Gift Nifty 1-Day change >= +80 pts; "
        "Buy NIFTY ITM 3 Put (PE) if <= -80 pts; No Trade between -80 and +80 pts. "
        "Entry window 09:15:00–09:17:00 IST, max 1 trade/day, Stop Loss 4% of capital, Target 5% of capital."
    )
    status: Literal["RUNNING", "STOPPED", "PAUSED"]
    mode: Literal["BACKTEST", "LIVE"]
    option_selection: str = "ITM 3"
    signal_threshold: float = 80.0
    entry_window_start: str = "09:15:00"
    entry_window_end: str = "09:17:00"
    trading_window: str = "09:15:00 – 09:17:00 IST"
    auto_square_off: str = "15:15 IST"
    max_trades_per_day: int = 1
    trades_executed_today: int = 0
    total_capital: float = 200000.0
    stoploss_capital_pct: float = 4.0
    stoploss_amount: float = 8000.0
    target_capital_pct: float = 5.0
    target_amount: float = 10000.0
    lot_size: int = 65
    lots: int = 1
    total_qty: int = 65
    product: str = "I (Intraday)"
    critical_alert: Optional[str] = None
    orphan_positions: Optional[List[Dict[str, Any]]] = None
    quote_status: Optional[str] = "FRESH"


class StrategySettingsUpdate(BaseModel):
    lots: Optional[int] = Field(None, ge=1, le=50, description="Lot size multiplier")
    stoploss_capital_pct: Optional[float] = Field(None, ge=0.5, le=50.0, description="Stop loss % of capital (default 4%)")
    target_capital_pct: Optional[float] = Field(None, ge=0.5, le=50.0, description="Target % of capital (default 5%)")
    total_capital: Optional[float] = Field(None, ge=10000.0, description="Total strategy capital")


class GiftNiftyObservationRequest(BaseModel):
    trade_date: Optional[str] = Field(None, description="Trading date YYYY-MM-DD (defaults to today IST)")
    change_points: float = Field(..., description="Actual Gift Nifty 1-Day change in points")
    prev_close: Optional[float] = None
    current_value: Optional[float] = None
    observed_at: Optional[str] = None


class GiftNiftyCsvImportRequest(BaseModel):
    csv: str = Field(..., description="CSV text with header: date,change_points[,prev_close,value_at_0915,observed_at]")


class SignalEvaluationResult(BaseModel):
    timestamp: str
    gift_nifty_change: Optional[float] = None
    signal: str  # BUY_CALL, BUY_PUT, NO_TRADE
    signal_display: Optional[str] = "NO TRADE"  # CALL, PUT, NO TRADE
    can_trade_now: bool
    reason: str
    underlying_spot: Optional[float] = None
    selected_option_strike: Optional[int] = None
    selected_option_type: Optional[str] = None
    selected_symbol: Optional[str] = None
    option_selection_rule: str = "ITM 3 (Dynamic from Option Chain)"
    lot_size: int = 65
    quantity: int = 65
    entry_price: Optional[float] = None
    total_capital: float = 200000.0
    stoploss_capital_pct: float = 4.0
    stoploss_amount: float = 8000.0
    target_capital_pct: float = 5.0
    target_amount: float = 10000.0
    trading_window_status: str = "CLOSED"
    daily_trade_count: int = 0
    max_trades_per_day: int = 1
    engine_status: str = "STOPPED"
    expiry_date: Optional[str] = None


class ModeSwitchRequest(BaseModel):
    mode: Literal["BACKTEST", "LIVE"]
    confirm_live: Optional[bool] = False


class BacktestRequest(BaseModel):
    duration: Optional[str] = Field("3M", description="Duration code: 1M, 3M, 6M, 1Y, CUSTOM")
    from_date: Optional[str] = Field(None, description="Start date YYYY-MM-DD for custom date range")
    to_date: Optional[str] = Field(None, description="End date YYYY-MM-DD for custom date range")
    capital: Optional[float] = Field(None, description="Initial strategy capital")
    lots: Optional[int] = Field(None, description="Number of lots")


class InstrumentMetadata(BaseModel):
    instrument_key: str
    trading_symbol: str
    name: str = "NIFTY"
    exchange: str = "NSE"
    segment: str = "NSE_FO"
    expiry: str
    strike_price: float
    option_type: Literal["CE", "PE"]
    lot_size: int = 65
    minimum_lot: int = 65
    freeze_quantity: int = 1755
    max_lots_per_order: int = 27
    tick_size: float = 0.05
    source: str = "UPSTOX_API"


class QuantityCalculationRequest(BaseModel):
    lots: int = Field(..., ge=0, description="Number of lots")
    lot_size: Optional[int] = Field(None, description="Actual exchange lot size (defaults to Upstox metadata / 65)")
    strike: Optional[int] = None
    option_type: Literal["CE", "PE"] = "CE"
    option_premium: float = 0.0
    available_capital: Optional[float] = None
    instrument: Optional[str] = "NIFTY"
    raw_quantity: Optional[int] = None


class QuantityCalculationResponse(BaseModel):
    is_valid: bool
    instrument: str = "NIFTY"
    instrument_key: str = ""
    trading_symbol: Optional[str] = None
    expiry: str = ""
    option_type: str = "CE"
    strike: int = 0
    lots: int
    lot_size: int = 65
    total_quantity: int
    freeze_quantity: int = 1755
    max_lots_per_order: int = 27
    estimated_order_value: float = 0.0
    within_capital_limit: bool = True
    metadata_source: str = "UPSTOX_API"
    errors: List[str] = []
    message: str = "Valid order quantity"
