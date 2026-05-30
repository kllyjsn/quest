"""Backtest engine — walk-forward validation with comprehensive metrics."""


import numpy as np
import pandas as pd

from app.engine.factors import rank_universe
from app.engine.regime import detect_regime


def run_backtest(
    price_data: dict[str, pd.DataFrame],
    spy_prices: pd.Series,
    initial_capital: float = 1000.0,
    max_positions: int = 8,
    rebalance_days: int = 21,
    start_date: str | None = None,
    end_date: str | None = None,
    factor_weights: dict[str, float] | None = None,
) -> dict:
    """
    Run a walk-forward backtest of the multi-factor strategy.

    - Rebalances every `rebalance_days` trading days
    - Uses regime detection to adjust equity exposure
    - Applies position-size and sector caps
    """
    # Get the common date range
    all_dates = set()
    for sym, df in price_data.items():
        if df is not None and not df.empty:
            all_dates.update(df.index)

    if not all_dates:
        return {"error": "No price data available"}

    dates = sorted(all_dates)

    if start_date:
        start_dt = pd.Timestamp(start_date)
        dates = [d for d in dates if d >= start_dt]
    if end_date:
        end_dt = pd.Timestamp(end_date)
        dates = [d for d in dates if d <= end_dt]

    if len(dates) < 60:
        return {"error": "Insufficient data for backtest (need 60+ trading days)"}

    # Initialize
    cash = initial_capital
    positions: dict[str, float] = {}  # symbol -> quantity
    equity_curve: list[dict] = []
    trades: list[dict] = []
    peak_value = initial_capital

    for i, date in enumerate(dates):
        # Get current prices
        current_prices = {}
        for sym, df in price_data.items():
            if date in df.index:
                current_prices[sym] = float(df.loc[date, "Close"])

        # Calculate portfolio value
        position_value = sum(
            positions.get(sym, 0) * current_prices.get(sym, 0)
            for sym in positions
        )
        portfolio_value = cash + position_value
        peak_value = max(peak_value, portfolio_value)
        drawdown = (portfolio_value - peak_value) / peak_value if peak_value > 0 else 0

        equity_curve.append({
            "date": date.isoformat() if hasattr(date, "isoformat") else str(date),
            "value": round(portfolio_value, 2),
            "cash": round(cash, 2),
            "drawdown": round(drawdown, 4),
        })

        # Drawdown protection
        if drawdown <= -0.15:
            # Sell half of all positions
            for sym in list(positions.keys()):
                if sym in current_prices and positions[sym] > 0:
                    sell_qty = positions[sym] * 0.5
                    cash += sell_qty * current_prices[sym]
                    positions[sym] -= sell_qty
                    trades.append({
                        "date": str(date),
                        "symbol": sym,
                        "side": "sell",
                        "quantity": round(sell_qty, 4),
                        "price": current_prices[sym],
                        "reason": "drawdown_protection",
                    })
            continue

        # Rebalance on schedule
        if i % rebalance_days != 0 or i < 130:
            continue

        # Get historical data up to this point for factor calculation
        lookback_data = {}
        for sym, df in price_data.items():
            mask = df.index <= date
            if mask.sum() >= 30:
                lookback_data[sym] = df[mask]

        if not lookback_data:
            continue

        # Rank stocks
        rankings = rank_universe(lookback_data, weights=factor_weights)
        if not rankings:
            continue

        # Detect regime using SPY
        if isinstance(spy_prices, pd.Series):
            spy_lookback = spy_prices[spy_prices.index <= date]
        else:
            spy_lookback = pd.Series()
        regime = "bull"
        if len(spy_lookback) >= 200:
            regime_info = detect_regime(spy_lookback)
            regime = regime_info["regime"]

        # Target allocation
        top_stocks = rankings[:max_positions]
        equity_target = {"bull": 0.95, "sideways": 0.75, "bear": 0.50}.get(regime, 0.75)

        scores = [max(s["composite"], 0.01) for s in top_stocks]
        total_score = sum(scores)
        target_weights = {}
        for stock, score in zip(top_stocks, scores):
            w = (score / total_score) * equity_target
            w = min(w, 0.25)  # Position cap
            target_weights[stock["symbol"]] = w

        # Execute rebalance
        # Sell positions not in target
        for sym in list(positions.keys()):
            if sym not in target_weights and sym in current_prices and positions[sym] > 0:
                cash += positions[sym] * current_prices[sym]
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "sell",
                    "quantity": round(positions[sym], 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_exit",
                })
                positions[sym] = 0

        # Buy/adjust target positions
        total_value = cash + sum(positions.get(s, 0) * current_prices.get(s, 0) for s in positions)
        for sym, target_w in target_weights.items():
            if sym not in current_prices or current_prices[sym] <= 0:
                continue
            target_value = total_value * target_w
            current_value = positions.get(sym, 0) * current_prices[sym]
            delta = target_value - current_value

            if abs(delta) / total_value < 0.02:
                continue  # Skip small rebalances

            if delta > 0 and cash > 0:
                buy_value = min(delta, cash)
                qty = buy_value / current_prices[sym]
                positions[sym] = positions.get(sym, 0) + qty
                cash -= buy_value
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "buy",
                    "quantity": round(qty, 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_entry",
                })
            elif delta < 0 and positions.get(sym, 0) > 0:
                sell_qty = min(abs(delta) / current_prices[sym], positions[sym])
                positions[sym] -= sell_qty
                cash += sell_qty * current_prices[sym]
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "sell",
                    "quantity": round(sell_qty, 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_adjust",
                })

    # Clean up zero positions
    positions = {s: q for s, q in positions.items() if q > 0}

    # Calculate metrics
    if not equity_curve:
        return {"error": "No equity curve generated"}

    values = [e["value"] for e in equity_curve]
    final_value = values[-1]
    total_return = (final_value / initial_capital) - 1
    trading_days = len(values)
    years = trading_days / 252

    annual_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0

    # Sharpe ratio
    daily_returns = pd.Series(values).pct_change().dropna()
    if len(daily_returns) > 1 and daily_returns.std() > 0:
        sharpe = (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
    else:
        sharpe = 0

    # Sortino ratio
    downside = daily_returns[daily_returns < 0]
    if len(downside) > 1 and downside.std() > 0:
        sortino = (daily_returns.mean() / downside.std()) * np.sqrt(252)
    else:
        sortino = 0

    # Max drawdown
    peak = pd.Series(values).cummax()
    dd = (pd.Series(values) - peak) / peak
    max_drawdown = float(dd.min())

    total_trades_count = len(trades)

    return {
        "initial_capital": initial_capital,
        "final_value": round(final_value, 2),
        "total_return": round(total_return, 4),
        "annual_return": round(annual_return, 4),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "max_drawdown": round(max_drawdown, 4),
        "total_trades": total_trades_count,
        "trading_days": trading_days,
        "equity_curve": equity_curve,
        "trades": trades[-100:],  # Last 100 trades
        "final_positions": {s: round(q, 4) for s, q in positions.items()},
        "final_cash": round(cash, 2),
    }
