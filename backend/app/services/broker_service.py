import time
from datetime import datetime
from typing import Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.broker_token import BrokerToken
from backend.app.models.system_config import SystemConfig
from backend.app.services.upstox_client import upstox_client
from backend.app.core.config import settings
from backend.app.core.logging import logger


class BrokerService:
    """Central service managing Upstox credentials, token validation, and connection telemetry."""

    async def get_or_create_token_record(self, db: AsyncSession) -> BrokerToken:
        stmt = select(BrokerToken).limit(1)
        result = await db.execute(stmt)
        record = result.scalars().first()
        if not record:
            record = BrokerToken(
                api_key=settings.UPSTOX_API_KEY,
                api_secret=settings.UPSTOX_API_SECRET,
                redirect_uri=settings.UPSTOX_REDIRECT_URI,
                access_token=None,
                is_valid=False,
            )
            db.add(record)
            await db.commit()
            await db.refresh(record)
        return record

    async def get_or_create_config(self, db: AsyncSession) -> SystemConfig:
        stmt = select(SystemConfig).limit(1)
        result = await db.execute(stmt)
        config = result.scalars().first()
        if not config:
            config = SystemConfig(
                mode=settings.DEFAULT_TRADING_MODE,
                strategy_name="Gift Nifty Directional",
                underlying="NIFTY",
                strategy_status="STOPPED",
                gift_nifty_signal_threshold=80.0,
                option_selection="ITM 3",
                entry_window_start="09:15",
                entry_window_end="09:17",
                max_trades_per_day=1,
                total_capital=200000.0,
                stoploss_capital_pct=5.0,
                target_capital_pct=6.0,
                lot_size=settings.NIFTY_LOT_SIZE,
                lots=2,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)
        return config

    async def verify_connection(
        self, db: AsyncSession, force_check: bool = False
    ) -> Tuple[bool, Optional[str], Optional[dict], int]:
        """
        Validate the current Upstox token.
        Returns: (is_connected: bool, message: Optional[str], profile_data: Optional[dict], latency_ms: int)
        """
        token_record = await self.get_or_create_token_record(db)

        if not token_record.access_token:
            token_record.is_valid = False
            await db.commit()
            return False, "No Upstox access token configured. Please authenticate via OAuth or enter access token.", None, 0

        # Ping Upstox profile endpoint to verify live session
        start_time = time.time()
        try:
            profile_response = await upstox_client.get_profile(token_record.access_token)
            latency_ms = int((time.time() - start_time) * 1000)

            # Update token record cache
            token_record.is_valid = True
            token_record.last_verified_at = datetime.utcnow()
            user_data = profile_response.get("data", {})
            token_record.user_id = user_data.get("user_id") or token_record.user_id
            token_record.user_name = user_data.get("user_name") or token_record.user_name
            token_record.email = user_data.get("email") or token_record.email
            await db.commit()

            return True, "Connected to Upstox Live OMS", user_data, latency_ms

        except Exception as exc:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.warning(f"Upstox token validation failed: {str(exc)}")
            token_record.is_valid = False
            token_record.last_verified_at = datetime.utcnow()
            await db.commit()
            return False, "Broker connection lost. Access token is invalid or expired.", None, latency_ms

    async def update_access_token(self, db: AsyncSession, access_token: str) -> Tuple[bool, str]:
        """Update access token and immediately verify it."""
        token_record = await self.get_or_create_token_record(db)
        token_record.access_token = access_token.strip()
        await db.commit()

        is_connected, msg, profile, _ = await self.verify_connection(db, force_check=True)
        return is_connected, msg


broker_service = BrokerService()

