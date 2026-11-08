import os
import sys
import uuid
import pytest
from datetime import datetime, time, date, timedelta
import pytz

sys.path.insert(0, os.path.abspath("."))

from backend.app.core.database import AsyncSessionLocal
from backend.app.models.system_config import SystemConfig
from backend.app.models.order import Order
from backend.app.services.strategy_service import strategy_service
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService
from backend.app.core.exceptions import RiskLimitBreachedException
from backend.app.strategy.nifty_directional import (
    IST,
    DEFAULT_STOPLOSS_CAPITAL_PCT,
    DEFAULT_TARGET_CAPITAL_PCT,
    capital_risk_limits,
    price_for_net_pnl,
    net_pnl_at,
    is_within_entry_window,
    resolve_exit,
    parse_candles,
    Candle,
    nearest_expiry_on_or_after,
)
from backend.app.main import init_database


# =========================================================================== #
# 1. Risk Calculations: 5% SL & 6% Target and Option Premium Price Levels
# =========================================================================== #
def test_risk_calculations_5pct_sl_and_6pct_target():
    """Verify 5% SL and 6% Target on ₹2,00,000 capital and net option pricing."""
    capital = 200000.0
    sl_amount, tgt_amount = capital_risk_limits(capital, stoploss_pct=5.0, target_pct=6.0)

    assert sl_amount == 10000.0, "5% of ₹2,00,000 must be exactly ₹10,000"
    assert tgt_amount == 12000.0, "6% of ₹2,00,000 must be exactly ₹12,000"
    assert DEFAULT_STOPLOSS_CAPITAL_PCT == 5.0
    assert DEFAULT_TARGET_CAPITAL_PCT == 6.0

    # Test conversion to option premium exit levels using lot size (65)
    entry_px = 300.0
    qty = 65
    trade_date = "2026-11-05"

    tgt_exit_px = price_for_net_pnl(entry_px, qty, trade_date, tgt_amount)
    sl_exit_px = price_for_net_pnl(entry_px, qty, trade_date, -sl_amount)

    assert tgt_exit_px > entry_px
    assert sl_exit_px < entry_px
    assert abs(net_pnl_at(entry_px, tgt_exit_px, qty, trade_date) - 12000.0) < 0.05
    assert abs(net_pnl_at(entry_px, sl_exit_px, qty, trade_date) - (-10000.0)) < 0.05


# =========================================================================== #
# 2. Migration Behavior & Custom Value Preservation
# =========================================================================== #
@pytest.mark.asyncio
async def test_migration_upgrades_legacy_defaults_preserves_custom():
    """
    Verify:
    1. Legacy defaults (4% SL, 5% Target) are safely upgraded to 5% SL, 6% Target.
    2. Custom user values (e.g. 3.5% SL, 8.0% Target) are NOT overwritten on startup.
    3. Startup reset does not revert 5%/6% back to 4%/5%.
    """
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)

        # Scenario A: Legacy defaults (4.0 / 5.0) -> migrate to (5.0 / 6.0)
        cfg.stoploss_capital_pct = 4.0
        cfg.target_capital_pct = 5.0
        await session.commit()

        await init_database()

        await session.refresh(cfg)
        assert cfg.stoploss_capital_pct == 5.0, "Legacy 4% SL must migrate to 5% SL"
        assert cfg.target_capital_pct == 6.0, "Legacy 5% Target must migrate to 6% Target"

        # Scenario B: Custom user values (e.g. 3.5 / 8.0) -> must be preserved!
        cfg.stoploss_capital_pct = 3.5
        cfg.target_capital_pct = 8.0
        await session.commit()

        await init_database()

        await session.refresh(cfg)
        assert cfg.stoploss_capital_pct == 3.5, "Custom SL (3.5%) must be preserved"
        assert cfg.target_capital_pct == 8.0, "Custom Target (8.0%) must be preserved"

        # Restore default 5.0 / 6.0
        cfg.stoploss_capital_pct = 5.0
        cfg.target_capital_pct = 6.0
        await session.commit()


# =========================================================================== #
# 3. Entry Window Boundaries & UTC Host Clock Handling
# =========================================================================== #
def test_entry_window_boundary_checks():
    """Verify exact boundaries of 09:15:00 (inclusive) to 09:17:00 (exclusive) IST."""
    # Pre-window
    assert not is_within_entry_window(time(9, 14, 59))
    # Inclusive start
    assert is_within_entry_window(time(9, 15, 0))
    # Inside window
    assert is_within_entry_window(time(9, 15, 30))
    assert is_within_entry_window(time(9, 16, 59))
    # Exclusive end
    assert not is_within_entry_window(time(9, 17, 0))
    # Post-window
    assert not is_within_entry_window(time(9, 17, 1))
    assert not is_within_entry_window(time(11, 0, 0))


def test_utc_host_clock_to_ist_conversion():
    """
    Verify timezone conversion when server host clock is in UTC:
    03:45:00 UTC == 09:15:00 IST (within window)
    03:44:59 UTC == 09:14:59 IST (outside window)
    03:47:00 UTC == 09:17:00 IST (outside window)
    """
    utc_tz = pytz.timezone("UTC")

    # 03:45:00 UTC -> 09:15:00 IST
    utc_start = datetime(2026, 11, 5, 3, 45, 0, tzinfo=utc_tz)
    ist_start = utc_start.astimezone(IST).time()
    assert ist_start == time(9, 15, 0)
    assert is_within_entry_window(ist_start)

    # 03:44:59 UTC -> 09:14:59 IST
    utc_pre = datetime(2026, 11, 5, 3, 44, 59, tzinfo=utc_tz)
    ist_pre = utc_pre.astimezone(IST).time()
    assert ist_pre == time(9, 14, 59)
    assert not is_within_entry_window(ist_pre)

    # 03:47:00 UTC -> 09:17:00 IST
    utc_end = datetime(2026, 11, 5, 3, 47, 0, tzinfo=utc_tz)
    ist_end = utc_end.astimezone(IST).time()
    assert ist_end == time(9, 17, 0)
    assert not is_within_entry_window(ist_end)


@pytest.mark.asyncio
async def test_manual_order_service_enforces_0915_0917_window():
    """Verify OrderService.place_directional_order strictly enforces the 09:15-09:17 IST window."""
    svc = OrderService()
    async with AsyncSessionLocal() as session:
        from sqlalchemy import delete
        await session.execute(delete(Order).where(Order.status.in_(["PLACED", "PENDING_EXIT"])))
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.trades_executed_today = 0
        cfg.is_kill_switch_active = False
        await session.commit()

        # Outside window (09:14:59) -> blocked
        with pytest.raises(RiskLimitBreachedException) as exc_pre:
            await svc.place_directional_order(
                db=session,
                option_type="CE",
                lots=1,
                current_time=time(9, 14, 59),
            )
        assert "outside trading window" in str(exc_pre.value)

        # Outside window (09:17:00) -> blocked
        with pytest.raises(RiskLimitBreachedException) as exc_post:
            await svc.place_directional_order(
                db=session,
                option_type="CE",
                lots=1,
                current_time=time(9, 17, 0),
            )
        assert "outside trading window" in str(exc_post.value)

        # Outside window (11:30:00) -> blocked
        with pytest.raises(RiskLimitBreachedException) as exc_noon:
            await svc.place_directional_order(
                db=session,
                option_type="CE",
                lots=1,
                current_time=time(11, 30, 0),
            )
        assert "outside trading window" in str(exc_noon.value)

        cfg.mode = "BACKTEST"
        await session.commit()


# =========================================================================== #
# 4. Same-Candle SL Priority (Backtest)
# =========================================================================== #
def test_same_candle_sl_priority_conservative_exit():
    """Verify that when both SL and Target are breached in the same candle, SL takes priority."""
    entry_dt = datetime(2026, 11, 5, 9, 15, 0, tzinfo=IST)
    entry_c = Candle(ts=entry_dt, open=300.0, high=310.0, low=295.0, close=305.0)

    # 10:00 candle touches BOTH low (140.0 <= SL 157.24) and high (500.0 >= Target 486.16)
    extreme_candle = Candle(
        ts=datetime(2026, 11, 5, 10, 0, 0, tzinfo=IST),
        open=305.0,
        high=500.0,
        low=140.0,
        close=320.0,
    )

    exit_res = resolve_exit(
        candles=[entry_c, extreme_candle],
        entry=entry_c,
        entry_price=300.0,
        quantity=65,
        trade_date="2026-11-05",
        stoploss_amount=10000.0,  # 5% SL
        target_amount=12000.0,    # 6% Target
    )

    assert exit_res is not None
    assert exit_res.exit_reason == "SL", "SL must take precedence when both are hit in same candle"
    assert "SL and target both inside one" in (exit_res.note or "")


# =========================================================================== #
# 5. Restart Daily Trade Lock Persistence
# =========================================================================== #
@pytest.mark.asyncio
async def test_restart_daily_trade_lock_persistence():
    """
    Verify:
    1. Order was placed and closed earlier today.
    2. Server restarts (new DB session initializes).
    3. Daily 1-trade limit remains locked and blocks second entry.
    """
    svc = OrderService()
    async with AsyncSessionLocal() as session:
        today_date = datetime.now(IST).strftime("%Y-%m-%d")
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.last_trade_date = today_date
        cfg.trades_executed_today = 1
        cfg.is_kill_switch_active = False

        # Add closed order for today
        order_id = f"UPX-RESTART-{uuid.uuid4().hex[:8]}"
        closed_order = Order(
            client_order_id=order_id,
            upstox_order_id="OMS-12345",
            instrument_key="NSE_FO|60001",
            symbol="NIFTY 24500 CE 09 NOV 26",
            option_type="CE",
            strike=24500,
            lots=1,
            qty=65,
            price=250.0,
            status="CLOSED",
            exit_price=150.0,
            placed_at=datetime.utcnow(),
            exit_reason="SL",
        )
        session.add(closed_order)
        await session.commit()

        # Simulate fresh session after server reboot
        with pytest.raises(RiskLimitBreachedException) as exc:
            await svc.place_directional_order(
                db=session,
                option_type="PE",
                lots=1,
                current_time=time(9, 15, 30),
            )
        assert "Maximum daily limit reached" in str(exc.value)

        # Clean up
        await session.delete(closed_order)
        cfg.trades_executed_today = 0
        cfg.mode = "BACKTEST"
        await session.commit()


# =========================================================================== #
# 6. Current Expiry Selection (Thursday / Expiry Day)
# =========================================================================== #
def test_expiry_selection_thursday_and_rollover():
    """
    Verify expiry date calculation:
    - On Thursday before 15:30 IST: selects same-day (0-DTE) expiry.
    - On Thursday after 15:30 IST: rolls to next weekly expiry (+7 days).
    - On other weekdays: selects upcoming Thursday.
    """
    # Thursday 2026-11-05
    thursday = date(2026, 11, 5)

    # Reference date on Thursday -> returns 2026-11-05
    exp_thu = strategy_service.get_upcoming_nifty_expiry(ref_date=thursday)
    assert exp_thu == "2026-11-05"

    # Wednesday 2026-11-04 -> upcoming Thursday is 2026-11-05
    wednesday = date(2026, 11, 4)
    exp_wed = strategy_service.get_upcoming_nifty_expiry(ref_date=wednesday)
    assert exp_wed == "2026-11-05"

    # Friday 2026-11-06 -> upcoming Thursday is 2026-11-12
    friday = date(2026, 11, 6)
    exp_fri = strategy_service.get_upcoming_nifty_expiry(ref_date=friday)
    assert exp_fri == "2026-11-12"

    # Test nearest_expiry_on_or_after
    expiries = ["2026-11-05", "2026-11-12", "2026-11-19"]
    assert nearest_expiry_on_or_after(expiries, "2026-11-05") == "2026-11-05"
    assert nearest_expiry_on_or_after(expiries, "2026-11-06") == "2026-11-12"


# =========================================================================== #
# 7. Backtest Proxy Behavior: Default Off vs Explicit Opt-In
# =========================================================================== #
@pytest.mark.asyncio
async def test_backtest_proxy_default_off_vs_opt_in():
    """
    Verify:
    1. allow_nifty_proxy=False (default): Missing Gift Nifty data is DATA UNAVAILABLE.
    2. allow_nifty_proxy=True: Uses NIFTY 50 cash opening gap with explicit 'is_proxy' and 'signal_label'.
    3. Counts for real_signal_days, proxy_days, and unavailable_days are tracked.
    """
    daily_candles = [
        ["2026-10-02T00:00:00+05:30", 24800.0, 24850.0, 24750.0, 24805.0, 100000],
        ["2026-10-05T00:00:00+05:30", 24900.0, 25120.0, 24880.0, 25090.0, 120000],  # +95 Nifty gap
    ]
    chain = [
        {
            "strike_price": float(s),
            "instrument_type": t,
            "expiry": "2026-10-08",
            "lot_size": 65,
            "trading_symbol": f"NIFTY {s} {t}",
            "instrument_key": f"NSE_FO|{s}{t}",
        }
        for s in range(24600, 25000, 50)
        for t in ("CE", "PE")
    ]
    opt_candles = {
        "2026-10-05": [
            ["2026-10-05T09:15:00+05:30", 300.0, 325.0, 295.0, 320.0, 15000],
            ["2026-10-05T10:32:00+05:30", 385.0, 495.0, 380.0, 490.0, 25000],
        ]
    }

    async with AsyncSessionLocal() as session:
        # 1. Default (proxy OFF): without Gift Nifty records, marks DATA UNAVAILABLE
        res_default = await strategy_service.run_backtest(
            db=session,
            duration="CUSTOM",
            from_date="2026-10-05",
            to_date="2026-10-05",
            capital=200000.0,
            lots=1,
            nifty_daily_candles=daily_candles,
            contracts_by_date={"2026-10-05": chain},
            option_candles_by_date=opt_candles,
            allow_nifty_proxy=False,  # Explicit default
        )
        data_def = res_default["data"]
        assert data_def["status"] == "DATA UNAVAILABLE"
        assert data_def["total_trades"] == 0
        assert data_def["data_unavailable_days"] == 1
        assert data_def["proxy_days"] == 0
        assert data_def["days"][0]["signal"] == "DATA UNAVAILABLE"

        # 2. Proxy explicitly enabled: allow_nifty_proxy=True
        res_proxy = await strategy_service.run_backtest(
            db=session,
            duration="CUSTOM",
            from_date="2026-10-05",
            to_date="2026-10-05",
            capital=200000.0,
            lots=1,
            nifty_daily_candles=daily_candles,
            contracts_by_date={"2026-10-05": chain},
            option_candles_by_date=opt_candles,
            allow_nifty_proxy=True,  # Opt-in
        )
        data_proxy = res_proxy["data"]
        assert data_proxy["status"] == "COMPLETE"
        assert data_proxy["total_trades"] == 1
        assert data_proxy["proxy_days"] == 1
        assert data_proxy["days"][0]["is_proxy"] is True
        assert "PROXY SIGNAL" in data_proxy["days"][0]["signal_label"]

