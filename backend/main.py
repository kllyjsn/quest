"""Quant Edge — FastAPI backend."""

import sys
from pathlib import Path

# Ensure the backend directory is on the path so 'app' package is importable
backend_dir = str(Path(__file__).parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import (
    auth,
    backtest,
    broker,
    historical,
    paper_trading,
    portfolio,
    recommendations,
    risk,
    signals,
    strategies,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Quant Edge",
    description="Systematic quantitative trading engine",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(
    strategies.router, prefix="/api/strategies", tags=["strategies"]
)
app.include_router(
    portfolio.router, prefix="/api/portfolio", tags=["portfolio"]
)
app.include_router(
    signals.router, prefix="/api/signals", tags=["signals"]
)
app.include_router(
    backtest.router, prefix="/api/backtest", tags=["backtest"]
)
app.include_router(
    broker.router, prefix="/api/broker", tags=["broker"]
)
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
app.include_router(
    paper_trading.router, prefix="/api/paper", tags=["paper-trading"]
)
app.include_router(
    historical.router, prefix="/api/historical", tags=["historical"]
)
app.include_router(
    recommendations.router, prefix="/api/recommendations", tags=["recommendations"]
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
