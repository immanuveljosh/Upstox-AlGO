from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class SystemConfig(Base, TimestampMixin):
    __tablename__ = "system_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Trading Mode: BACKTEST (default) or LIVE
    mode: Mapped[str] = mapped_column(String(20), default="BACKTEST", nullable=False)

    # Default Strategy: Nifty Directional
    strategy_id: Mapped[str] = mapped_column(String(50), default="nifty-directional")
    strategy_name: Mapped[str] = mapped_column(String(100), default="Nifty Directional")
    underlying: Mapped[str] = mapped_column(String(50), default="NIFTY")
    strategy_status: Mapped[str] = mapped_column(String(20), default="STOPPED")  # RUNNING / STOPPED

    # Gift Nifty 1-Day Signal Rules (points)
    gift_nifty_signal_threshold: Mapped[float] = mapped_column(Float, default=80.0)  # >= +80 CE, <= -80 PE
    option_selection: Mapped[str] = mapped_column(String(20), default="ITM 3")  # ITM 3

    # Execution Window & Daily Limit (09:15:00 inclusive - 09:17:00 exclusive IST)
    entry_window_start: Mapped[str] = mapped_column(String(10), default="09:15:00")
    entry_window_end: Mapped[str] = mapped_column(String(10), default="09:17:00")
    max_trades_per_day: Mapped[int] = mapped_column(Integer, default=1)
    last_trade_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # YYYY-MM-DD
    trades_executed_today: Mapped[int] = mapped_column(Integer, default=0)

    # Capital-Based Risk Management (4% SL / 5% Target of total strategy capital)
    total_capital: Mapped[float] = mapped_column(Float, default=200000.0)
    stoploss_capital_pct: Mapped[float] = mapped_column(Float, default=4.0)  # 4% of strategy capital
    target_capital_pct: Mapped[float] = mapped_column(Float, default=5.0)  # 5% of strategy capital

    # Order Lot Configuration (validated from Upstox contract metadata)
    lot_size: Mapped[int] = mapped_column(Integer, default=65)
    lots: Mapped[int] = mapped_column(Integer, default=1)

    # Safeguards
    product: Mapped[str] = mapped_column(String(10), default="I")  # Intraday (MIS / I)
    is_kill_switch_active: Mapped[bool] = mapped_column(Boolean, default=False)

    # Live Safety Telemetry & Alerts
    critical_alert: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    orphan_positions_json: Mapped[Optional[str]] = mapped_column(String(4000), nullable=True)
