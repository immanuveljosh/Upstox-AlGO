from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin
from backend.app.core.security import EncryptedText


class BrokerToken(Base, TimestampMixin):
    __tablename__ = "broker_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    api_key: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    api_secret: Mapped[str] = mapped_column(EncryptedText, nullable=False, default="")
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    access_token: Mapped[Optional[str]] = mapped_column(EncryptedText, nullable=True)
    token_type: Mapped[str] = mapped_column(String(50), default="Bearer")
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # UCC
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    connection_status: Mapped[str] = mapped_column(String(50), default="DISCONNECTED")
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Semi-Automated Daily Access Token Lifecycle & Scheduler Fields
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    token_request_status: Mapped[str] = mapped_column(String(50), default="IDLE")
    last_token_request_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_token_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_token_request_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    authorization_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notifier_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    auto_request_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    scheduled_request_time: Mapped[str] = mapped_column(String(10), default="08:45")
    last_webhook_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
