from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class SystemConfig(Base, TimestampMixin):
    __tablename__ = "system_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Trading Mode: LIVE or BACKTEST
    mode: Mapped[str] = mapped_column(String(20), default="LIVE", nullable=False)

    # Strategy: Gift Nifty Directional (Default Hard-Coded)
    strategy_name: Mapped[str] = mapped_column(String(100), default="Gift Nifty Directional")
    underlying: Mapped[str] = mapped_column(String(50), default="NIFTY")
    strategy_status: Mapped[str] = mapped_column(String(20), default="STOPPED")  # RUNNING / STOPPED

    # Gift Nifty 1-Day Signal Rules
    gift_nifty_signal_threshold: Mapped[float] = mapped_column(Float, default=80.0)  # +/- 80 pts
    option_selection: Mapped[str] = mapped_column(String(20), default="ITM 3")  # ITM 3

    # Execution Window & Daily Limit
    entry_window_start: Mapped[str] = mapped_column(String(10), default="09:15")
    entry_window_end: Mapped[str] = mapped_column(String(10), default="09:17")
    max_trades_per_day: Mapped[int] = mapped_column(Integer, default=1)
    last_trade_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # YYYY-MM-DD
    trades_executed_today: Mapped[int] = mapped_column(Integer, default=0)

    # Capital & Risk Parameters (5% SL / 6% Target)
    total_capital: Mapped[float] = mapped_column(Float, default=200000.0)
    stoploss_capital_pct: Mapped[float] = mapped_column(Float, default=5.0)  # 5% SL
    target_capital_pct: Mapped[float] = mapped_column(Float, default=6.0)  # 6% Target

    # Order Lot Configuration
    lot_size: Mapped[int] = mapped_column(Integer, default=25)  # 25 units per lot for Nifty
    lots: Mapped[int] = mapped_column(Integer, default=2)  # Configurable lots

    # Safeguards
    product: Mapped[str] = mapped_column(String(10), default="I")  # Intraday (MIS / I)
    is_kill_switch_active: Mapped[bool] = mapped_column(Boolean, default=False)
