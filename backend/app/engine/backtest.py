"""Backtest engine — walk-forward validation with comprehensive metrics.

Enhancements:
- Transaction cost modeling (10bps per trade)
- Slippage estimation (5bps market impact)
- Trailing stop-loss per position
- Better regime-adaptive exposure
- Monthly return tracking for analysis
"""


import numpy as np
import pandas as pd

from app.engine.factors import get_regime_weights, rank_universe
from app.engine.regime import detect_regime

TRANSACTION_COST_BPS = 10  # 10 basis points per trade
SLIPPAGE_BPS = 5  # 5 basis points slippage estimate


def _apply_costs(value: float, side: str) -> float:
    """Apply transaction costs and slippage."""
    cost_pct = (TRANSACTION_COST_BPS + SLIPPAGE_BPS) / 10000
    if side == "buy":
        return value * (1 + cost_pct)
    return value * (1 - cost_pct)


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
    - Models transaction costs and slippage
    - Implements trailing stops per position
    """
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
    position_highs: dict[str, float] = {}  # symbol -> highest price seen
    equity_curve: list[dict] = []
    trades: list[dict] = []
    peak_value = initial_capital
    total_costs = 0.0
    monthly_returns: list[dict] = []
    last_month_value = initial_capital
    last_month = None

    for i, date in enumerate(dates):
        current_prices = {}
        for sym, df in price_data.items():
            if date in df.index:
                current_prices[sym] = float(df.loc[date, "Close"])

        # Update position highs for trailing stops
        for sym in list(positions.keys()):
            if sym in current_prices and positions[sym] > 0:
                if sym not in position_highs:
                    position_highs[sym] = current_prices[sym]
                position_highs[sym] = max(
                    position_highs[sym], current_prices[sym]
                )

        # Trailing stop check (8% from high)
        for sym in list(positions.keys()):
            if sym in current_prices and positions[sym] > 0:
                high = position_highs.get(sym, current_prices[sym])
                if high > 0:
                    drawdown_from_high = (
                        current_prices[sym] - high
                    ) / high
                    if drawdown_from_high <= -0.08:
                        sell_value = _apply_costs(
                            positions[sym] * current_prices[sym], "sell"
                        )
                        cost = (
                            positions[sym] * current_prices[sym] - sell_value
                        )
                        total_costs += cost
                        cash += sell_value
                        trades.append({
                            "date": str(date),
                            "symbol": sym,
                            "side": "sell",
                            "quantity": round(positions[sym], 4),
                            "price": current_prices[sym],
                            "reason": "trailing_stop",
                        })
                        positions[sym] = 0
                        position_highs.pop(sym, None)

        # Calculate portfolio value
        position_value = sum(
            positions.get(sym, 0) * current_prices.get(sym, 0)
            for sym in positions
        )
        portfolio_value = cash + position_value
        peak_value = max(peak_value, portfolio_value)
        drawdown = (
            (portfolio_value - peak_value) / peak_value
            if peak_value > 0
            else 0
        )

        equity_curve.append({
            "date": (
                date.isoformat()
                if hasattr(date, "isoformat")
                else str(date)
            ),
            "value": round(portfolio_value, 2),
            "cash": round(cash, 2),
            "drawdown": round(drawdown, 4),
        })

        # Monthly return tracking
        current_month = (
            date.month if hasattr(date, "month") else None
        )
        if last_month is not None and current_month != last_month:
            monthly_ret = (
                (portfolio_value - last_month_value) / last_month_value
                if last_month_value > 0
                else 0
            )
            monthly_returns.append({
                "month": str(date)[:7],
                "return": round(monthly_ret, 4),
                "value": round(portfolio_value, 2),
            })
            last_month_value = portfolio_value
        last_month = current_month

        # Portfolio-level drawdown protection
        if drawdown <= -0.15:
            for sym in list(positions.keys()):
                if (
                    sym in current_prices
                    and positions[sym] > 0
                ):
                    sell_value = _apply_costs(
                        positions[sym] * current_prices[sym], "sell"
                    )
                    cost = (
                        positions[sym] * current_prices[sym] - sell_value
                    )
                    total_costs += cost
                    cash += sell_value
                    trades.append({
                        "date": str(date),
                        "symbol": sym,
                        "side": "sell",
                        "quantity": round(
                            positions[sym] * 0.5, 4
                        ),
                        "price": current_prices[sym],
                        "reason": "drawdown_protection",
                    })
                    positions[sym] *= 0.5
            continue

        # Rebalance on schedule
        if i % rebalance_days != 0 or i < 130:
            continue

        # Get historical data up to this point
        lookback_data = {}
        for sym, df in price_data.items():
            mask = df.index <= date
            if mask.sum() >= 30:
                lookback_data[sym] = df[mask]

        if not lookback_data:
            continue

        # Detect regime and get adaptive weights
        if isinstance(spy_prices, pd.Series):
            spy_lookback = spy_prices[spy_prices.index <= date]
        else:
            spy_lookback = pd.Series()
        regime = "bull"
        if len(spy_lookback) >= 200:
            regime_info = detect_regime(spy_lookback)
            regime = regime_info["regime"]

        # Use regime-adaptive factor weights
        adaptive_weights = (
            factor_weights if factor_weights else
            get_regime_weights(regime)
        )

        # Rank stocks with adaptive weights
        rankings = rank_universe(lookback_data, weights=adaptive_weights)
        if not rankings:
            continue

        # Target allocation
        top_stocks = rankings[:max_positions]
        equity_target = {
            "bull": 0.95, "sideways": 0.70, "bear": 0.45
        }.get(regime, 0.70)

        scores = [max(s["composite"], 0.01) for s in top_stocks]
        total_score = sum(scores)
        target_weights = {}
        for stock, score in zip(top_stocks, scores):
            w = (score / total_score) * equity_target
            w = min(w, 0.20)
            target_weights[stock["symbol"]] = w

        # Sell positions not in target
        for sym in list(positions.keys()):
            if (
                sym not in target_weights
                and sym in current_prices
                and positions[sym] > 0
            ):
                sell_value = _apply_costs(
                    positions[sym] * current_prices[sym], "sell"
                )
                cost = positions[sym] * current_prices[sym] - sell_value
                total_costs += cost
                cash += sell_value
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "sell",
                    "quantity": round(positions[sym], 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_exit",
                })
                positions[sym] = 0
                position_highs.pop(sym, None)

        # Buy/adjust target positions
        total_value = cash + sum(
            positions.get(s, 0) * current_prices.get(s, 0)
            for s in positions
        )
        for sym, target_w in target_weights.items():
            if sym not in current_prices or current_prices[sym] <= 0:
                continue
            target_value = total_value * target_w
            current_value = (
                positions.get(sym, 0) * current_prices[sym]
            )
            delta = target_value - current_value

            if abs(delta) / total_value < 0.02:
                continue

            if delta > 0 and cash > 0:
                buy_cost = _apply_costs(min(delta, cash), "buy")
                actual_invested = min(delta, cash)
                if buy_cost > cash:
                    actual_invested = cash / (
                        1 + (TRANSACTION_COST_BPS + SLIPPAGE_BPS) / 10000
                    )
                    buy_cost = cash
                qty = actual_invested / current_prices[sym]
                positions[sym] = positions.get(sym, 0) + qty
                position_highs[sym] = max(
                    position_highs.get(sym, 0), current_prices[sym]
                )
                cost = buy_cost - actual_invested
                total_costs += cost
                cash -= buy_cost
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "buy",
                    "quantity": round(qty, 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_entry",
                })
            elif delta < 0 and positions.get(sym, 0) > 0:
                sell_qty = min(
                    abs(delta) / current_prices[sym], positions[sym]
                )
                sell_value = _apply_costs(
                    sell_qty * current_prices[sym], "sell"
                )
                cost = sell_qty * current_prices[sym] - sell_value
                total_costs += cost
                positions[sym] -= sell_qty
                cash += sell_value
                trades.append({
                    "date": str(date),
                    "symbol": sym,
                    "side": "sell",
                    "quantity": round(sell_qty, 4),
                    "price": current_prices[sym],
                    "reason": "rebalance_adjust",
                })

    # Clean up
    positions = {s: q for s, q in positions.items() if q > 0}

    if not equity_curve:
        return {"error": "No equity curve generated"}

    # Calculate metrics
    values = [e["value"] for e in equity_curve]
    final_value = values[-1]
    total_return = (final_value / initial_capital) - 1
    trading_days = len(values)
    years = trading_days / 252

    annual_return = (
        (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
    )

    daily_returns = pd.Series(values).pct_change().dropna()
    if len(daily_returns) > 1 and daily_returns.std() > 0:
        sharpe = (
            (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
        )
    else:
        sharpe = 0

    downside = daily_returns[daily_returns < 0]
    if len(downside) > 1 and downside.std() > 0:
        sortino = (
            (daily_returns.mean() / downside.std()) * np.sqrt(252)
        )
    else:
        sortino = 0

    peak = pd.Series(values).cummax()
    dd = (pd.Series(values) - peak) / peak
    max_drawdown = float(dd.min())

    # Win rate
    sell_trades = [t for t in trades if t["side"] == "sell"]
    winning_trades = sum(
        1
        for t in sell_trades
        if t.get("reason") not in [
            "trailing_stop", "drawdown_protection",
        ]
    )
    total_closed = len(sell_trades) if sell_trades else 1
    win_rate = winning_trades / total_closed

    # Calmar ratio
    calmar = (
        annual_return / abs(max_drawdown)
        if max_drawdown != 0
        else 0
    )

    return {
        "initial_capital": initial_capital,
        "final_value": round(final_value, 2),
        "total_return": round(total_return, 4),
        "annual_return": round(annual_return, 4),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "calmar_ratio": round(calmar, 3),
        "max_drawdown": round(max_drawdown, 4),
        "total_trades": len(trades),
        "win_rate": round(win_rate, 3),
        "total_costs": round(total_costs, 2),
        "trading_days": trading_days,
        "monthly_returns": monthly_returns,
        "equity_curve": equity_curve,
        "trades": trades[-100:],
        "final_positions": {
            s: round(q, 4) for s, q in positions.items()
        },
        "final_cash": round(cash, 2),
    }
