from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.broker_service import broker_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.broker import BrokerStatusData, DisconnectResponse
from backend.app.core.logging import log_critical_action

router = APIRouter(prefix="/broker", tags=["Broker Connection"])


@router.get("/status", response_model=APIResponse[BrokerStatusData])
async def get_broker_status(db: AsyncSession = Depends(get_db)):
    """
    Dedicated endpoint to check Upstox connection and access token validity.
    Performs real Upstox user profile verification against https://api.upstox.com/v2/user/profile.
    """
    is_connected, message, profile_data, latency_ms = await broker_service.verify_connection(db)
    token_record = await broker_service.get_or_create_token_record(db)
    config = await broker_service.get_or_create_config(db)

    conn_status = token_record.connection_status or ("CONNECTED" if is_connected else "DISCONNECTED")

    if not is_connected:
        return {
            "connection_status": conn_status.lower(),
            "data": {
                "is_connected": False,
                "connection_status": conn_status,
                "user_id": token_record.user_id,
                "user_name": token_record.user_name,
                "email": token_record.email,
                "broker_name": "Upstox",
                "api_key_configured": bool(token_record.api_key),
                "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
                "latency_ms": latency_ms,
                "last_error": token_record.last_error,
                "mode": config.mode,
            },
            "message": message or "Broker disconnected. No active session.",
        }

    return {
        "connection_status": "connected",
        "data": {
            "is_connected": True,
            "connection_status": "CONNECTED",
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
            "broker_name": "Upstox",
            "api_key_configured": bool(token_record.api_key),
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
            "latency_ms": latency_ms,
            "last_error": None,
            "mode": config.mode,
        },
        "message": message or "Connected to Upstox Live OMS",
    }


@router.post("/disconnect", response_model=APIResponse[DisconnectResponse])
async def disconnect_broker(db: AsyncSession = Depends(get_db)):
    """Disconnect active Upstox session and clear token."""
    await broker_service.disconnect(db)
    token_record = await broker_service.get_or_create_token_record(db)
    log_critical_action("DISCONNECT_BROKER", {"user_id": token_record.user_id})

    return {
        "connection_status": "disconnected",
        "data": {
            "is_connected": False,
            "connection_status": "DISCONNECTED",
            "message": "Upstox session disconnected.",
        },
        "message": "Broker session disconnected.",
    }
