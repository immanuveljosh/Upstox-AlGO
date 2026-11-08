from datetime import datetime, timedelta
import uuid
import pytest
from sqlalchemy import delete
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.order import Order
from backend.app.models.backtest import GiftNiftyObservation
from backend.app.services.strategy_intelligence_service import strategy_intelligence_service


@pytest.mark.asyncio
async def test_live_intelligence_empty_state():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Order))
        await db.execute(delete(GiftNiftyObservation))
        await db.commit()
        res = await strategy_intelligence_service.get_intelligence(
            db=db,
            mode="LIVE",
            duration="1M",
        )
        assert res.strategy_id == "nifty-directional"
        assert res.mode == "LIVE"
        assert res.summary.total_trades == 0
        assert res.summary.win_rate_pct == 0.0
        assert isinstance(res.signals, list)
        assert isinstance(res.executions, list)
        assert isinstance(res.monthly_heatmap, list)


@pytest.mark.asyncio
async def test_live_intelligence_with_signals_and_missed_signal():
    async with AsyncSessionLocal() as db:
        test_date = (datetime.utcnow() - timedelta(days=5)).strftime("%Y-%m-%d")
        obs = GiftNiftyObservation(
            trade_date=test_date,
            change_points=95.5,  # >= +80 -> CALL
            source="MANUAL_TEST",
        )
        db.add(obs)
        await db.commit()

        try:
            res = await strategy_intelligence_service.get_intelligence(
                db=db,
                mode="LIVE",
                duration="1M",
            )
            # Should detect CALL signal and flag it as MISSED because no LIVE order was routed
            sig = next((s for s in res.signals if s.trade_date == test_date), None)
            assert sig is not None
            assert sig.signal == "CALL"
            assert sig.signal_strength_points == 95.5
            assert sig.signal_strength_category == "MODERATE"
            assert sig.is_missed is True
            assert sig.executed_status == "MISSED"
            assert sig.missed_reason is not None
        finally:
            await db.delete(obs)
            await db.commit()


@pytest.mark.asyncio
async def test_live_intelligence_with_executed_trade_and_slippage():
    async with AsyncSessionLocal() as db:
        test_dt = datetime.utcnow() - timedelta(days=6)
        test_date = test_dt.strftime("%Y-%m-%d")

        obs = GiftNiftyObservation(
            trade_date=test_date,
            change_points=-105.0,  # <= -80 -> PUT
            source="MANUAL_TEST",
        )
        db.add(obs)

        order = Order(
            client_order_id=f"TEST-INTEL-{uuid.uuid4().hex[:6]}",
            symbol="NIFTY 24900 PE",
            strike=24900,
            option_type="PE",
            lots=1,
            qty=65,
            price=210.0,
            expected_price=208.0,
            slippage=2.0,
            status="CLOSED",
            mode="LIVE",
            placed_at=test_dt,
            signal_time=test_dt - timedelta(seconds=15),
            broker_confirmed_at=test_dt + timedelta(milliseconds=120),
            exit_price=275.0,
            exit_time=test_dt + timedelta(hours=2),
            realized_pnl=4225.0,
            exit_reason="Target",
        )
        db.add(order)
        await db.commit()

        try:
            res = await strategy_intelligence_service.get_intelligence(
                db=db,
                mode="LIVE",
                duration="1M",
            )
            assert res.summary.total_trades >= 1
            assert res.summary.winning_trades >= 1
            assert res.summary.win_rate_pct > 0.0

            sig = next((s for s in res.signals if s.trade_date == test_date), None)
            assert sig is not None
            assert sig.signal == "PUT"
            assert sig.executed_status == "EXECUTED"
            assert sig.is_missed is False

            ex = next((e for e in res.executions if e.client_order_id == order.client_order_id), None)
            assert ex is not None
            assert ex.actual_fill_price == 210.0
            assert ex.expected_price == 208.0
            assert ex.slippage_points == 2.0
            assert ex.exit_reason == "Target"
            assert ex.net_pnl == 4225.0

            # Heatmap should contain test year-month
            assert len(res.monthly_heatmap) >= 1
            curr_hm = next((h for h in res.monthly_heatmap if h.year_month == test_date[:7]), None)
            assert curr_hm is not None
            assert curr_hm.status == "PROFIT"

            # CSV export
            csv_text = strategy_intelligence_service.export_intelligence_csv(res)
            assert "STRATEGY INTELLIGENCE REPORT" in csv_text
            assert "NIFTY 24900 PE" in csv_text
        finally:
            await db.delete(obs)
            await db.delete(order)
            await db.commit()


@pytest.mark.asyncio
async def test_streak_calculation_math():
    pnls = [100.0, 200.0, 300.0, -50.0, -80.0, 150.0]
    max_wins, max_losses = strategy_intelligence_service._calculate_streaks(pnls)
    assert max_wins == 3
    assert max_losses == 2


@pytest.mark.asyncio
async def test_backtest_mode_intelligence():
    async with AsyncSessionLocal() as db:
        res = await strategy_intelligence_service.get_intelligence(
            db=db,
            mode="BACKTEST",
            duration="1M",
        )
        assert res.strategy_id == "nifty-directional"
        assert res.mode == "BACKTEST"
        assert res.summary is not None
        assert res.summary.initial_capital == 200000.0
        assert isinstance(res.equity_curve, list)
        assert isinstance(res.monthly_heatmap, list)
        assert isinstance(res.signals, list)
        assert isinstance(res.executions, list)

        # CSV export check
        csv_str = strategy_intelligence_service.export_intelligence_csv(res)
        assert "STRATEGY INTELLIGENCE REPORT" in csv_str
        assert "Gift Nifty Change (Pts)" in csv_str

