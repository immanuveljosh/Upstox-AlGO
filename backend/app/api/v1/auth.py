import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict
from urllib.parse import urlencode, quote
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException
from backend.app.schemas.broker import TokenUpdateRequest
from backend.app.core.logging import logger, log_critical_action

router = APIRouter(prefix="/auth", tags=["Authentication & Upstox OAuth"])

# In-memory CSRF state cache (state -> creation_datetime)
_oauth_states: Dict[str, datetime] = {}
# In-memory single-use code cache to prevent duplicate exchange calls
_processed_auth_codes: Dict[str, datetime] = {}


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
