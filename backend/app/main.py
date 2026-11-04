import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from backend.app.core.config import settings
from backend.app.core.logging import setup_logging, logger
from backend.app.core.database import engine, AsyncSessionLocal
from backend.app.models.base import Base
from backend.app.models.broker_token import BrokerToken
from backend.app.models.system_config import SystemConfig
from backend.app.models.trade import Trade
from backend.app.api.v1.router import api_v1_router
from backend.app.core.exceptions import (
    BrokerConnectionException,
    ModeRestrictionException,
    RiskLimitBreachedException,
)


async def init_database():
    """Create all tables and seed baseline data."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed initial system configuration and sample closed trades if empty
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select

        # System config seed for Gift Nifty Directional
        res = await session.execute(select(SystemConfig).limit(1))
        existing_cfg = res.scalars().first()
        if not existing_cfg:
            cfg = SystemConfig(
                mode="BACKTEST",
                strategy_id="strat-gift-nifty-dir",
                strategy_name="Gift Nifty Directional",
                underlying="NIFTY",
                strategy_status="STOPPED",
                gift_nifty_signal_threshold=80.0,
                option_selection="ITM 3",
                entry_window_start="09:15",
                entry_window_end="09:17",
                max_trades_per_day=1,
                total_capital=200000.0,
                stoploss_capital_pct=5.0,
                target_capital_pct=6.0,
                lot_size=65,
                lots=2,
            )
            session.add(cfg)
        elif existing_cfg.lot_size == 25:
            existing_cfg.lot_size = 65

        # Broker token seed placeholder
        res_token = await session.execute(select(BrokerToken).limit(1))
        if not res_token.scalars().first():
            bt = BrokerToken(
                api_key=settings.UPSTOX_API_KEY or "ups_live_demo_key",
                api_secret=settings.UPSTOX_API_SECRET or "ups_secret",
                redirect_uri=settings.UPSTOX_REDIRECT_URI,
                access_token=None,
                is_valid=False,
            )
            session.add(bt)

        # Seed sample historical trades if table is empty
        res_trades = await session.execute(select(Trade).limit(1))
        if not res_trades.scalars().first():
            now = datetime.utcnow()
            sample_trades = [
                Trade(
                    trade_id="TRD-94801",
                    client_order_id="ORD-94801",
                    symbol="NIFTY 24800 PE",
                    option_type="PE",
                    lots=3,
                    qty=75,
                    entry_price=128.5,
                    exit_price=159.2,
                    realized_pnl=2302.5,
                    pnl_percent=23.89,
                    entry_time=now - timedelta(hours=3),
                    exit_time=now - timedelta(hours=2, minutes=30),
                ),
                Trade(
                    trade_id="TRD-94788",
                    client_order_id="ORD-94788",
                    symbol="NIFTY 24900 CE",
                    option_type="CE",
                    lots=2,
                    qty=50,
                    entry_price=112.0,
                    exit_price=113.35,
                    realized_pnl=67.5,
                    pnl_percent=1.21,
                    entry_time=now - timedelta(hours=4),
                    exit_time=now - timedelta(hours=3, minutes=45),
                ),
                Trade(
                    trade_id="TRD-94762",
                    client_order_id="ORD-94762",
                    symbol="NIFTY 24700 CE",
                    option_type="CE",
                    lots=3,
                    qty=75,
                    entry_price=154.2,
                    exit_price=184.8,
                    realized_pnl=2295.0,
                    pnl_percent=19.84,
                    entry_time=now - timedelta(days=1, hours=2),
                    exit_time=now - timedelta(days=1, hours=1),
                ),
                Trade(
                    trade_id="TRD-94750",
                    client_order_id="ORD-94750",
                    symbol="NIFTY 24750 PE",
                    option_type="PE",
                    lots=3,
                    qty=75,
                    entry_price=135.0,
                    exit_price=118.0,
                    realized_pnl=-1275.0,
                    pnl_percent=-12.59,
                    entry_time=now - timedelta(days=2, hours=3),
                    exit_time=now - timedelta(days=2, hours=2),
                ),
                Trade(
                    trade_id="TRD-94720",
                    client_order_id="ORD-94720",
                    symbol="NIFTY 24650 CE",
                    option_type="CE",
                    lots=3,
                    qty=75,
                    entry_price=140.0,
                    exit_price=178.5,
                    realized_pnl=2887.5,
                    pnl_percent=27.5,
                    entry_time=now - timedelta(days=4),
                    exit_time=now - timedelta(days=4, minutes=-40),
                ),
            ]
            session.add_all(sample_trades)

        await session.commit()


async def background_strategy_worker():
    """Background engine monitoring Gift Nifty Directional strategy every 4 seconds."""
    from backend.app.services.strategy_service import strategy_service
    while True:
        try:
            await asyncio.sleep(4.0)
            async with AsyncSessionLocal() as session:
                await strategy_service.run_monitoring_tick(session)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.debug(f"Strategy background worker note: {str(exc)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Initializing Upstox Algo Trading Engine database schema...")
    await init_database()
    logger.info("Starting Gift Nifty Directional automated background worker...")
    worker_task = asyncio.create_task(background_strategy_worker())
    logger.info("Trading engine is ready to accept requests.")
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Trading engine shutting down cleanly.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-grade FastAPI Backend for Nifty Intraday Index Option Directional Trading with Upstox v2 API integration.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception Handlers
@app.exception_handler(BrokerConnectionException)
async def broker_connection_handler(request: Request, exc: BrokerConnectionException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail,
    )


@app.exception_handler(ModeRestrictionException)
async def mode_restriction_handler(request: Request, exc: ModeRestrictionException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail,
    )


@app.exception_handler(RiskLimitBreachedException)
async def risk_limit_handler(request: Request, exc: RiskLimitBreachedException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "connection_status": "connected",
            "status": "validation_error",
            "message": "Invalid input payload",
            "details": exc.errors(),
        },
    )


# Mount Routers: Both at root (e.g. /broker/status) AND under /api/v1 (e.g. /api/v1/broker/status)
app.include_router(api_v1_router)
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "timestamp": datetime.utcnow().isoformat(),
        "api_v1": settings.API_V1_PREFIX,
    }
