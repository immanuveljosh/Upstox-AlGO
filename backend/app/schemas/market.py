from typing import List, Optional, Literal
from pydantic import BaseModel


class NiftySpotData(BaseModel):
    symbol: str = "NIFTY 50"
    spot_price: float
    change: float
    change_pct: float
    timestamp: str
    atm_strike: int
    market_status: str = "MARKET CLOSED"


class GiftNiftyData(BaseModel):
    symbol: str = "GIFT NIFTY"
    timeframe: str = "1 Day"
    status: str = "AVAILABLE"  # AVAILABLE | DATA UNAVAILABLE
    current_value: Optional[float] = None
    prev_close: Optional[float] = None
    day_change_points: Optional[float] = None
    day_change_pct: Optional[float] = None
    threshold_pts: float = 80.0
    signal: str = "NO TRADE"  # CALL | PUT | NO TRADE | DATA UNAVAILABLE
    signal_status: Literal["CALL_TRIGGER_ACTIVE", "PUT_TRIGGER_ACTIVE", "NEUTRAL_WAIT", "DATA_UNAVAILABLE"] = "DATA_UNAVAILABLE"
    source: Optional[str] = None
    timestamp: str


class OptionContractITM3(BaseModel):
    strike: int
    option_type: Literal["CE", "PE"]
    moneyness: str = "ITM 3"
    symbol: str
    instrument_key: Optional[str] = None
    expiry: Optional[str] = None
    lot_size: int = 65
    freeze_quantity: int = 1755
    ltp: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    open_interest: int = 0
    volume: int = 0


class OptionChainITM3Response(BaseModel):
    underlying: str = "NIFTY 50"
    spot_price: float
    atm_strike: int
    expiry: Optional[str] = None
    call_itm3: Optional[OptionContractITM3] = None
    put_itm3: Optional[OptionContractITM3] = None
    selection_rule: str = "ITM 3 dynamically calculated from live NIFTY option chain"


class HistoricalCandle(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int
