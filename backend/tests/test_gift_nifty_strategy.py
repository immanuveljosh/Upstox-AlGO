import sys
import os
sys.path.insert(0, os.path.abspath("."))

import pytest
from datetime import time, datetime, timezone, timedelta

from backend.app.services.strategy_service import strategy_service
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService
from backend.app.models.order import Order
from sqlalchemy import select
from backend.app.core.database import AsyncSessionLocal
from backend.app.core.exceptions import RiskLimitBreachedException, ModeRestrictionException
from backend.app.strategy.nifty_directional import (
    IST,
    STRATEGY_NAME,
    SIGNAL_CALL,
    SIGNAL_PUT,
    SIGNAL_NO_TRADE,
    classify_signal,
    select_itm_strike,
    capital_risk_limits,
    calculate_option_charges,
    parse_candles,
    entry_candle,
    resolve_exit,
)





# --------------------------------------------------------------------------- #
# 1. Entry Signal Logic (Inclusive thresholds: >= +80 CALL, <= -80 PUT)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_signal_positive_80_call():
    assert classify_signal(80.0) == SIGNAL_CALL
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=80.0,
            current_time=time(9, 15, 30),
            spot_price=24900.0,
        )
        data = res["data"]
        assert data["signal"] == "BUY_CALL"
        assert data["signal_display"] == "CALL"
        assert data["selected_option_type"] == "CE"
        assert data["selected_option_strike"] == 24750


@pytest.mark.asyncio
async def test_signal_positive_100_call():
    assert classify_signal(100.0) == SIGNAL_CALL
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=100.0,
            current_time=time(9, 15, 30),
            spot_price=24900.0,
        )
        data = res["data"]
        assert data["signal"] == "BUY_CALL"
        assert data["signal_display"] == "CALL"
        assert data["selected_option_type"] == "CE"


@pytest.mark.asyncio
async def test_signal_negative_80_put():
    assert classify_signal(-80.0) == SIGNAL_PUT
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-80.0,
            current_time=time(9, 15, 30),
            spot_price=24900.0,
        )
        data = res["data"]
        assert data["signal"] == "BUY_PUT"
        assert data["signal_display"] == "PUT"
        assert data["selected_option_type"] == "PE"
        assert data["selected_option_strike"] == 25050


@pytest.mark.asyncio
async def test_signal_negative_100_put():
    assert classify_signal(-100.0) == SIGNAL_PUT
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-100.0,
            current_time=time(9, 15, 30),
            spot_price=24900.0,
        )
        data = res["data"]
        assert data["signal"] == "BUY_PUT"
        assert data["signal_display"] == "PUT"
        assert data["selected_option_type"] == "PE"


@pytest.mark.asyncio
async def test_signal_positive_79_no_trade():
    assert classify_signal(79.0) == SIGNAL_NO_TRADE
    assert classify_signal(79.99) == SIGNAL_NO_TRADE
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=79.0,
            current_time=time(9, 15, 30),
        )
        data = res["data"]
        assert data["signal"] == "NO_TRADE"
        assert data["signal_display"] == "NO TRADE"
        assert not data["can_trade_now"]


@pytest.mark.asyncio
async def test_signal_negative_79_no_trade():
    assert classify_signal(-79.0) == SIGNAL_NO_TRADE
    assert classify_signal(-79.99) == SIGNAL_NO_TRADE
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-79.0,
            current_time=time(9, 15, 30),
        )
        data = res["data"]
        assert data["signal"] == "NO_TRADE"
        assert data["signal_display"] == "NO TRADE"
        assert not data["can_trade_now"]


# --------------------------------------------------------------------------- #
# 2. Trading Window Tests (09:15:00 inclusive – 09:17:00 exclusive IST)
# --------------------------------------------------------------------------- #
def test_trading_window_outside_block():
    in_w_pre, _ = strategy_service.is_within_trading_window(time(9, 14, 59))
    assert not in_w_pre, "09:14:59 must be blocked (pre-window)"

    in_w_post, _ = strategy_service.is_within_trading_window(time(10, 0, 0))
    assert not in_w_post, "10:00:00 must be blocked (post-window)"


def test_trading_window_0915_inclusive_allow():
    in_w, _ = strategy_service.is_within_trading_window(time(9, 15, 0))
    assert in_w, "09:15:00 must be allowed (inclusive window start)"


def test_trading_window_0916_allow():
    in_w, _ = strategy_service.is_within_trading_window(time(9, 16, 59))
    assert in_w, "09:16:59 must be allowed (inside window)"


def test_trading_window_0917_exclusive_block():
    in_w_exact, _ = strategy_service.is_within_trading_window(time(9, 17, 0))
    assert not in_w_exact, "09:17:00 must be blocked (exclusive window end)"

    in_w_after, _ = strategy_service.is_within_trading_window(time(9, 17, 1))
    assert not in_w_after, "09:17:01 must be blocked"


# --------------------------------------------------------------------------- #
# 3. Max 1 Trade Per Day & Daily Rollover
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_second_trade_same_day_block():
    order_svc = OrderService()
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.trades_executed_today = 1
        cfg.last_trade_date = datetime.now(IST).strftime("%Y-%m-%d")
        cfg.is_kill_switch_active = False
        await session.commit()

        blocked = False
        try:
            await order_svc.place_directional_order(session, "PE", lots=1)
        except RiskLimitBreachedException as err:
            blocked = True
            assert "Maximum daily limit reached" in str(err)
        assert blocked, "Second trade on same day must be blocked"

        cfg.trades_executed_today = 0
        cfg.mode = "BACKTEST"
        await session.commit()


@pytest.mark.asyncio
async def test_new_trading_day_reset():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.last_trade_date = "2026-10-01"
        cfg.trades_executed_today = 1
        await session.commit()

        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=85.0,
            current_time=time(9, 15, 30),
            spot_price=24900.0,
        )
        assert res["data"]["daily_trade_count"] == 0

        cfg_refreshed = await broker_service.get_or_create_config(session)
        assert cfg_refreshed.trades_executed_today == 0


# --------------------------------------------------------------------------- #
# 4. Dynamic ITM 3 Option Selection from Option Chain
# --------------------------------------------------------------------------- #
def test_itm3_ce_selection_from_chain():
    chain_strikes = [24500 + i * 50 for i in range(15)]
    # Spot = 24878.50 -> ATM in chain = 24900 -> 3rd ITM CE = 24750
    ce_strike = select_itm_strike(chain_strikes, 24878.50, "CE", depth=3)
    assert ce_strike == 24750
    assert strategy_service.calculate_itm3_strike(24878.50, "CE", chain_strikes) == 24750
    assert strategy_service.calculate_itm3_strike(25010.0, "CE") == 24850


def test_itm3_pe_selection_from_chain():
    chain_strikes = [24500 + i * 50 for i in range(15)]
    # Spot = 24878.50 -> ATM in chain = 24900 -> 3rd ITM PE = 25050
    pe_strike = select_itm_strike(chain_strikes, 24878.50, "PE", depth=3)
    assert pe_strike == 25050
    assert strategy_service.calculate_itm3_strike(24878.50, "PE", chain_strikes) == 25050
    assert strategy_service.calculate_itm3_strike(25010.0, "PE") == 25150


# --------------------------------------------------------------------------- #
# 5. Lot Size & Quantity Validation
# --------------------------------------------------------------------------- #
def test_quantity_1_lot_validated_lot_size():
    calc_1 = strategy_service.calculate_and_validate_quantity(lots=1, lot_size=65)
    assert calc_1["is_valid"]
    assert calc_1["total_quantity"] == 65
    assert calc_1["lots"] == 1
    assert calc_1["lot_size"] == 65

    calc_2 = strategy_service.calculate_and_validate_quantity(lots=2, lot_size=65)
    assert calc_2["is_valid"]
    assert calc_2["total_quantity"] == 130

    calc_invalid = strategy_service.calculate_and_validate_quantity(
        lots=1, lot_size=65, raw_quantity=70
    )
    assert not calc_invalid["is_valid"]


# --------------------------------------------------------------------------- #
# 6. Capital-Based Risk Management (Stop Loss = 4%, Target = 5%)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_capital_sl_4pct_and_target_5pct():
    sl_amt, tgt_amt = capital_risk_limits(200000.0, stoploss_pct=4.0, target_pct=5.0)
    assert sl_amt == 8000.0   # 4% of ₹2,00,000 = ₹8,000
    assert tgt_amt == 10000.0  # 5% of ₹2,00,000 = ₹10,000

    async with AsyncSessionLocal() as session:
        cfg_res = await strategy_service.get_strategy_config(session)
        data = cfg_res["data"]
        assert data["name"] == STRATEGY_NAME
        assert data["stoploss_capital_pct"] == 4.0
        assert data["target_capital_pct"] == 5.0
        assert data["stoploss_amount"] == 8000.0
        assert data["target_amount"] == 10000.0


# --------------------------------------------------------------------------- #
# 7. Live Trading Safety: No Fake Fills & Backtest Mode Order Block
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_backtest_mode_never_places_live_orders():
    order_svc = OrderService()
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "BACKTEST"
        cfg.trades_executed_today = 0
        cfg.is_kill_switch_active = False
        await session.commit()

        with pytest.raises(ModeRestrictionException):
            await order_svc.place_directional_order(
                db=session,
                option_type="CE",
                lots=1,
                order_type="MARKET",
            )


@pytest.mark.asyncio
async def test_failed_order_no_false_filled_status():
    order_svc = OrderService()
    async with AsyncSessionLocal() as session:
        # Clear any prior open test orders
        stmt = select(Order).where(Order.status == "PLACED")
        for ord_item in (await session.execute(stmt)).scalars().all():
            ord_item.status = "CLOSED"
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.trades_executed_today = 0
        await session.commit()

        res = await order_svc.place_directional_order(
            db=session,
            option_type="CE",
            lots=1,
            order_type="MARKET",
        )
        if res.get("data"):
            order_status = res["data"].get("status")
            assert order_status in ["REJECTED", "PLACED"]
            assert order_status != "FILLED"
        else:
            assert res.get("connection_status") == "connection_lost"

        cfg.mode = "BACKTEST"
        await session.commit()


@pytest.mark.asyncio
async def test_duplicate_signal_no_duplicate_order():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.trades_executed_today = 1
        cfg.strategy_status = "RUNNING"
        await session.commit()

        tick_res = await strategy_service.run_monitoring_tick(
            db=session,
            override_time=time(9, 15, 30),
            override_change=95.0,
        )
        actions = tick_res["data"]["actions_taken"]
        executed = any("Auto-executed" in a for a in actions)
        assert not executed, "Duplicate signal must NOT place duplicate order"

        cfg.trades_executed_today = 0
        cfg.strategy_status = "STOPPED"
        await session.commit()
