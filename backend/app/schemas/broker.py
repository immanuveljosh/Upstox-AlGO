from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class BrokerStatusData(BaseModel):
    is_connected: bool
    connection_status: str  # "CONNECTED", "DISCONNECTED", "TOKEN_EXPIRED", "AUTH_FAILED", "CONNECTING"
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    broker_name: str = "Upstox"
    api_key_configured: bool = False
    last_verified: Optional[str] = None
    latency_ms: Optional[int] = None
    last_error: Optional[str] = None
    mode: str = "LIVE"


class TokenUpdateRequest(BaseModel):
    access_token: str = Field(..., min_length=10, description="Upstox bearer access token")


class UpstoxAuthUrlResponse(BaseModel):
    authorization_url: str
    client_id: str
    redirect_uri: str
    state: Optional[str] = None


class DisconnectResponse(BaseModel):
    is_connected: bool = False
    connection_status: str = "DISCONNECTED"
    message: str = "Broker disconnected"


class UpstoxProfileData(BaseModel):
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    broker: str = "Upstox"
    latency_ms: Optional[int] = None
    last_verified: Optional[str] = None
