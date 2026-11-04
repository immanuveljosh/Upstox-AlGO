from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class GiftNiftyObservation(Base, TimestampMixin):
    """Actual recorded Gift Nifty 1-Day change observations by trading date."""
    __tablename__ = "gift_nifty_observations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trade_date: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)  # YYYY-MM-DD
    change_points: Mapped[float] = mapped_column(Float, nullable=False)
    prev_close: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    observed_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # ISO-8601 IST
    source: Mapped[str] = mapped_column(String(40), default="MANUAL", nullable=False)


class BacktestRunRecord(Base, TimestampMixin):
    """Persisted historical backtest runs for Nifty Directional strategy."""
    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    strategy_name: Mapped[str] = mapped_column(String(100), default="Nifty Directional", nullable=False)
    duration_code: Mapped[str] = mapped_column(String(20), nullable=False)
    duration_label: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[str] = mapped_column(String(20), nullable=False)
    end_date: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)  # COMPLETE | INCOMPLETE | DATA UNAVAILABLE
    initial_capital: Mapped[float] = mapped_column(Float, nullable=False)
    lots: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    net_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    roi_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overall_result: Mapped[str] = mapped_column(String(30), default="DATA UNAVAILABLE", nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

