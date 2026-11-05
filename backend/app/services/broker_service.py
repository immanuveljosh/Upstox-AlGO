import asyncio
import base64
import ipaddress
import json
import time
from datetime import datetime, timedelta
from typing import Tuple, Optional, Union, Dict, Any
from urllib.parse import urlparse
import pytz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.broker_token import BrokerToken
from backend.app.models.system_config import SystemConfig
from backend.app.services.upstox_client import upstox_client, UpstoxAuthException
from backend.app.core.config import settings
from backend.app.core.logging import logger, log_critical_action
from backend.app.core.security import encrypt_token, hash_token, mask_token
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

IST = pytz.timezone("Asia/Kolkata")


class BrokerService:
    """Central service managing Upstox credentials, semi-automated daily token requests, webhook ingestion, and connection telemetry."""

    _tables_initialized: bool = False
    _scheduler_lock: Optional[asyncio.Lock] = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._scheduler_lock is None:
            cls._scheduler_lock = asyncio.Lock()
        return cls._scheduler_lock

    async def _ensure_tables(self) -> None:
        if not BrokerService._tables_initialized:
            from backend.app.core.database import engine
            from backend.app.models import Base
            from sqlalchemy import text

            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                for col_name, col_type in [
                    ("expected_price", "FLOAT"),
                    ("slippage", "FLOAT"),
                    ("signal_time", "DATETIME"),
                    ("broker_confirmed_at", "DATETIME"),
                    ("exit_reason", "VARCHAR(100)"),
                    ("instrument_key", "VARCHAR(100)"),
                    ("exit_upstox_order_id", "VARCHAR(100)"),
                    ("exit_status", "VARCHAR(50)"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col_name} {col_type}"))
                    except Exception:
                        pass

                for col_name, col_type in [
                    ("connection_status", "VARCHAR(50)"),
                    ("last_error", "VARCHAR(500)"),
                    ("issued_at", "DATETIME"),
                    ("expires_at", "DATETIME"),
                    ("token_request_status", "VARCHAR(50) DEFAULT 'IDLE'"),
                    ("last_token_request_at", "DATETIME"),
                    ("last_token_approved_at", "DATETIME"),
                    ("last_token_request_date", "VARCHAR(20)"),
                    ("authorization_expiry", "DATETIME"),
                    ("notifier_url", "VARCHAR(500)"),
                    ("auto_request_enabled", "BOOLEAN DEFAULT 1"),
                    ("scheduled_request_time", "VARCHAR(10) DEFAULT '08:45'"),
                    ("last_webhook_hash", "VARCHAR(128)"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE broker_tokens ADD COLUMN {col_name} {col_type}"))
                    except Exception:
                        pass

                for col_name, col_type in [
                    ("critical_alert", "VARCHAR(500)"),
                    ("orphan_positions_json", "VARCHAR(4000)"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE system_configs ADD COLUMN {col_name} {col_type}"))
                    except Exception:
                        pass
            BrokerService._tables_initialized = True

    @staticmethod
    def _parse_upstox_timestamp(val: Optional[Union[str, int, float]]) -> Optional[datetime]:
        """Parse Upstox epoch-ms, epoch-s, or ISO-8601 timestamp into naive UTC datetime."""
        if val is None or val == "":
            return None
        try:
            if isinstance(val, (int, float)) or (isinstance(val, str) and val.strip().isdigit()):
                num = float(val)
                # Epoch milliseconds vs seconds
                if num > 1e11:
                    num = num / 1000.0
                return datetime.utcfromtimestamp(num)
            if isinstance(val, str):
                cleaned = val.strip().replace("Z", "+00:00")
                dt = datetime.fromisoformat(cleaned)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(pytz.UTC).replace(tzinfo=None)
                return dt
        except Exception:
            pass
        return None

    @staticmethod
    def _extract_jwt_claims(access_token: Optional[str]) -> Dict[str, Any]:
        """Safely decode JWT payload claims without external dependencies."""
        if not access_token:
            return {}
        try:
            parts = access_token.strip().split(".")
            if len(parts) != 3:
                return {}
            payload_b64 = parts[1]
            padding = "=" * ((4 - len(payload_b64) % 4) % 4)
            payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
            return json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            return {}

    @classmethod
    def _is_jwt_expired(cls, access_token: Optional[str]) -> bool:
        """Check if a JWT access token has an 'exp' claim that is in the past."""
        claims = cls._extract_jwt_claims(access_token)
        exp = claims.get("exp")
        if exp is not None:
            try:
                return float(exp) < time.time()
            except Exception:
                return False
        return False

    @classmethod
    def compute_default_expiry_utc(cls, issued_utc: Optional[datetime] = None) -> datetime:
        """
        Upstox daily access tokens expire at 03:30 AM IST.
        Computes the next 03:30 AM IST in naive UTC.
        """
        base_utc = issued_utc or datetime.utcnow()
        aware_ist = pytz.UTC.localize(base_utc).astimezone(IST)
        expiry_ist = aware_ist.replace(hour=3, minute=30, second=0, microsecond=0)
        if aware_ist >= expiry_ist:
            expiry_ist = expiry_ist + timedelta(days=1)
        return expiry_ist.astimezone(pytz.UTC).replace(tzinfo=None)

    @classmethod
    def format_utc_to_ist(cls, dt_utc: Optional[datetime]) -> Optional[str]:
        """Format naive UTC datetime into 'DD-MMM-YYYY HH:MM:SS IST'."""
        if not dt_utc:
            return None
        aware_ist = pytz.UTC.localize(dt_utc).astimezone(IST)
        return aware_ist.strftime("%d-%b-%Y %H:%M:%S IST")

    @classmethod
    def compute_next_scheduled_request_ist(
        cls,
        scheduled_time: str = "08:45",
        auto_enabled: bool = True,
        last_request_date: Optional[str] = None,
        now_ist: Optional[datetime] = None,
    ) -> Optional[str]:
        """Compute next scheduled token request date & time in Asia/Kolkata (Mon-Fri)."""
        if not auto_enabled:
            return "Scheduler Paused"
        current_ist = now_ist or datetime.now(IST)
        try:
            parts = (scheduled_time or "08:45").strip().split(":")
            hour, minute = int(parts[0]), int(parts[1])
        except Exception:
            hour, minute = 8, 45

        candidate = current_ist.replace(hour=hour, minute=minute, second=0, microsecond=0)
        today_str = current_ist.strftime("%Y-%m-%d")

        if current_ist >= candidate or last_request_date == today_str:
            candidate = candidate + timedelta(days=1)

        # Advance past weekend (Saturday=5, Sunday=6)
        while candidate.weekday() >= 5:
            candidate = candidate + timedelta(days=1)

        return candidate.strftime("%d-%b-%Y %H:%M:%S IST")

    @classmethod
    def validate_webhook_url_format(cls, url: Optional[str]) -> Tuple[bool, str, str]:
        """
        Validate Notifier Webhook URL format.
        Returns: (is_valid: bool, status_label: str, reason: str)
        Status labels: 'URL Missing', 'URL Invalid', 'Valid HTTPS URL'
        """
        raw = (url or "").strip()
        if not raw:
            return (
                False,
                "URL Missing",
                "Notifier Webhook URL is missing. Configure PUBLIC_BACKEND_URL or UPSTOX_NOTIFIER_URL.",
            )
        try:
            parsed = urlparse(raw)
        except Exception:
            return (
                False,
                "URL Invalid",
                "Malformed Webhook URL. Expected https://<PUBLIC_DOMAIN>/api/v1/auth/upstox/notifier.",
            )

        scheme = (parsed.scheme or "").lower()
        host = (parsed.hostname or "").lower()
        path = (parsed.path or "").rstrip("/")

        if not scheme or not host:
            return (
                False,
                "URL Invalid",
                "Invalid Webhook URL format. Expected https://<PUBLIC_DOMAIN>/api/v1/auth/upstox/notifier.",
            )

        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or host.endswith(".local"):
            return (
                False,
                "URL Invalid",
                "Localhost URLs cannot receive webhooks from Upstox servers. Use a public HTTPS domain.",
            )

        try:
            ip_val = ipaddress.ip_address(host)
            if (
                ip_val.is_private
                or ip_val.is_loopback
                or ip_val.is_link_local
                or ip_val.is_multicast
                or ip_val.is_reserved
                or ip_val.is_unspecified
            ):
                return (
                    False,
                    "URL Invalid",
                    f"Restricted private or link-local IP addresses ({host}) cannot be used as a public webhook URL.",
                )
        except ValueError:
            pass

        if scheme != "https":
            return (
                False,
                "URL Invalid",
                "Upstox requires an HTTPS (https://) Notifier Webhook URL.",
            )

        if not path.endswith("/api/v1/auth/upstox/notifier"):
            return (
                False,
                "URL Invalid",
                "Webhook URL path must end with '/api/v1/auth/upstox/notifier'.",
            )

        return (
            True,
            "Valid HTTPS URL",
            "Public HTTPS webhook URL format is valid.",
        )

    @classmethod
    def resolve_webhook_url(cls, token_record: Optional[BrokerToken] = None) -> str:
        """
        Single source of truth for the Notifier Webhook URL.
        Never generates a localhost fallback URL.
        """
        if token_record and token_record.notifier_url and token_record.notifier_url.strip():
            candidate = token_record.notifier_url.strip()
            # If DB stored an old localhost default and env has a public canonical URL, prefer canonical
            is_valid, _, _ = cls.validate_webhook_url_format(candidate)
            if is_valid or not settings.canonical_notifier_url:
                return candidate
        return settings.canonical_notifier_url

    def build_token_telemetry(self, token_record: BrokerToken) -> Dict[str, Any]:
        """Build standardized token management & scheduler telemetry dictionary."""
        sched_time = token_record.scheduled_request_time or settings.DAILY_TOKEN_REQUEST_TIME or "08:45"
        auto_enabled = (
            token_record.auto_request_enabled
            if token_record.auto_request_enabled is not None
            else settings.DAILY_TOKEN_SCHEDULER_ENABLED
        )
        endpoint_url = self.resolve_webhook_url(token_record)
        url_ok, url_status, url_reason = self.validate_webhook_url_format(endpoint_url)

        req_status = token_record.token_request_status or (
            "APPROVED_ACTIVE" if token_record.is_valid else "IDLE"
        )
        is_notifier_url_err = bool(
            req_status in ("NOTIFIER_URL_REQUIRED", "URL_MISSING", "URL_INVALID")
            or not url_ok
            or (
                token_record.last_error is not None
                and (
                    "UDAPI1123" in token_record.last_error
                    or "Invalid notifier url" in token_record.last_error
                    or "Notifier Webhook URL is not configured" in token_record.last_error
                )
            )
        )

        # Compute standardized status label across the 8 required statuses:
        # URL Missing, URL Invalid, Endpoint Unreachable, Console Configuration Required,
        # Request Pending Approval, Token Received, Token Verified, Authentication Failed
        if not url_ok:
            status_label = url_status  # "URL Missing" or "URL Invalid"
        elif req_status == "URL_MISSING":
            status_label = "URL Missing"
        elif req_status == "URL_INVALID":
            status_label = "URL Invalid"
        elif req_status == "ENDPOINT_UNREACHABLE":
            status_label = "Endpoint Unreachable"
        elif req_status == "NOTIFIER_URL_REQUIRED" or is_notifier_url_err:
            status_label = "Console Configuration Required"
        elif req_status == "REQUESTED_PENDING":
            status_label = "Request Pending Approval"
        elif token_record.is_valid and req_status == "APPROVED_ACTIVE":
            status_label = "Token Verified"
        elif req_status in ("REJECTED", "FAILED") or token_record.connection_status == "AUTH_FAILED":
            status_label = "Authentication Failed"
        elif token_record.last_token_approved_at and not token_record.is_valid:
            status_label = "Authentication Failed"
        else:
            status_label = "Console Configuration Required"

        # Developer Console configuration status — never claim registered unless Upstox accepted request or delivered token
        if token_record.is_valid and token_record.last_token_approved_at:
            console_status = "Token Verified"
        elif req_status == "REQUESTED_PENDING":
            console_status = "Request Pending Approval"
        else:
            console_status = "Console Configuration Required"

        # Webhook delivery status
        if token_record.is_valid and token_record.last_token_approved_at:
            delivery_status = "Token Verified"
        elif token_record.last_token_approved_at:
            delivery_status = "Token Received"
        elif req_status == "REQUESTED_PENDING":
            delivery_status = "Request Pending Approval"
        else:
            delivery_status = "Awaiting Delivery"

        return {
            "token_request_status": req_status,
            "token_request_status_label": status_label,
            "is_notifier_url_error": is_notifier_url_err,
            "last_error": token_record.last_error,
            "issued_at": token_record.issued_at.isoformat() if token_record.issued_at else None,
            "issued_at_ist": self.format_utc_to_ist(token_record.issued_at),
            "expires_at": token_record.expires_at.isoformat() if token_record.expires_at else None,
            "expires_at_ist": self.format_utc_to_ist(token_record.expires_at),
            "last_token_request_at": (
                token_record.last_token_request_at.isoformat() if token_record.last_token_request_at else None
            ),
            "last_token_request_ist": self.format_utc_to_ist(token_record.last_token_request_at),
            "last_token_approved_at": (
                token_record.last_token_approved_at.isoformat() if token_record.last_token_approved_at else None
            ),
            "last_token_approved_ist": self.format_utc_to_ist(token_record.last_token_approved_at),
            "authorization_expiry": (
                token_record.authorization_expiry.isoformat() if token_record.authorization_expiry else None
            ),
            "authorization_expiry_ist": self.format_utc_to_ist(token_record.authorization_expiry),
            "notifier_url": endpoint_url,
            "webhook_endpoint": endpoint_url,
            "webhook_url_status": url_status,
            "webhook_url_reason": url_reason,
            "console_config_status": console_status,
            "webhook_delivery_status": delivery_status,
            "auto_request_enabled": bool(auto_enabled),
            "scheduled_request_time": sched_time,
            "next_scheduled_request_ist": self.compute_next_scheduled_request_ist(
                scheduled_time=sched_time,
                auto_enabled=bool(auto_enabled),
                last_request_date=token_record.last_token_request_date,
            ),
        }

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
                notifier_url=settings.canonical_notifier_url,
                access_token=None,
                is_valid=False,
                auto_request_enabled=settings.DAILY_TOKEN_SCHEDULER_ENABLED,
                scheduled_request_time=settings.DAILY_TOKEN_REQUEST_TIME,
                token_request_status="IDLE",
            )
            db.add(record)
            await db.commit()
            await db.refresh(record)
        else:
            mutated = False
            if not record.scheduled_request_time:
                record.scheduled_request_time = settings.DAILY_TOKEN_REQUEST_TIME or "08:45"
                mutated = True
            if record.auto_request_enabled is None:
                record.auto_request_enabled = True
                mutated = True
            if not record.token_request_status:
                record.token_request_status = "APPROVED_ACTIVE" if record.is_valid else "IDLE"
                mutated = True
            if (
                not record.notifier_url
                or (
                    "localhost" in record.notifier_url
                    and settings.canonical_notifier_url
                    and "localhost" not in settings.canonical_notifier_url
                )
            ):
                record.notifier_url = settings.canonical_notifier_url
                mutated = True
            if (
                record.api_secret
                and record.api_key
                and record.api_secret == record.api_key
                and settings.UPSTOX_API_SECRET
                and settings.UPSTOX_API_SECRET != record.api_key
            ):
                record.api_secret = settings.UPSTOX_API_SECRET
                mutated = True
            if mutated:
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
            if not config.total_capital or config.total_capital < 50000:
                config.total_capital = DEFAULT_TOTAL_CAPITAL
                mutated = True
            if mutated:
                await db.commit()
                await db.refresh(config)
        return config

    def _is_record_token_expired(self, token_record: BrokerToken) -> bool:
        """Check whether the token on record has passed its expires_at or JWT exp timestamp."""
        now_utc = datetime.utcnow()
        if token_record.expires_at and now_utc >= token_record.expires_at:
            return True
        if self._is_jwt_expired(token_record.access_token):
            return True
        return False

    async def verify_connection(
        self, db: AsyncSession, force_check: bool = False
    ) -> Tuple[bool, Optional[str], Optional[dict], int]:
        """
        Validate the current Upstox token using the official Upstox user profile API:
        GET https://api.upstox.com/v2/user/profile
        Returns: (is_connected: bool, message: Optional[str], profile_data: Optional[dict], latency_ms: int)
        """
        token_record = await self.get_or_create_token_record(db)

        if not token_record.access_token or not token_record.access_token.strip():
            token_record.is_valid = False
            token_record.connection_status = "DISCONNECTED"
            preserved_statuses = (
                "REQUESTED_PENDING",
                "NOTIFIER_URL_REQUIRED",
                "URL_MISSING",
                "URL_INVALID",
                "ENDPOINT_UNREACHABLE",
                "REJECTED",
                "FAILED",
            )
            if token_record.token_request_status not in preserved_statuses:
                token_record.token_request_status = "IDLE"
                token_record.last_error = "No Upstox access token configured."
            elif not token_record.last_error:
                token_record.last_error = "No Upstox access token configured."
            upstox_client.reinitialize_session(None)
            await db.commit()
            return (
                False,
                token_record.last_error
                if token_record.token_request_status in preserved_statuses and token_record.last_error
                else "Disconnected: No active Upstox access token configured. Request a new token or login via Upstox.",
                None,
                0,
            )

        # Pre-check explicit expires_at timestamp if set in database
        now_utc = datetime.utcnow()
        if token_record.expires_at and now_utc >= token_record.expires_at:
            token_record.is_valid = False
            token_record.connection_status = "TOKEN_EXPIRED"
            if token_record.token_request_status not in (
                "REQUESTED_PENDING",
                "NOTIFIER_URL_REQUIRED",
                "URL_MISSING",
                "URL_INVALID",
            ):
                token_record.token_request_status = "EXPIRED"
                token_record.last_error = "Upstox daily access token has expired (03:30 AM IST cutoff)."
            token_record.last_verified_at = now_utc
            upstox_client.reinitialize_session(None)
            await db.commit()
            return (
                False,
                "Authorization Required: Daily Upstox token expired at 03:30 AM IST. Request or approve today's token.",
                None,
                0,
            )

        # Fast cached response if verified recently (< 10s) and not force_check
        if (
            not force_check
            and token_record.last_verified_at
            and (now_utc - token_record.last_verified_at).total_seconds() < 10
        ):
            if token_record.is_valid:
                cached_user = {
                    "user_id": token_record.user_id,
                    "user_name": token_record.user_name,
                    "email": token_record.email,
                }
                return True, "Connected to Upstox Live OMS", cached_user, 95
            else:
                if self._is_jwt_expired(token_record.access_token) and token_record.connection_status != "TOKEN_EXPIRED":
                    token_record.connection_status = "TOKEN_EXPIRED"
                    if token_record.token_request_status not in (
                        "REQUESTED_PENDING",
                        "NOTIFIER_URL_REQUIRED",
                        "URL_MISSING",
                        "URL_INVALID",
                    ):
                        token_record.token_request_status = "EXPIRED"
                        token_record.last_error = "Upstox daily access token has expired."
                    await db.commit()
                return False, token_record.last_error or "Broker disconnected.", None, 0

        start_time = time.time()
        try:
            profile_response = await upstox_client.get_profile(token_record.access_token)
            latency_ms = max(1, int((time.time() - start_time) * 1000))

            user_data = profile_response.get("data", {}) or {}
            returned_uid = user_data.get("user_id")

            # Populate JWT timestamps if not already set
            claims = self._extract_jwt_claims(token_record.access_token)
            if not token_record.issued_at and claims.get("iat"):
                token_record.issued_at = self._parse_upstox_timestamp(claims.get("iat"))
            if not token_record.expires_at and claims.get("exp"):
                token_record.expires_at = self._parse_upstox_timestamp(claims.get("exp"))

            token_record.is_valid = True
            token_record.connection_status = "CONNECTED"
            token_record.token_request_status = "APPROVED_ACTIVE"
            token_record.last_error = None
            token_record.last_verified_at = datetime.utcnow()
            token_record.user_id = returned_uid or token_record.user_id
            token_record.user_name = user_data.get("user_name") or token_record.user_name
            token_record.email = user_data.get("email") or token_record.email

            upstox_client.reinitialize_session(token_record.access_token)
            await db.commit()

            return True, f"Connected to Upstox Live OMS ({latency_ms}ms)", user_data, latency_ms

        except UpstoxAuthException as exc:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            logger.warning(f"Upstox token validation failed ({exc.error_code}): {exc}")
            token_record.is_valid = False
            token_record.last_verified_at = datetime.utcnow()
            upstox_client.reinitialize_session(None)

            msg_lower = str(exc).lower()
            preserved_req_statuses = (
                "REQUESTED_PENDING",
                "NOTIFIER_URL_REQUIRED",
                "URL_MISSING",
                "URL_INVALID",
                "ENDPOINT_UNREACHABLE",
            )
            if (
                "expired" in msg_lower
                or exc.error_code in ("UDAPI100057", "TOKEN_EXPIRED")
                or self._is_jwt_expired(token_record.access_token)
            ):
                token_record.connection_status = "TOKEN_EXPIRED"
                if token_record.token_request_status not in preserved_req_statuses:
                    token_record.token_request_status = "EXPIRED"
                    token_record.last_error = "Upstox daily access token has expired."
                user_msg = "Token Expired: Daily Upstox authorization expired. Request a new token or approve pending notification."
            else:
                token_record.connection_status = "AUTH_FAILED"
                if token_record.token_request_status not in preserved_req_statuses:
                    token_record.token_request_status = "FAILED"
                    token_record.last_error = f"Authentication failed: {str(exc)}"
                user_msg = f"Authentication Failed: {str(exc)}"

            await db.commit()
            return False, user_msg, None, latency_ms

        except Exception as exc:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            logger.warning(f"Upstox API unreachable: {exc}")
            token_record.is_valid = False
            token_record.connection_status = "DISCONNECTED"
            if token_record.token_request_status not in (
                "REQUESTED_PENDING",
                "NOTIFIER_URL_REQUIRED",
                "URL_MISSING",
                "URL_INVALID",
            ):
                token_record.last_error = f"Connection failed: {str(exc)}"
            token_record.last_verified_at = datetime.utcnow()
            await db.commit()
            return False, f"Connection Failed: {str(exc)}", None, latency_ms

    async def request_daily_token(
        self,
        db: AsyncSession,
        manual: bool = False,
        force: bool = False,
        now_ist: Optional[datetime] = None,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Trigger official Upstox v3 Semi-Automated Access Token Request:
        POST https://api.upstox.com/v3/login/auth/token/request/{client_id}
        """
        async with self._get_lock():
            token_record = await self.get_or_create_token_record(db)
            client_id = (token_record.api_key or settings.UPSTOX_API_KEY or "").strip()
            client_secret = (token_record.api_secret or settings.UPSTOX_API_SECRET or "").strip()

            if not client_id or not client_secret:
                msg = "Upstox API Key (Client ID) and API Secret must be configured before requesting a token."
                token_record.last_error = msg
                await db.commit()
                return False, msg, self.build_token_telemetry(token_record)

            # Validate configured webhook URL format before sending token request
            resolved_url = self.resolve_webhook_url(token_record)
            url_ok, url_status, url_reason = self.validate_webhook_url_format(resolved_url)
            if not url_ok:
                token_record.token_request_status = (
                    "URL_MISSING" if url_status == "URL Missing" else "URL_INVALID"
                )
                token_record.last_error = f"{url_status}: {url_reason}"
                await db.commit()
                await db.refresh(token_record)
                return False, f"{url_status}: {url_reason}", self.build_token_telemetry(token_record)

            current_ist = now_ist or datetime.now(IST)
            today_ist_str = current_ist.strftime("%Y-%m-%d")

            # Duplicate prevention for scheduled requests or rapid duplicate clicks
            if not force:
                if not manual and token_record.last_token_request_date == today_ist_str:
                    return (
                        False,
                        f"Daily token request already executed for {today_ist_str}.",
                        self.build_token_telemetry(token_record),
                    )
                if (
                    token_record.token_request_status == "REQUESTED_PENDING"
                    and token_record.last_token_request_at
                    and (datetime.utcnow() - token_record.last_token_request_at).total_seconds() < 60
                ):
                    return (
                        True,
                        "Token request is already pending approval in your Upstox mobile app / WhatsApp.",
                        self.build_token_telemetry(token_record),
                    )

            try:
                resp = await upstox_client.request_access_token_v3(
                    client_id=client_id,
                    client_secret=client_secret,
                )
                data = resp.get("data", {}) or {}
                auth_exp = self._parse_upstox_timestamp(data.get("authorization_expiry"))
                notif_url = data.get("notifier_url") or resolved_url

                token_record.token_request_status = "REQUESTED_PENDING"
                token_record.last_token_request_at = datetime.utcnow()
                token_record.last_token_request_date = today_ist_str
                token_record.authorization_expiry = auth_exp
                token_record.notifier_url = notif_url
                token_record.last_error = None
                await db.commit()
                await db.refresh(token_record)

                log_critical_action(
                    "UPSTOX_TOKEN_REQUEST_SENT",
                    {
                        "trigger": "MANUAL" if manual else "SCHEDULED",
                        "trade_date": today_ist_str,
                        "authorization_expiry": auth_exp.isoformat() if auth_exp else None,
                    },
                )
                return (
                    True,
                    "Access token request initiated. Approve the request in your Upstox app or WhatsApp to auto-connect.",
                    self.build_token_telemetry(token_record),
                )

            except UpstoxAuthException as exc:
                logger.warning(f"Upstox v3 token request failed ({exc.error_code}): {exc}")
                is_notifier_err = (
                    exc.error_code == "UDAPI1123"
                    or "UDAPI1123" in str(exc)
                    or "Invalid notifier url" in str(exc)
                )
                if is_notifier_err:
                    token_record.token_request_status = "NOTIFIER_URL_REQUIRED"
                    token_record.last_error = (
                        "UDAPI1123: Notifier Webhook URL is not configured in Upstox Developer App."
                    )
                    user_msg = (
                        "Notifier Webhook URL is not configured in Upstox Developer App. "
                        "Register your webhook URL in developer.upstox.com and retry."
                    )
                else:
                    token_record.token_request_status = "REJECTED" if 400 <= exc.status_code < 500 else "FAILED"
                    token_record.last_error = f"Token request failed: {str(exc)}"
                    user_msg = f"Upstox token request failed: {str(exc)}"
                await db.commit()
                await db.refresh(token_record)
                return False, user_msg, self.build_token_telemetry(token_record)

            except Exception as exc:
                logger.error(f"Unexpected error requesting Upstox token: {exc}")
                token_record.token_request_status = "FAILED"
                token_record.last_error = f"Token request error: {str(exc)}"
                await db.commit()
                await db.refresh(token_record)
                return False, f"Failed to request token: {str(exc)}", self.build_token_telemetry(token_record)

    async def process_notifier_webhook(
        self,
        db: AsyncSession,
        payload_dict: Dict[str, Any],
    ) -> Tuple[bool, int, str, Dict[str, Any]]:
        """
        Process incoming Upstox Notifier Webhook payload:
        POST /api/v1/auth/upstox/notifier
        Validates client_id, user_id, message_type, idempotency, encrypts token at rest,
        verifies token against Upstox profile API, and reconnects broker automatically.
        Never logs or returns access_token.
        """
        message_type = str(payload_dict.get("message_type") or "").strip()
        if message_type != "access_token":
            return False, 400, f"Unsupported webhook message_type '{message_type}'. Expected 'access_token'.", {}

        incoming_client_id = str(payload_dict.get("client_id") or "").strip()
        incoming_user_id = str(payload_dict.get("user_id") or "").strip()
        raw_access_token = str(payload_dict.get("access_token") or "").strip()
        token_type = str(payload_dict.get("token_type") or "Bearer").strip()

        if not incoming_client_id or not incoming_user_id or len(raw_access_token) < 10:
            return False, 400, "Invalid webhook payload: missing required fields.", {}

        token_record = await self.get_or_create_token_record(db)
        expected_client_id = (token_record.api_key or settings.UPSTOX_API_KEY or "").strip()

        # 1. Validate client_id matches configured application
        if expected_client_id and incoming_client_id != expected_client_id:
            logger.warning(
                f"Rejected Upstox notifier webhook: client_id mismatch (got {incoming_client_id[:6]}...)"
            )
            return False, 403, "Webhook rejected: client_id does not match configured Upstox application.", {}

        # 2. Validate expected account identity if already bound
        if token_record.user_id and token_record.user_id.strip() and incoming_user_id != token_record.user_id.strip():
            logger.warning(
                f"Rejected Upstox notifier webhook: user_id mismatch (expected {token_record.user_id}, got {incoming_user_id})"
            )
            return False, 403, "Webhook rejected: user_id does not match configured trader account.", {}

        # 3. Idempotency check (duplicate webhook delivery)
        incoming_hash = hash_token(raw_access_token)
        if token_record.last_webhook_hash == incoming_hash and token_record.is_valid:
            logger.info(f"Idempotent webhook delivery ignored for user_id={incoming_user_id}")
            return (
                True,
                200,
                "Webhook already processed (idempotent).",
                {
                    "duplicate": True,
                    "is_connected": True,
                    "connection_status": "CONNECTED",
                    "user_id": token_record.user_id,
                },
            )

        # 4. Parse issued_at and expires_at timestamps
        claims = self._extract_jwt_claims(raw_access_token)
        issued_dt = (
            self._parse_upstox_timestamp(payload_dict.get("issued_at"))
            or self._parse_upstox_timestamp(claims.get("iat"))
            or datetime.utcnow()
        )
        expires_dt = (
            self._parse_upstox_timestamp(payload_dict.get("expires_at"))
            or self._parse_upstox_timestamp(claims.get("exp"))
            or self.compute_default_expiry_utc(issued_dt)
        )

        # Reject already-expired tokens delivered in webhook
        if expires_dt <= datetime.utcnow() or self._is_jwt_expired(raw_access_token):
            token_record.is_valid = False
            token_record.connection_status = "TOKEN_EXPIRED"
            token_record.token_request_status = "EXPIRED"
            token_record.last_error = "Webhook delivered an expired access token."
            await db.commit()
            return False, 400, "Webhook rejected: delivered access token is already expired.", {}

        # 5. Store encrypted token at rest and verify against live Upstox Profile API
        token_record.access_token = raw_access_token
        token_record.token_type = token_type
        token_record.user_id = incoming_user_id
        token_record.issued_at = issued_dt
        token_record.expires_at = expires_dt
        token_record.last_token_approved_at = datetime.utcnow()
        token_record.last_webhook_hash = incoming_hash
        await db.commit()

        is_connected, verify_msg, profile_data, latency_ms = await self.verify_connection(db, force_check=True)
        await db.refresh(token_record)

        if not is_connected:
            token_record.is_valid = False
            token_record.token_request_status = "FAILED"
            if token_record.connection_status == "CONNECTED":
                token_record.connection_status = "AUTH_FAILED"
            upstox_client.reinitialize_session(None)
            await db.commit()
            log_critical_action(
                "UPSTOX_WEBHOOK_VERIFICATION_FAILED",
                {"user_id": incoming_user_id, "status": token_record.connection_status},
            )
            return (
                False,
                401,
                verify_msg or "Webhook token failed Upstox profile verification.",
                {
                    "duplicate": False,
                    "is_connected": False,
                    "connection_status": token_record.connection_status,
                },
            )

        # Confirm profile user_id matches webhook user_id if returned
        profile_uid = (profile_data or {}).get("user_id")
        if profile_uid and str(profile_uid).strip() != incoming_user_id:
            token_record.is_valid = False
            token_record.connection_status = "AUTH_FAILED"
            token_record.token_request_status = "FAILED"
            token_record.last_error = "Profile user_id did not match webhook user_id."
            upstox_client.reinitialize_session(None)
            await db.commit()
            return False, 403, "Profile identity verification mismatch.", {}

        token_record.token_request_status = "APPROVED_ACTIVE"
        token_record.connection_status = "CONNECTED"
        token_record.is_valid = True
        token_record.last_error = None
        await db.commit()

        log_critical_action(
            "UPSTOX_WEBHOOK_TOKEN_ACTIVATED",
            {
                "user_id": token_record.user_id,
                "user_name": token_record.user_name,
                "latency_ms": latency_ms,
                "expires_at": expires_dt.isoformat(),
            },
        )
        return (
            True,
            200,
            f"Access token verified and broker reconnected ({latency_ms}ms).",
            {
                "duplicate": False,
                "is_connected": True,
                "connection_status": "CONNECTED",
                "user_id": token_record.user_id,
                "user_name": token_record.user_name,
                "latency_ms": latency_ms,
                "expires_at_ist": self.format_utc_to_ist(expires_dt),
            },
        )

    async def update_scheduler_settings(
        self,
        db: AsyncSession,
        auto_request_enabled: bool,
        scheduled_request_time: str,
    ) -> Dict[str, Any]:
        """Update daily token request scheduler configuration."""
        token_record = await self.get_or_create_token_record(db)
        token_record.auto_request_enabled = bool(auto_request_enabled)
        token_record.scheduled_request_time = scheduled_request_time.strip()
        await db.commit()
        await db.refresh(token_record)
        log_critical_action(
            "UPDATE_TOKEN_SCHEDULER",
            {
                "auto_request_enabled": token_record.auto_request_enabled,
                "scheduled_request_time": token_record.scheduled_request_time,
            },
        )
        return self.build_token_telemetry(token_record)

    async def cancel_pending_token_request(self, db: AsyncSession) -> Dict[str, Any]:
        """Reset local pending token request or error state if expired or dismissed by user."""
        token_record = await self.get_or_create_token_record(db)
        if token_record.token_request_status in ("REQUESTED_PENDING", "NOTIFIER_URL_REQUIRED", "REJECTED"):
            token_record.token_request_status = "APPROVED_ACTIVE" if token_record.is_valid else "IDLE"
            token_record.authorization_expiry = None
            if token_record.last_error and ("UDAPI1123" in token_record.last_error or "Token request" in token_record.last_error):
                token_record.last_error = None
            await db.commit()
            await db.refresh(token_record)
        return self.build_token_telemetry(token_record)

    async def run_daily_scheduler_tick(
        self,
        db: AsyncSession,
        now_ist: Optional[datetime] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Periodic scheduler check in Asia/Kolkata timezone:
        1. Enforces 03:30 AM IST daily token expiration cutoff.
        2. At or after configured scheduled_request_time (default 08:45 AM IST) on trading days (Mon-Fri),
           automatically triggers the Upstox v3 token request once per day.
        """
        token_record = await self.get_or_create_token_record(db)
        current_ist = now_ist or datetime.now(IST)
        now_utc = current_ist.astimezone(pytz.UTC).replace(tzinfo=None)

        # 1. Enforce token expiry (03:30 AM IST cutoff)
        if token_record.is_valid and (
            (token_record.expires_at and now_utc >= token_record.expires_at)
            or self._is_jwt_expired(token_record.access_token)
        ):
            token_record.is_valid = False
            token_record.connection_status = "TOKEN_EXPIRED"
            if token_record.token_request_status != "REQUESTED_PENDING":
                token_record.token_request_status = "EXPIRED"
            token_record.last_error = "Daily Upstox token expired at 03:30 AM IST. Authorization required."
            upstox_client.reinitialize_session(None)
            await db.commit()
            logger.info("Upstox daily access token reached 03:30 AM IST expiry cutoff.")

        # 2. Check if pending approval window expired without webhook reception
        if (
            token_record.token_request_status == "REQUESTED_PENDING"
            and token_record.authorization_expiry
            and now_utc >= token_record.authorization_expiry
            and not token_record.is_valid
        ):
            token_record.token_request_status = "EXPIRED"
            token_record.connection_status = "TOKEN_EXPIRED"
            token_record.last_error = "Authorization Required: Token approval window expired without confirmation."
            await db.commit()

        # 3. Check if daily scheduled request should fire
        if not token_record.auto_request_enabled:
            return None

        # Trading days: Monday (0) through Friday (4)
        if current_ist.weekday() >= 5:
            return None

        today_ist_str = current_ist.strftime("%Y-%m-%d")
        if token_record.last_token_request_date == today_ist_str:
            return None

        sched_str = (token_record.scheduled_request_time or "08:45").strip()
        try:
            parts = sched_str.split(":")
            sched_hour, sched_minute = int(parts[0]), int(parts[1])
        except Exception:
            sched_hour, sched_minute = 8, 45

        target_ist = current_ist.replace(hour=sched_hour, minute=sched_minute, second=0, microsecond=0)
        if current_ist < target_ist:
            return None

        # If already connected with a token that was approved today (and not expiring within 6h), mark date and skip
        if (
            token_record.is_valid
            and token_record.expires_at
            and token_record.expires_at > now_utc + timedelta(hours=6)
            and token_record.last_token_approved_at
            and pytz.UTC.localize(token_record.last_token_approved_at).astimezone(IST).strftime("%Y-%m-%d")
            == today_ist_str
        ):
            token_record.last_token_request_date = today_ist_str
            await db.commit()
            return None

        ok, msg, telemetry = await self.request_daily_token(
            db=db,
            manual=False,
            force=False,
            now_ist=current_ist,
        )
        return {"triggered": ok, "message": msg, "telemetry": telemetry}

    async def update_access_token(self, db: AsyncSession, access_token: str) -> Tuple[bool, str]:
        """Update access token (encrypted at rest) and immediately verify it."""
        token_record = await self.get_or_create_token_record(db)
        cleaned = access_token.strip() if access_token else None
        token_record.access_token = cleaned
        if cleaned:
            claims = self._extract_jwt_claims(cleaned)
            token_record.issued_at = self._parse_upstox_timestamp(claims.get("iat")) or datetime.utcnow()
            token_record.expires_at = (
                self._parse_upstox_timestamp(claims.get("exp"))
                or self.compute_default_expiry_utc(token_record.issued_at)
            )
            token_record.last_webhook_hash = hash_token(cleaned)
        await db.commit()

        is_connected, msg, profile, _ = await self.verify_connection(db, force_check=True)
        return is_connected, msg

    async def disconnect(self, db: AsyncSession) -> None:
        """Explicitly disconnect Upstox broker session and clear token."""
        token_record = await self.get_or_create_token_record(db)
        token_record.access_token = None
        token_record.is_valid = False
        token_record.connection_status = "DISCONNECTED"
        token_record.token_request_status = "IDLE"
        token_record.last_error = "Broker session disconnected by user."
        token_record.last_verified_at = datetime.utcnow()
        upstox_client.reinitialize_session(None)
        await db.commit()


broker_service = BrokerService()
