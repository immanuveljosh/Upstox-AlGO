import asyncio
import os
import socket
import sys
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import app, init_database
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.order import Order
from backend.app.models.system_config import SystemConfig
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import OrderService, order_service
from backend.app.services.strategy_service import strategy_service
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException
from backend.app.core.exceptions import RiskLimitBreachedException, ModeRestrictionException


# ============================================================================ #
# PRIORITY 3 (BUG-1): SSRF Protection in Webhook Validation
# ============================================================================ #

@pytest.mark.asyncio
async def test_ssrf_protection_blocks_private_and_metadata_ips():
    """BUG-1: Validate webhook reachability blocks private, loopback, and link-local (metadata) IPs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. AWS/Cloud instance metadata IP (169.254.169.254)
        resp1 = await ac.post(
            "/api/v1/auth/webhook/validate",
            json={"url": "https://169.254.169.254/api/v1/auth/upstox/notifier"},
        )
        assert resp1.status_code == 200
        body1 = resp1.json()
        assert body1["status"] == "error"
        assert body1["data"]["is_public"] is False
        assert "Restricted private or link-local" in body1["message"] or "URL Invalid" in body1["message"]

        # 2. RFC 1918 Private IP (10.0.0.1)
        resp2 = await ac.post(
            "/api/v1/auth/webhook/validate",
            json={"url": "https://10.0.0.1/api/v1/auth/upstox/notifier"},
        )
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert body2["status"] == "error"
        assert body2["data"]["is_public"] is False

        # 3. Loopback IP (127.0.0.1)
        resp3 = await ac.post(
            "/api/v1/auth/webhook/validate",
            json={"url": "https://127.0.0.1/api/v1/auth/upstox/notifier"},
        )
        assert resp3.status_code == 200
        assert resp3.json()["status"] == "error"

        # 4. DNS Rebinding: Hostname resolves to 169.254.169.254
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 443))]
            resp4 = await ac.post(
                "/api/v1/auth/webhook/validate",
                json={"url": "https://attacker-domain.example.com/api/v1/auth/upstox/notifier"},
            )
            assert resp4.status_code == 200
            body4 = resp4.json()
            assert body4["status"] == "error"
            assert body4["data"]["endpoint_status"] == "Restricted IP"
            assert "resolves to restricted or private IP address" in body4["message"]


# ============================================================================ #
# PRIORITY 2 (BUG-2): Order Cancellation Uses Broker Upstox Order ID
# ============================================================================ #

@pytest.mark.asyncio
async def test_order_cancellation_resolves_and_sends_upstox_order_id():
    """BUG-2: Order cancellation must resolve client_order_id to upstox_order_id and dispatch broker ID."""
    await init_database()
    svc = OrderService()

    async with AsyncSessionLocal() as session:
        cid = f"UPX-TEST-CANCEL-{uuid.uuid4().hex[:8]}"
        uid = f"241105{uuid.uuid4().hex[:8]}"
        # Create a test order in DB with distinct client_order_id and upstox_order_id
        test_order = Order(
            client_order_id=cid,
            upstox_order_id=uid,
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24500 CE 09 NOV 26",
            option_type="CE",
            strike=24500,
            lots=1,
            qty=65,
            order_type="MARKET",
            price=120.0,
            status="PLACED",
        )
        session.add(test_order)
        await session.commit()
        await session.refresh(test_order)

        # Mock broker connection and upstox_client.cancel_order
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "cancel_order", new_callable=AsyncMock) as mock_cancel:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_cancel.return_value = {"status": "success", "order_id": uid}

            res = await svc.cancel_order(db=session, order_id=cid)
            assert res.get("connection_status") == "connected"
            assert res.get("data", {}).get("status") == "CANCELLED"
            # Verify Upstox cancel_order was called with the actual upstox_order_id, NOT client_order_id
            assert mock_cancel.call_args[0][1] == uid

            # Verify local status updated to CANCELLED
            await session.refresh(test_order)
            assert test_order.status == "CANCELLED"

            await session.delete(test_order)
            await session.commit()


@pytest.mark.asyncio
async def test_order_cancellation_handles_already_executed_or_cancelled():
    """BUG-2: Order cancellation prevents duplicate cancel or canceling already executed orders."""
    await init_database()
    svc = OrderService()

    async with AsyncSessionLocal() as session:
        cid = f"UPX-TEST-CLOSED-{uuid.uuid4().hex[:8]}"
        uid = f"241105{uuid.uuid4().hex[:8]}"
        test_order = Order(
            client_order_id=cid,
            upstox_order_id=uid,
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24500 CE 09 NOV 26",
            option_type="CE",
            strike=24500,
            lots=1,
            qty=65,
            order_type="MARKET",
            price=120.0,
            status="CLOSED",
        )
        session.add(test_order)
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")

            # Attempt to cancel already closed order
            res = await svc.cancel_order(db=session, order_id=cid)
            assert res.get("connection_status") == "connected"
            assert "cannot be cancelled" in res["message"] or "already executed" in res["message"]

        await session.delete(test_order)
        await session.commit()


# ============================================================================ #
# PRIORITY 5 (BUG-3): Atomic Daily Trade Limit Race Condition Protection
# ============================================================================ #

@pytest.mark.asyncio
async def test_concurrent_order_placement_enforces_daily_limit():
    """BUG-3: Concurrent order calls within 09:15-09:17 window enforce strict 1 trade per day atomically."""
    await init_database()
    svc = OrderService()

    async with AsyncSessionLocal() as session:
        # Clean any prior placed orders
        stmt = select(Order).where(Order.status == "PLACED")
        for ord_item in (await session.execute(stmt)).scalars().all():
            ord_item.status = "CLOSED"

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.trades_executed_today = 0
        cfg.max_trades_per_day = 1
        cfg.is_kill_switch_active = False
        await session.commit()

        # Mock broker connection and market quote/order placement
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(strategy_service, "fetch_instrument_metadata", new_callable=AsyncMock) as mock_meta, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 15, "TEST_USER")
            mock_meta.return_value = {
                "symbol": "NIFTY",
                "spot_price": 24500.0,
                "itm_ce_strike": 24350,
                "itm_pe_strike": 24650,
                "lot_size": 65,
                "selected_strike": 24350,
                "selected_option_type": "CE",
                "instrument_key": "NSE_FO|52345",
                "trading_symbol": "NIFTY 24350 CE 09 NOV 26",
                "estimated_price": 150.0,
            }
            mock_place.return_value = {
                "status": "success",
                "data": {"order_id": "2411059990001"},
            }

            # Run 3 concurrent order placement requests
            results = await asyncio.gather(
                svc.place_directional_order(db=session, option_type="CE", lots=1, strike=24350),
                svc.place_directional_order(db=session, option_type="CE", lots=1, strike=24350),
                svc.place_directional_order(db=session, option_type="CE", lots=1, strike=24350),
                return_exceptions=True,
            )

            # Exactly one request should succeed (or place order) and others must be rejected by risk limit
            success_count = sum(1 for r in results if isinstance(r, dict) and (r.get("connection_status") == "connected" or r.get("data")))
            blocked_count = sum(1 for r in results if isinstance(r, RiskLimitBreachedException))

            assert success_count == 1, f"Expected 1 successful trade, got {success_count}"
            assert blocked_count == 2, f"Expected 2 blocked trades, got {blocked_count}"

            # Clean up
            for r in results:
                if isinstance(r, dict) and r.get("data", {}).get("client_order_id"):
                    c_id = r["data"]["client_order_id"]
                    ord_row = (await session.execute(select(Order).where(Order.client_order_id == c_id))).scalars().first()
                    if ord_row:
                        await session.delete(ord_row)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# PRIORITY 1 & 4 (BUG-6 & BUG-7): Instrument Key Persistence & Square-off
# ============================================================================ #

@pytest.mark.asyncio
async def test_order_persistence_and_monitoring_uses_instrument_key():
    """BUG-6 & BUG-7: Real instrument_key is persisted and used for live quotes and exit orders."""
    await init_database()

    async with AsyncSessionLocal() as session:
        # Clean any prior placed orders
        stmt = select(Order).where(Order.status == "PLACED")
        for ord_item in (await session.execute(stmt)).scalars().all():
            ord_item.status = "CLOSED"

        cid = f"UPX-TEST-INSTRUMENT-{uuid.uuid4().hex[:8]}"
        uid = f"241105{uuid.uuid4().hex[:8]}"

        # Create an open order with instrument_key
        test_order = Order(
            client_order_id=cid,
            upstox_order_id=uid,
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            order_type="MARKET",
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0
        cfg.stoploss_capital_pct = 4.0
        cfg.target_capital_pct = 5.0

        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_MONITORING_TOKEN"
        tok.is_valid = True
        await session.commit()

        # Mock broker connection, positions, quotes, and order placement
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [
                {"instrument_token": "NSE_FO|52345", "quantity": 65, "pnl": 5200.0}
            ]
            # LTP that triggers Target (> +5% of capital = +10,000 pts / 65 ~ 305/sh)
            mock_quote.return_value = {
                "status": "success",
                "data": {
                    "NSE_FO|52345": {
                        "last_price": 310.0,
                        "instrument_token": "NSE_FO|52345",
                        "timestamp": datetime.now().timestamp() * 1000,
                    }
                },
            }
            mock_place.return_value = {
                "status": "success",
                "data": {"order_id": "241105_EXIT_TARGET_001"},
            }

            tick_res = await strategy_service.run_monitoring_tick(db=session)

            # 1. Verify get_market_quote was called with the persisted instrument_key ('NSE_FO|52345'), NOT symbol
            assert mock_quote.call_args[0][1] == "NSE_FO|52345"

            # 2. Verify place_order for exit was called with instrument_token = 'NSE_FO|52345'
            exit_call = mock_place.call_args[0][1] if len(mock_place.call_args[0]) > 1 else mock_place.call_args[0][0]
            assert exit_call["instrument_token"] == "NSE_FO|52345"
            assert exit_call["transaction_type"] == "SELL"

            # 3. Verify order record updated with exit status and exit order id
            await session.refresh(test_order)
            assert test_order.status == "PENDING_EXIT"
            assert test_order.exit_upstox_order_id == "241105_EXIT_TARGET_001"
            assert test_order.exit_status == "PENDING_FILL"

            # Clean up
            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


@pytest.mark.asyncio
async def test_square_off_rejection_marks_failed_exit_not_closed():
    """BUG-6: If Upstox OMS rejects exit order, do NOT mark position CLOSED locally."""
    await init_database()

    async with AsyncSessionLocal() as session:
        # Clean any prior placed orders
        stmt = select(Order).where(Order.status == "PLACED")
        for ord_item in (await session.execute(stmt)).scalars().all():
            ord_item.status = "CLOSED"

        cid = f"UPX-TEST-FAILED-EXIT-{uuid.uuid4().hex[:8]}"
        uid = f"241105{uuid.uuid4().hex[:8]}"

        test_order = Order(
            client_order_id=cid,
            upstox_order_id=uid,
            instrument_key="NSE_FO|52345",
            symbol="NIFTY 24350 CE 09 NOV 26",
            option_type="CE",
            strike=24350,
            lots=1,
            qty=65,
            order_type="MARKET",
            price=150.0,
            status="PLACED",
        )
        session.add(test_order)

        cfg = await broker_service.get_or_create_config(session)
        cfg.mode = "LIVE"
        cfg.total_capital = 200000.0

        tok = await broker_service.get_or_create_token_record(session)
        tok.access_token = "TEST_MONITORING_TOKEN"
        tok.is_valid = True
        await session.commit()

        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn, \
             patch.object(upstox_client, "get_positions", new_callable=AsyncMock) as mock_pos, \
             patch.object(upstox_client, "get_market_quote", new_callable=AsyncMock) as mock_quote, \
             patch.object(upstox_client, "place_order", new_callable=AsyncMock) as mock_place:

            mock_conn.return_value = (True, "Connected", 10, "TEST_USER")
            mock_pos.return_value = [{"instrument_token": "NSE_FO|52345", "quantity": 65}]
            # Price triggers stop loss (-4% of 200k = -8000 -> 150 - 123 = ~27)
            mock_quote.return_value = {
                "status": "success",
                "data": {
                    "NSE_FO|52345": {
                        "last_price": 20.0,
                        "instrument_token": "NSE_FO|52345",
                        "timestamp": datetime.now().timestamp() * 1000,
                    }
                },
            }
            # Upstox OMS throws exception on exit
            mock_place.side_effect = Exception("Upstox OMS Error: Margin requirement failed")

            await strategy_service.run_monitoring_tick(db=session)

            await session.refresh(test_order)
            # Must NOT be marked CLOSED
            assert test_order.status != "CLOSED"
            assert test_order.exit_status == "FAILED_EXIT"

            # Clean up
            await session.delete(test_order)
            cfg.mode = "BACKTEST"
            await session.commit()


# ============================================================================ #
# PRIORITY 6 (BUG-8): Strategy Square-Off Alias Endpoint
# ============================================================================ #

@pytest.mark.asyncio
async def test_strategy_square_off_alias_endpoint():
    """BUG-8: /api/v1/strategy/square-off alias returns 200 and routes to kill-switch."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch.object(broker_service, "verify_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (True, "Connected", 12, "TEST_USER")
            resp = await ac.post("/api/v1/strategy/square-off")
            assert resp.status_code == 200
            data = resp.json()
            assert data["connection_status"] == "connected"
            assert "kill switch executed" in data["message"].lower()


# ============================================================================ #
# PRIORITY 7 & 8 (BUG-4 & BUG-5): Frontend Hardcoded ID & Auth Bypass Removed
# ============================================================================ #

def test_frontend_login_and_killswitch_remediations():
    """BUG-4 & BUG-5: Verify hardcoded ID, demo bypass, and dead URLs are eliminated from frontend source."""
    login_path = os.path.abspath("src/app/login/page.tsx")
    with open(login_path, "r", encoding="utf-8") as f:
        login_content = f.read()

    # BUG-4: No hardcoded client ID in login page
    assert "22e100c2-59e7-4d4d-98a0-d69ae3b08c87" not in login_content

    # BUG-5: No demo fallback auth bypass in catch block
    assert '/?auth=connected' not in login_content or 'data.connection_status === "connected"' in login_content
    assert "router.push('/?auth=connected')" not in login_content
    assert 'router.push("/?auth=connected")' in login_content  # Only inside successful response handler!
    assert "Fallback for offline/standalone demo" not in login_content

    # BUG-8: KillSwitchSettings uses exit-all and does not fake local liquidation in catch
    killswitch_path = os.path.abspath("src/components/settings/KillSwitchSettings.tsx")
    with open(killswitch_path, "r", encoding="utf-8") as f:
        ks_content = f.read()

    assert "/api/v1/orders/exit-all" in ks_content
    assert "Active positions squared off locally" not in ks_content
