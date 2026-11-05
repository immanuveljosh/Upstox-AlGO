from typing import Optional
from pydantic import BaseModel, Field


class BrokerCredentialsUpdate(BaseModel):
    api_key: Optional[str] = Field(None, min_length=1)
    api_secret: Optional[str] = Field(None, min_length=1)
    redirect_uri: Optional[str] = Field(None, min_length=1)
    notifier_url: Optional[str] = Field(None, min_length=1)
    access_token: Optional[str] = None


class AllSettingsData(BaseModel):
    api_key: Optional[str] = None
    api_key_configured: bool
    api_key_masked: str
    has_api_secret: bool = False
    api_secret_masked: str = ""
    redirect_uri: str
    has_active_token: bool
    access_token_masked: str = ""
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    broker_name: str = "Upstox"
    connection_status: str = "DISCONNECTED"
    is_connected: bool = False
    latency_ms: Optional[int] = None
    last_verified: Optional[str] = None
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
