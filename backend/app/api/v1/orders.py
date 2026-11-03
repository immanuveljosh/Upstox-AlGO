from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.services.order_service import order_service
from backend.app.services.risk_service import risk_service
from backend.app.schemas.common import APIResponse
from backend.app.schemas.order import OrderCreateRequest, OrderPlacedData, OrderItem, ExitAllResultData

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("/place", response_model=APIResponse[OrderPlacedData])
@router.post("", response_model=APIResponse[OrderPlacedData])
async def place_order(
    payload: OrderCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Place directional Call (CE) or Put (PE) order.
    Strategy automatically selects ITM 3 strike if strike is not provided.
    In LIVE mode -> real Upstox OMS order execution.
    In BACKTEST mode -> order placement is strictly blocked (backtest is historical query only).
    """
    return await order_service.place_directional_order(
        db=db,
        option_type=payload.option_type,
        lots=payload.lots,
        strike=payload.strike,
        order_type=payload.order_type,
        price=payload.price,
        trigger_price=payload.trigger_price,
    )


@router.post("/exit-all", response_model=APIResponse[ExitAllResultData])
async def exit_all_positions(db: AsyncSession = Depends(get_db)):
    """
    Exit all open positions and cancel pending orders.
    Requires active broker connection.
    """
    return await risk_service.execute_kill_switch(db)


@router.get("/open", response_model=APIResponse[List[OrderItem]])
async def get_open_orders(db: AsyncSession = Depends(get_db)):
    """Retrieve all open/placed orders."""
    return await order_service.get_orders(db=db, status_filter="PLACED")


@router.get("/closed", response_model=APIResponse[List[OrderItem]])
async def get_closed_orders(db: AsyncSession = Depends(get_db)):
    """Retrieve all executed closed orders."""
    return await order_service.get_orders(db=db, status_filter="CLOSED")


@router.get("/rejected", response_model=APIResponse[List[OrderItem]])
async def get_rejected_orders(db: AsyncSession = Depends(get_db)):
    """Retrieve all rejected orders."""
    return await order_service.get_orders(db=db, status_filter="REJECTED")


@router.get("", response_model=APIResponse[List[OrderItem]])
async def list_orders(
    status: Optional[str] = Query(None, description="Filter: PLACED, CLOSED, REJECTED, or ALL"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve orders with optional status filter."""
    return await order_service.get_orders(db=db, status_filter=status)


@router.delete("/{order_id}", response_model=APIResponse[dict])
async def cancel_order(
    order_id: str = Path(..., description="Client order ID to cancel"),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an active order."""
    return await order_service.cancel_order(db=db, order_id=order_id)
