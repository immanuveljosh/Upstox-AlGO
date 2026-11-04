from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.market_service import market_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.market import (
    NiftySpotData,
    GiftNiftyData,
    OptionChainITM3Response,
    HistoricalCandle,
)

router = APIRouter(prefix="/market", tags=["Market Data"])


@router.get("/nifty", response_model=APIResponse[NiftySpotData])
@router.get("/nifty-spot", response_model=APIResponse[NiftySpotData])
async def get_nifty_spot(db: AsyncSession = Depends(get_db)):
    """
    Get current Nifty 50 spot price, tick change, and ATM strike.
    When disconnected, returns connection_lost status and empty data.
    """
    return await market_service.get_nifty_spot(db)


@router.get("/gift-nifty", response_model=APIResponse[GiftNiftyData])
@router.get("/gift-nifty-1day", response_model=APIResponse[GiftNiftyData])
async def get_gift_nifty(db: AsyncSession = Depends(get_db)):
    """
    Get Gift Nifty 1-Day value, day change (+/- points), and threshold trigger status (+80 / -80).
    When disconnected, returns connection_lost status and empty data.
    """
    return await market_service.get_gift_nifty_1day(db)


@router.get("/option-chain", response_model=APIResponse[OptionChainITM3Response])
async def get_itm3_option_chain(db: AsyncSession = Depends(get_db)):
    """
    Get ITM 3 Call (ATM - 150) and ITM 3 Put (ATM + 150) option contracts for Nifty.
    When disconnected, returns connection_lost status and empty data.
    """
    return await market_service.get_itm3_option_chain(db)


@router.get("/historical-candles", response_model=APIResponse[List[HistoricalCandle]])
async def get_historical_candles(
    interval: str = Query("1day", description="Candle interval (1minute, 5minute, 15minute, 1day)"),
    to_date: str = Query("2026-11-03", description="End date YYYY-MM-DD"),
    from_date: str = Query("2026-10-15", description="Start date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch historical candles for Gift Nifty and Nifty 50 backtest analysis.
    """
    return await market_service.get_historical_candles(
        db=db, interval=interval, to_date=to_date, from_date=from_date
    )


@router.get("/funds", response_model=APIResponse[dict])
async def get_funds(db: AsyncSession = Depends(get_db)):
    """Fetch live account funds and available margin from Upstox."""
    return await market_service.get_funds(db=db)
