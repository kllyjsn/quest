"""Risk management endpoints."""


from fastapi import APIRouter

from app.db import get_db
from app.engine.risk import RiskManager

router = APIRouter()

_risk_manager = RiskManager()


@router.get("/summary")
async def get_risk_summary(portfolio_value: float = 1000.0):
    """Get current risk summary."""
    _risk_manager.update_peak(portfolio_value)
    return _risk_manager.get_risk_summary(portfolio_value, [])


@router.get("/limits")
async def get_risk_limits():
    """Get current risk limit configuration."""
    limits = _risk_manager.limits
    return {
        "max_position_pct": limits.max_position_pct,
        "max_sector_pct": limits.max_sector_pct,
        "max_drawdown_warning": limits.max_drawdown_warning,
        "max_drawdown_reduce": limits.max_drawdown_reduce,
        "max_drawdown_liquidate": limits.max_drawdown_liquidate,
        "trailing_stop_pct": limits.trailing_stop_pct,
        "take_profit_pct": limits.take_profit_pct,
        "take_profit_sell_pct": limits.take_profit_sell_pct,
        "min_cash_reserve_pct": limits.min_cash_reserve_pct,
        "pdt_max_day_trades": limits.pdt_max_day_trades,
    }


@router.post("/check-position")
async def check_position(
    symbol: str,
    proposed_value: float,
    portfolio_value: float = 1000.0,
):
    """Check if a proposed position passes risk checks."""
    return _risk_manager.check_position_size(symbol, proposed_value, portfolio_value)


@router.get("/pdt")
async def check_pdt():
    """Check Pattern Day Trader status."""
    return _risk_manager.check_pdt()


@router.get("/kelly")
async def kelly_size(
    win_rate: float = 0.55,
    avg_win: float = 0.08,
    avg_loss: float = 0.04,
    fraction: float = 0.5,
):
    """Calculate Kelly criterion position size."""
    kelly = _risk_manager.kelly_position_size(win_rate, avg_win, avg_loss, fraction)
    return {
        "kelly_fraction": round(kelly, 4),
        "recommended_position_pct": round(kelly * 100, 2),
        "inputs": {
            "win_rate": win_rate,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "kelly_fraction_used": fraction,
        },
    }


@router.get("/events")
async def get_risk_events(limit: int = 50):
    """Get risk event history."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM risk_events ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    await db.close()

    return {
        "events": [
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "event_type": row["event_type"],
                "description": row["description"],
                "severity": row["severity"],
                "action_taken": row["action_taken"],
            }
            for row in rows
        ]
    }
