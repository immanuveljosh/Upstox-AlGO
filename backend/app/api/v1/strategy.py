from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.strategy_service import strategy_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.strategy import (
    StrategyConfigData,
    StrategySettingsUpdate,
    SignalEvaluationResult,
    ModeSwitchRequest,
)

router = APIRouter(prefix="/strategy", tags=["Strategy & Mode"])


@router.get("", response_model=APIResponse[StrategyConfigData])
async def get_strategy(db: AsyncSession = Depends(get_db)):
    """Fetch default 'Gift Nifty Directional' strategy configuration and running status."""
    return await strategy_service.get_strategy_config(db)


@router.post("/start", response_model=APIResponse[dict])
async def start_strategy(db: AsyncSession = Depends(get_db)):
    """Start automated Gift Nifty directional scanner. Requires active broker connection."""
    return await strategy_service.start_strategy(db)


@router.post("/stop", response_model=APIResponse[dict])
async def stop_strategy(db: AsyncSession = Depends(get_db)):
    """Stop automated strategy execution."""
    return await strategy_service.stop_strategy(db)


@router.post("/toggle", response_model=APIResponse[dict])
async def toggle_strategy(db: AsyncSession = Depends(get_db)):
    """Toggle strategy automation."""
    return await strategy_service.toggle_strategy(db)


@router.put("/settings", response_model=APIResponse[StrategyConfigData])
@router.put("/config", response_model=APIResponse[StrategyConfigData])
async def update_strategy_settings(
    payload: StrategySettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update configurable strategy parameters:
    - Lot size (multiplier)
    - Stop Loss % of capital (default 5%)
    - Target % of capital (default 6%)
    - Total Capital
    """
    return await strategy_service.update_settings(
        db=db,
        lots=payload.lots,
        stoploss_capital_pct=payload.stoploss_capital_pct,
        target_capital_pct=payload.target_capital_pct,
        total_capital=payload.total_capital,
    )


@router.post("/evaluate", response_model=APIResponse[SignalEvaluationResult])
async def evaluate_signal(
    gift_nifty_change: Optional[float] = Query(None, description="Override 1-Day Gift Nifty points change"),
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates current 1-Day Gift Nifty signal:
    - If >= +80 pts -> BUY CALL (ITM 3)
    - If <= -80 pts -> BUY PUT (ITM 3)
    - Between -80 and +80 -> NEUTRAL WAIT
    - Checks 09:15 - 09:17 AM IST window and maximum 1 trade per day constraint.
    """
    return await strategy_service.evaluate_signal(db=db, gift_nifty_change=gift_nifty_change)


@router.post("/mode", response_model=APIResponse[dict])
async def switch_mode(
    payload: ModeSwitchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Switch trading mode: LIVE vs BACKTEST."""
    return await strategy_service.switch_mode(db, payload.mode)
