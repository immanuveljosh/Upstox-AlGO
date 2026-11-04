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
    InstrumentMetadata,
    QuantityCalculationRequest,
    QuantityCalculationResponse,
)

router = APIRouter(prefix="/strategy", tags=["Strategy & Mode"])


@router.get("", response_model=APIResponse[StrategyConfigData])
@router.get("/config", response_model=APIResponse[StrategyConfigData])
async def get_strategy(db: AsyncSession = Depends(get_db)):
    """Fetch default 'Gift Nifty Directional' strategy configuration and running status."""
    return await strategy_service.get_strategy_config(db)


@router.get("/instrument-metadata", response_model=APIResponse[InstrumentMetadata])
async def get_instrument_metadata(
    strike: Optional[int] = Query(None, description="Option strike price (e.g. 24750)"),
    option_type: str = Query("CE", description="Option type: CE or PE"),
    expiry_date: Optional[str] = Query(None, description="Contract expiry date YYYY-MM-DD"),
    spot_price: float = Query(24878.5, description="Current Nifty 50 spot price"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch actual lot size and contract metadata from Upstox option contracts API.
    For current NIFTY contracts, lot_size = 65 units per lot, freeze_quantity = 1755 (27 lots).
    """
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
    """
    Calculate Total Quantity = Number of Lots × Actual Lot Size and validate against
    broker and exchange requirements (lot multiple, freeze limit, capital margin).
    """
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
    )
    strike_val = int(meta.get("strike_price") or payload.strike or 24750)
    calc["instrument"] = payload.instrument or "NIFTY"
    calc["trading_symbol"] = meta.get("trading_symbol", f"NIFTY {strike_val} {payload.option_type}")
    calc["instrument_key"] = meta.get("instrument_key", "NSE_FO|40013")
    calc["expiry"] = meta.get("expiry", "2026-11-09")
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


@router.post("/scan", response_model=APIResponse[dict])
async def scan_strategy(
    gift_nifty_change: Optional[float] = Query(None, description="Optional Gift Nifty change override"),
    spot_price: Optional[float] = Query(None, description="Optional Nifty spot price override"),
    db: AsyncSession = Depends(get_db),
):
    """
    Run one cycle of the automated Gift Nifty strategy scanner:
    - Reconciles active positions against 5% Capital SL and 6% Capital Target.
    - If in 09:15-09:17 AM window and threshold is reached, executes directional trade.
    """
    return await strategy_service.run_monitoring_tick(
        db=db,
        override_change=gift_nifty_change,
        override_spot=spot_price,
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
    """Switch trading mode: PAPER (default), LIVE, or BACKTEST."""
    return await strategy_service.switch_mode(
        db, new_mode=payload.mode, confirm_live=bool(payload.confirm_live)
    )


@router.post("/backtest", response_model=APIResponse[dict])
async def run_backtest(
    from_date: str = Query("2026-01-01", description="Start date YYYY-MM-DD"),
    to_date: str = Query("2026-11-03", description="End date YYYY-MM-DD"),
    capital: Optional[float] = Query(None, description="Initial strategy capital"),
    lots: Optional[int] = Query(None, description="Lot size"),
    db: AsyncSession = Depends(get_db),
):
    """
    Backtest default 'Gift Nifty Directional' strategy:
    - Analyzes historical Gift Nifty 1-day gaps and NIFTY 3rd ITM options.
    - Computes win rate, profit factor, drawdown, stop loss / target hits, and net P&L.
    - If historical data unavailable, displays DATA UNAVAILABLE.
    """
    return await strategy_service.run_backtest(
        db=db,
        from_date=from_date,
        to_date=to_date,
        capital=capital,
        lots=lots,
    )
