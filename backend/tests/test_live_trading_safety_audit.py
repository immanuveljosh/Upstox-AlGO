import asyncio
import os
import sys
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import init_database
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.order import Order
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService
from backend.app.services.strategy_service import strategy_service
from backend.app.services.risk_service import risk_service
from backend.app.services.upstox_client import upstox_client
from backend.app.core.exceptions import RiskLimitBreachedException, ModeRestrictionException


# ============================================================================ #
# 1. Broker Position Reconciliation
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_1_broker_reconciliation_flat_closes_db_order():
    """Verify: When Upstox position is flat (qty=0), local PLACED order is reconciled as CLOSED."""
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-AUDIT-1-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="2411059911",
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN"
        tok.is_valid = True
        await session.commit()

        # Upstox reports quantity = 0 (position squared off elsewhere or flat)
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [
                {"instrument_token": "NSE_FO|52345", "quantity": 0, "pnl": 1250.0, "sell_price": 169.2}
            ]

            await strategy_service.run_monitoring_tick(db=session)

            await session.refresh(test_order)
            assert test_order.status == "CLOSED"
            assert test_order.exit_status == "CONFIRMED_EXIT"
            assert test_order.realized_pnl == 1250.0
            assert "Broker Position Reconciled" in (test_order.exit_reason or "")

            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 2. Square-off Execution vs Fill Confirmation
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_2_square_off_acknowledgement_behavior():
    """Audit: Square-off currently marks order CLOSED upon OMS order_id acknowledgement."""
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-AUDIT-2-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="2411059922",
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|52345", "quantity": 65}]
            mock_quote.return_value = {
                "status": "success",
                "data": {"NSE_FO|52345": {"last_price": 310.0, "timestamp": datetime.now().timestamp() * 1000}},
            }
            # Upstox returns order_id upon placement
            mock_place.return_value = {"status": "success", "data": {"order_id": "EXIT_ACK_12345"}}

            await strategy_service.run_monitoring_tick(db=session)

            await session.refresh(test_order)
            # Confirms order was acknowledged by OMS and entered PENDING_EXIT state (awaiting fill confirmation)
            assert test_order.status == "PENDING_EXIT"
            assert test_order.exit_status == "PENDING_FILL"
            assert test_order.exit_upstox_order_id == "EXIT_ACK_12345"

            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 3. Handling of Rejected Exit Orders
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_3_rejected_exit_remains_open_and_tracks_failed_exit():
    """Verify: If exit order is rejected by broker, position status is NOT marked CLOSED."""
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-AUDIT-3-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="2411059933",
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|52345", "quantity": 65}]
            mock_quote.return_value = {
                "status": "success",
                "data": {"NSE_FO|52345": {"last_price": 20.0, "timestamp": datetime.now().timestamp() * 1000}},
            }
            mock_place.side_effect = Exception("UDAPI100010: Exchange RMS rejection")

            await strategy_service.run_monitoring_tick(db=session)

            await session.refresh(test_order)
            assert test_order.status == "PLACED"
            assert test_order.exit_status == "FAILED_EXIT"
            assert "RMS rejection" in (test_order.reject_reason or "")

            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 4. Multi-Worker Concurrency Characteristics
# ============================================================================ #
def test_audit_4_lock_scope_analysis():
    """Audit: OrderService lock is an asyncio.Lock, which protects coroutines within the same process."""
    lock = OrderService._get_lock()
    assert isinstance(lock, asyncio.Lock)
    # Note: asyncio.Lock is process-local; multi-process deployments require OS/DB synchronization.


# ============================================================================ #
# 5. Kill Switch Stops Entries & Liquidates
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_5_kill_switch_blocks_entries_and_liquidates():
    """Verify: Kill switch sets is_kill_switch_active=True, sends market sell orders, and blocks entries."""
    await init_database()
    svc = OrderService()

    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.is_kill_switch_active = False
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [
                {"trading_symbol": "NIFTY 24350 CE", "quantity": 65, "instrument_token": "NSE_FO|52345", "product": "I"}
            ]
            mock_place.return_value = {"status": "success", "data": {"order_id": "KS_EXIT_123"}}

            res = await risk_service.execute_kill_switch(session)
            assert res["data"]["triggered"] is True
            assert res["data"]["positions_closed"] == 1

            # Verify market SELL order dispatched with tag KILL_SWITCH
            ks_call = mock_place.call_args[0][1]
            assert ks_call["transaction_type"] == "SELL"
            assert ks_call["tag"] == "KILL_SWITCH"
            assert ks_call["quantity"] == 65

            # Verify that subsequent order entry is strictly blocked
            await session.refresh(cfg)
            assert cfg.is_kill_switch_active is True

            with pytest.raises(RiskLimitBreachedException) as exc_info:
                await svc.place_directional_order(session, option_type="CE")
            assert "Kill Switch is currently active" in str(exc_info.value)

            # Reset
            cfg.is_kill_switch_active = False
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 6. Stale Quote Protection
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_6_stale_quote_skipped_without_false_exit():
    """Verify: Missing or zero quotes in LIVE mode skip risk evaluation without false exits."""
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-AUDIT-6-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="2411059966",
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|52345", "quantity": 65}]
            # Quote returns None or fails
            mock_quote.return_value = {"status": "error", "data": {}}

            await strategy_service.run_monitoring_tick(db=session)

            # No exit order was placed because quote was unavailable
            assert mock_place.call_count == 0
            await session.refresh(test_order)
            assert test_order.status == "PLACED"

            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 7. Token Expiry Halts Live Monitoring
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_7_token_expiry_skips_monitoring_gracefully():
    """Verify: Expired token (401) is caught and does not crash the background worker."""
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-AUDIT-7-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="2411059977",
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "EXPIRED_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.side_effect = Exception("UDAPI100050: Invalid token")
            mock_quote.side_effect = Exception("UDAPI100050: Invalid token")

            # Monitoring tick should not raise unhandled exception
            res = await strategy_service.run_monitoring_tick(db=session)
            assert isinstance(res, dict)

            await session.refresh(test_order)
            assert test_order.status == "PLACED"

            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# 8. Mode Restriction Safety
# ============================================================================ #
@pytest.mark.asyncio
async def test_audit_8_backtest_mode_hard_blocks_order_placement():
    """Verify: Backtest mode strictly throws ModeRestrictionException on order placement."""
    await init_database()
    svc = OrderService()

    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "BACKTEST"
        await session.commit()

        with pytest.raises(ModeRestrictionException):
            await svc.place_directional_order(session, option_type="CE")

