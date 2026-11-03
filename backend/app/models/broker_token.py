from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin


class BrokerToken(Base, TimestampMixin):
    __tablename__ = "broker_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    api_key: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    api_secret: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_type: Mapped[str] = mapped_column(String(50), default="Bearer")
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # UCC
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

