from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class Trade(Base, TimestampMixin):
    """Historical closed trades for precise P&L and drawdown calculation."""
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trade_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    client_order_id: Mapped[str] = mapped_column(String(100), index=True)

    symbol: Mapped[str] = mapped_column(String(100), nullable=False)
    option_type: Mapped[str] = mapped_column(String(10), nullable=False)  # CE / PE
    lots: Mapped[int] = mapped_column(Integer, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)

    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_percent: Mapped[float] = mapped_column(Float, nullable=False)

    entry_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    exit_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

