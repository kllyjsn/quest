"""Multi-factor ranking model — scores stocks across momentum, quality, value, volatility."""

import numpy as np
import pandas as pd
from scipy import stats

from app.engine.market_data import compute_returns, compute_rsi, compute_volatility


def momentum_score(prices: pd.Series) -> float:
    """
    Jegadeesh-Titman momentum: 6-month return skipping the most recent month.
    Captures the intermediate-term momentum effect while avoiding short-term reversal.
    """
    if len(prices) < 130:
        return 0.0
    # Skip last 21 trading days, use previous ~105 days
    past_price = prices.iloc[-130]
    recent_price = prices.iloc[-21]
    if past_price <= 0:
        return 0.0
    return (recent_price / past_price) - 1


def mean_reversion_score(prices: pd.Series) -> float:
    """
    Mean reversion signal: combination of RSI oversold + Bollinger Band deviation.
    Higher score = more oversold = stronger buy signal.
    """
    if len(prices) < 30:
        return 0.0

    rsi = compute_rsi(prices)
    current_rsi = rsi.iloc[-1] if len(rsi) > 0 else 50

    # Bollinger Band position (0 = at lower band, 1 = at upper band)
    sma_20 = prices.rolling(20).mean()
    std_20 = prices.rolling(20).std()
    if std_20.iloc[-1] > 0:
        bb_position = (prices.iloc[-1] - (sma_20.iloc[-1] - 2 * std_20.iloc[-1])) / (
            4 * std_20.iloc[-1]
        )
    else:
        bb_position = 0.5

    # Invert: lower RSI and lower BB position = higher mean reversion score
    rsi_score = (50 - min(current_rsi, 50)) / 50  # 0 when RSI>=50, 1 when RSI=0
    bb_score = max(0, 1 - bb_position)  # Higher when price is near lower band

    return rsi_score * 0.5 + bb_score * 0.5


def quality_score_from_prices(prices: pd.Series) -> float:
    """
    Price-derived quality proxy: consistency of returns + low drawdown.
    (Real quality would use fundamentals — ROE, debt/equity — but we keep it data-only.)
    """
    if len(prices) < 252:
        return 0.0

    returns = compute_returns(prices)
    if len(returns) < 100:
        return 0.0

    # Positive return consistency (% of months positive)
    monthly_returns = prices.resample("ME").last().pct_change().dropna()
    if len(monthly_returns) == 0:
        return 0.0
    pct_positive = (monthly_returns > 0).mean()

    # Low max drawdown
    cummax = prices.cummax()
    drawdown = (prices - cummax) / cummax
    max_dd = abs(drawdown.min())
    dd_score = max(0, 1 - max_dd * 2)  # Penalize drawdowns > 50%

    # Return stability (low volatility of monthly returns)
    if monthly_returns.std() > 0:
        stability = 1 / (1 + monthly_returns.std() * 10)
    else:
        stability = 0.5

    return pct_positive * 0.4 + dd_score * 0.3 + stability * 0.3


def volatility_score(prices: pd.Series) -> float:
    """
    Volatility factor: prefer moderate volatility.
    Too low = no return potential. Too high = excessive risk.
    Target: ~20% annualized vol.
    """
    if len(prices) < 30:
        return 0.0

    returns = compute_returns(prices)
    vol = compute_volatility(returns)
    current_vol = vol.iloc[-1] if len(vol) > 0 else 0.2

    # Bell curve around 20% vol
    target_vol = 0.20
    deviation = abs(current_vol - target_vol)
    return max(0, 1 - deviation * 3)


def rank_universe(
    price_data: dict[str, pd.DataFrame],
    weights: dict[str, float] | None = None,
) -> list[dict]:
    """
    Rank all stocks in the universe by composite factor score.

    Returns sorted list of {symbol, composite, momentum, mean_reversion, quality, volatility}.
    """
    if weights is None:
        weights = {
            "momentum": 0.35,
            "mean_reversion": 0.20,
            "quality": 0.25,
            "volatility": 0.20,
        }

    scores = []
    for symbol, df in price_data.items():
        if df is None or df.empty or "Close" not in df.columns:
            continue
        close = df["Close"]
        if len(close) < 30:
            continue

        mom = momentum_score(close)
        mr = mean_reversion_score(close)
        qual = quality_score_from_prices(close)
        vol = volatility_score(close)

        scores.append({
            "symbol": symbol,
            "momentum": round(mom, 4),
            "mean_reversion": round(mr, 4),
            "quality": round(qual, 4),
            "volatility": round(vol, 4),
            "raw_scores": {
                "momentum": mom, "mean_reversion": mr,
                "quality": qual, "volatility": vol,
            },
        })

    if not scores:
        return []

    # Z-score normalization per factor
    df_scores = pd.DataFrame(scores)
    for factor in ["momentum", "mean_reversion", "quality", "volatility"]:
        values = df_scores[factor].values
        if np.std(values) > 0:
            z = stats.zscore(values)
        else:
            z = np.zeros_like(values)
        df_scores[f"{factor}_z"] = z

    # Composite score
    df_scores["composite"] = sum(
        df_scores[f"{factor}_z"] * w for factor, w in weights.items()
    )

    df_scores = df_scores.sort_values("composite", ascending=False)

    result = []
    for _, row in df_scores.iterrows():
        result.append({
            "symbol": row["symbol"],
            "composite": round(row["composite"], 4),
            "rank": len(result) + 1,
            "momentum": round(row["momentum"], 4),
            "mean_reversion": round(row["mean_reversion"], 4),
            "quality": round(row["quality"], 4),
            "volatility": round(row["volatility"], 4),
        })

    return result
