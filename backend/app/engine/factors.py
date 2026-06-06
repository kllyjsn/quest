"""Multi-factor ranking model — scores stocks across momentum, quality, value, volatility.

Novel enhancements:
- Momentum acceleration (2nd derivative) to catch trend inflection points
- Risk-adjusted momentum (return / vol) for better signal-to-noise
- Earnings quality proxy via return consistency and trend strength
- Adaptive factor weights based on regime
"""

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
    past_price = prices.iloc[-130]
    recent_price = prices.iloc[-21]
    if past_price <= 0:
        return 0.0
    return (recent_price / past_price) - 1


def momentum_acceleration(prices: pd.Series) -> float:
    """
    Momentum acceleration: rate of change of momentum.
    Positive acceleration = trend strengthening.
    This catches inflection points earlier than raw momentum.
    """
    if len(prices) < 130:
        return 0.0

    # Current 3-month momentum (skip last 5 days for stability)
    if len(prices) > 68:
        mom_recent = prices.iloc[-5] / prices.iloc[-68] - 1
    else:
        return 0.0

    # Prior 3-month momentum
    if len(prices) > 131:
        mom_prior = prices.iloc[-63] / prices.iloc[-131] - 1
    else:
        return 0.0

    return mom_recent - mom_prior


def risk_adjusted_momentum(prices: pd.Series) -> float:
    """
    Momentum divided by volatility — Sharpe-like signal.
    Higher = stronger risk-adjusted trend.
    """
    if len(prices) < 130:
        return 0.0

    returns = compute_returns(prices)
    if len(returns) < 63:
        return 0.0

    recent_returns = returns.iloc[-63:]
    vol = recent_returns.std() * np.sqrt(252)
    mom = prices.iloc[-21] / prices.iloc[-130] - 1

    if vol > 0.01:
        return mom / vol
    return 0.0


def mean_reversion_score(prices: pd.Series) -> float:
    """
    Mean reversion signal: combination of RSI oversold + Bollinger Band deviation.
    Higher score = more oversold = stronger buy signal.
    """
    if len(prices) < 30:
        return 0.0

    rsi = compute_rsi(prices)
    current_rsi = rsi.iloc[-1] if len(rsi) > 0 else 50

    sma_20 = prices.rolling(20).mean()
    std_20 = prices.rolling(20).std()
    if std_20.iloc[-1] > 0:
        bb_position = (prices.iloc[-1] - (sma_20.iloc[-1] - 2 * std_20.iloc[-1])) / (
            4 * std_20.iloc[-1]
        )
    else:
        bb_position = 0.5

    rsi_score = (50 - min(current_rsi, 50)) / 50
    bb_score = max(0, 1 - bb_position)

    return rsi_score * 0.5 + bb_score * 0.5


def quality_score_from_prices(prices: pd.Series) -> float:
    """
    Price-derived quality proxy: consistency of returns + low drawdown + trend strength.
    Enhanced with R-squared of log-price regression (trend consistency).
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
    dd_score = max(0, 1 - max_dd * 2)

    # Return stability
    if monthly_returns.std() > 0:
        stability = 1 / (1 + monthly_returns.std() * 10)
    else:
        stability = 0.5

    # Trend consistency: R-squared of log-price linear regression
    log_prices = np.log(prices.dropna().values)
    if len(log_prices) > 60:
        x = np.arange(len(log_prices))
        slope, _, r_value, _, _ = stats.linregress(x, log_prices)
        r_squared = r_value ** 2
        # Bonus for upward slope
        trend_bonus = 0.2 if slope > 0 else 0.0
    else:
        r_squared = 0.0
        trend_bonus = 0.0

    return (pct_positive * 0.3 + dd_score * 0.2 + stability * 0.2 +
            r_squared * 0.2 + trend_bonus)


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

    target_vol = 0.20
    deviation = abs(current_vol - target_vol)
    return max(0, 1 - deviation * 3)


def earnings_momentum_proxy(prices: pd.Series) -> float:
    """
    Earnings momentum proxy using price reaction to earnings-like events.
    Detects post-earnings drift by finding high-volume days with big moves
    and measuring the subsequent drift direction.
    """
    if len(prices) < 60:
        return 0.0

    returns = compute_returns(prices)
    if len(returns) < 40:
        return 0.0

    # Find days with abnormally large absolute returns (> 2 std)
    abs_rets = returns.abs()
    threshold = abs_rets.mean() + 2 * abs_rets.std()
    big_move_days = returns[abs_rets > threshold]

    if len(big_move_days) == 0:
        return 0.0

    # Recent big move drift (last 60 days)
    recent_big = big_move_days.iloc[-3:] if len(big_move_days) >= 3 else big_move_days
    drift = recent_big.mean()

    return float(np.clip(drift * 20, -1, 1))


def get_regime_weights(regime: str = "bull") -> dict[str, float]:
    """Adaptive factor weights based on market regime."""
    if regime == "bull":
        return {
            "momentum": 0.30,
            "risk_adj_momentum": 0.15,
            "mean_reversion": 0.10,
            "quality": 0.20,
            "volatility": 0.15,
            "earnings_proxy": 0.10,
        }
    elif regime == "bear":
        return {
            "momentum": 0.10,
            "risk_adj_momentum": 0.10,
            "mean_reversion": 0.25,
            "quality": 0.30,
            "volatility": 0.15,
            "earnings_proxy": 0.10,
        }
    else:  # sideways
        return {
            "momentum": 0.20,
            "risk_adj_momentum": 0.15,
            "mean_reversion": 0.20,
            "quality": 0.25,
            "volatility": 0.10,
            "earnings_proxy": 0.10,
        }


def rank_universe(
    price_data: dict[str, pd.DataFrame],
    weights: dict[str, float] | None = None,
) -> list[dict]:
    """
    Rank all stocks in the universe by composite factor score.
    Uses 6 factors with z-score normalization.
    """
    if weights is None:
        weights = {
            "momentum": 0.25,
            "risk_adj_momentum": 0.15,
            "mean_reversion": 0.15,
            "quality": 0.20,
            "volatility": 0.15,
            "earnings_proxy": 0.10,
        }

    scores = []
    for symbol, df in price_data.items():
        if df is None or df.empty or "Close" not in df.columns:
            continue
        close = df["Close"]
        if len(close) < 30:
            continue

        mom = momentum_score(close)
        ram = risk_adjusted_momentum(close)
        mr = mean_reversion_score(close)
        qual = quality_score_from_prices(close)
        vol = volatility_score(close)
        ep = earnings_momentum_proxy(close)

        scores.append({
            "symbol": symbol,
            "momentum": round(mom, 4),
            "risk_adj_momentum": round(ram, 4),
            "mean_reversion": round(mr, 4),
            "quality": round(qual, 4),
            "volatility": round(vol, 4),
            "earnings_proxy": round(ep, 4),
            "raw_scores": {
                "momentum": mom, "risk_adj_momentum": ram,
                "mean_reversion": mr, "quality": qual,
                "volatility": vol, "earnings_proxy": ep,
            },
        })

    if not scores:
        return []

    df_scores = pd.DataFrame(scores)
    active_factors = [f for f in weights if f in df_scores.columns]

    for factor in active_factors:
        values = df_scores[factor].values
        if np.std(values) > 0:
            z = stats.zscore(values)
        else:
            z = np.zeros_like(values)
        df_scores[f"{factor}_z"] = z

    # Composite score
    df_scores["composite"] = sum(
        df_scores[f"{factor}_z"] * w for factor, w in weights.items()
        if f"{factor}_z" in df_scores.columns
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
