from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_order_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    upstox_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    instrument_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    symbol: Mapped[str] = mapped_column(String(100), nullable=False)
    strike: Mapped[int] = mapped_column(Integer, nullable=False)
    option_type: Mapped[str] = mapped_column(String(10), nullable=False)  # CE or PE
    lots: Mapped[int] = mapped_column(Integer, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)

    order_type: Mapped[str] = mapped_column(String(20), default="MARKET")  # MARKET / LIMIT
    price: Mapped[float] = mapped_column(Float, default=0.0)
    trigger_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status: PLACED, PENDING_EXIT, CLOSED, REJECTED, CANCELLED
    status: Mapped[str] = mapped_column(String(30), default="PLACED", index=True)
    mode: Mapped[str] = mapped_column(String(20), default="LIVE")  # LIVE or BACKTEST
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Execution timestamps & PnL
    placed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_upstox_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    exit_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    realized_pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Strategy Intelligence & Execution Monitoring telemetry
    expected_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    slippage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    signal_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    broker_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


