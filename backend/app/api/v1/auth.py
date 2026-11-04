from typing import Optional
from urllib.parse import urlencode, quote
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client
from backend.app.schemas.broker import TokenUpdateRequest
from backend.app.core.logging import logger, log_critical_action

router = APIRouter(prefix="/auth", tags=["Authentication & Upstox OAuth"])


@router.get("/login")
async def get_login_url(db: AsyncSession = Depends(get_db)):
    """
    Returns Upstox OAuth2 dialog authorization URL.
    Format: https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=...&redirect_uri=...
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

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
    }
    auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"

    return {
        "connection_status": "connected",
        "data": {
            "authorization_url": auth_url,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
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

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
    }
    auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def auth_callback(
    code: str = Query(..., description="Authorization code from Upstox redirect"),
    format: Optional[str] = Query(None, description="'json' to return JSON payload, otherwise redirects to frontend"),
    db: AsyncSession = Depends(get_db),
):
    """
    OAuth2 callback: exchanges authorization code for Upstox access_token and stores it.
    """
    token_record = await broker_service.get_or_create_token_record(db)
    client_id = token_record.api_key or settings.UPSTOX_API_KEY
    client_secret = token_record.api_secret or settings.UPSTOX_API_SECRET
    redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

    try:
        token_data = await upstox_client.exchange_token(
            code=code,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )

        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access_token returned by Upstox OAuth endpoint.")

        is_connected, msg = await broker_service.update_access_token(db, access_token)
        log_critical_action("OAUTH_TOKEN_EXCHANGED", {"status": is_connected})

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

        # Browser redirect to Next.js frontend with query params
        redirect_url = f"{settings.FRONTEND_URL}/?auth=connected&ucc={token_record.user_id or ''}"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    except Exception as exc:
        logger.error(f"Upstox OAuth callback failed: {str(exc)}")
        if format == "json":
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": f"OAuth token exchange failed: {str(exc)}",
            }
        
        error_url = f"{settings.FRONTEND_URL}/?auth=error&msg={quote(str(exc))}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)


@router.post("/token")
async def set_manual_token(
    payload: TokenUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manual Upstox access token configuration."""
    is_connected, msg = await broker_service.update_access_token(db, payload.access_token)
    token_record = await broker_service.get_or_create_token_record(db)

    log_critical_action("MANUAL_TOKEN_UPDATE", {"is_connected": is_connected})

    return {
        "connection_status": "connected" if is_connected else "connection_lost",
        "data": {
            "is_connected": is_connected,
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
        },
        "message": msg,
    }


@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db)):
    """Fetch active trader profile from Upstox."""
    is_connected, msg, profile, latency = await broker_service.verify_connection(db)
    if not is_connected:
        return {
            "connection_status": "connection_lost",
            "data": None,
            "message": msg or "Broker connection lost. User session inactive.",
        }

    token_record = await broker_service.get_or_create_token_record(db)
    return {
        "connection_status": "connected",
        "data": {
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
            "broker": "Upstox",
            "latency_ms": latency,
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
        },
        "message": "User session active.",
    }

