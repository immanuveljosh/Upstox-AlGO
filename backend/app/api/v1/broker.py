from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.broker_service import broker_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.broker import BrokerStatusData

router = APIRouter(prefix="/broker", tags=["Broker Connection"])


@router.get("/status", response_model=APIResponse[BrokerStatusData])
async def get_broker_status(db: AsyncSession = Depends(get_db)):
    """
    Dedicated endpoint to check Upstox connection and access token validity.
    Returns:
    {
       "connection_status": "connection_lost",
       "data": null,
       "message": "Broker connection lost. No data available."
     }
    when disconnected.
    """
    is_connected, message, profile_data, latency_ms = await broker_service.verify_connection(db)
    token_record = await broker_service.get_or_create_token_record(db)
    config = await broker_service.get_or_create_config(db)

    if not is_connected:
        return {
            "connection_status": "connection_lost",
            "data": None,
            "message": message or "Broker connection lost. No data available.",
        }

    return {
        "connection_status": "connected",
        "data": {
            "is_connected": True,
            "connection_status": "connected",
            "user_id": token_record.user_id,
            "user_name": token_record.user_name,
            "email": token_record.email,
            "broker_name": "Upstox",
            "api_key_configured": bool(token_record.api_key),
            "last_verified": token_record.last_verified_at.isoformat() if token_record.last_verified_at else None,
            "latency_ms": latency_ms,
            "mode": config.mode,
        },
        "message": message or "Connected to Upstox Live OMS",
    }
