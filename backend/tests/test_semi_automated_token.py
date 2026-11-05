import os
import sys
import socket
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
import pytest
import pytz
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import app, init_database
from backend.app.core.database import AsyncSessionLocal
from backend.app.core.security import is_encrypted_at_rest, decrypt_token
from backend.app.services.broker_service import broker_service, IST
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException


@pytest.mark.asyncio
async def test_1_successful_token_request_and_3_approval_pending():
    """Test 1 & 3: Successful v3 token request transitions status to REQUESTED_PENDING with authorization_expiry."""
    await init_database()
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_key = token_record.api_key
        orig_sec = token_record.api_secret
        orig_status = token_record.token_request_status
        orig_date = token_record.last_token_request_date

        try:
            token_record.api_key = "test-client-id-123"
            token_record.api_secret = "test-client-secret-xyz"
            await db.commit()

            future_exp_ms = str(int((datetime.utcnow() + timedelta(hours=3)).timestamp() * 1000))
            with patch(
                "backend.app.services.upstox_client.upstox_client.request_access_token_v3",
                new_callable=AsyncMock,
            ) as mock_req:
                mock_req.return_value = {
                    "status": "success",
                    "data": {
                        "authorization_expiry": future_exp_ms,
                        "notifier_url": "http://localhost:8000/api/v1/auth/upstox/notifier",
                    },
                }

                ok, msg, telemetry = await broker_service.request_daily_token(
                    db=db, manual=True, force=True
                )

                assert ok is True
                assert "Approve" in msg
                assert telemetry["token_request_status"] == "REQUESTED_PENDING"
                assert telemetry["authorization_expiry_ist"] is not None
                assert telemetry["last_token_request_ist"] is not None
                mock_req.assert_awaited_once_with(
                    client_id="test-client-id-123",
                    client_secret="test-client-secret-xyz",
                )
        finally:
            token_record.api_key = orig_key
            token_record.api_secret = orig_sec
            token_record.token_request_status = orig_status
            token_record.last_token_request_date = orig_date
            await db.commit()


@pytest.mark.asyncio
async def test_2_upstox_api_rejection():
    """Test 2: Upstox v3 API rejection marks token_request_status as REJECTED and records error."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_status = token_record.token_request_status

        try:
            with patch(
                "backend.app.services.upstox_client.upstox_client.request_access_token_v3",
                new_callable=AsyncMock,
            ) as mock_req:
                mock_req.side_effect = UpstoxAuthException(
                    "Invalid Client Secret (code: UDAPI100016)",
                    status_code=401,
                    error_code="UDAPI100016",
                )

                ok, msg, telemetry = await broker_service.request_daily_token(
                    db=db, manual=True, force=True
                )

                assert ok is False
                assert "UDAPI100016" in msg
                assert telemetry["token_request_status"] == "REJECTED"
        finally:
            token_record.token_request_status = orig_status
            await db.commit()


@pytest.mark.asyncio
async def test_udapi1123_invalid_notifier_url_marks_notifier_url_required():
    """Verify that UDAPI1123 (Invalid notifier url) marks status as NOTIFIER_URL_REQUIRED, flags is_notifier_url_error, and formats actionable message."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_status = token_record.token_request_status
        orig_err = token_record.last_error

        try:
            with patch(
                "backend.app.services.upstox_client.upstox_client.request_access_token_v3",
                new_callable=AsyncMock,
            ) as mock_req:
                mock_req.side_effect = UpstoxAuthException(
                    "Invalid notifier url (code: UDAPI1123)",
                    status_code=400,
                    error_code="UDAPI1123",
                )

                ok, msg, telemetry = await broker_service.request_daily_token(
                    db=db, manual=True, force=True
                )

                assert ok is False
                assert "Notifier Webhook URL is not configured" in msg
                assert telemetry["token_request_status"] == "NOTIFIER_URL_REQUIRED"
                assert telemetry["is_notifier_url_error"] is True
                assert "UDAPI1123" in telemetry["last_error"]
        finally:
            token_record.token_request_status = orig_status
            token_record.last_error = orig_err
            await db.commit()


@pytest.mark.asyncio
async def test_4_approved_webhook_and_10_broker_reconnection_and_encryption():
    """Test 4, 9, 10: Approved webhook encrypts token at rest, verifies profile, reconnects broker, never leaks token."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_token = token_record.access_token
        orig_key = token_record.api_key
        orig_uid = token_record.user_id
        orig_valid = token_record.is_valid
        orig_conn = token_record.connection_status
        orig_req_status = token_record.token_request_status
        orig_approved_at = token_record.last_token_approved_at
        orig_issued_at = token_record.issued_at
        orig_expires_at = token_record.expires_at

        try:
            token_record.api_key = "22e100c2-59e7-4d4d-98a0-d69ae3b08c87"
            token_record.user_id = "5GC3MG"
            await db.commit()

            now_ms = int(datetime.utcnow().timestamp() * 1000)
            exp_ms = int((datetime.utcnow() + timedelta(hours=16)).timestamp() * 1000)
            fresh_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.fresh_approved_webhook_token_payload.signature123"

            webhook_payload = {
                "client_id": "22e100c2-59e7-4d4d-98a0-d69ae3b08c87",
                "user_id": "5GC3MG",
                "access_token": fresh_token,
                "token_type": "Bearer",
                "issued_at": str(now_ms),
                "expires_at": str(exp_ms),
                "message_type": "access_token",
            }

            with patch(
                "backend.app.services.upstox_client.upstox_client.get_profile",
                new_callable=AsyncMock,
            ) as mock_profile:
                mock_profile.return_value = {
                    "status": "success",
                    "data": {
                        "user_id": "5GC3MG",
                        "user_name": "IMMANUVEL D",
                        "email": "immannithra@gmail.com",
                    },
                }

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    resp = await ac.post("/api/v1/auth/upstox/notifier", json=webhook_payload)

                assert resp.status_code == 200
                body = resp.json()
                assert body["status"] == "success"
                assert body["data"]["is_connected"] is True
                assert body["data"]["connection_status"] == "CONNECTED"
                assert body["data"]["duplicate"] is False
                # Ensure token is NEVER returned in API response
                assert fresh_token not in resp.text

                # Verify broker client session reinitialized
                assert upstox_client.active_access_token == fresh_token

                # Verify token is encrypted at rest in raw SQLite storage
                raw_row = (
                    await db.execute(
                        text("SELECT access_token FROM broker_tokens WHERE id = :id"),
                        {"id": token_record.id},
                    )
                ).fetchone()
                assert raw_row is not None
                raw_db_val = raw_row[0]
                assert is_encrypted_at_rest(raw_db_val) is True
                assert raw_db_val != fresh_token
                assert decrypt_token(raw_db_val) == fresh_token

                # Verify duplicate webhook idempotency (Test 7)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    dup_resp = await ac.post("/api/v1/auth/upstox/notifier", json=webhook_payload)
                assert dup_resp.status_code == 200
                dup_body = dup_resp.json()
                assert dup_body["data"]["duplicate"] is True
                # Profile API was called only once (on first delivery, not on duplicate)
                assert mock_profile.await_count == 1
        finally:
            token_record.access_token = orig_token
            token_record.api_key = orig_key
            token_record.user_id = orig_uid
            await db.commit()


@pytest.mark.asyncio
async def test_5_invalid_webhook_payload_and_6_wrong_client_id():
    """Test 5 & 6: Invalid webhook payload structure and wrong client_id are rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Wrong message_type
        r1 = await ac.post(
            "/api/v1/auth/upstox/notifier",
            json={
                "client_id": "22e100c2-59e7-4d4d-98a0-d69ae3b08c87",
                "user_id": "5GC3MG",
                "access_token": "some_valid_length_token_12345",
                "message_type": "order_update",
            },
        )
        assert r1.status_code == 400

        # Missing fields
        r2 = await ac.post(
            "/api/v1/auth/upstox/notifier",
            json={"message_type": "access_token"},
        )
        assert r2.status_code == 400

        # Wrong client_id (Test 6)
        r3 = await ac.post(
            "/api/v1/auth/upstox/notifier",
            json={
                "client_id": "wrong-malicious-client-id",
                "user_id": "5GC3MG",
                "access_token": "some_valid_length_token_12345",
                "message_type": "access_token",
            },
        )
        assert r3.status_code == 403


@pytest.mark.asyncio
async def test_8_invalid_token_and_9_profile_verification_failure():
    """Test 8 & 9: Webhook with invalid token or failing profile verification never marks broker CONNECTED."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_token = token_record.access_token
        orig_key = token_record.api_key
        orig_uid = token_record.user_id
        orig_valid = token_record.is_valid
        orig_conn = token_record.connection_status
        orig_req_status = token_record.token_request_status
        orig_approved_at = token_record.last_token_approved_at
        orig_issued_at = token_record.issued_at
        orig_expires_at = token_record.expires_at

        try:
            token_record.api_key = "22e100c2-59e7-4d4d-98a0-d69ae3b08c87"
            token_record.user_id = "5GC3MG"
            await db.commit()

            # 1. Already expired token in webhook
            past_exp_ms = int((datetime.utcnow() - timedelta(hours=2)).timestamp() * 1000)
            ok_exp, code_exp, msg_exp, _ = await broker_service.process_notifier_webhook(
                db,
                {
                    "client_id": "22e100c2-59e7-4d4d-98a0-d69ae3b08c87",
                    "user_id": "5GC3MG",
                    "access_token": "expired_webhook_token_1234567890",
                    "expires_at": str(past_exp_ms),
                    "message_type": "access_token",
                },
            )
            assert ok_exp is False
            assert code_exp == 400
            await db.refresh(token_record)
            assert token_record.is_valid is False

            # 2. Token fails live Upstox profile verification
            future_exp_ms = int((datetime.utcnow() + timedelta(hours=10)).timestamp() * 1000)
            with patch(
                "backend.app.services.upstox_client.upstox_client.get_profile",
                new_callable=AsyncMock,
            ) as mock_profile:
                mock_profile.side_effect = UpstoxAuthException(
                    "Invalid token used to access API",
                    status_code=401,
                    error_code="UDAPI100050",
                )

                ok_fail, code_fail, msg_fail, data_fail = await broker_service.process_notifier_webhook(
                    db,
                    {
                        "client_id": "22e100c2-59e7-4d4d-98a0-d69ae3b08c87",
                        "user_id": "5GC3MG",
                        "access_token": "unverified_bad_token_9876543210",
                        "expires_at": str(future_exp_ms),
                        "message_type": "access_token",
                    },
                )
                assert ok_fail is False
                assert code_fail == 401
                await db.refresh(token_record)
                assert token_record.is_valid is False
                assert token_record.connection_status == "AUTH_FAILED"
                assert token_record.token_request_status == "FAILED"
        finally:
            token_record.access_token = orig_token
            token_record.api_key = orig_key
            token_record.user_id = orig_uid
            await db.commit()


@pytest.mark.asyncio
async def test_11_scheduler_timezone_12_duplicate_prevention_13_restart_persistence():
    """Test 11, 12, 13: Scheduler uses Asia/Kolkata, fires once at 08:45 IST, and survives restart without duplicate requests."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_enabled = token_record.auto_request_enabled
        orig_sched = token_record.scheduled_request_time
        orig_date = token_record.last_token_request_date
        orig_valid = token_record.is_valid

        try:
            token_record.auto_request_enabled = True
            token_record.scheduled_request_time = "08:45"
            token_record.last_token_request_date = None
            token_record.is_valid = False
            await db.commit()

            # Before 08:45 AM IST on a Thursday -> should NOT trigger
            thursday_0830_ist = IST.localize(datetime(2026, 11, 5, 8, 30, 0))
            res_early = await broker_service.run_daily_scheduler_tick(db, now_ist=thursday_0830_ist)
            assert res_early is None

            # At 08:45 AM IST on Thursday -> SHOULD trigger once
            thursday_0845_ist = IST.localize(datetime(2026, 11, 5, 8, 45, 5))
            with patch(
                "backend.app.services.upstox_client.upstox_client.request_access_token_v3",
                new_callable=AsyncMock,
            ) as mock_req:
                mock_req.return_value = {
                    "status": "success",
                    "data": {"authorization_expiry": "1793860000000"},
                }

                res_trigger = await broker_service.run_daily_scheduler_tick(db, now_ist=thursday_0845_ist)
                assert res_trigger is not None
                assert res_trigger["triggered"] is True
                assert mock_req.await_count == 1

                # Simulate second worker / backend restart on the same trading day (08:50 AM IST) -> must NOT trigger again!
                thursday_0850_ist = IST.localize(datetime(2026, 11, 5, 8, 50, 0))
                res_dup = await broker_service.run_daily_scheduler_tick(db, now_ist=thursday_0850_ist)
                assert res_dup is None
                assert mock_req.await_count == 1

                # Weekend check: Saturday at 09:00 AM IST -> must NOT trigger
                saturday_0900_ist = IST.localize(datetime(2026, 11, 7, 9, 0, 0))
                res_weekend = await broker_service.run_daily_scheduler_tick(db, now_ist=saturday_0900_ist)
                assert res_weekend is None
        finally:
            token_record.auto_request_enabled = orig_enabled
            token_record.scheduled_request_time = orig_sched
            token_record.last_token_request_date = orig_date
            token_record.is_valid = orig_valid
            await db.commit()


@pytest.mark.asyncio
async def test_14_token_expiry_0330_ist_enforcement():
    """Test 14: Token expiry at 03:30 AM IST automatically marks token TOKEN_EXPIRED and halts live connection."""
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        orig_valid = token_record.is_valid
        orig_exp = token_record.expires_at
        orig_status = token_record.connection_status

        try:
            # Set token as valid yesterday, with expiry at 03:30 AM IST today (in the past)
            token_record.is_valid = True
            token_record.connection_status = "CONNECTED"
            token_record.expires_at = datetime.utcnow() - timedelta(minutes=5)
            await db.commit()

            # Verify connection must immediately detect expiry and mark TOKEN_EXPIRED
            is_conn, msg, _, _ = await broker_service.verify_connection(db, force_check=False)
            assert is_conn is False
            assert "03:30 AM IST" in msg or "Expired" in msg
            await db.refresh(token_record)
            assert token_record.is_valid is False
            assert token_record.connection_status == "TOKEN_EXPIRED"
            assert token_record.token_request_status == "EXPIRED"
        finally:
            token_record.is_valid = orig_valid
            token_record.expires_at = orig_exp
            token_record.connection_status = orig_status
            await db.commit()


@pytest.mark.asyncio
async def test_15_webhook_health_and_validation_endpoints():
    """Test 15: Webhook GET health check and reachability validation endpoints operate reliably."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # GET /api/v1/auth/upstox/notifier probe returns 200 ready
        resp_health = await ac.get("/api/v1/auth/upstox/notifier")
        assert resp_health.status_code == 200
        data_health = resp_health.json()
        assert data_health["status"] == "ready"
        assert "Upstox Notifier Webhook" in data_health["service"]

        # POST /api/v1/auth/webhook/validate with mocked httpx response and public DNS resolution
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get, \
             patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("104.21.23.45", 443))]
            mock_resp = AsyncMock()
            mock_resp.status_code = 200
            mock_get.return_value = mock_resp

            resp_val = await ac.post(
                "/api/v1/auth/webhook/validate",
                json={"url": "https://radiation-handling-fired-lbs.trycloudflare.com/api/v1/auth/upstox/notifier"},
            )
            assert resp_val.status_code == 200
            body = resp_val.json()
            assert body["data"]["is_https"] is True
            assert body["data"]["is_public"] is True
            assert body["data"]["is_reachable"] is True
            assert body["data"]["layer"] == "OK"
            assert "SUCCESS" in body["data"]["diagnosis"]
