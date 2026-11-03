from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.broker_service import broker_service
from backend.app.schemas.settings import BrokerCredentialsUpdate
from backend.app.core.logging import log_critical_action

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/all")
async def get_all_settings(db: AsyncSession = Depends(get_db)):
    """Fetch complete broker credentials state, risk parameters, and strategy configs."""
    token_record = await broker_service.get_or_create_token_record(db)
    config = await broker_service.get_or_create_config(db)

    # Mask API key for security
    api_key = token_record.api_key or ""
    masked_key = (
        f"{api_key[:6]}••••••••{api_key[-4:]}" if len(api_key) > 10 else ("Configured" if api_key else "Not Configured")
    )

    return {
        "connection_status": "connected" if token_record.is_valid else "connection_lost",
        "data": {
            "api_key_configured": bool(token_record.api_key),
            "api_key_masked": masked_key,
            "redirect_uri": token_record.redirect_uri,
            "has_active_token": bool(token_record.access_token),
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
    """Save or update Upstox Developer API credentials."""
    token_record = await broker_service.get_or_create_token_record(db)

    if payload.api_key is not None:
        token_record.api_key = payload.api_key.strip()
    if payload.api_secret is not None:
        token_record.api_secret = payload.api_secret.strip()
    if payload.redirect_uri is not None:
        token_record.redirect_uri = payload.redirect_uri.strip()

    await db.commit()
    await db.refresh(token_record)

    log_critical_action("UPDATE_BROKER_CREDENTIALS", {"api_key_updated": bool(payload.api_key)})

    return {
        "connection_status": "connected" if token_record.is_valid else "connection_lost",
        "data": {
            "api_key_configured": bool(token_record.api_key),
            "redirect_uri": token_record.redirect_uri,
        },
        "message": "Upstox credentials updated.",
    }
