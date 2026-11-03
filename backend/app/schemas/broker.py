from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class BrokerStatusData(BaseModel):
    is_connected: bool
    connection_status: str  # "connected" or "connection_lost"
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    broker_name: str = "Upstox"
    api_key_configured: bool = False
    last_verified: Optional[str] = None
    latency_ms: Optional[int] = None
    mode: str = "LIVE"


class TokenUpdateRequest(BaseModel):
    access_token: str = Field(..., min_length=10, description="Upstox bearer access token")


class UpstoxAuthUrlResponse(BaseModel):
    authorization_url: str
    client_id: str
    redirect_uri: str


class UpstoxProfileData(BaseModel):
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    broker: str = "Upstox"
    latency_ms: Optional[int] = None
    last_verified: Optional[str] = None
