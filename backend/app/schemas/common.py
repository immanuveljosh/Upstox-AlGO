from typing import Generic, TypeVar, Optional, Any, Literal
from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """Consistent envelope format returned across all endpoints."""
    connection_status: str = "connected"
    data: Optional[T] = None
    message: str = "Success"


def connection_lost_response(
    message: str = "Broker connection lost. No data available.",
    default_data: Any = None,
) -> dict:
    """Standardized response format when broker is offline or token expired."""
    return {
        "connection_status": "connection_lost",
        "data": default_data,
        "message": message,
    }
