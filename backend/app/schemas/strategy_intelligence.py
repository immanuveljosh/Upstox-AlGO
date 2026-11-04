from typing import List, Optional
from pydantic import BaseModel, Field


class SignalAnalysisItem(BaseModel):
    trade_date: str
    signal_time: Optional[str] = None
    gift_nifty_change: Optional[float] = None
    gift_nifty_source: Optional[str] = None
    signal: str  # CALL, PUT, NO TRADE, DATA UNAVAILABLE
    signal_strength_points: Optional[float] = None
    signal_strength_category: str  # STRONG (>=120), MODERATE (80-120), NEUTRAL (<80), UNAVAILABLE
    executed_symbol: Optional[str] = None
    executed_status: str  # EXECUTED, NO_TRADE, MISSED, REJECTED, DATA_UNAVAILABLE
    is_missed: bool = False
    missed_reason: Optional[str] = None


class ExecutionMonitoringItem(BaseModel):
    trade_date: str
    client_order_id: str
    upstox_order_id: Optional[str] = None
    symbol: str
    option_type: str
    strike: int
    lots: int
    lot_size: int
    quantity: int
    signal_timestamp: Optional[str] = None
    order_submission_timestamp: Optional[str] = None
    broker_confirmation_timestamp: Optional[str] = None
    latency_ms: Optional[float] = None
    expected_price: Optional[float] = None
    actual_fill_price: float
    slippage_points: Optional[float] = None
    slippage_pct: Optional[float] = None
    exit_timestamp: Optional[str] = None
    exit_price: Optional[float] = None
    gross_pnl: Optional[float] = None
    charges: Optional[float] = None
    net_pnl: Optional[float] = None
    exit_reason: Optional[str] = None  # SL, Target, Time Exit, etc.
    status: str  # PLACED, CLOSED, REJECTED
    rejection_details: Optional[str] = None


class MonthlyHeatmapItem(BaseModel):
    year: int
    month: int
    month_name: str
    year_month: str
    gross_pnl: float
    net_pnl: float
    total_charges: float
    trades_count: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    roi_pct: float
    status: str  # PROFIT, LOSS, BREAK EVEN, NO_TRADES


class EquityPointItem(BaseModel):
    date: str
    equity: float
    pnl: float
    drawdown: float


class PnlAnalyticsSummary(BaseModel):
    total_trading_days: int = 0
    total_signals: int = 0
    call_signals: int = 0
    put_signals: int = 0
    no_trade_signals: int = 0
    missed_signals: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    winning_days: int = 0
    losing_days: int = 0
    breakeven_days: int = 0
    win_rate_pct: float = 0.0
    initial_capital: float = 200000.0
    final_capital: float = 200000.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    total_charges: float = 0.0
    net_pnl: float = 0.0
    roi_pct: float = 0.0
    avg_profit_per_win: float = 0.0
    avg_loss_per_loss: float = 0.0
    avg_trade_pnl: float = 0.0
    max_drawdown_amount: float = 0.0
    max_drawdown_pct: float = 0.0
    consecutive_wins_max: int = 0
    consecutive_losses_max: int = 0
    profit_factor: Optional[float] = None
    overall_result: str = "NO TRADES"


class StrategyIntelligenceData(BaseModel):
    strategy_id: str = "nifty-directional"
    strategy_name: str = "Nifty Directional"
    mode: str = "LIVE"
    duration_code: str = "3M"
    duration_label: str = "3 Months"
    start_date: str
    end_date: str
    data_available: bool = True
    summary: PnlAnalyticsSummary
    equity_curve: List[EquityPointItem] = Field(default_factory=list)
    monthly_heatmap: List[MonthlyHeatmapItem] = Field(default_factory=list)
    signals: List[SignalAnalysisItem] = Field(default_factory=list)
    executions: List[ExecutionMonitoringItem] = Field(default_factory=list)
    message: str = ""

