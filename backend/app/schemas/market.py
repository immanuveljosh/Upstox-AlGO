from typing import List, Optional, Literal
from pydantic import BaseModel


class NiftySpotData(BaseModel):
    symbol: str = "NIFTY 50"
    spot_price: float
    change: float
    change_pct: float
    timestamp: str
    atm_strike: int


class GiftNiftyData(BaseModel):
    symbol: str = "GIFT NIFTY"
    timeframe: str = "1-Day"
    current_value: float
    day_change_points: float
    day_change_pct: float
    threshold_pts: float = 80.0
    signal_status: Literal["CALL_TRIGGER_ACTIVE", "PUT_TRIGGER_ACTIVE", "NEUTRAL_WAIT"]
    timestamp: str


class OptionContractITM3(BaseModel):
    strike: int
    option_type: Literal["CE", "PE"]
    moneyness: str = "ITM 3"
    symbol: str
    ltp: float
    bid: float
    ask: float
    open_interest: int
    volume: int


class OptionChainITM3Response(BaseModel):
    underlying: str = "NIFTY 50"
    spot_price: float
    atm_strike: int
    call_itm3: OptionContractITM3
    put_itm3: OptionContractITM3
    selection_rule: str = "Strategy strictly filters ITM 3 (In-The-Money 3rd strike) options only"


class HistoricalCandle(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int
