"""Quant Edge — FastAPI backend."""

import sys
from pathlib import Path

# Ensure the backend directory is on the path
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Quant Edge",
    description="Systematic quantitative trading engine",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


def _mount_routers():
    """Mount all routers after app creation."""
    from app.db import init_db
    from app.routers import auth, backtest, broker, paper_trading, portfolio, risk, signals, strategies
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_a: FastAPI):
        await init_db()
        yield

    app.router.lifespan_context = lifespan

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(strategies.router, prefix="/api/strategies", tags=["strategies"])
    app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
    app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
    app.include_router(backtest.router, prefix="/api/backtest", tags=["backtest"])
    app.include_router(broker.router, prefix="/api/broker", tags=["broker"])
    app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
    app.include_router(paper_trading.router, prefix="/api/paper", tags=["paper-trading"])


_mount_routers()
