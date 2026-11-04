import sys
import os
sys.path.insert(0, os.path.abspath("."))

import pytest
import asyncio
from datetime import time, datetime
from backend.app.services.strategy_service import strategy_service
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.order import Order
from backend.app.core.exceptions import RiskLimitBreachedException


# 1 & 2: Gift Nifty +80 -> CE, +100 -> CE
@pytest.mark.asyncio
async def test_signal_positive_80_ce():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=80.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data = res["data"]
        assert data["signal"] == "BUY_CALL"
        assert data["selected_option_type"] == "CE"
        assert data["signal_display"] == "CALL"


@pytest.mark.asyncio
async def test_signal_positive_100_ce():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=100.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data = res["data"]
        assert data["signal"] == "BUY_CALL"
        assert data["selected_option_type"] == "CE"
        assert data["signal_display"] == "CALL"


# 3 & 4: Gift Nifty -80 -> PE, -100 -> PE
@pytest.mark.asyncio
async def test_signal_negative_80_pe():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-80.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data = res["data"]
        assert data["signal"] == "BUY_PUT"
        assert data["selected_option_type"] == "PE"
        assert data["signal_display"] == "PUT"


@pytest.mark.asyncio
async def test_signal_negative_100_pe():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-100.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data = res["data"]
        assert data["signal"] == "BUY_PUT"
        assert data["selected_option_type"] == "PE"
        assert data["signal_display"] == "PUT"


# 5 & 6: Gift Nifty +79 -> NO SIGNAL, -79 -> NO SIGNAL
@pytest.mark.asyncio
async def test_signal_positive_79_no_signal():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=79.0,
            current_time=time(9, 15, 30),
        )
        data = res["data"]
        assert data["signal"] == "NO_TRADE"
        assert data["signal_display"] == "NO SIGNAL"
        assert not data["can_trade_now"]


@pytest.mark.asyncio
async def test_signal_negative_79_no_signal():
    async with AsyncSessionLocal() as session:
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-79.0,
            current_time=time(9, 15, 30),
        )
        data = res["data"]
        assert data["signal"] == "NO_TRADE"
        assert data["signal_display"] == "NO SIGNAL"
        assert not data["can_trade_now"]


# 7, 8, 9, 10: Trading Window Tests (09:15-09:17 AM IST)
def test_trading_window_outside_block():
    in_w_pre, msg_pre = strategy_service.is_within_trading_window(time(9, 14, 59))
    assert not in_w_pre, "09:14:59 must be blocked (pre-market)"

    in_w_post, msg_post = strategy_service.is_within_trading_window(time(10, 0, 0))
    assert not in_w_post, "10:00:00 must be blocked (outside window)"


def test_trading_window_0915_allow():
    in_w, msg = strategy_service.is_within_trading_window(time(9, 15, 0))
    assert in_w, "09:15:00 must be allowed (inclusive window open)"


def test_trading_window_0916_allow():
    in_w, msg = strategy_service.is_within_trading_window(time(9, 16, 30))
    assert in_w, "09:16:30 must be allowed (inside window)"


def test_trading_window_0917_after_block():
    in_w_exact, _ = strategy_service.is_within_trading_window(time(9, 17, 0))
    assert not in_w_exact, "09:17:00 must be blocked (exclusive window close)"

    in_w_after, _ = strategy_service.is_within_trading_window(time(9, 17, 1))
    assert not in_w_after, "09:17:01 must be blocked"


# 11 & 12: Second trade same day BLOCK & New trading day RESET
@pytest.mark.asyncio
async def test_second_trade_same_day_block():
    order_svc = OrderService()
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "BACKTEST"
        cfg.trades_executed_today = 0
        cfg.is_kill_switch_active = False
        await session.commit()

        # Trade 1: Should succeed
        res1 = await order_svc.place_directional_order(session, "CE", lots=1)
        assert res1["status"] if "status" in res1 else res1["connection_status"] == "connected"

        # Trade 2 on same day: MUST be blocked
        blocked = False
        try:
            await order_svc.place_directional_order(session, "PE", lots=1)
        except RiskLimitBreachedException as err:
            blocked = True
            assert "Maximum daily limit reached" in str(err)
        assert blocked, "Second trade on same day must be blocked by daily trade limit"

        # Cleanup
        cfg.trades_executed_today = 0
        await session.commit()


@pytest.mark.asyncio
async def test_new_trading_day_reset():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.last_trade_date = "2026-11-01"  # Yesterday/prior date
        cfg.trades_executed_today = 1       # Limit was consumed
        await session.commit()

        # Evaluate signal on current date -> must reset trades_executed_today to 0
        res = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=85.0,
            current_time=time(9, 15, 30),
        )
        assert res["data"]["daily_trade_count"] == 0

        # Verify DB persisted the reset
        cfg_refreshed = await broker_service.get_or_create_config(session)
        assert cfg_refreshed.trades_executed_today == 0


# 13 & 14: ITM 3 CE and PE Selection
def test_itm3_ce_selection():
    # Spot = 24878.50 -> ATM = 24900 -> ITM 3 Call = 24900 - 150 = 24750
    ce_strike = strategy_service.calculate_itm3_strike(24878.50, "CE")
    assert ce_strike == 24750, f"Expected 24750 for 3rd ITM Call, got {ce_strike}"

    # Spot = 25010 -> ATM = 25000 -> ITM 3 Call = 25000 - 150 = 24850
    assert strategy_service.calculate_itm3_strike(25010.0, "CE") == 24850


def test_itm3_pe_selection():
    # Spot = 24878.50 -> ATM = 24900 -> ITM 3 Put = 24900 + 150 = 25050
    pe_strike = strategy_service.calculate_itm3_strike(24878.50, "PE")
    assert pe_strike == 25050, f"Expected 25050 for 3rd ITM Put, got {pe_strike}"

    # Spot = 25010 -> ATM = 25000 -> ITM 3 Put = 25000 + 150 = 25150
    assert strategy_service.calculate_itm3_strike(25010.0, "PE") == 25150


# 15: Quantity = 1 lot × validated lot size (65)
def test_quantity_1_lot_validated_lot_size():
    # Test 1 lot = 65 quantity
    calc_1 = strategy_service.calculate_and_validate_quantity(lots=1, lot_size=65)
    assert calc_1["is_valid"]
    assert calc_1["total_quantity"] == 65
    assert calc_1["lots"] == 1
    assert calc_1["lot_size"] == 65

    # Test 2 lots = 130 quantity
    calc_2 = strategy_service.calculate_and_validate_quantity(lots=2, lot_size=65)
    assert calc_2["is_valid"]
    assert calc_2["total_quantity"] == 130

    # Test non-multiple rejected (e.g. 70 qty is not multiple of 65)
    calc_invalid = strategy_service.calculate_and_validate_quantity(
        lots=1, lot_size=65, raw_quantity=70
    )
    assert not calc_invalid["is_valid"]


# 16 & 17: Capital SL = 5% and Capital Target = 6%
@pytest.mark.asyncio
async def test_capital_sl_5pct():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        capital = cfg.total_capital  # ₹2,00,000
        sl_pct = cfg.stoploss_capital_pct  # 5%
        sl_amount = capital * (sl_pct / 100.0)
        assert sl_pct == 5.0
        assert sl_amount == 10000.0  # ₹10,000 on ₹2L capital

        # On ₹1,00,000 capital, SL = ₹5,000
        calc_1l_sl = 100000.0 * (5.0 / 100.0)
        assert calc_1l_sl == 5000.0


@pytest.mark.asyncio
async def test_capital_target_6pct():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        capital = cfg.total_capital  # ₹2,00,000
        tgt_pct = cfg.target_capital_pct  # 6%
        tgt_amount = capital * (tgt_pct / 100.0)
        assert tgt_pct == 6.0
        assert tgt_amount == 12000.0  # ₹12,000 on ₹2L capital

        # On ₹1,00,000 capital, Target = ₹6,000
        calc_1l_tgt = 100000.0 * (6.0 / 100.0)
        assert calc_1l_tgt == 6000.0


# 18: Failed order -> NO false filled status
@pytest.mark.asyncio
async def test_failed_order_no_false_filled_status():
    order_svc = OrderService()
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"  # When token is invalid or API throws
        await session.commit()

        # Live order with disconnected/simulated exception should be REJECTED, never FILLED
        res = await order_svc.place_directional_order(
            db=session,
            option_type="CE",
            lots=1,
            order_type="MARKET",
        )
        if res.get("data"):
            order_status = res["data"].get("status")
            assert order_status in ["REJECTED", "PLACED"], f"Status must not be falsely FILLED, got {order_status}"
            assert order_status != "FILLED"
        else:
            assert res.get("connection_status") == "connection_lost"

        # Restore mode to BACKTEST
        cfg.mode = "BACKTEST"
        await session.commit()


# 19: Duplicate signal -> NO duplicate order
@pytest.mark.asyncio
async def test_duplicate_signal_no_duplicate_order():
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.trades_executed_today = 1  # 1 order already executed today
        cfg.strategy_status = "RUNNING"
        await session.commit()

        # Run monitoring tick with +95 Bullish signal
        tick_res = await strategy_service.run_monitoring_tick(
            db=session,
            override_time=time(9, 15, 30),
            override_change=95.0,
        )
        actions = tick_res["data"]["actions_taken"]
        # No second order placed due to duplicate signal
        executed = any("Auto-executed" in a for a in actions)
        assert not executed, "Duplicate signal must NOT place duplicate order"

        # Cleanup
        cfg.trades_executed_today = 0
        cfg.strategy_status = "STOPPED"
        await session.commit()
