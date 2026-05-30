"""Backtest endpoints."""

from fastapi import APIRouter

from app.engine.backtest import run_backtest
from app.engine.market_data import UNIVERSE, get_historical_data

router = APIRouter()


@router.post("/run")
async def run_backtest_endpoint(
    initial_capital: float = 1000.0,
    max_positions: int = 8,
    rebalance_days: int = 21,
    period: str = "2y",
    momentum_weight: float = 0.35,
    mean_reversion_weight: float = 0.20,
    quality_weight: float = 0.25,
    volatility_weight: float = 0.20,
):
    """Run a backtest with the multi-factor strategy."""
    price_data = await get_historical_data(UNIVERSE, period=period)
    spy_data = await get_historical_data(["SPY"], period=period)

    if "SPY" not in spy_data:
        return {"error": "Could not fetch SPY data for regime detection"}

    spy_prices = spy_data["SPY"]["Close"]

    weights = {
        "momentum": momentum_weight,
        "mean_reversion": mean_reversion_weight,
        "quality": quality_weight,
        "volatility": volatility_weight,
    }

    result = run_backtest(
        price_data=price_data,
        spy_prices=spy_prices,
        initial_capital=initial_capital,
        max_positions=max_positions,
        rebalance_days=rebalance_days,
        factor_weights=weights,
    )

    return result


@router.get("/quick")
async def quick_backtest():
    """Run a quick backtest with default parameters."""
    price_data = await get_historical_data(UNIVERSE[:30], period="1y")
    spy_data = await get_historical_data(["SPY"], period="1y")

    if "SPY" not in spy_data:
        return {"error": "Could not fetch SPY data"}

    result = run_backtest(
        price_data=price_data,
        spy_prices=spy_data["SPY"]["Close"],
        initial_capital=1000.0,
        max_positions=5,
        rebalance_days=21,
    )

    return {
        "initial_capital": result.get("initial_capital"),
        "final_value": result.get("final_value"),
        "total_return": result.get("total_return"),
        "annual_return": result.get("annual_return"),
        "sharpe_ratio": result.get("sharpe_ratio"),
        "sortino_ratio": result.get("sortino_ratio"),
        "max_drawdown": result.get("max_drawdown"),
        "total_trades": result.get("total_trades"),
    }
