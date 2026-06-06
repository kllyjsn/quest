"""Strategy configuration and execution endpoints."""

from fastapi import APIRouter

from app.engine.factors import rank_universe
from app.engine.market_data import SECTOR_ETFS, UNIVERSE, get_historical_data
from app.engine.regime import detect_regime

router = APIRouter()


DEFAULT_WEIGHTS = {
    "momentum": 0.35,
    "mean_reversion": 0.20,
    "quality": 0.25,
    "volatility": 0.20,
}

REGIME_WEIGHTS = {
    "bull": {"momentum": 0.45, "mean_reversion": 0.10, "quality": 0.25, "volatility": 0.20},
    "bear": {"momentum": 0.10, "mean_reversion": 0.35, "quality": 0.35, "volatility": 0.20},
    "sideways": {"momentum": 0.20, "mean_reversion": 0.35, "quality": 0.25, "volatility": 0.20},
}


@router.get("/regime")
async def get_regime():
    """Detect current market regime."""
    spy_data = await get_historical_data(["SPY"], period="2y")
    sector_data = await get_historical_data(SECTOR_ETFS, period="1y")

    if "SPY" not in spy_data:
        return {"error": "Could not fetch SPY data"}

    spy_prices = spy_data["SPY"]["Close"]
    regime = detect_regime(spy_prices, sector_data)
    return regime


@router.get("/rankings")
async def get_rankings(top_n: int = 20, regime_adaptive: bool = True):
    """Get multi-factor stock rankings for the universe."""
    price_data = await get_historical_data(UNIVERSE, period="1y")

    weights = DEFAULT_WEIGHTS
    regime_info = None

    if regime_adaptive:
        spy_data = await get_historical_data(["SPY"], period="2y")
        if "SPY" in spy_data:
            spy_prices = spy_data["SPY"]["Close"]
            sector_data = await get_historical_data(SECTOR_ETFS, period="1y")
            regime_info = detect_regime(spy_prices, sector_data)
            regime_str = regime_info["regime"]
            if isinstance(regime_str, str):
                weights = REGIME_WEIGHTS.get(regime_str, DEFAULT_WEIGHTS)
            else:
                weights = REGIME_WEIGHTS.get(regime_str.value, DEFAULT_WEIGHTS)

    rankings = rank_universe(price_data, weights=weights)

    return {
        "rankings": rankings[:top_n],
        "total_scored": len(rankings),
        "weights": weights,
        "regime": regime_info,
    }


@router.get("/sector-rotation")
async def get_sector_rotation():
    """Sector relative strength analysis."""
    from app.engine.market_data import SP500_SECTORS
    sector_data = await get_historical_data(SECTOR_ETFS, period="6mo")

    sectors = []
    for etf, name in SP500_SECTORS.items():
        if etf not in sector_data:
            continue
        df = sector_data[etf]
        close = df["Close"]
        if len(close) < 21:
            continue

        ret_1m = float(close.iloc[-1] / close.iloc[-21] - 1) if len(close) >= 21 else 0
        ret_3m = float(close.iloc[-1] / close.iloc[-63] - 1) if len(close) >= 63 else 0
        ret_6m = float(close.iloc[-1] / close.iloc[0] - 1)

        sma_50 = close.rolling(50).mean()
        above_sma = close.iloc[-1] > sma_50.iloc[-1] if len(sma_50.dropna()) > 0 else False

        sectors.append({
            "etf": etf,
            "sector": name,
            "return_1m": round(ret_1m, 4),
            "return_3m": round(ret_3m, 4),
            "return_6m": round(ret_6m, 4),
            "above_50sma": bool(above_sma),
            "relative_strength": round((ret_1m * 0.4 + ret_3m * 0.35 + ret_6m * 0.25), 4),
        })

    sectors.sort(key=lambda x: x["relative_strength"], reverse=True)
    for i, s in enumerate(sectors):
        s["rank"] = i + 1

    return {"sectors": sectors}


@router.get("/config")
async def get_strategy_config():
    """Get current strategy configuration."""
    return {
        "universe_size": len(UNIVERSE),
        "universe": UNIVERSE,
        "default_weights": DEFAULT_WEIGHTS,
        "regime_weights": REGIME_WEIGHTS,
        "rebalance_frequency": "monthly",
        "max_positions": 8,
        "strategies": [
            {
                "name": "Multi-Factor",
                "description": "Composite z-score across momentum, quality, mean-reversion, volatility",
            },
            {"name": "Momentum", "description": "Jegadeesh-Titman 6-month return, skip last month"},
            {"name": "Mean Reversion", "description": "RSI + Bollinger Band oversold signals on quality stocks"},
            {"name": "Sector Rotation", "description": "Relative strength ranking of 11 GICS sectors"},
        ],
    }
