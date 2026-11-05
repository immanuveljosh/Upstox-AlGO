from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.strategy_service import strategy_service
from backend.app.services.risk_service import risk_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.risk import KillSwitchResultData
from backend.app.schemas.strategy import (
    StrategyConfigData,
    StrategySettingsUpdate,
    GiftNiftyObservationRequest,
    GiftNiftyCsvImportRequest,
    SignalEvaluationResult,
    ModeSwitchRequest,
    InstrumentMetadata,
    QuantityCalculationRequest,
    QuantityCalculationResponse,
    BacktestRequest,
)

router = APIRouter(prefix="/strategy", tags=["Strategy & Backtest"])


@router.get("", response_model=APIResponse[StrategyConfigData])
@router.get("/config", response_model=APIResponse[StrategyConfigData])
async def get_strategy(db: AsyncSession = Depends(get_db)):
    """Fetch default 'Nifty Directional' strategy configuration and running status."""
    return await strategy_service.get_strategy_config(db)


@router.get("/status", response_model=APIResponse[dict])
async def get_strategy_status(db: AsyncSession = Depends(get_db)):
    """Fetch live 'Nifty Directional' strategy overview, Gift Nifty signal, window status, and today's trade status."""
    return await strategy_service.get_live_status(db)


@router.post("/square-off", response_model=APIResponse[KillSwitchResultData])
async def emergency_square_off_strategy_alias(db: AsyncSession = Depends(get_db)):
    """
    Emergency square-off alias endpoint for strategy controls.
    Delegates immediately to risk_service.execute_kill_switch.
    """
    return await risk_service.execute_kill_switch(db)


@router.post("/gift-nifty", response_model=APIResponse[dict])
async def record_gift_nifty_observation(
    payload: GiftNiftyObservationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record an actual Gift Nifty 1-Day change observation in points."""
    return await strategy_service.record_gift_nifty_observation(
        db=db,
        change_points=payload.change_points,
        trade_date=payload.trade_date,
        prev_close=payload.prev_close,
        current_value=payload.current_value,
        observed_at=payload.observed_at,
        source="MANUAL",
    )


@router.post("/gift-nifty/import", response_model=APIResponse[dict])
async def import_gift_nifty_csv(
    payload: GiftNiftyCsvImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """Import historical Gift Nifty 1-Day change observations from CSV."""
    return await strategy_service.import_gift_nifty_csv(db=db, csv_text=payload.csv)


@router.get("/gift-nifty/history", response_model=APIResponse[dict])
async def get_gift_nifty_history(
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """List recorded Gift Nifty 1-Day change observations."""
    return await strategy_service.list_gift_nifty_history(db=db, from_date=from_date, to_date=to_date)


@router.get("/instrument-metadata", response_model=APIResponse[InstrumentMetadata])
async def get_instrument_metadata(
    strike: Optional[int] = Query(None, description="Option strike price"),
    option_type: str = Query("CE", description="Option type: CE or PE"),
    expiry_date: Optional[str] = Query(None, description="Contract expiry date YYYY-MM-DD"),
    spot_price: Optional[float] = Query(None, description="Current Nifty 50 spot price"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch actual lot size and contract metadata from Upstox option contracts API."""
    meta = await strategy_service.fetch_instrument_metadata(
        db=db,
        strike=strike,
        option_type=option_type,
        expiry_date=expiry_date,
        spot_price=spot_price,
    )
    return {
        "connection_status": "connected",
        "data": meta,
        "message": f"Instrument metadata resolved ({meta['trading_symbol']} • Lot Size: {meta['lot_size']}).",
    }


@router.post("/calculate-quantity", response_model=APIResponse[QuantityCalculationResponse])
async def calculate_quantity(
    payload: QuantityCalculationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculate Total Quantity = Number of Lots × Actual Lot Size and validate against exchange rules."""
    meta = await strategy_service.fetch_instrument_metadata(
        db=db,
        strike=payload.strike,
        option_type=payload.option_type,
    )
    actual_lot_size = int(meta.get("lot_size", 65))
    freeze_qty = int(meta.get("freeze_quantity", 1755))

    cfg_res = await strategy_service.get_strategy_config(db)
    cfg_data = cfg_res.get("data") or {}
    available_cap = payload.available_capital or float(cfg_data.get("total_capital", 200000.0))

    calc = strategy_service.calculate_and_validate_quantity(
        lots=payload.lots,
        lot_size=actual_lot_size,
        freeze_quantity=freeze_qty,
        option_premium=payload.option_premium,
        available_capital=available_cap,
        raw_quantity=payload.raw_quantity,
    )
    strike_val = int(meta.get("strike_price") or payload.strike or 0)
    calc["instrument"] = payload.instrument or "NIFTY"
    calc["trading_symbol"] = meta.get("trading_symbol", f"NIFTY {strike_val} {payload.option_type}")
    calc["instrument_key"] = meta.get("instrument_key", "")
    calc["expiry"] = meta.get("expiry", "")
    calc["option_type"] = payload.option_type
    calc["strike"] = strike_val
    calc["metadata_source"] = meta.get("source", "UPSTOX_API")

    return {
        "connection_status": "connected",
        "data": calc,
        "message": calc.get("message", "Validation completed."),
    }


@router.post("/start", response_model=APIResponse[dict])
async def start_strategy(db: AsyncSession = Depends(get_db)):
    """Start automated Nifty Directional scanner."""
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
    - Lot size multiplier (lots)
    - Stop Loss % of capital (default 4%)
    - Target % of capital (default 5%)
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
    gift_nifty_change: Optional[float] = Query(None, description="Gift Nifty 1-Day points change"),
    spot_price: Optional[float] = Query(None, description="NIFTY spot price"),
    db: AsyncSession = Depends(get_db),
):
    """Evaluates Gift Nifty 1-Day directional signal against Nifty Directional rules."""
    return await strategy_service.evaluate_signal(
        db=db, gift_nifty_change=gift_nifty_change, spot_price=spot_price
    )


@router.post("/mode", response_model=APIResponse[dict])
async def switch_mode(
    payload: ModeSwitchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Switch trading mode: BACKTEST (default) or LIVE."""
    return await strategy_service.switch_mode(
        db, new_mode=payload.mode, confirm_live=bool(payload.confirm_live)
    )


@router.get("/backtest", response_model=APIResponse[dict])
@router.post("/backtest", response_model=APIResponse[dict])
async def run_backtest(
    duration: Optional[str] = Query("3M", description="Duration code: 1M, 3M, 6M, 1Y, CUSTOM"),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD for custom range"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD for custom range"),
    capital: Optional[float] = Query(None, description="Initial strategy capital"),
    lots: Optional[int] = Query(None, description="Lot size multiplier"),
    payload: Optional[BacktestRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Run Historical Strategy Backtest for 'Nifty Directional':
    - Duration options: 1 Month (1M), 3 Months (3M), 6 Months (6M), 1 Year (1Y), Custom Date Range (CUSTOM).
    - Never places live orders.
    """
    dur = (payload.duration if payload and payload.duration else duration) or "3M"
    start_d = payload.from_date if payload and payload.from_date else from_date
    end_d = payload.to_date if payload and payload.to_date else to_date
    cap = payload.capital if payload and payload.capital else capital
    trade_lots = payload.lots if payload and payload.lots else lots

    return await strategy_service.run_backtest(
        db=db,
        duration=dur,
        from_date=start_d,
        to_date=end_d,
        capital=cap,
        lots=trade_lots,
    )


@router.get("/backtest/runs", response_model=APIResponse[list])
async def list_backtest_runs(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List recently executed backtest runs."""
    return await strategy_service.list_backtest_runs(db=db, limit=limit)


@router.get("/backtest/runs/{run_id}", response_model=APIResponse[dict])
async def get_backtest_run(
    run_id: str = Path(..., description="Backtest run ID"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a stored backtest run by ID."""
    payload = await strategy_service.get_backtest_run(db=db, run_id=run_id)
    if not payload:
        raise HTTPException(status_code=404, detail=f"Backtest run {run_id} not found.")
    return {
        "connection_status": "connected",
        "data": payload,
        "message": f"Retrieved backtest run {run_id}.",
    }


@router.get("/backtest/runs/{run_id}/export.csv")
async def export_backtest_run_csv(
    run_id: str = Path(..., description="Backtest run ID"),
    db: AsyncSession = Depends(get_db),
):
    """Export a stored backtest run's detailed daily trade table as CSV."""
    payload = await strategy_service.get_backtest_run(db=db, run_id=run_id)
    if not payload:
        raise HTTPException(status_code=404, detail=f"Backtest run {run_id} not found.")
    csv_text = strategy_service.export_backtest_csv(payload)
    filename = f"nifty_directional_backtest_{payload.get('duration_code', 'run')}_{payload.get('start_date', '')}_{payload.get('end_date', '')}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
