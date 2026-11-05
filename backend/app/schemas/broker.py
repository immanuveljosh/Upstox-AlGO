from typing import Optional, Union
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

    # Semi-Automated Daily Access Token Lifecycle & Scheduler Telemetry
    token_request_status: str = "IDLE"
    token_request_status_label: str = "Console Configuration Required"
    issued_at: Optional[str] = None
    issued_at_ist: Optional[str] = None
    expires_at: Optional[str] = None
    expires_at_ist: Optional[str] = None
    last_token_request_at: Optional[str] = None
    last_token_request_ist: Optional[str] = None
    last_token_approved_at: Optional[str] = None
    last_token_approved_ist: Optional[str] = None
    authorization_expiry: Optional[str] = None
    authorization_expiry_ist: Optional[str] = None
    notifier_url: Optional[str] = None
    webhook_endpoint: str = ""
    webhook_url_status: str = "URL Missing"
    webhook_url_reason: Optional[str] = None
    console_config_status: str = "Console Configuration Required"
    webhook_delivery_status: str = "Not Delivered"
    auto_request_enabled: bool = True
    scheduled_request_time: str = "08:45"
    next_scheduled_request_ist: Optional[str] = None
    is_notifier_url_error: bool = False


class TokenUpdateRequest(BaseModel):
    access_token: str = Field(..., min_length=10, description="Upstox bearer access token")


class UpstoxNotifierWebhookPayload(BaseModel):
    client_id: str = Field(..., min_length=1, description="Upstox App Client ID")
    user_id: str = Field(..., min_length=1, description="Upstox UCC / User ID")
    access_token: str = Field(..., min_length=10, description="Issued Upstox JWT access token")
    token_type: Optional[str] = Field("Bearer", description="Token type, expected Bearer")
    expires_at: Optional[Union[str, int, float]] = Field(None, description="Token expiry timestamp")
    issued_at: Optional[Union[str, int, float]] = Field(None, description="Token issue timestamp")
    message_type: str = Field(..., description="Webhook message type, must be 'access_token'")


class TokenRequestScheduleUpdate(BaseModel):
    auto_request_enabled: bool = True
    scheduled_request_time: str = Field("08:45", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


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
