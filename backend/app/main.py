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
    from sqlalchemy import text
    async with engine.begin() as conn:
        if "sqlite" in settings.DATABASE_URL:
            try:
                await conn.execute(text("PRAGMA journal_mode=WAL"))
                await conn.execute(text("PRAGMA busy_timeout=30000"))
            except Exception:
                pass
        await conn.run_sync(Base.metadata.create_all)
        for col_name, col_type in [
            ("expected_price", "FLOAT"),
            ("slippage", "FLOAT"),
            ("signal_time", "DATETIME"),
            ("broker_confirmed_at", "DATETIME"),
            ("exit_reason", "VARCHAR(100)"),
            ("instrument_key", "VARCHAR(100)"),
            ("exit_upstox_order_id", "VARCHAR(100)"),
            ("exit_status", "VARCHAR(50)"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass
        for col_name, col_type in [
            ("connection_status", "VARCHAR(50)"),
            ("last_error", "VARCHAR(500)"),
            ("issued_at", "DATETIME"),
            ("expires_at", "DATETIME"),
            ("token_request_status", "VARCHAR(50) DEFAULT 'IDLE'"),
            ("last_token_request_at", "DATETIME"),
            ("last_token_approved_at", "DATETIME"),
            ("last_token_request_date", "VARCHAR(20)"),
            ("authorization_expiry", "DATETIME"),
            ("notifier_url", "VARCHAR(500)"),
            ("auto_request_enabled", "BOOLEAN DEFAULT 1"),
            ("scheduled_request_time", "VARCHAR(10) DEFAULT '08:45'"),
            ("last_webhook_hash", "VARCHAR(128)"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE broker_tokens ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass

        for col_name, col_type in [
            ("critical_alert", "VARCHAR(500)"),
            ("orphan_positions_json", "VARCHAR(4000)"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE system_configs ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass
        from backend.app.core.security import encrypt_token, is_encrypted_at_rest
        try:
            raw_rows = (await conn.execute(text("SELECT id, access_token, api_secret FROM broker_tokens"))).fetchall()
            for r_id, raw_tok, raw_sec in raw_rows:
                if raw_tok and not is_encrypted_at_rest(raw_tok):
                    await conn.execute(
                        text("UPDATE broker_tokens SET access_token = :enc WHERE id = :id"),
                        {"enc": encrypt_token(raw_tok), "id": r_id},
                    )
                if raw_sec and not is_encrypted_at_rest(raw_sec):
                    await conn.execute(
                        text("UPDATE broker_tokens SET api_secret = :enc WHERE id = :id"),
                        {"enc": encrypt_token(raw_sec), "id": r_id},
                    )
        except Exception:
            pass

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
            if not existing_cfg.total_capital or existing_cfg.total_capital < 50000:
                existing_cfg.total_capital = DEFAULT_TOTAL_CAPITAL

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
    """Background engine monitoring Nifty Directional strategy and daily Upstox token scheduler."""
    from backend.app.services.strategy_service import strategy_service
    from backend.app.services.broker_service import broker_service
    while True:
        try:
            await asyncio.sleep(4.0)
            async with AsyncSessionLocal() as session:
                await broker_service.run_daily_scheduler_tick(session)
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
    logger.info("Running startup broker position reconciliation...")
    try:
        async with AsyncSessionLocal() as session:
            from backend.app.services.strategy_service import strategy_service
            await strategy_service.startup_reconcile_positions(session)
    except Exception as e:
        logger.warning(f"Startup position reconciliation note: {str(e)}")
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "connection_status": "connection_lost",
            "data": None,
            "message": f"Internal server error: {str(exc)}",
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
