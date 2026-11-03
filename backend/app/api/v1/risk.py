from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.risk_service import risk_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.risk import KillSwitchResultData, RiskLimitsData, RiskLimitsUpdate

router = APIRouter(prefix="/risk", tags=["Risk Management & Kill Switch"])


@router.post("/kill-switch", response_model=APIResponse[KillSwitchResultData])
async def trigger_kill_switch(db: AsyncSession = Depends(get_db)):
    """
    Emergency Exit All Positions (Kill Switch).
    Immediately liquidates open Nifty positions at market price, cancels pending orders,
    and stops strategy execution.
    Only works when broker connection is active.
    """
    return await risk_service.execute_kill_switch(db)


@router.get("/limits", response_model=APIResponse[RiskLimitsData])
async def get_risk_limits(db: AsyncSession = Depends(get_db)):
    """Get active risk limits, 5% stoploss, 6% target, and daily trade limit."""
    return await risk_service.get_risk_limits(db)


@router.put("/limits", response_model=APIResponse[RiskLimitsData])
async def update_risk_limits(
    payload: RiskLimitsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update risk parameters (total capital, stop loss %, target %)."""
    return await risk_service.update_risk_limits(
        db=db,
        total_capital=payload.total_capital,
        stoploss_capital_pct=payload.stoploss_capital_pct,
        target_capital_pct=payload.target_capital_pct,
        max_trades_per_day=payload.max_trades_per_day,
    )
