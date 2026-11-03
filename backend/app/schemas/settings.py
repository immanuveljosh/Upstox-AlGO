from typing import Optional
from pydantic import BaseModel, Field


class BrokerCredentialsUpdate(BaseModel):
    api_key: Optional[str] = Field(None, min_length=1)
    api_secret: Optional[str] = Field(None, min_length=1)
    redirect_uri: Optional[str] = Field(None, min_length=1)


class AllSettingsData(BaseModel):
    api_key_configured: bool
    api_key_masked: str
    redirect_uri: str
    has_active_token: bool
    mode: str
    strategy_name: str
    strategy_status: str
    lot_size: int
    lots: int
    option_selection: str
    total_capital: float
    stoploss_capital_pct: float
    target_capital_pct: float
    max_trades_per_day: int
