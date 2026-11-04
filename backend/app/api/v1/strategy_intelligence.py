from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.strategy_intelligence_service import strategy_intelligence_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.strategy_intelligence import StrategyIntelligenceData

router = APIRouter(tags=["Strategy Intelligence"])


@router.get("/strategy/intelligence", response_model=APIResponse[StrategyIntelligenceData])
@router.get("/strategy-intelligence", response_model=APIResponse[StrategyIntelligenceData])
async def get_strategy_intelligence(
    mode: str = Query("LIVE", description="Trading mode: LIVE or BACKTEST"),
    duration: str = Query("3M", description="Duration code: 1M, 3M, 6M, 1Y, CUSTOM"),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD for custom range"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD for custom range"),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns comprehensive Strategy Intelligence for Nifty Directional:
    - Signal Analysis (Gift Nifty signal history, CALL/PUT/NO TRADE, signal strength, missed signal detection)
    - P&L Analytics (Win/Loss Streaks, Daily & Monthly breakdown, Drawdown, Profit Factor)
    - Strategy Performance (1M, 3M, 6M, 1Y, Custom range, Equity curve, Monthly P&L heatmap)
    - Execution Monitoring (Latency, Expected vs Fill price, Slippage, Exit reasons, Rejection details)
    - Strict LIVE vs BACKTEST mode separation.
    """
    data = await strategy_intelligence_service.get_intelligence(
        db=db,
        mode=mode,
        duration=duration,
        from_date=from_date,
        to_date=to_date,
    )
    return {
        "connection_status": "connected",
        "data": data,
        "message": data.message or "Strategy intelligence data computed.",
    }


@router.get("/strategy/intelligence/export.csv")
@router.get("/strategy-intelligence/export.csv")
async def export_strategy_intelligence_csv(
    mode: str = Query("LIVE", description="Trading mode: LIVE or BACKTEST"),
    duration: str = Query("3M", description="Duration code: 1M, 3M, 6M, 1Y, CUSTOM"),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD for custom range"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD for custom range"),
    db: AsyncSession = Depends(get_db),
):
    """Exports Strategy Intelligence signal history and execution monitoring as CSV."""
    data = await strategy_intelligence_service.get_intelligence(
        db=db,
        mode=mode,
        duration=duration,
        from_date=from_date,
        to_date=to_date,
    )
    csv_text = strategy_intelligence_service.export_intelligence_csv(data)
    filename = f"strategy_intelligence_{data.mode.lower()}_{data.duration_code.lower()}_{data.start_date}_{data.end_date}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

