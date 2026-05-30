"""Portfolio management endpoints."""

import json
from datetime import datetime

from fastapi import APIRouter

from app.db import get_db
from app.engine.factors import rank_universe
from app.engine.market_data import UNIVERSE, get_historical_data
from app.engine.portfolio import SECTOR_MAP, build_portfolio
from app.engine.regime import detect_regime
from app.engine.risk import RiskManager

router = APIRouter()

# Global risk manager instance
_risk_manager = RiskManager()


@router.get("/target")
async def get_target_portfolio(
    portfolio_value: float = 1000.0,
    max_positions: int = 8,
):
    """Calculate target portfolio allocation based on current signals."""
    price_data = await get_historical_data(UNIVERSE, period="1y")
    rankings = rank_universe(price_data)

    spy_data = await get_historical_data(["SPY"], period="2y")
    regime = "bull"
    if "SPY" in spy_data:
        regime_info = detect_regime(spy_data["SPY"]["Close"])
        regime = regime_info["regime"]
        if hasattr(regime, "value"):
            regime = regime.value

    result = build_portfolio(
        rankings=rankings,
        portfolio_value=portfolio_value,
        risk_manager=_risk_manager,
        max_positions=max_positions,
        regime=regime,
    )
    result["regime"] = regime
    return result


@router.post("/snapshot")
async def save_snapshot(
    total_value: float,
    cash: float,
    positions: str = "{}",
    regime: str = "unknown",
):
    """Save a portfolio snapshot to the database."""
    db = await get_db()
    drawdown = _risk_manager.current_drawdown(total_value)
    _risk_manager.update_peak(total_value)

    await db.execute(
        """INSERT INTO portfolio_snapshots (timestamp, total_value, cash, positions, drawdown, regime)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (datetime.now().isoformat(), total_value, cash, positions, drawdown, regime),
    )
    await db.commit()
    await db.close()
    return {"status": "saved", "drawdown": drawdown}


@router.get("/history")
async def get_portfolio_history(limit: int = 90):
    """Get portfolio value history."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    await db.close()

    return {
        "snapshots": [
            {
                "timestamp": row["timestamp"],
                "total_value": row["total_value"],
                "cash": row["cash"],
                "positions": json.loads(row["positions"]) if row["positions"] else {},
                "drawdown": row["drawdown"],
                "regime": row["regime"],
            }
            for row in reversed(rows)
        ]
    }


@router.get("/sector-exposure")
async def get_sector_exposure():
    """Get current sector exposure breakdown."""
    return {
        "sector_map": SECTOR_MAP,
        "sectors": list(set(SECTOR_MAP.values())),
    }
