import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
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
from backend.app.models.backtest import GiftNiftyObservation, BacktestRunRecord
from backend.app.api.v1.router import api_v1_router
from backend.app.core.exceptions import (
    BrokerConnectionException,
    ModeRestrictionException,
    RiskLimitBreachedException,
)
from backend.app.strategy.nifty_directional import (
    STRATEGY_ID,
    STRATEGY_NAME,
    UNDERLYING,
    OPTION_SELECTION,
    DEFAULT_SIGNAL_THRESHOLD,
    DEFAULT_STOPLOSS_CAPITAL_PCT,
    DEFAULT_TARGET_CAPITAL_PCT,
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_LOTS,
)


async def init_database():
    """Create all tables and ensure Nifty Directional default configuration."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, delete

        res = await session.execute(select(SystemConfig).limit(1))
        existing_cfg = res.scalars().first()
        if not existing_cfg:
            cfg = SystemConfig(
                mode="BACKTEST",
                strategy_id=STRATEGY_ID,
                strategy_name=STRATEGY_NAME,
                underlying=UNDERLYING,
                strategy_status="STOPPED",
                gift_nifty_signal_threshold=DEFAULT_SIGNAL_THRESHOLD,
                option_selection=OPTION_SELECTION,
                entry_window_start="09:15:00",
                entry_window_end="09:17:00",
                max_trades_per_day=1,
                total_capital=DEFAULT_TOTAL_CAPITAL,
                stoploss_capital_pct=DEFAULT_STOPLOSS_CAPITAL_PCT,
                target_capital_pct=DEFAULT_TARGET_CAPITAL_PCT,
                lot_size=65,
                lots=DEFAULT_LOTS,
            )
            session.add(cfg)
        else:
            existing_cfg.strategy_id = STRATEGY_ID
            existing_cfg.strategy_name = STRATEGY_NAME
            existing_cfg.underlying = UNDERLYING
            existing_cfg.option_selection = OPTION_SELECTION
            existing_cfg.entry_window_start = "09:15:00"
            existing_cfg.entry_window_end = "09:17:00"
            if existing_cfg.stoploss_capital_pct == 5.0 and existing_cfg.target_capital_pct == 6.0:
                existing_cfg.stoploss_capital_pct = DEFAULT_STOPLOSS_CAPITAL_PCT
                existing_cfg.target_capital_pct = DEFAULT_TARGET_CAPITAL_PCT
            if existing_cfg.lot_size == 25:
                existing_cfg.lot_size = 65

        # Broker token record
        res_token = await session.execute(select(BrokerToken).limit(1))
        if not res_token.scalars().first():
            bt = BrokerToken(
                api_key=settings.UPSTOX_API_KEY or "",
                api_secret=settings.UPSTOX_API_SECRET or "",
                redirect_uri=settings.UPSTOX_REDIRECT_URI,
                access_token=None,
                is_valid=False,
            )
            session.add(bt)

        # Clean up any legacy seeded sample trades
        await session.execute(
            delete(Trade).where(
                Trade.trade_id.in_(["TRD-94801", "TRD-94788", "TRD-94762", "TRD-94750", "TRD-94720"])
            )
        )

        await session.commit()


async def background_strategy_worker():
    """Background engine monitoring Nifty Directional strategy every 4 seconds."""
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
    logger.info("Starting Nifty Directional automated background worker...")
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
    description="Production-grade FastAPI Backend for Nifty Directional Intraday Index Option Trading with Upstox v2 API integration.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


app.include_router(api_v1_router)
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "strategy": STRATEGY_NAME,
        "timestamp": datetime.utcnow().isoformat(),
        "api_v1": settings.API_V1_PREFIX,
    }
