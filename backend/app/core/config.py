import os
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Upstox Nifty Directional Trading Engine"
    API_V1_PREFIX: str = "/api/v1"
    ENV: str = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Database: SQLite async by default, swap to postgresql+asyncpg://... for PostgreSQL
    DATABASE_URL: str = "sqlite+aiosqlite:///./algo_trader.db"

    # CORS configuration
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3005",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    def parse_cors_origins(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Upstox API credentials & Public Webhook Configuration
    UPSTOX_API_KEY: str = ""
    UPSTOX_API_SECRET: str = ""
    UPSTOX_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/callback"
    PUBLIC_BACKEND_URL: str = ""
    UPSTOX_NOTIFIER_URL: str = ""
    UPSTOX_ACCESS_TOKEN: str = ""
    UPSTOX_ANALYTICS_TOKEN: str = ""
    UPSTOX_BASE_URL: str = "https://api.upstox.com/v2"
    UPSTOX_V3_BASE_URL: str = "https://api.upstox.com/v3"
    FRONTEND_URL: str = "http://localhost:3005"

    @property
    def canonical_notifier_url(self) -> str:
        """
        Single source of truth for the Upstox Notifier Webhook URL.
        Reads from UPSTOX_NOTIFIER_URL or constructs from PUBLIC_BACKEND_URL.
        Never generates localhost URLs for production.
        """
        if self.UPSTOX_NOTIFIER_URL and self.UPSTOX_NOTIFIER_URL.strip():
            raw = self.UPSTOX_NOTIFIER_URL.strip()
            if not any(h in raw.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0")):
                return raw
        if self.PUBLIC_BACKEND_URL and self.PUBLIC_BACKEND_URL.strip():
            base = self.PUBLIC_BACKEND_URL.strip().rstrip("/")
            if not any(h in base.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0")):
                return f"{base}{self.API_V1_PREFIX}/auth/upstox/notifier"
        return ""

    # Semi-Automated Daily Token Request Scheduler (Asia/Kolkata)
    DAILY_TOKEN_REQUEST_TIME: str = "08:45"
    DAILY_TOKEN_SCHEDULER_ENABLED: bool = True

    # Live Safety & Monitoring Configuration
    MAX_QUOTE_AGE_SECONDS: int = 60  # Maximum acceptable age in seconds for option quotes
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # Security & Tokens
    JWT_SECRET_KEY: str = "upstox_super_secure_secret_key_change_in_production_2026"
    TOKEN_ENCRYPTION_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Trading Defaults
    DEFAULT_TRADING_MODE: str = "BACKTEST"  # BACKTEST (default) or LIVE
    NIFTY_LOT_SIZE: int = 65  # 65 units per lot for current NIFTY contracts
    NIFTY_FREEZE_QTY: int = 1755  # 27 lots * 65 = 1755 max qty per order

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

