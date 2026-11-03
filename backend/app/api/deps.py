from typing import Tuple
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.broker_service import broker_service
from backend.app.core.exceptions import BrokerConnectionException
from backend.app.models.broker_token import BrokerToken
from backend.app.models.system_config import SystemConfig


async def get_active_broker_token(
    db: AsyncSession = Depends(get_db),
) -> Tuple[BrokerToken, str]:
    """Ensures broker connection is live; otherwise aborts with connection_lost 503."""
    is_connected, msg, _, _ = await broker_service.verify_connection(db)
    if not is_connected:
        raise BrokerConnectionException(msg or "Broker connection lost. No data available.")

    token_record = await broker_service.get_or_create_token_record(db)
    return token_record, token_record.access_token


async def get_system_config(
    db: AsyncSession = Depends(get_db),
) -> SystemConfig:
    return await broker_service.get_or_create_config(db)

