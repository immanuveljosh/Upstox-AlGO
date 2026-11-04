import sys
import os
sys.path.insert(0, os.path.abspath("."))

import pytest
import asyncio
from datetime import time
from backend.app.services.strategy_service import strategy_service
from backend.app.core.database import AsyncSessionLocal
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService


def test_strike_selection_3rd_itm():
    """Verify exact 3rd ITM strike selection calculation."""
    # Test case 1: Spot = 24,878.50 -> ATM = 24,900
    spot = 24878.50
    ce_strike = strategy_service.calculate_itm3_strike(spot, "CE")
    pe_strike = strategy_service.calculate_itm3_strike(spot, "PE")
    assert ce_strike == 24750, f"Expected 24750 for 3rd ITM CE, got {ce_strike}"
    assert pe_strike == 25050, f"Expected 25050 for 3rd ITM PE, got {pe_strike}"

    # Test case 2: Spot = 24,820.00 -> ATM = 24,800
    spot2 = 24820.00
    ce_strike2 = strategy_service.calculate_itm3_strike(spot2, "CE")
    pe_strike2 = strategy_service.calculate_itm3_strike(spot2, "PE")
    assert ce_strike2 == 24650, f"Expected 24650 for 3rd ITM CE, got {ce_strike2}"
    assert pe_strike2 == 24950, f"Expected 24950 for 3rd ITM PE, got {pe_strike2}"

    # Test case 3: Spot = 25,000.00 -> ATM = 25,000
    spot3 = 25000.00
    ce_strike3 = strategy_service.calculate_itm3_strike(spot3, "CE")
    pe_strike3 = strategy_service.calculate_itm3_strike(spot3, "PE")
    assert ce_strike3 == 24850, f"Expected 24850 for 3rd ITM CE, got {ce_strike3}"
    assert pe_strike3 == 25150, f"Expected 25150 for 3rd ITM PE, got {pe_strike3}"


def test_trading_window_restriction():
    """Verify entry window is strictly 09:15:00 inclusive and 09:17:00 exclusive."""
    # 09:14:59 (Pre-market)
    in_w, msg = strategy_service.is_within_trading_window(time(9, 14, 59))
    assert not in_w, "09:14:59 must be outside trading window"

    # 09:15:00 (Window Open - Inclusive)
    in_w, msg = strategy_service.is_within_trading_window(time(9, 15, 0))
    assert in_w, "09:15:00 must be inside trading window"

    # 09:16:30 (Window Open)
    in_w, msg = strategy_service.is_within_trading_window(time(9, 16, 30))
    assert in_w, "09:16:30 must be inside trading window"

    # 09:17:00 (Window Closed - Exclusive)
    in_w, msg = strategy_service.is_within_trading_window(time(9, 17, 0))
    assert not in_w, "09:17:00 must be outside trading window (exclusive)"

    # 09:17:01 (Window Closed)
    in_w, msg = strategy_service.is_within_trading_window(time(9, 17, 1))
    assert not in_w, "09:17:01 must be outside trading window"

    # 10:00:00 (Window Closed)
    in_w, msg = strategy_service.is_within_trading_window(time(10, 0, 0))
    assert not in_w, "10:00:00 must be outside trading window"


async def async_test_directional_signals():
    """Verify Bullish (+80), Bearish (-80), and No-Trade (-80 to +80) signals."""
    async with AsyncSessionLocal() as session:
        # 1. Bullish Signal: >= +80.0
        res_bullish = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=80.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data = res_bullish["data"]
        assert data["signal"] == "BUY_CALL", f"Expected BUY_CALL, got {data['signal']}"
        assert data["selected_option_type"] == "CE"
        assert data["selected_option_strike"] == 24750  # 3rd ITM Call

        # 2. Bullish Signal higher than threshold
        res_bullish2 = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=125.0,
            current_time=time(9, 16, 0),
            spot_price=24878.50,
        )
        assert res_bullish2["data"]["signal"] == "BUY_CALL"
        assert res_bullish2["data"]["selected_option_type"] == "CE"

        # 3. Bearish Signal: <= -80.0
        res_bearish = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-80.0,
            current_time=time(9, 15, 30),
            spot_price=24878.50,
        )
        data_b = res_bearish["data"]
        assert data_b["signal"] == "BUY_PUT", f"Expected BUY_PUT, got {data_b['signal']}"
        assert data_b["selected_option_type"] == "PE"
        assert data_b["selected_option_strike"] == 25050  # 3rd ITM Put

        # 4. Bearish Signal lower than threshold
        res_bearish2 = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-110.0,
            current_time=time(9, 16, 15),
            spot_price=24878.50,
        )
        assert res_bearish2["data"]["signal"] == "BUY_PUT"

        # 5. No-Trade Zone: between -80 and +80
        res_neutral1 = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=79.9,
            current_time=time(9, 15, 30),
        )
        assert res_neutral1["data"]["signal"] == "NO_TRADE"
        assert not res_neutral1["data"]["can_trade_now"]

        res_neutral2 = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=-79.9,
            current_time=time(9, 15, 30),
        )
        assert res_neutral2["data"]["signal"] == "NO_TRADE"
        assert not res_neutral2["data"]["can_trade_now"]

        res_neutral3 = await strategy_service.evaluate_signal(
            db=session,
            gift_nifty_change=0.0,
            current_time=time(9, 15, 30),
        )
        assert res_neutral3["data"]["signal"] == "NO_TRADE"
        assert not res_neutral3["data"]["can_trade_now"]


async def async_test_capital_management_and_limits():
    """Verify Capital-based Stop Loss (5%) and Target Profit (6%)."""
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        capital = config.total_capital  # 200,000
        sl_pct = config.stoploss_capital_pct  # 5%
        tgt_pct = config.target_capital_pct  # 6%

        sl_amount = capital * (sl_pct / 100.0)
        tgt_amount = capital * (tgt_pct / 100.0)

        assert sl_amount == 10000.0, f"Expected SL amount 10000, got {sl_amount}"
        assert tgt_amount == 12000.0, f"Expected Target amount 12000, got {tgt_amount}"

        # Option point equivalent for 2 lots (50 qty)
        qty = config.lots * config.lot_size
        sl_points = sl_amount / qty
        tgt_points = tgt_amount / qty
        assert sl_points == 200.0, f"Expected SL points 200, got {sl_points}"
        assert tgt_points == 240.0, f"Expected Target points 240, got {tgt_points}"


async def async_test_backtest_runner():
    """Verify historical backtest execution against candles."""
    async with AsyncSessionLocal() as session:
        bt_res = await strategy_service.run_backtest(
            db=session,
            from_date="2026-01-01",
            to_date="2026-11-03",
            capital=200000.0,
            lots=2,
        )
        assert bt_res["connection_status"] == "connected"
        data = bt_res["data"]
        assert data["strategy_id"] == "strat-gift-nifty-dir"
        assert data["status"] in ["SUCCESS", "DATA UNAVAILABLE"]
        if data["status"] == "SUCCESS":
            assert data["total_trading_days"] > 0
            assert data["total_trades"] + data["no_trade_days"] == data["total_trading_days"]
            assert data["win_rate_pct"] >= 0.0
            assert "profit_factor" in data
            assert "max_drawdown_pct" in data


async def async_test_paper_trading_execution_and_daily_limit():
    """Verify paper trading order execution and daily 1-trade limit enforcement."""
    order_service = OrderService()
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        config.mode = "PAPER"
        config.trades_executed_today = 0
        await session.commit()

        # 1. Place 1st paper directional order -> Should succeed
        res = await order_service.place_directional_order(
            db=session,
            option_type="CE",
            lots=2,
            order_type="MARKET",
        )
        assert res["connection_status"] == "connected"
        assert res["data"]["mode"] == "PAPER"
        assert res["data"]["moneyness"] == "ITM 3"
        assert res["data"]["strike"] == 24750

        # Check daily trade limit was incremented
        config_after = await broker_service.get_or_create_config(session)
        assert config_after.trades_executed_today >= 1

        # 2. Attempt 2nd trade on the same day -> Must raise RiskLimitBreachedException
        from backend.app.core.exceptions import RiskLimitBreachedException
        exception_raised = False
        try:
            await order_service.place_directional_order(
                db=session,
                option_type="PE",
                lots=2,
                order_type="MARKET",
            )
        except RiskLimitBreachedException as e:
            exception_raised = True
            assert "Maximum daily limit reached" in str(e)

        assert exception_raised, "Expected 2nd trade on same day to be blocked by daily trade limit"

        # Reset daily trade counter for clean testing state
        config_after.trades_executed_today = 0
        await session.commit()


def test_main():
    test_strike_selection_3rd_itm()
    test_trading_window_restriction()
    asyncio.run(async_test_directional_signals())
    asyncio.run(async_test_capital_management_and_limits())
    asyncio.run(async_test_paper_trading_execution_and_daily_limit())
    asyncio.run(async_test_backtest_runner())
    print("ALL TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_main()
