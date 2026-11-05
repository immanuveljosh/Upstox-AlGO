import asyncio
import os
import sys
import uuid
import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import init_database
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.order import Order
from backend.app.models.system_config import SystemConfig
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import order_service
from backend.app.services.strategy_service import strategy_service
from backend.app.services.upstox_client import upstox_client
from backend.app.core.config import settings


# ============================================================================ #
# Priority 1: EXIT ORDER FILL CONFIRMATION & PENDING_EXIT LIFECYCLE
# ============================================================================ #
@pytest.mark.asyncio
async def test_priority_1_pending_exit_polled_until_fill_complete():
    """
    Verify:
    1. Order triggers exit -> transitions to PENDING_EXIT, exit_status=PENDING_FILL.
    2. Next tick: order_history status is 'open' -> stays PENDING_EXIT.
    3. Next tick: order_history status is 'complete' and broker pos is 0 -> transitions to CLOSED, CONFIRMED_EXIT.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P1-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105001",
            instrument_key="NSE_FO|60001",
            symbol="NIFTY 24500 CE 09 NOV 26",
            option_type="CE",
            strike=24500,
            lots=1,
            qty=65,
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        cfg.stoploss_capital_pct = 4.0  # SL = ₹8,000
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P1"
        tok.is_valid = True
        await session.commit()

        # Step 1: Quote breaches SL -> exit placed -> transitions to PENDING_EXIT
        # Buy 150, current 10 -> net loss ~ ₹9,100 > ₹8,000
        fresh_quote = {
            "status": "success",
            "data": {
                "NSE_FO|60001": {
                    "last_price": 10.0,
                    "timestamp": datetime.now().timestamp() * 1000,
                }
            },
        }

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60001", "quantity": 65, "pnl": -9100.0}]
            mock_quote.return_value = fresh_quote
            mock_place.return_value = {"status": "success", "data": {"order_id": "EXIT-OMS-001"}}

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.status == "PENDING_EXIT"
            assert test_order.exit_status == "PENDING_FILL"
            assert test_order.exit_upstox_order_id == "EXIT-OMS-001"

        # Step 2: Next tick while order is 'open' in broker order book -> stays PENDING_EXIT
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_order_history", new_callable=AsyncMock) as mock_hist:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60001", "quantity": 65, "pnl": -9100.0}]
            mock_hist.return_value = [{"order_id": "EXIT-OMS-001", "status": "open"}]

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.status == "PENDING_EXIT"
            assert test_order.exit_status == "PENDING_FILL"

        # Step 3: Broker fills order: order_history is 'complete' and position is flat (qty=0)
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_order_history", new_callable=AsyncMock) as mock_hist:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60001", "quantity": 0, "pnl": -9100.0}]
            mock_hist.return_value = [{"order_id": "EXIT-OMS-001", "status": "complete", "average_price": 9.8}]

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.status == "CLOSED"
            assert test_order.exit_status == "CONFIRMED_EXIT"
            assert test_order.exit_price == 9.8

        await session.delete(test_order)
        await session.commit()


@pytest.mark.asyncio
async def test_priority_1_pending_exit_reverts_on_broker_rejection():
    """
    Verify: If an exit order in PENDING_EXIT is rejected by Upstox OMS,
    it reverts to PLACED with exit_status=FAILED_EXIT for automated retry.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P1-REJ-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105002",
            instrument_key="NSE_FO|60002",
            symbol="NIFTY 24500 PE 09 NOV 26",
            option_type="PE",
            strike=24500,
            lots=1,
            qty=65,
            price=120.0,
            status="PENDING_EXIT",
            exit_status="PENDING_FILL",
            exit_upstox_order_id="EXIT-REJ-999",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P1_REJ"
        tok.is_valid = True
        await session.commit()

        # Upstox returns rejected for the exit order
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_order_history", new_callable=AsyncMock) as mock_hist:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60002", "quantity": 65, "pnl": -8500.0}]
            mock_hist.return_value = [{"order_id": "EXIT-REJ-999", "status": "rejected", "status_message": "RMS: Margin exceeded"}]

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.status == "PLACED"
            assert test_order.exit_status == "FAILED_EXIT"
            assert "REJECTED" in (test_order.reject_reason or "")

        await session.delete(test_order)
        await session.commit()


# ============================================================================ #
# Priority 2: PARTIAL FILL QUANTITY RECONCILIATION
# ============================================================================ #
@pytest.mark.asyncio
async def test_priority_2_partial_fill_quantity_reconciliation():
    """
    Verify:
    1. Local order has qty=130 (2 lots).
    2. Broker position reports quantity=65 (only 1 lot actually filled).
    3. Reconciles open_order.qty = 65.
    4. On exit, square-off payload routes quantity=65 (never 130), preventing reverse position.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P2-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105003",
            instrument_key="NSE_FO|60003",
            symbol="NIFTY 24600 CE 09 NOV 26",
            option_type="CE",
            strike=24600,
            lots=2,
            qty=130,  # Expected 2 lots, but partial fill on broker
            price=200.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        cfg.stoploss_capital_pct = 4.0
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P2"
        tok.is_valid = True
        await session.commit()

        # Step 1: Upstox position shows net quantity=65 (partial fill)
        fresh_quote = {
            "status": "success",
            "data": {
                "NSE_FO|60003": {
                    "last_price": 50.0,  # SL breach: net loss > ₹8,000
                    "timestamp": datetime.now().timestamp() * 1000,
                }
            },
        }

        placed_payloads = []

        async def capture_place_order(token, payload):
            placed_payloads.append(payload)
            return {"status": "success", "data": {"order_id": "EXIT-PARTIAL-001"}}

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", side_effect=capture_place_order):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60003", "quantity": 65, "pnl": -9750.0}]
            mock_quote.return_value = fresh_quote

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.qty == 65
            assert len(placed_payloads) == 1
            # Crucial invariant: exited only actual broker net quantity (65), preventing reverse position!
            assert placed_payloads[0]["quantity"] == 65

        await session.delete(test_order)
        await session.commit()


@pytest.mark.asyncio
async def test_priority_2_flat_broker_prevents_reverse_exit_order():
    """
    Verify: If position is already flat on broker (qty=0), no SELL exit order
    is routed to Upstox (which would create an accidental short).
    Local order is directly marked CLOSED.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P2-FLAT-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105004",
            instrument_key="NSE_FO|60004",
            symbol="NIFTY 24600 PE 09 NOV 26",
            option_type="PE",
            strike=24600,
            lots=1,
            qty=65,
            price=180.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P2_FLAT"
        tok.is_valid = True
        await session.commit()

        mock_place = AsyncMock()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            # Broker reports position is already flat (0)
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60004", "quantity": 0, "pnl": 500.0}]

            await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            assert test_order.status == "CLOSED"
            assert test_order.exit_status == "CONFIRMED_EXIT"
            # Zero exit orders routed
            mock_place.assert_not_called()

        await session.delete(test_order)
        await session.commit()


# ============================================================================ #
# Priority 3: TOKEN EXPIRY ALERT
# ============================================================================ #
@pytest.mark.asyncio
async def test_priority_3_repeated_401_triggers_critical_alert():
    """
    Verify: When Upstox returns 401 Unauthorized while positions are open,
    critical_alert is set on SystemConfig and Telegram alert is dispatched.
    Monitoring does not silently ignore.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P3-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105005",
            instrument_key="NSE_FO|60005",
            symbol="NIFTY 24700 CE 09 NOV 26",
            option_type="CE",
            strike=24700,
            lots=1,
            qty=65,
            price=210.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.critical_alert = None
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "EXPIRED_TOKEN_P3"
        tok.is_valid = True
        await session.commit()

        with patch.object(upstox_client, "get_positions", side_effect=Exception("401 Unauthorized: Access token expired")):
            await strategy_service.run_monitoring_tick(session)

            await session.refresh(cfg)
            assert cfg.critical_alert is not None
            assert "CRITICAL" in cfg.critical_alert
            assert "Access Token Expired" in cfg.critical_alert

        await session.delete(test_order)
        cfg.critical_alert = None
        await session.commit()


# ============================================================================ #
# Priority 4: ORPHAN POSITION RECOVERY
# ============================================================================ #
@pytest.mark.asyncio
async def test_priority_4_orphan_positions_detected_and_not_auto_closed():
    """
    Verify:
    1. Broker returns an open position not matched to any active order in DB.
    2. Detected as orphan position, saved in config.orphan_positions_json.
    3. Position is NOT automatically closed (no live orders placed).
    4. Explicit adopt_orphan_position adopts it into active DB tracking.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.orphan_positions_json = None
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P4"
        tok.is_valid = True
        await session.commit()

        orphan_token = "NSE_FO|99999"
        orphan_broker_pos = [
            {
                "instrument_token": orphan_token,
                "trading_symbol": "NIFTY 24800 CE 09 NOV 26",
                "quantity": 65,
                "buy_price": 140.0,
                "last_price": 155.0,
                "pnl": 975.0,
                "product": "I",
            }
        ]

        mock_place = AsyncMock()

        # Step 1 & 2: Startup reconciliation detects orphan
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = orphan_broker_pos

            res = await strategy_service.startup_reconcile_positions(session)
            assert res["status"] == "SUCCESS"
            assert res["orphan_count"] == 1

            await session.refresh(cfg)
            assert cfg.orphan_positions_json is not None
            orphans = json.loads(cfg.orphan_positions_json)
            assert len(orphans) == 1
            assert orphans[0]["instrument_token"] == orphan_token

            # Crucial safety: zero exit orders placed!
            mock_place.assert_not_called()

        # Step 3: Explicit adoption by user
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = orphan_broker_pos

            adopt_res = await order_service.adopt_orphan_position(session, orphan_token)
            assert adopt_res["connection_status"] == "connected"
            adopted_cid = adopt_res["data"]["client_order_id"]

            stmt = select(Order).where(Order.client_order_id == adopted_cid)
            adopted_order = (await session.execute(stmt)).scalars().first()
            assert adopted_order is not None
            assert adopted_order.status == "PLACED"
            assert adopted_order.qty == 65
            assert adopted_order.instrument_key == orphan_token

            # Clean up
            await session.delete(adopted_order)
            cfg.orphan_positions_json = None
            await session.commit()


# ============================================================================ #
# Priority 5: STALE QUOTE PROTECTION
# ============================================================================ #
@pytest.mark.asyncio
async def test_priority_5_stale_quote_skipped_when_age_exceeds_threshold():
    """
    Verify:
    1. Option quote has timestamp older than MAX_QUOTE_AGE_SECONDS.
    2. System skips SL/Target evaluation.
    3. Order is NOT exited despite theoretical SL price breach.
    4. Warning is recorded on order.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P5-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105006",
            instrument_key="NSE_FO|60006",
            symbol="NIFTY 24900 CE 09 NOV 26",
            option_type="CE",
            strike=24900,
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        cfg.stoploss_capital_pct = 4.0
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P5"
        tok.is_valid = True
        await session.commit()

        # Quote timestamp is 180 seconds old (> MAX_QUOTE_AGE_SECONDS = 60s)
        stale_ts = (datetime.now() - timedelta(seconds=180)).timestamp() * 1000
        stale_quote = {
            "status": "success",
            "data": {
                "NSE_FO|60006": {
                    "last_price": 5.0,  # Extreme breach if fresh, but stale!
                    "timestamp": stale_ts,
                }
            },
        }

        mock_place = AsyncMock()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60006", "quantity": 65, "pnl": -12000.0}]
            mock_quote.return_value = stale_quote

            tick_res = await strategy_service.run_monitoring_tick(session)

            await session.refresh(test_order)
            # Crucial invariant: Order remained PLACED and was NOT triggered on stale quote!
            assert test_order.status == "PLACED"
            assert "Quote is STALE" in (test_order.reject_reason or "") or "Quote is stale" in (test_order.reject_reason or "")
            mock_place.assert_not_called()

        await session.delete(test_order)
        await session.commit()


@pytest.mark.asyncio
async def test_priority_5_validate_quote_freshness_all_categories():
    """
    Directly tests validate_quote_freshness across all required categories:
    1. Missing timestamp
    2. Invalid timestamp
    3. Future timestamp
    4. Expired timestamp
    5. Fresh valid timestamp
    """
    from backend.app.strategy.nifty_directional import ist_now

    now_base = ist_now()

    # 1. Missing timestamp
    res_none = strategy_service.validate_quote_freshness(None)
    assert res_none[0] is False
    assert res_none[1] == "UNVERIFIED_MISSING_QUOTE"

    res_empty = strategy_service.validate_quote_freshness({"last_price": 150.0})
    assert res_empty[0] is False
    assert res_empty[1] == "UNVERIFIED_MISSING_TIMESTAMP"

    is_stale, _, _ = strategy_service._is_quote_stale({"last_price": 150.0})
    assert is_stale is True  # Missing timestamp must NEVER return fresh (False)

    # 2. Invalid timestamp
    res_str_bad = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": "not-a-datetime"})
    assert res_str_bad[0] is False
    assert res_str_bad[1] == "UNVERIFIED_INVALID_TIMESTAMP"

    res_neg = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": -100})
    assert res_neg[0] is False
    assert res_neg[1] == "UNVERIFIED_INVALID_TIMESTAMP"

    res_obj = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": ["invalid", "type"]})
    assert res_obj[0] is False
    assert res_obj[1] == "UNVERIFIED_INVALID_TIMESTAMP"

    # 3. Future timestamp (> 5s in future)
    future_ms = (now_base + timedelta(seconds=30)).timestamp() * 1000
    res_future = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": future_ms})
    assert res_future[0] is False
    assert res_future[1] == "UNVERIFIED_FUTURE_TIMESTAMP"

    # 4. Expired timestamp (> MAX_QUOTE_AGE_SECONDS = 60s)
    expired_ms = (now_base - timedelta(seconds=120)).timestamp() * 1000
    res_expired = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": expired_ms})
    assert res_expired[0] is False
    assert res_expired[1] == "STALE"
    assert res_expired[2] is not None and res_expired[2] >= 115.0

    # 5. Fresh valid timestamp (0 <= age <= 60s)
    fresh_ms = (now_base - timedelta(seconds=10)).timestamp() * 1000
    res_fresh = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": fresh_ms})
    assert res_fresh[0] is True
    assert res_fresh[1] == "FRESH"
    assert res_fresh[2] is not None and res_fresh[2] <= 15.0

    # ISO string format support
    iso_fresh = (now_base - timedelta(seconds=5)).strftime("%Y-%m-%dT%H:%M:%S")
    res_iso = strategy_service.validate_quote_freshness({"last_price": 150.0, "timestamp": iso_fresh})
    assert res_iso[0] is True
    assert res_iso[1] == "FRESH"


@pytest.mark.asyncio
async def test_priority_5_missing_and_future_timestamp_blocks_sl_decision():
    """
    Integration test: Missing or future quote timestamps block SL/Target execution.
    Only verified fresh quotes may trigger square-off.
    """
    await init_database()
    async with AsyncSessionLocal() as session:
        cid = f"UPX-P5-INT-{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id="241105007",
            instrument_key="NSE_FO|60007",
            symbol="NIFTY 24900 PE 09 NOV 26",
            option_type="PE",
            strike=24900,
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        cfg.stoploss_capital_pct = 4.0
        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_TOKEN_P5_INT"
        tok.is_valid = True
        await session.commit()

        mock_place = AsyncMock()

        # Step 1: Missing timestamp -> Monitoring paused, reject_reason UNVERIFIED
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60007", "quantity": 65, "pnl": -12000.0}]
            mock_quote.return_value = {
                "status": "success",
                "data": {"NSE_FO|60007": {"last_price": 5.0}},  # Missing timestamp
            }

            await strategy_service.run_monitoring_tick(session)
            await session.refresh(test_order)
            assert test_order.status == "PLACED"
            assert "UNVERIFIED (missing timestamp in feed)" in (test_order.reject_reason or "")
            mock_place.assert_not_called()

        # Step 2: Future timestamp -> Monitoring paused, reject_reason UNVERIFIED
        future_ts = (datetime.now() + timedelta(seconds=60)).timestamp() * 1000
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60007", "quantity": 65, "pnl": -12000.0}]
            mock_quote.return_value = {
                "status": "success",
                "data": {"NSE_FO|60007": {"last_price": 5.0, "timestamp": future_ts}},
            }

            await strategy_service.run_monitoring_tick(session)
            await session.refresh(test_order)
            assert test_order.status == "PLACED"
            assert "UNVERIFIED (future timestamp" in (test_order.reject_reason or "")
            mock_place.assert_not_called()

        # Step 3: Fresh valid quote within 60s -> SL executes and enters PENDING_EXIT
        fresh_ts = (datetime.now() - timedelta(seconds=5)).timestamp() * 1000
        mock_place.return_value = {"status": "success", "data": {"order_id": "EXIT-FRESH-001"}}
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", mock_place):
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|60007", "quantity": 65, "pnl": -12000.0}]
            mock_quote.return_value = {
                "status": "success",
                "data": {"NSE_FO|60007": {"last_price": 5.0, "timestamp": fresh_ts}},
            }

            await strategy_service.run_monitoring_tick(session)
            await session.refresh(test_order)
            # Verified: fresh quote triggers square-off transition to PENDING_EXIT!
            assert test_order.status == "PENDING_EXIT"
            assert test_order.exit_status == "PENDING_FILL"
            assert test_order.exit_upstox_order_id == "EXIT-FRESH-001"
            assert mock_place.call_count == 1

        await session.delete(test_order)
        await session.commit()


