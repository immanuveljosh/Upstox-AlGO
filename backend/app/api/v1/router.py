from fastapi import APIRouter
from backend.app.api.v1.broker import router as broker_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.orders import router as orders_router
from backend.app.api.v1.pnl import router as pnl_router
from backend.app.api.v1.strategy import router as strategy_router
from backend.app.api.v1.risk import router as risk_router
from backend.app.api.v1.market import router as market_router
from backend.app.api.v1.settings import router as settings_router

api_v1_router = APIRouter()

api_v1_router.include_router(broker_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(orders_router)
api_v1_router.include_router(pnl_router)
api_v1_router.include_router(strategy_router)
api_v1_router.include_router(risk_router)
api_v1_router.include_router(market_router)
api_v1_router.include_router(settings_router)

