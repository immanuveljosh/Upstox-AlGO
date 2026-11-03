from fastapi import HTTPException, status


class BrokerConnectionException(HTTPException):
    def __init__(self, detail: str = "Broker connection lost. No data available."):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "connection_status": "connection_lost",
                "data": None,
                "message": detail,
            },
        )


class ModeRestrictionException(HTTPException):
    def __init__(self, detail: str = "Action blocked by current trading mode."):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "status": "error",
                "message": detail,
            },
        )


class RiskLimitBreachedException(HTTPException):
    def __init__(self, detail: str = "Risk limit threshold breached."):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "status": "risk_breached",
                "message": detail,
            },
        )

