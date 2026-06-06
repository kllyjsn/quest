"""Market regime detection — classifies the current market environment."""

from enum import StrEnum

import numpy as np
import pandas as pd

from app.engine.market_data import compute_returns, compute_volatility


class MarketRegime(StrEnum):
    BULL = "bull"
    BEAR = "bear"
    SIDEWAYS = "sideways"


def detect_regime(
    spy_prices: pd.Series,
    sector_data: dict[str, pd.DataFrame] | None = None,
) -> dict:
    """
    Multi-signal regime classifier.

    Signals:
    1. Trend: 50/200 SMA crossover (golden cross / death cross)
    2. Momentum: 1-month and 3-month returns
    3. Volatility: Rolling 21-day vol vs historical median
    4. Breadth: % of sectors above their 50-day SMA
    """
    if len(spy_prices) < 200:
        return {
            "regime": MarketRegime.SIDEWAYS,
            "confidence": 0.5,
            "signals": {},
        }

    sma_50 = spy_prices.rolling(50).mean()
    sma_200 = spy_prices.rolling(200).mean()

    # Signal 1: Trend
    trend_signal = 1 if sma_50.iloc[-1] > sma_200.iloc[-1] else -1
    trend_slope = (sma_50.iloc[-1] - sma_50.iloc[-20]) / sma_50.iloc[-20] if sma_50.iloc[-20] != 0 else 0

    # Signal 2: Momentum
    returns = compute_returns(spy_prices)
    mom_1m = spy_prices.iloc[-1] / spy_prices.iloc[-21] - 1 if len(spy_prices) > 21 else 0
    mom_3m = spy_prices.iloc[-1] / spy_prices.iloc[-63] - 1 if len(spy_prices) > 63 else 0

    # Signal 3: Volatility
    vol = compute_volatility(returns)
    current_vol = vol.iloc[-1] if len(vol) > 0 else 0.15
    median_vol = vol.median() if len(vol) > 0 else 0.15
    vol_regime = "high" if current_vol > median_vol * 1.3 else ("low" if current_vol < median_vol * 0.7 else "normal")

    # Signal 4: Breadth (sectors above 50-day SMA)
    breadth_score = 0.5
    if sector_data:
        above_sma = 0
        total = 0
        for sym, df in sector_data.items():
            if len(df) >= 50 and "Close" in df.columns:
                close = df["Close"]
                sma = close.rolling(50).mean()
                if close.iloc[-1] > sma.iloc[-1]:
                    above_sma += 1
                total += 1
        if total > 0:
            breadth_score = above_sma / total

    # Composite scoring
    score = 0.0
    score += trend_signal * 0.3
    score += np.clip(mom_1m * 10, -1, 1) * 0.2
    score += np.clip(mom_3m * 5, -1, 1) * 0.2
    score += (breadth_score - 0.5) * 2 * 0.2
    score += (-1 if vol_regime == "high" else (1 if vol_regime == "low" else 0)) * 0.1

    if score > 0.3:
        regime = MarketRegime.BULL
    elif score < -0.3:
        regime = MarketRegime.BEAR
    else:
        regime = MarketRegime.SIDEWAYS

    confidence = min(abs(score) / 0.6, 1.0)

    return {
        "regime": regime,
        "confidence": round(confidence, 3),
        "composite_score": round(score, 4),
        "signals": {
            "trend": trend_signal,
            "trend_slope": round(trend_slope, 4),
            "momentum_1m": round(mom_1m, 4),
            "momentum_3m": round(mom_3m, 4),
            "volatility": round(current_vol, 4),
            "volatility_regime": vol_regime,
            "breadth": round(breadth_score, 3),
        },
    }
