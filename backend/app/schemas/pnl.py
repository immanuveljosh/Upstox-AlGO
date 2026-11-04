from typing import List, Literal
from pydantic import BaseModel, Field


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
    # snake_case fields
    net_pnl: float = 0.0
    gross_pnl: float = 0.0
    brokerage_taxes: float = 0.0
    win_rate: float = 0.0
    profit_trades: int = 0
    loss_trades: int = 0
    total_trades: int = 0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    profit_factor: float = 0.0
    equity_curve: List[EquityPoint] = Field(default_factory=list)
    daily_pnl: List[DailyPnlRecord] = Field(default_factory=list)

    # camelCase fields matching frontend PnlSummary interface
    netPnl: float = 0.0
    grossPnl: float = 0.0
    brokerageTaxes: float = 0.0
    winRate: float = 0.0
    profitTrades: int = 0
    lossTrades: int = 0
    totalTrades: int = 0
    maxDrawdown: float = 0.0
    maxDrawdownPct: float = 0.0
    avgWin: float = 0.0
    avgLoss: float = 0.0
    profitFactor: float = 0.0
    equityCurve: List[EquityPoint] = Field(default_factory=list)
    dailyPnl: List[DailyPnlRecord] = Field(default_factory=list)
