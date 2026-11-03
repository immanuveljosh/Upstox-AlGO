from typing import List, Optional
from pydantic import BaseModel, Field


class KillSwitchResultData(BaseModel):
    triggered: bool
    positions_closed: int
    orders_cancelled: int
    strategy_stopped: bool
    closed_symbols: List[str] = []
    summary: str


class RiskLimitsData(BaseModel):
    total_capital: float
    stoploss_capital_pct: float
    stoploss_amount: float
    target_capital_pct: float
    target_amount: float
    max_trades_per_day: int
    trades_executed_today: int
    circuit_breaker_triggered: bool = False


class RiskLimitsUpdate(BaseModel):
    total_capital: Optional[float] = Field(None, ge=10000.0, description="Total trading capital")
    stoploss_capital_pct: Optional[float] = Field(None, ge=1.0, le=50.0, description="Stoploss % of capital")
    target_capital_pct: Optional[float] = Field(None, ge=1.0, le=50.0, description="Target % of capital")
    max_trades_per_day: Optional[int] = Field(None, ge=1, le=5, description="Max trades per day")
