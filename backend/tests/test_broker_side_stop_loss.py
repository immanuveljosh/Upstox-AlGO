import os
import sys
import uuid
import pytest
from datetime import datetime, time, date
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath("."))

from backend.app.core.database import AsyncSessionLocal
from backend.app.models.system_config import SystemConfig
from backend.app.models.order import Order
from backend.app.models.broker_token import BrokerToken
from backend.app.services.strategy_service import strategy_service
from backend.app.services.broker_service import broker_service
from backend.app.services.order_service import order_service
from backend.app.services.upstox_client import upstox_client
from backend.app.main import init_database
from backend.app.strategy.nifty_directional import (
    capital_risk_limits,
    price_for_net_pnl,
    round_to_tick,
    ist_now,
)


@pytest.mark.asyncio
async def test_entry_fill_places_broker_stop():
    """1. After entry is confirmed filled, place broker SL for exact filled qty at charge-adjusted 5% SL price."""
    await init_database()
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        config.mode = "LIVE"
        config.total_capital = 200000.0
        config.stoploss_capital_pct = 5.0
        config.target_capital_pct = 6.0
        await session.commit()

        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_live"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-ENTRY-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-101",
            instrument_key="NSE_FO|43919",
            symbol="NIFTY 24200 CE",
            strike=24200,
            option_type="CE",
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # Mock Upstox place_order for the SL
        with patch.object(
            upstox_client,
            "place_order",
            new_callable=AsyncMock,
            return_value={"status": "success", "data": {"order_id": "UPX-SL-201"}},
        ) as mock_place:
            success, stop_id, err = await order_service.place_broker_stop_loss(
                db=session,
                order=order,
                fill_price=200.0,
                filled_qty=65,
            )

            assert success is True
            assert stop_id == "UPX-SL-201"
            assert order.broker_stop_order_id == "UPX-SL-201"
            assert order.broker_stop_status == "ACTIVE"
            assert order.broker_stop_trigger_price is not None
            assert order.broker_stop_limit_price is not None
            assert order.broker_stop_limit_price <= order.broker_stop_trigger_price

            mock_place.assert_called_once()
            call_payload = mock_place.call_args[0][1]
            assert call_payload["order_type"] == "SL"
            assert call_payload["transaction_type"] == "SELL"
            assert call_payload["quantity"] == 65
            assert call_payload["trigger_price"] == order.broker_stop_trigger_price
            assert call_payload["price"] == order.broker_stop_limit_price


@pytest.mark.asyncio
async def test_target_exit_cancels_stop_first():
    """2. If app exits for target/time/manual, broker stop is cancelled FIRST before exit order is sent."""
    await init_database()
    async with AsyncSessionLocal() as session:
        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_target"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-TGT-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-102",
            broker_stop_order_id="UPX-SL-202",
            broker_stop_status="ACTIVE",
            instrument_key="NSE_FO|43920",
            symbol="NIFTY 24200 CE",
            strike=24200,
            option_type="CE",
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # Stop is still open at broker
        with patch.object(
            upstox_client,
            "get_order_history",
            new_callable=AsyncMock,
            return_value=[{"status": "trigger pending", "order_id": "UPX-SL-202"}],
        ), patch.object(
            upstox_client,
            "cancel_order",
            new_callable=AsyncMock,
            return_value={"status": "success"},
        ) as mock_cancel:
            can_proceed, reason = await order_service.cancel_broker_stop_if_active(
                db=session,
                order=order,
                token_record=token_record,
            )

            assert can_proceed is True
            assert reason == "CANCELLED"
            assert order.broker_stop_status == "CANCELLED"
            mock_cancel.assert_called_once_with("test_token_target", "UPX-SL-202")


@pytest.mark.asyncio
async def test_stop_triggered_at_broker_closes_position_without_second_sell():
    """3. If stop already triggered at broker, close local position and do not send second sell order."""
    await init_database()
    async with AsyncSessionLocal() as session:
        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_trig"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-TRIG-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-103",
            broker_stop_order_id="UPX-SL-203",
            broker_stop_status="ACTIVE",
            broker_stop_trigger_price=180.0,
            instrument_key="NSE_FO|43921",
            symbol="NIFTY 24200 CE",
            strike=24200,
            option_type="CE",
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # Stop order history returns complete (already executed!)
        with patch.object(
            upstox_client,
            "get_order_history",
            new_callable=AsyncMock,
            return_value=[{"status": "complete", "average_price": 178.5, "order_id": "UPX-SL-203"}],
        ), patch.object(
            upstox_client,
            "cancel_order",
            new_callable=AsyncMock,
        ) as mock_cancel, patch.object(
            upstox_client,
            "place_order",
            new_callable=AsyncMock,
        ) as mock_place:
            can_proceed, reason = await order_service.cancel_broker_stop_if_active(
                db=session,
                order=order,
                token_record=token_record,
            )

            # Must NOT allow proceeding with another sell order!
            assert can_proceed is False
            assert reason == "ALREADY_TRIGGERED"
            assert order.status == "CLOSED"
            assert order.broker_stop_status == "TRIGGERED"
            assert order.exit_status == "CONFIRMED_EXIT"
            assert order.exit_price == 178.5
            assert order.realized_pnl is not None

            # Cancel and Place exit must NOT be called
            mock_cancel.assert_not_called()
            mock_place.assert_not_called()


@pytest.mark.asyncio
async def test_stop_placement_failure_alerts():
    """4. If placing broker stop fails after retry, raise loud critical alert and fallback to software monitoring."""
    await init_database()
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        config.mode = "LIVE"
        config.critical_alert = None
        await session.commit()

        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_fail"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-FAIL-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-104",
            instrument_key="NSE_FO|43922",
            symbol="NIFTY 24200 PE",
            strike=24200,
            option_type="PE",
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # Mock Upstox place_order raising an exception
        with patch.object(
            upstox_client,
            "place_order",
            new_callable=AsyncMock,
            side_effect=RuntimeError("OMS connection timed out"),
        ), patch.object(
            strategy_service,
            "_send_telegram_alert",
            new_callable=AsyncMock,
        ) as mock_tg:
            success, stop_id, err = await order_service.place_broker_stop_loss(
                db=session,
                order=order,
                fill_price=200.0,
                filled_qty=65,
            )

            assert success is False
            assert stop_id is None
            assert order.broker_stop_status == "FAILED"
            assert config.critical_alert is not None
            assert "Broker Stop-Loss placement failed" in config.critical_alert
            mock_tg.assert_called_once()


@pytest.mark.asyncio
async def test_restart_picks_up_existing_stop():
    """5. Startup reconciliation picks up an existing broker stop and verifies status."""
    await init_database()
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        config.mode = "LIVE"
        await session.commit()

        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_restart"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-RESTART-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-105",
            broker_stop_order_id="UPX-SL-205",
            broker_stop_status="ACTIVE",
            instrument_key="NSE_FO|43923",
            symbol="NIFTY 24200 CE",
            strike=24200,
            option_type="CE",
            lots=1,
            qty=65,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # On startup, Upstox order history shows trigger pending (still active)
        with patch.object(
            upstox_client,
            "get_positions",
            new_callable=AsyncMock,
            return_value=[{"instrument_token": "NSE_FO|43923", "quantity": 65}],
        ), patch.object(
            upstox_client,
            "get_order_history",
            new_callable=AsyncMock,
            return_value=[{"status": "trigger pending", "order_id": "UPX-SL-205"}],
        ):
            res = await strategy_service.startup_reconcile_positions(session)
            assert res["status"] == "SUCCESS"
            await session.refresh(order)
            assert order.status == "PLACED"
            assert order.broker_stop_status == "ACTIVE"


@pytest.mark.asyncio
async def test_partial_fill_quantity():
    """6. Stop quantity matches actual open quantity and adjusts when quantity is modified."""
    await init_database()
    async with AsyncSessionLocal() as session:
        config = await broker_service.get_or_create_config(session)
        config.mode = "LIVE"
        config.total_capital = 200000.0
        await session.commit()

        token_record = await broker_service.get_or_create_token_record(session)
        token_record.access_token = "test_token_partial"
        token_record.is_valid = True
        await session.commit()

        order = Order(
            client_order_id=f"TEST-PARTIAL-{uuid.uuid4().hex[:6]}",
            upstox_order_id="UPX-ENTRY-106",
            broker_stop_order_id="UPX-SL-206",
            broker_stop_status="ACTIVE",
            instrument_key="NSE_FO|43924",
            symbol="NIFTY 24200 CE",
            strike=24200,
            option_type="CE",
            lots=2,
            qty=130,
            price=200.0,
            status="PLACED",
            mode="LIVE",
            placed_at=datetime.utcnow(),
        )
        session.add(order)
        await session.commit()
        await session.refresh(order)

        # Cancel old stop (130) and place new stop for partial fill (65)
        with patch.object(
            upstox_client,
            "cancel_order",
            new_callable=AsyncMock,
            return_value={"status": "success"},
        ) as mock_cancel, patch.object(
            upstox_client,
            "place_order",
            new_callable=AsyncMock,
            return_value={"status": "success", "data": {"order_id": "UPX-SL-206-ADJUSTED"}},
        ) as mock_place:
            adjusted = await order_service.adjust_broker_stop_quantity(
                db=session,
                order=order,
                new_qty=65,
            )

            assert adjusted is True
            mock_cancel.assert_called_once_with("test_token_partial", "UPX-SL-206")
            mock_place.assert_called_once()
            call_payload = mock_place.call_args[0][1]
            assert call_payload["quantity"] == 65
            assert order.broker_stop_order_id == "UPX-SL-206-ADJUSTED"

