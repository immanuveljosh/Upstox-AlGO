from typing import Optional, Literal, List
from pydantic import BaseModel, Field


class OrderCreateRequest(BaseModel):
    option_type: Literal["CE", "PE"] = Field(..., description="Directional Call or Put")
    lots: Optional[int] = Field(default=None, ge=1, le=50, description="Lots multiplier (defaults to strategy setting)")
    strike: Optional[int] = Field(default=None, description="Strike price. If None, strategy selects ITM 3 automatically from option chain.")
    order_type: Literal["MARKET", "LIMIT"] = Field(default="MARKET", description="Order execution type")
    price: Optional[float] = Field(default=0.0, ge=0.0, description="Limit price if LIMIT order")
    trigger_price: Optional[float] = Field(default=0.0, ge=0.0, description="Trigger price if SL order")


class OrderPlacedData(BaseModel):
    client_order_id: str
    upstox_order_id: Optional[str] = None
    symbol: str
    strike: int
    moneyness: str = "ITM 3"
    type: str
    lots: int
    lot_size: int = 65
    qty: int
    instrument_key: Optional[str] = None
    price: float
    status: str
    mode: str
    product: str = "I (Intraday)"
    stoploss_capital_4pct: str
    target_capital_5pct: str
    reject_reason: Optional[str] = None
    time: str


class OrderItem(BaseModel):
    id: str
    client_order_id: str
    upstox_order_id: Optional[str] = None
    time: str
    symbol: str
    strike: int
    type: Literal["CE", "PE"]
    lots: int
    lot_size: int = 65
    qty: int
    price: float
    status: Literal["PLACED", "CLOSED", "REJECTED", "CANCELLED"]
    mode: str
    pnl: Optional[float] = None
    exit_price: Optional[float] = None
    exit_time: Optional[str] = None
    reject_reason: Optional[str] = None


class ExitAllResultData(BaseModel):
    triggered: bool
    positions_closed: int
    orders_cancelled: int
    strategy_stopped: bool
    closed_symbols: List[str] = []
    summary: str
