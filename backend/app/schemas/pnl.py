from typing import List, Literal, Optional
from pydantic import BaseModel


class EquityPoint(BaseModel):
    date: str
    equity: float
    drawdown: float


class DailyPnlRecord(BaseModel):
    date: str
    pnl: float
    trades: int


class PnlSummaryData(BaseModel):
    period: Literal["monthly", "sixMonth", "yearly"]
    net_pnl: float
    gross_pnl: float
    brokerage_taxes: float
    win_rate: float
    profit_trades: int
    loss_trades: int
    total_trades: int
    max_drawdown: float
    max_drawdown_pct: float
    profit_factor: float
    equity_curve: List[EquityPoint]
    daily_pnl: List[DailyPnlRecord]
