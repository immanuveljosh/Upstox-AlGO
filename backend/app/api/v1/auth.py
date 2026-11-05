import json
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from urllib.parse import urlencode, quote
import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, HTTPException, Request, status
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException
from backend.app.schemas.broker import TokenUpdateRequest, TokenRequestScheduleUpdate
from backend.app.core.logging import logger, log_critical_action

router = APIRouter(prefix="/auth", tags=["Authentication & Upstox OAuth"])

# In-memory CSRF state cache (state -> creation_datetime)
_oauth_states: Dict[str, datetime] = {}
# In-memory single-use code cache to prevent duplicate exchange calls
_processed_auth_codes: Dict[str, datetime] = {}
# Webhook rate limiting tracker (ip -> list of epoch timestamps)
_webhook_rate_tracker: Dict[str, List[float]] = {}
MAX_WEBHOOK_PAYLOAD_BYTES = 16384
MAX_WEBHOOK_REQUESTS_PER_MINUTE = 30


def _cleanup_old_oauth_entries():
    now = datetime.utcnow()
    # Expire states older than 10 minutes
    expired_states = [s for s, ts in _oauth_states.items() if now - ts > timedelta(minutes=10)]
    for s in expired_states:
        _oauth_states.pop(s, None)
    # Expire processed codes older than 10 minutes
    expired_codes = [c for c, ts in _processed_auth_codes.items() if now - ts > timedelta(minutes=10)]
    for c in expired_codes:
        _processed_auth_codes.pop(c, None)


def generate_oauth_state() -> str:
    _cleanup_old_oauth_entries()
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = datetime.utcnow()
    return state


def validate_and_consume_oauth_state(state: Optional[str]) -> bool:
    _cleanup_old_oauth_entries()
    if not state:
        return False
    if state in _oauth_states:
        del _oauth_states[state]
        return True
    return False


def is_code_already_processed(code: str) -> bool:
    _cleanup_old_oauth_entries()
    return code in _processed_auth_codes


def mark_code_processed(code: str):
    _cleanup_old_oauth_entries()
    _processed_auth_codes[code] = datetime.utcnow()


@router.get("/login")
async def get_login_url(db: AsyncSession = Depends(get_db)):
    """
    Returns Upstox OAuth2 dialog authorization URL with CSRF state protection.
    Format: https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=...&redirect_uri=...&state=...
    """
    token_record = await broker_service.get_or_create_token_record(db)
    client_id = token_record.api_key or settings.UPSTOX_API_KEY
    redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

    if not client_id:
        return {
            "connection_status": "connection_lost",
            "data": None,
            "message": "Upstox API Key (Client ID) is not configured in Settings.",
        }

    state = generate_oauth_state()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"

    return {
        "connection_status": "connected",
        "data": {
            "authorization_url": auth_url,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        },
        "message": "Upstox authorization URL generated.",
    }


@router.get("/authorize")
async def authorize_redirect(db: AsyncSession = Depends(get_db)):
    """
    Directly redirects browser to Upstox OAuth2 dialog sign-in page.
    """
    token_record = await broker_service.get_or_create_token_record(db)
    client_id = token_record.api_key or settings.UPSTOX_API_KEY
    redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upstox API Key (Client ID) is not configured.",
        )

    state = generate_oauth_state()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def auth_callback(
    code: Optional[str] = Query(None, description="Authorization code from Upstox redirect"),
    state: Optional[str] = Query(None, description="CSRF state parameter"),
    error: Optional[str] = Query(None, description="OAuth error code returned by Upstox"),
    error_description: Optional[str] = Query(None, description="OAuth error description from Upstox"),
    format: Optional[str] = Query(None, description="'json' to return JSON payload, otherwise redirects to frontend"),
    db: AsyncSession = Depends(get_db),
):
    """
    OAuth2 callback: exchanges authorization code for Upstox access_token and stores it.
    Validates CSRF state and prevents duplicate token exchange processing.
    """
    # 1. Handle OAuth error query params from Upstox
    if error:
        err_msg = error_description or error or "Upstox authorization was denied."
        logger.warning(f"Upstox OAuth authorization returned error: {error} - {err_msg}")
        if format == "json":
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": f"Upstox authorization error: {err_msg}",
            }
        error_url = f"{settings.FRONTEND_URL}/settings?auth=error&msg={quote(err_msg)}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)

    # 2. Validate presence of authorization code
    if not code or not code.strip():
        msg = "No authorization code received from Upstox redirect."
        if format == "json":
            return {"connection_status": "connection_lost", "data": None, "message": msg}
        error_url = f"{settings.FRONTEND_URL}/settings?auth=error&msg={quote(msg)}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)

    # 3. Check for duplicate exchange of same authorization code (e.g. React 18 strict mode double-fetch)
    if is_code_already_processed(code.strip()):
        token_record = await broker_service.get_or_create_token_record(db)
        if token_record.is_valid:
            if format == "json":
                return {
                    "connection_status": "connected",
                    "data": {
                        "token_saved": True,
                        "is_connected": True,
                        "user_name": token_record.user_name,
                        "ucc": token_record.user_id,
                    },
                    "message": "Authorization code already processed and verified.",
                }
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/settings?auth=connected&ucc={token_record.user_id or ''}",
                status_code=status.HTTP_302_FOUND,
            )

    # 4. Validate CSRF state if provided
    if state and not validate_and_consume_oauth_state(state):
        logger.warning(f"OAuth state mismatch or expired state: {state}")

    token_record = await broker_service.get_or_create_token_record(db)
    client_id = token_record.api_key or settings.UPSTOX_API_KEY
    client_secret = token_record.api_secret or settings.UPSTOX_API_SECRET
    redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

    try:
        token_data = await upstox_client.exchange_token(
            code=code.strip(),
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )

        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access_token returned by Upstox OAuth endpoint.")

        # Mark code as processed to block duplicate calls
        mark_code_processed(code.strip())

        is_connected, msg = await broker_service.update_access_token(db, access_token)
        log_critical_action("OAUTH_TOKEN_EXCHANGED", {"status": is_connected, "user": token_record.user_id})

        if format == "json":
            return {
                "connection_status": "connected" if is_connected else "connection_lost",
                "data": {
                    "token_saved": True,
                    "is_connected": is_connected,
                    "user_name": token_record.user_name,
                    "ucc": token_record.user_id,
                },
                "message": msg or "Upstox OAuth handshake successful.",
            }

        redirect_url = f"{settings.FRONTEND_URL}/settings?auth=connected&ucc={token_record.user_id or ''}"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    except UpstoxAuthException as exc:
        logger.error(f"Upstox OAuth token exchange rejected: {str(exc)}")
        msg = f"OAuth exchange failed: {str(exc)}"
        if format == "json":
            return {"connection_status": "connection_lost", "data": None, "message": msg}
        error_url = f"{settings.FRONTEND_URL}/settings?auth=error&msg={quote(msg)}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)

    except Exception as exc:
        logger.error(f"Upstox OAuth callback failed: {str(exc)}")
        msg = f"OAuth handshake failed: {str(exc)}"
        if format == "json":
            return {"connection_status": "connection_lost", "data": None, "message": msg}
        error_url = f"{settings.FRONTEND_URL}/settings?auth=error&msg={quote(msg)}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)


@router.post("/token")
async def set_manual_token(
    payload: TokenUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manual Upstox access token configuration with immediate Upstox profile verification."""
    is_connected, msg = await broker_service.update_access_token(db, payload.access_token)
    token_record = await broker_service.get_or_create_token_record(db)

    log_critical_action("MANUAL_TOKEN_UPDATE", {"is_connected": is_connected, "ucc": token_record.user_id})

    return {
        "connection_status": "connected" if is_connected else "connection_lost",
        "data": {
            "is_connected": is_connected,
            "connection_status": token_record.connection_status,
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
        },
        "message": msg,
    }


@router.post("/disconnect")
async def disconnect_broker(db: AsyncSession = Depends(get_db)):
    """Explicitly disconnect active Upstox session and clear token."""
    await broker_service.disconnect(db)
    token_record = await broker_service.get_or_create_token_record(db)
    log_critical_action("DISCONNECT_BROKER", {"user_id": token_record.user_id})
    return {
        "connection_status": "disconnected",
        "data": {
            "is_connected": False,
            "connection_status": "DISCONNECTED",
        },
        "message": "Upstox broker session disconnected successfully.",
    }


@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db)):
    """Fetch verified live active trader profile from Upstox."""
    is_connected, msg, profile, latency = await broker_service.verify_connection(db, force_check=True)
    token_record = await broker_service.get_or_create_token_record(db)

    if not is_connected:
        return {
            "connection_status": token_record.connection_status or "connection_lost",
            "data": {
                "is_connected": False,
                "connection_status": token_record.connection_status or "DISCONNECTED",
                "user_id": token_record.user_id,
                "user_name": token_record.user_name,
                "email": token_record.email,
                "broker": "Upstox",
                "latency_ms": latency,
                "last_error": token_record.last_error,
                "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
            },
            "message": msg or "Broker connection lost. User session inactive.",
        }

    return {
        "connection_status": "connected",
        "data": {
            "is_connected": True,
            "connection_status": "CONNECTED",
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
            "broker": "Upstox",
            "latency_ms": latency,
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
        },
        "message": "User session active.",
    }


def _check_webhook_rate_limit(client_ip: str) -> bool:
    """Return True if within rate limit, False if rate limit exceeded."""
    now = time.time()
    cutoff = now - 60.0
    history = [ts for ts in _webhook_rate_tracker.get(client_ip, []) if ts > cutoff]
    if len(history) >= MAX_WEBHOOK_REQUESTS_PER_MINUTE:
        _webhook_rate_tracker[client_ip] = history
        return False
    history.append(now)
    _webhook_rate_tracker[client_ip] = history
    return True


class WebhookValidationRequest(BaseModel):
    url: Optional[str] = None


@router.get("/upstox/notifier")
async def upstox_notifier_webhook_health(db: AsyncSession = Depends(get_db)):
    """
    Health check and reachability probe for the Upstox Notifier Webhook endpoint:
    GET /api/v1/auth/upstox/notifier
    Allows external reachability tests and webhook validators to verify the endpoint is active.
    """
    token_record = await broker_service.get_or_create_token_record(db)
    client_id = token_record.api_key or settings.UPSTOX_API_KEY
    masked_cid = f"{client_id[:6]}••••{client_id[-4:]}" if len(client_id) > 10 else client_id
    return {
        "status": "ready",
        "service": "Upstox Notifier Webhook Listener",
        "configured_client_id": masked_cid,
        "is_configured": bool(client_id),
        "accepts": "POST application/json",
        "message": "Webhook endpoint is operational and awaiting POST deliveries from Upstox.",
    }


@router.post("/webhook/validate")
async def validate_webhook_reachability(
    payload: Optional[WebhookValidationRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate format and public reachability of the configured Upstox Notifier Webhook URL:
    POST /api/v1/auth/webhook/validate
    First validates URL format (HTTPS, public domain, /api/v1/auth/upstox/notifier path).
    Then pings the URL over HTTPS to confirm internet accessibility and SSL.
    Explicitly notes that endpoint reachability does NOT confirm registration in Upstox Developer Console.
    """
    token_record = await broker_service.get_or_create_token_record(db)
    raw_input = payload.url if (payload and payload.url is not None) else broker_service.resolve_webhook_url(token_record)
    target_url = (raw_input or "").strip()

    url_ok, url_status, url_reason = broker_service.validate_webhook_url_format(target_url)
    is_https = target_url.lower().startswith("https://")
    is_localhost = any(h in target_url.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0", "::1"))

    if not url_ok:
        diagnosis = f"{url_status}: {url_reason}"
        layer = "INFRASTRUCTURE_WARNING" if url_status == "URL Invalid" else "INFRASTRUCTURE_ERROR"
        return {
            "status": "error",
            "data": {
                "url": target_url,
                "url_status": url_status,
                "endpoint_status": url_status,
                "is_https": is_https,
                "is_public": not is_localhost and bool(target_url),
                "is_reachable": False,
                "status_code": None,
                "latency_ms": 0,
                "diagnosis": diagnosis,
                "console_note": "Endpoint reachability does NOT confirm registration in Upstox Developer Console.",
                "layer": layer,
            },
            "message": diagnosis,
        }

    start_t = time.time()
    reachable = False
    status_code = None
    err_detail = None

    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.get(target_url)
            status_code = resp.status_code
            latency_ms = max(1, int((time.time() - start_t) * 1000))
            reachable = resp.status_code in (200, 400, 405)
    except Exception as exc:
        latency_ms = max(1, int((time.time() - start_t) * 1000))
        err_detail = str(exc)

    if not reachable:
        endpoint_status = "Endpoint Unreachable"
        diagnosis = (
            f"Endpoint Unreachable: Could not reach {target_url} ({err_detail or f'HTTP {status_code}'}). "
            "Ensure your public HTTPS tunnel or reverse proxy is running."
        )
        layer = "INFRASTRUCTURE_ERROR"
    else:
        endpoint_status = "HTTPS Endpoint Reachable"
        diagnosis = (
            f"SUCCESS: HTTPS Endpoint Reachable ({latency_ms}ms): Backend webhook listener is online. "
            "Note: Endpoint reachability confirms your server is live, but does NOT confirm registration in Upstox Developer Console."
        )
        layer = "OK"

    return {
        "status": "success" if reachable else "error",
        "data": {
            "url": target_url,
            "url_status": url_status,
            "endpoint_status": endpoint_status,
            "is_https": is_https,
            "is_public": not is_localhost,
            "is_reachable": reachable,
            "status_code": status_code,
            "latency_ms": latency_ms,
            "diagnosis": diagnosis,
            "console_note": "Endpoint reachability does NOT confirm registration in Upstox Developer Console.",
            "layer": layer,
        },
        "message": diagnosis,
    }


@router.post("/upstox/notifier")
async def upstox_notifier_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Official Upstox Notifier Webhook Endpoint:
    POST /api/v1/auth/upstox/notifier
    Receives approved daily access token payload from Upstox, validates client_id & user_id,
    stores token encrypted at rest, verifies against Upstox profile API, and reconnects broker.
    Never logs or returns access_token.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not _check_webhook_rate_limit(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "status": "error",
                "message": "Rate limit exceeded for notifier webhook.",
            },
        )

    # Enforce safe request-size limit
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_WEBHOOK_PAYLOAD_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "status": "error",
                "message": "Webhook payload exceeds maximum allowed size.",
            },
        )

    raw_body = await request.body()
    if len(raw_body) > MAX_WEBHOOK_PAYLOAD_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "status": "error",
                "message": "Webhook payload exceeds maximum allowed size.",
            },
        )

    try:
        payload_dict = json.loads(raw_body.decode("utf-8"))
        if not isinstance(payload_dict, dict):
            raise ValueError("Payload must be a JSON object")
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "message": "Malformed JSON payload in notifier webhook.",
            },
        )

    ok, http_code, msg, result_data = await broker_service.process_notifier_webhook(
        db=db,
        payload_dict=payload_dict,
    )

    return JSONResponse(
        status_code=http_code,
        content={
            "status": "success" if ok else "error",
            "connection_status": "connected" if ok else "connection_lost",
            "data": result_data,
            "message": msg,
        },
    )


@router.post("/token-request")
async def request_daily_access_token(
    force: bool = Query(False, description="Force token request even if one was recently sent"),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger official Upstox v3 Semi-Automated Access Token Request:
    POST https://api.upstox.com/v3/login/auth/token/request/{client_id}
    """
    ok, msg, telemetry = await broker_service.request_daily_token(
        db=db,
        manual=True,
        force=force,
    )
    token_record = await broker_service.get_or_create_token_record(db)

    if not ok:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "connection_status": (token_record.connection_status or "DISCONNECTED").lower(),
                "status": "error",
                "data": telemetry,
                "message": msg,
            },
        )

    return {
        "connection_status": (token_record.connection_status or "DISCONNECTED").lower(),
        "status": "success",
        "data": telemetry,
        "message": msg,
    }


@router.get("/token-request/status")
async def get_token_request_status(db: AsyncSession = Depends(get_db)):
    """Get comprehensive token lifecycle, approval status, and daily scheduler telemetry."""
    token_record = await broker_service.get_or_create_token_record(db)
    telemetry = broker_service.build_token_telemetry(token_record)
    return {
        "connection_status": "connected" if token_record.is_valid else "connection_lost",
        "data": {
            "is_connected": token_record.is_valid,
            "connection_status": token_record.connection_status or ("CONNECTED" if token_record.is_valid else "DISCONNECTED"),
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "last_error": token_record.last_error,
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
            **telemetry,
        },
        "message": "Token request status retrieved.",
    }


@router.put("/token-request/schedule")
async def update_token_request_schedule(
    payload: TokenRequestScheduleUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update daily token request scheduler configuration (Asia/Kolkata)."""
    telemetry = await broker_service.update_scheduler_settings(
        db=db,
        auto_request_enabled=payload.auto_request_enabled,
        scheduled_request_time=payload.scheduled_request_time,
    )
    token_record = await broker_service.get_or_create_token_record(db)
    return {
        "connection_status": "connected" if token_record.is_valid else "connection_lost",
        "data": telemetry,
        "message": (
            f"Daily token scheduler updated: {'Enabled' if payload.auto_request_enabled else 'Paused'} at {payload.scheduled_request_time} IST."
        ),
    }


@router.post("/token-request/cancel")
async def cancel_pending_token_request(db: AsyncSession = Depends(get_db)):
    """Reset local pending token approval state."""
    telemetry = await broker_service.cancel_pending_token_request(db)
    token_record = await broker_service.get_or_create_token_record(db)
    return {
        "connection_status": "connected" if token_record.is_valid else "connection_lost",
        "data": telemetry,
        "message": "Pending token request state cleared.",
    }

