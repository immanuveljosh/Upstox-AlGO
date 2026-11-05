import asyncio
import os
import sys
from urllib.parse import parse_qs, urlparse
import pytest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath("."))

from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import UpstoxAuthException
from backend.app.api.v1.auth import (
    generate_oauth_state,
    validate_and_consume_oauth_state,
    is_code_already_processed,
    mark_code_processed,
)


@pytest.mark.asyncio
async def test_oauth_url_construction_with_csrf_state():
    """Verify that OAuth login URL includes response_type=code, client_id, exact redirect_uri, and secure state."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        client_id = token_record.api_key or settings.UPSTOX_API_KEY
        redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

        assert client_id, "Client ID must not be empty"
        assert redirect_uri, "Redirect URI must not be empty"
        assert redirect_uri == "http://localhost:8000/api/v1/auth/callback"

        state = generate_oauth_state()
        assert len(state) >= 32, "State must be cryptographically secure"

        from urllib.parse import urlencode

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"

        parsed = urlparse(auth_url)
        assert parsed.scheme == "https"
        assert parsed.netloc == "api.upstox.com"
        assert parsed.path == "/v2/login/authorization/dialog"

        qs = parse_qs(parsed.query)
        assert qs["response_type"] == ["code"]
        assert qs["client_id"] == [client_id]
        assert qs["redirect_uri"] == [redirect_uri]
        assert qs["state"] == [state]


@pytest.mark.asyncio
async def test_csrf_state_validation_and_single_use():
    """CSRF state must validate once and cannot be re-used."""
    state = generate_oauth_state()
    # First consumption must succeed
    assert validate_and_consume_oauth_state(state) is True
    # Replay attack: second consumption must fail
    assert validate_and_consume_oauth_state(state) is False
    # Unknown state must fail
    assert validate_and_consume_oauth_state("unknown_malicious_state") is False
    assert validate_and_consume_oauth_state(None) is False


@pytest.mark.asyncio
async def test_duplicate_authorization_code_protection():
    """Authorization code cannot be processed twice."""
    test_code = "TEST_AUTH_CODE_XYZ123"
    assert is_code_already_processed(test_code) is False
    mark_code_processed(test_code)
    assert is_code_already_processed(test_code) is True


@pytest.mark.asyncio
async def test_live_genuine_upstox_profile_verification():
    """Test authenticated profile verification against live Upstox or genuine configured token."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        if token_record.access_token:
            is_connected, msg, profile, latency = await broker_service.verify_connection(db, force_check=True)
            assert isinstance(latency, int)
            assert latency > 0
            if is_connected:
                assert token_record.connection_status == "CONNECTED"
                assert token_record.user_id is not None
                assert token_record.user_name is not None
                assert "Connected" in msg


@pytest.mark.asyncio
async def test_invalid_token_classified_as_auth_failed():
    """When Upstox returns invalid token error, status is marked AUTH_FAILED."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        original_token = token_record.access_token

        try:
            with patch(
                "backend.app.services.upstox_client.upstox_client.get_profile",
                new_callable=AsyncMock,
            ) as mock_get_profile:
                mock_get_profile.side_effect = UpstoxAuthException(
                    "Invalid token used to access API", status_code=401, error_code="UDAPI100050"
                )

                token_record.access_token = "invalid_bearer_token"
                await db.commit()

                is_connected, msg, profile, latency = await broker_service.verify_connection(db, force_check=True)

                assert is_connected is False
                assert token_record.connection_status == "AUTH_FAILED"
                assert "Authentication Failed" in msg or "Invalid" in msg
        finally:
            token_record.access_token = original_token
            if original_token:
                await broker_service.verify_connection(db, force_check=True)
            await db.commit()


@pytest.mark.asyncio
async def test_expired_token_classified_as_token_expired():
    """When Upstox returns token expired error, status is marked TOKEN_EXPIRED."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        original_token = token_record.access_token

        try:
            with patch(
                "backend.app.services.upstox_client.upstox_client.get_profile",
                new_callable=AsyncMock,
            ) as mock_get_profile:
                mock_get_profile.side_effect = UpstoxAuthException(
                    "Token has expired", status_code=401, error_code="UDAPI100057"
                )

                token_record.access_token = "expired_bearer_token"
                await db.commit()

                is_connected, msg, profile, latency = await broker_service.verify_connection(db, force_check=True)

                assert is_connected is False
                assert token_record.connection_status == "TOKEN_EXPIRED"
                assert "Token Expired" in msg
        finally:
            token_record.access_token = original_token
            if original_token:
                await broker_service.verify_connection(db, force_check=True)
            await db.commit()


@pytest.mark.asyncio
async def test_disconnect_and_reconnect_flow():
    """Disconnect clears token and marks status DISCONNECTED; re-entering token restores connection."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        original_token = token_record.access_token

        try:
            # 1. Disconnect
            await broker_service.disconnect(db)
            await db.refresh(token_record)
            assert token_record.access_token is None
            assert token_record.is_valid is False
            assert token_record.connection_status == "DISCONNECTED"

            is_connected, msg, profile, latency = await broker_service.verify_connection(db, force_check=True)
            assert is_connected is False
            assert "Disconnected" in msg

            # 2. Re-enter valid token
            with patch(
                "backend.app.services.upstox_client.upstox_client.get_profile",
                new_callable=AsyncMock,
            ) as mock_get_profile:
                mock_get_profile.return_value = {
                    "status": "success",
                    "data": {
                        "user_id": "5GC3MG",
                        "user_name": "IMMANUVEL D",
                        "email": "immannithra@gmail.com",
                    },
                }
                is_connected, msg = await broker_service.update_access_token(db, "valid_fresh_oauth_token")
                await db.refresh(token_record)
                assert is_connected is True
                assert token_record.connection_status == "CONNECTED"
        finally:
            token_record.access_token = original_token
            if original_token:
                await broker_service.verify_connection(db, force_check=True)
            await db.commit()


@pytest.mark.asyncio
async def test_broker_status_response_model_serialization():
    """Verify /broker/status response serializes cleanly through APIResponse[BrokerStatusData] across all states."""
    from backend.app.api.v1.broker import get_broker_status
    from backend.app.schemas.common import APIResponse
    from backend.app.schemas.broker import BrokerStatusData

    async with AsyncSessionLocal() as db:
        resp = await get_broker_status(db)
        validated = APIResponse[BrokerStatusData].model_validate(resp)
        assert validated.data is not None
        assert validated.connection_status in ("connected", "disconnected", "token_expired", "auth_failed", "connection_lost")
