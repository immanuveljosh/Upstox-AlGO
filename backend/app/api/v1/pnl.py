from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.pnl_service import pnl_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.pnl import PnlSummaryData

router = APIRouter(prefix="/pnl", tags=["P&L Analytics"])


@router.get("/monthly", response_model=APIResponse[PnlSummaryData])
async def get_monthly_pnl(db: AsyncSession = Depends(get_db)):
    """
    Retrieve real 30-day monthly realized P&L metrics and equity curve.
    When disconnected, returns connection_lost status and empty response.
    """
    return await pnl_service.get_pnl_summary(db=db, period="monthly")


@router.get("/six-months", response_model=APIResponse[PnlSummaryData])
async def get_six_months_pnl(db: AsyncSession = Depends(get_db)):
    """
    Retrieve real 6-month realized P&L metrics and equity curve.
    When disconnected, returns connection_lost status and empty response.
    """
    return await pnl_service.get_pnl_summary(db=db, period="sixMonth")


@router.get("/yearly", response_model=APIResponse[PnlSummaryData])
async def get_yearly_pnl(db: AsyncSession = Depends(get_db)):
    """
    Retrieve real 12-month yearly realized P&L metrics and equity curve.
    When disconnected, returns connection_lost status and empty response.
    """
    return await pnl_service.get_pnl_summary(db=db, period="yearly")


@router.get("/summary", response_model=APIResponse[PnlSummaryData])
async def get_pnl_summary(
    period: Literal["monthly", "sixMonth", "yearly"] = Query(
        "monthly", description="Performance evaluation horizon"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Generic P&L endpoint with horizon parameter."""
    return await pnl_service.get_pnl_summary(db=db, period=period)
