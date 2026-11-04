from datetime import datetime
import uuid
import pytest
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.trade import Trade
from backend.app.services.pnl_service import pnl_service


@pytest.mark.asyncio
async def test_pnl_summary_empty_returns_valid_arrays():
    async with AsyncSessionLocal() as db:
        res = await pnl_service.get_pnl_summary(db=db, period="monthly")
        assert res["data"] is not None
        data = res["data"]
        assert isinstance(data["daily_pnl"], list)
        assert isinstance(data["dailyPnl"], list)
        assert isinstance(data["equity_curve"], list)
        assert isinstance(data["equityCurve"], list)


@pytest.mark.asyncio
async def test_pnl_summary_with_valid_trading_sessions():
    async with AsyncSessionLocal() as db:
        t1 = Trade(
            trade_id=f"TRD-TEST-{uuid.uuid4().hex[:8]}",
            client_order_id=f"ORD-TEST-{uuid.uuid4().hex[:8]}",
            symbol="NIFTY 24700 CE",
            option_type="CE",
            lots=1,
            qty=65,
            entry_price=200.0,
            exit_price=280.0,
            realized_pnl=5200.0,
            pnl_percent=40.0,
            entry_time=datetime.utcnow(),
            exit_time=datetime.utcnow(),
        )
        db.add(t1)
        await db.commit()

        try:
            res = await pnl_service.get_pnl_summary(db=db, period="monthly")
            data = res["data"]
            assert isinstance(data["dailyPnl"], list)
            assert len(data["dailyPnl"]) >= 1
            assert data["dailyPnl"] == data["daily_pnl"]
            assert data["profitTrades"] >= 1
            assert data["profitTrades"] == data["profit_trades"]
            assert isinstance(data["equityCurve"], list)
            assert len(data["equityCurve"]) >= 1
        finally:
            await db.delete(t1)
            await db.commit()
