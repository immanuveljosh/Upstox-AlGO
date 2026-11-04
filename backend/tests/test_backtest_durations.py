import sys
import os
sys.path.insert(0, os.path.abspath("."))

import pytest
from datetime import date

from dateutil.relativedelta import relativedelta
from backend.app.services.strategy_service import strategy_service
from backend.app.core.database import AsyncSessionLocal
from backend.app.strategy.nifty_directional import (
    calculate_option_charges,
    price_for_net_pnl,
    net_pnl_at,
)





def test_backtest_duration_date_calculation():
    """Verify start and end date calculation for 1M, 3M, 6M, 1Y, and Custom Date Range."""
    fixed_end = "2026-11-04"
    end_d = date(2026, 11, 4)

    # 1 Month
    s1, e1, l1, c1 = strategy_service.calculate_duration_dates(duration="1M", to_date=fixed_end)
    assert s1 == (end_d - relativedelta(months=1)).strftime("%Y-%m-%d")
    assert e1 == fixed_end
    assert l1 == "1 Month"
    assert c1 == "1M"

    # 3 Months
    s3, e3, l3, c3 = strategy_service.calculate_duration_dates(duration="3M", to_date=fixed_end)
    assert s3 == (end_d - relativedelta(months=3)).strftime("%Y-%m-%d")
    assert l3 == "3 Months"
    assert c3 == "3M"

    # 6 Months
    s6, e6, l6, c6 = strategy_service.calculate_duration_dates(duration="6M", to_date=fixed_end)
    assert s6 == (end_d - relativedelta(months=6)).strftime("%Y-%m-%d")
    assert l6 == "6 Months"
    assert c6 == "6M"

    # 1 Year
    s1y, e1y, l1y, c1y = strategy_service.calculate_duration_dates(duration="1Y", to_date=fixed_end)
    assert s1y == (end_d - relativedelta(years=1)).strftime("%Y-%m-%d")
    assert l1y == "1 Year"
    assert c1y == "1Y"

    # Custom Date Range
    sc, ec, lc, cc = strategy_service.calculate_duration_dates(
        duration="CUSTOM", from_date="2026-06-01", to_date="2026-09-30"
    )
    assert sc == "2026-06-01"
    assert ec == "2026-09-30"
    assert lc == "Custom Date Range"
    assert cc == "CUSTOM"


def test_charges_and_capital_net_pnl_math():
    """Verify statutory charges calculation and net P&L target/SL price math."""
    charges = calculate_option_charges(300.0, 460.0, 65, "2026-10-15")
    assert charges["brokerage"] == 40.0
    assert charges["stt"] > 0
    assert charges["exchange_txn"] > 0
    assert charges["gst"] > 0
    assert charges["total"] > 40.0

    # Target net P&L = +₹10,000 (5% of ₹2,00,000)
    tgt_px = price_for_net_pnl(300.0, 65, "2026-10-15", 10000.0)
    assert abs(net_pnl_at(300.0, tgt_px, 65, "2026-10-15") - 10000.0) < 0.05

    # Stop loss net P&L = -₹8,000 (-4% of ₹2,00,000)
    sl_px = price_for_net_pnl(300.0, 65, "2026-10-15", -8000.0)
    assert abs(net_pnl_at(300.0, sl_px, 65, "2026-10-15") - (-8000.0)) < 0.05


@pytest.mark.asyncio
async def test_backtest_with_historical_option_candles_sl_target_and_no_trade():
    """
    Verify Nifty Directional backtest with historical candles:
    - Day 1 (2026-10-05): Gift Nifty +95 pts -> CALL (ITM 3 CE = 24750), hits +5% Target (₹10,000) at 10:32 IST
    - Day 2 (2026-10-06): Gift Nifty +45 pts -> NO TRADE
    - Day 3 (2026-10-07): Gift Nifty -90 pts -> PUT (ITM 3 PE = 25050), hits -4% SL (-₹8,000) at 11:05 IST
    """
    daily_candles = [
        ["2026-10-02T00:00:00+05:30", 24800.0, 24850.0, 24750.0, 24805.0, 100000],
        ["2026-10-05T00:00:00+05:30", 24900.0, 25120.0, 24880.0, 25090.0, 120000],  # +95 gap -> CALL
        ["2026-10-06T00:00:00+05:30", 25135.0, 25180.0, 25080.0, 25110.0, 110000],  # +45 gap -> NO TRADE
        ["2026-10-07T00:00:00+05:30", 25020.0, 25180.0, 24950.0, 25140.0, 130000],  # -90 gap -> PUT
    ]

    chain_2026_10_08 = [
        {
            "strike_price": float(s),
            "instrument_type": t,
            "expiry": "2026-10-08",
            "lot_size": 65,
            "trading_symbol": f"NIFTY {s} {t} 08 OCT 26",
            "instrument_key": f"NSE_FO|{s}{t}",
        }
        for s in range(24500, 25400, 50)
        for t in ("CE", "PE")
    ]

    option_candles = {
        "2026-10-05": [
            ["2026-10-05T09:15:00+05:30", 300.0, 325.0, 295.0, 320.0, 15000],
            ["2026-10-05T09:16:00+05:30", 320.0, 390.0, 318.0, 385.0, 18000],
            ["2026-10-05T10:32:00+05:30", 385.0, 470.0, 380.0, 462.0, 25000],  # Crosses +₹10,000 net target
        ],
        "2026-10-07": [
            ["2026-10-07T09:15:00+05:30", 310.0, 315.0, 280.0, 285.0, 14000],
            ["2026-10-07T11:05:00+05:30", 285.0, 286.0, 170.0, 175.0, 22000],  # Crosses -₹8,000 net SL
        ],
    }

    async with AsyncSessionLocal() as session:
        res = await strategy_service.run_backtest(
            db=session,
            duration="CUSTOM",
            from_date="2026-10-05",
            to_date="2026-10-07",
            capital=200000.0,
            lots=1,
            nifty_daily_candles=daily_candles,
            contracts_by_date={
                "2026-10-05": chain_2026_10_08,
                "2026-10-07": chain_2026_10_08,
            },
            option_candles_by_date=option_candles,
        )

        data = res["data"]
        assert data["status"] == "COMPLETE"
        assert data["strategy_name"] == "Nifty Directional"
        assert data["total_trading_days"] == 3
        assert data["total_trades"] == 2
        assert data["winning_trades"] == 1
        assert data["losing_trades"] == 1
        assert data["no_trade_days"] == 1
        assert data["win_rate_pct"] == 50.0
        assert data["overall_result"] == "PROFIT"
        assert data["net_pnl"] > 0
        assert data["final_capital"] == round(200000.0 + data["net_pnl"], 2)

        d1, d2, d3 = data["days"]
        # Day 1: CALL (CE), ITM 3 from 24900 = 24750, TARGET
        assert d1["signal"] == "CALL"
        assert d1["option_type"] == "CE"
        assert d1["strike"] == 24750
        assert d1["quantity"] == 65
        assert d1["exit_reason"] == "TARGET"
        assert d1["result"] == "PROFIT"
        assert "05-Oct-2026 09:15:00 IST" == d1["entry_time_display"]
        assert "05-Oct-2026 10:32:00 IST" == d1["exit_time_display"]

        # Day 2: NO TRADE
        assert d2["signal"] == "NO TRADE"
        assert d2["result"] == "NO TRADE"
        assert d2["entry_price"] is None

        # Day 3: PUT (PE), ITM 3 from 25000 = 25150, SL
        assert d3["signal"] == "PUT"
        assert d3["option_type"] == "PE"
        assert d3["strike"] == 25150
        assert d3["exit_reason"] == "SL"
        assert d3["result"] == "LOSS"
        assert "07-Oct-2026 09:15:00 IST" == d3["entry_time_display"]
        assert "07-Oct-2026 11:05:00 IST" == d3["exit_time_display"]

        # Verify CSV export
        csv_text = strategy_service.export_backtest_csv(data)
        assert "2026-10-05" in csv_text
        assert "05-Oct-2026 09:15:00 IST" in csv_text


@pytest.mark.asyncio
async def test_backtest_durations_1m_3m_6m_1y_no_fabricated_option_prices():
    """
    Verify 1M, 3M, 6M, and 1Y backtests execute cleanly and NEVER fabricate
    option premiums when historical option candles are unavailable.
    """
    async with AsyncSessionLocal() as session:
        for dur in ("1M", "3M", "6M", "1Y"):
            res = await strategy_service.run_backtest(
                db=session,
                duration=dur,
                to_date="2026-11-03",
                capital=200000.0,
                lots=1,
            )
            assert res["connection_status"] == "connected"
            data = res["data"]
            assert data["strategy_name"] == "Nifty Directional"
            assert data["duration_code"] == dur
            assert data["status"] in ("COMPLETE", "INCOMPLETE", "DATA UNAVAILABLE")
            # Ensure no fake hardcoded entry_price (like 210.0 or 205.0) is ever invented
            for d in data["days"]:
                if d["result"] == "DATA UNAVAILABLE":
                    assert d["entry_price"] is None
                    assert d["exit_price"] is None
                    assert d["net_pnl"] is None
