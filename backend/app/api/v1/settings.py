from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.broker_service import broker_service
from backend.app.schemas.settings import BrokerCredentialsUpdate
from backend.app.core.logging import log_critical_action

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/all")
async def get_all_settings(db: AsyncSession = Depends(get_db)):
    """
    Fetch complete broker credentials state, risk parameters, and strategy configs.
    Security: Client Secret is NEVER returned in plaintext.
    """
    token_record = await broker_service.get_or_create_token_record(db)
    config = await broker_service.get_or_create_config(db)

    # API key masking
    api_key = token_record.api_key or ""
    masked_key = (
        f"{api_key[:6]}••••••••{api_key[-4:]}" if len(api_key) > 10 else ("Configured" if api_key else "Not Configured")
    )

    # Access token masking
    raw_token = token_record.access_token or ""
    masked_token = (
        f"{raw_token[:8]}••••••••{raw_token[-6:]}" if len(raw_token) > 16 else ("Active" if raw_token else "")
    )

    conn_status = token_record.connection_status or ("CONNECTED" if token_record.is_valid else "DISCONNECTED")

    return {
        "connection_status": conn_status.lower(),
        "data": {
            "api_key": api_key,
            "api_key_configured": bool(token_record.api_key),
            "api_key_masked": masked_key,
            "has_api_secret": bool(token_record.api_secret),
            "api_secret_masked": "••••••••••••" if token_record.api_secret else "",
            "redirect_uri": token_record.redirect_uri,
            "has_active_token": bool(token_record.access_token),
            "access_token_masked": masked_token,
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
            "broker_name": "Upstox",
            "connection_status": conn_status,
            "is_connected": token_record.is_valid,
            "latency_ms": 120 if token_record.is_valid else 0,
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
            "mode": config.mode,
            "strategy_name": config.strategy_name,
            "strategy_status": config.strategy_status,
            "lot_size": config.lot_size,
            "lots": config.lots,
            "option_selection": config.option_selection,
            "total_capital": config.total_capital,
            "stoploss_capital_pct": config.stoploss_capital_pct,
            "target_capital_pct": config.target_capital_pct,
            "max_trades_per_day": config.max_trades_per_day,
        },
        "message": "Settings retrieved.",
    }


@router.put("/broker")
async def update_broker_credentials(
    payload: BrokerCredentialsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Save or update Upstox Developer API credentials.
    Security: Validates fields; does not overwrite existing values with empty strings.
    Re-verifies connection against genuine Upstox profile API when credentials or tokens change.
    """
    token_record = await broker_service.get_or_create_token_record(db)

    changed = False

    # Safely update API key only if non-empty
    if payload.api_key is not None and payload.api_key.strip():
        new_key = payload.api_key.strip()
        if new_key != token_record.api_key:
            token_record.api_key = new_key
            changed = True

    # Safely update API secret only if non-empty (never overwrite with blank)
    if payload.api_secret is not None and payload.api_secret.strip():
        new_secret = payload.api_secret.strip()
        if new_secret != token_record.api_secret:
            token_record.api_secret = new_secret
            changed = True

    # Safely update Redirect URI only if non-empty
    if payload.redirect_uri is not None and payload.redirect_uri.strip():
        new_redirect = payload.redirect_uri.strip()
        if new_redirect != token_record.redirect_uri:
            token_record.redirect_uri = new_redirect
            changed = True

    # Safely update Access Token if provided
    if payload.access_token is not None and payload.access_token.strip():
        new_token = payload.access_token.strip()
        if new_token != token_record.access_token:
            token_record.access_token = new_token
            changed = True

    await db.commit()
    await db.refresh(token_record)

    # Re-verify live connection if credentials or token were modified
    is_connected = token_record.is_valid
    msg = "Upstox credentials updated."
    latency_ms = 0

    if changed and token_record.access_token:
        is_connected, msg, profile, latency_ms = await broker_service.verify_connection(db, force_check=True)
    elif not token_record.access_token:
        token_record.is_valid = False
        token_record.connection_status = "DISCONNECTED"
        await db.commit()
        is_connected = False
        msg = "Credentials saved. Please authenticate with Upstox via Login with Upstox."

    log_critical_action("UPDATE_BROKER_CREDENTIALS", {
        "api_key_updated": bool(payload.api_key),
        "is_connected": is_connected,
        "ucc": token_record.user_id,
    })

    conn_status = token_record.connection_status or ("CONNECTED" if is_connected else "DISCONNECTED")

    return {
        "connection_status": conn_status.lower(),
        "data": {
            "api_key_configured": bool(token_record.api_key),
            "redirect_uri": token_record.redirect_uri,
            "has_active_token": bool(token_record.access_token),
            "is_connected": is_connected,
            "connection_status": conn_status,
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "latency_ms": latency_ms,
        },
        "message": msg,
    }
