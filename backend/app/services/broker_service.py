import time
from datetime import datetime
from typing import Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.broker_token import BrokerToken
from backend.app.models.system_config import SystemConfig
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.strategy.nifty_directional import (
    STRATEGY_ID,
    STRATEGY_NAME,
    UNDERLYING,
    OPTION_SELECTION,
    DEFAULT_SIGNAL_THRESHOLD,
    DEFAULT_STOPLOSS_CAPITAL_PCT,
    DEFAULT_TARGET_CAPITAL_PCT,
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_LOTS,
)


class BrokerService:
    """Central service managing Upstox credentials, token validation, and connection telemetry."""

    _tables_initialized: bool = False

    async def _ensure_tables(self) -> None:
        if not BrokerService._tables_initialized:
            from backend.app.core.database import engine
            from backend.app.models import Base
            from sqlalchemy import text

            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # Check and add optional execution monitoring columns to orders table if missing
                for col_name, col_type in [
                    ("expected_price", "FLOAT"),
                    ("slippage", "FLOAT"),
                    ("signal_time", "DATETIME"),
                    ("broker_confirmed_at", "DATETIME"),
                    ("exit_reason", "VARCHAR(100)"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col_name} {col_type}"))
                    except Exception:
                        pass

                # Check and add connection tracking columns to broker_tokens table if missing
                for col_name, col_type in [
                    ("connection_status", "VARCHAR(50)"),
                    ("last_error", "VARCHAR(500)"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE broker_tokens ADD COLUMN {col_name} {col_type}"))
                    except Exception:
                        pass
            BrokerService._tables_initialized = True

    async def get_or_create_token_record(self, db: AsyncSession) -> BrokerToken:
        await self._ensure_tables()
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
        await self._ensure_tables()
        stmt = select(SystemConfig).limit(1)
        result = await db.execute(stmt)
        config = result.scalars().first()
        if not config:
            config = SystemConfig(
                mode=settings.DEFAULT_TRADING_MODE,
                strategy_id=STRATEGY_ID,
                strategy_name=STRATEGY_NAME,
                underlying=UNDERLYING,
                strategy_status="STOPPED",
                gift_nifty_signal_threshold=DEFAULT_SIGNAL_THRESHOLD,
                option_selection=OPTION_SELECTION,
                entry_window_start="09:15:00",
                entry_window_end="09:17:00",
                max_trades_per_day=1,
                total_capital=DEFAULT_TOTAL_CAPITAL,
                stoploss_capital_pct=DEFAULT_STOPLOSS_CAPITAL_PCT,
                target_capital_pct=DEFAULT_TARGET_CAPITAL_PCT,
                lot_size=settings.NIFTY_LOT_SIZE,
                lots=DEFAULT_LOTS,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)
        else:
            # Migrate any legacy strategy defaults to Nifty Directional (4% SL / 5% Target)
            mutated = False
            if config.strategy_id != STRATEGY_ID or config.strategy_name != STRATEGY_NAME:
                config.strategy_id = STRATEGY_ID
                config.strategy_name = STRATEGY_NAME
                if config.stoploss_capital_pct == 5.0 and config.target_capital_pct == 6.0:
                    config.stoploss_capital_pct = DEFAULT_STOPLOSS_CAPITAL_PCT
                    config.target_capital_pct = DEFAULT_TARGET_CAPITAL_PCT
                config.entry_window_start = "09:15:00"
                config.entry_window_end = "09:17:00"
                mutated = True
            if config.lot_size == 25:
                config.lot_size = settings.NIFTY_LOT_SIZE
                mutated = True
            if mutated:
                await db.commit()
                await db.refresh(config)
        return config

    async def verify_connection(
        self, db: AsyncSession, force_check: bool = False
    ) -> Tuple[bool, Optional[str], Optional[dict], int]:
        """
        Validate the current Upstox token using the official Upstox user profile API.
        Returns: (is_connected: bool, message: Optional[str], profile_data: Optional[dict], latency_ms: int)
        """
        token_record = await self.get_or_create_token_record(db)

        if not token_record.access_token or not token_record.access_token.strip():
            token_record.is_valid = False
            token_record.connection_status = "DISCONNECTED"
            token_record.last_error = "No Upstox access token configured."
            await db.commit()
            return False, "Disconnected: No active Upstox access token configured. Please authenticate via OAuth or enter access token.", None, 0

        # Fast cached response if verified recently (< 10s) and not force_check
        now = datetime.utcnow()
        if (
            not force_check
            and token_record.is_valid
            and token_record.last_verified_at
            and (now - token_record.last_verified_at).total_seconds() < 10
        ):
            cached_user = {
                "user_id": token_record.user_id,
                "user_name": token_record.user_name,
                "email": token_record.email,
            }
            return True, "Connected to Upstox Live OMS", cached_user, 95

        start_time = time.time()
        try:
            profile_response = await upstox_client.get_profile(token_record.access_token)
            latency_ms = max(1, int((time.time() - start_time) * 1000))

            token_record.is_valid = True
            token_record.connection_status = "CONNECTED"
            token_record.last_error = None
            token_record.last_verified_at = datetime.utcnow()
            user_data = profile_response.get("data", {}) or {}
            token_record.user_id = user_data.get("user_id") or token_record.user_id
            token_record.user_name = user_data.get("user_name") or token_record.user_name
            token_record.email = user_data.get("email") or token_record.email
            await db.commit()

            return True, f"Connected to Upstox Live OMS ({latency_ms}ms)", user_data, latency_ms

        except UpstoxAuthException as exc:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            logger.warning(f"Upstox token validation failed ({exc.error_code}): {exc}")
            token_record.is_valid = False
            token_record.last_verified_at = datetime.utcnow()

            msg_lower = str(exc).lower()
            if "expired" in msg_lower or exc.error_code in ("UDAPI100057", "TOKEN_EXPIRED"):
                token_record.connection_status = "TOKEN_EXPIRED"
                token_record.last_error = "Upstox access token has expired."
                user_msg = "Token Expired: Daily Upstox authorization expired. Please click 'Login with Upstox' to re-authenticate."
            else:
                token_record.connection_status = "AUTH_FAILED"
                token_record.last_error = f"Authentication failed: {str(exc)}"
                user_msg = f"Authentication Failed: {str(exc)}"

            await db.commit()
            return False, user_msg, None, latency_ms

        except Exception as exc:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            logger.warning(f"Upstox API unreachable: {exc}")
            token_record.is_valid = False
            token_record.connection_status = "DISCONNECTED"
            token_record.last_error = f"Connection failed: {str(exc)}"
            token_record.last_verified_at = datetime.utcnow()
            await db.commit()
            return False, f"Connection Failed: {str(exc)}", None, latency_ms

    async def update_access_token(self, db: AsyncSession, access_token: str) -> Tuple[bool, str]:
        """Update access token and immediately verify it."""
        token_record = await self.get_or_create_token_record(db)
        token_record.access_token = access_token.strip() if access_token else None
        await db.commit()

        is_connected, msg, profile, _ = await self.verify_connection(db, force_check=True)
        return is_connected, msg

    async def disconnect(self, db: AsyncSession) -> None:
        """Explicitly disconnect Upstox broker session and clear token."""
        token_record = await self.get_or_create_token_record(db)
        token_record.access_token = None
        token_record.is_valid = False
        token_record.connection_status = "DISCONNECTED"
        token_record.last_error = "Broker session disconnected by user."
        token_record.last_verified_at = datetime.utcnow()
        await db.commit()


broker_service = BrokerService()
