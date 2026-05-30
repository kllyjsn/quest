"""Signal generation and monitoring endpoints."""

import json
from datetime import datetime

import pandas as pd
from fastapi import APIRouter

from app.db import get_db
from app.engine.factors import mean_reversion_score, momentum_score
from app.engine.market_data import (
    UNIVERSE,
    compute_bollinger_bands,
    compute_macd,
    compute_rsi,
    get_historical_data,
)

router = APIRouter()


def _bb_position(price: float, upper: pd.Series, lower: pd.Series) -> float:
    if len(upper.dropna()) == 0:
        return 0.5
    u = float(upper.iloc[-1])
    lo = float(lower.iloc[-1])
    if u == lo:
        return 0.5
    return round((price - lo) / (u - lo), 3)


@router.get("/scan")
async def scan_signals(min_strength: float = 0.3):
    """Scan the universe for actionable signals."""
    price_data = await get_historical_data(UNIVERSE, period="6mo")

    signals = []
    for symbol, df in price_data.items():
        if df is None or df.empty or "Close" not in df.columns:
            continue
        close = df["Close"]
        if len(close) < 30:
            continue

        # Momentum signal
        mom = momentum_score(close)
        if abs(mom) > min_strength:
            signals.append({
                "symbol": symbol,
                "strategy": "momentum",
                "signal_type": "buy" if mom > 0 else "caution",
                "strength": round(abs(mom), 4),
                "value": round(mom, 4),
                "description": (
                    f"{'Strong' if abs(mom) > 0.3 else 'Moderate'}"
                    f" {'bullish' if mom > 0 else 'bearish'} momentum ({mom:.1%})"
                ),
            })

        # Mean reversion signal
        mr = mean_reversion_score(close)
        if mr > min_strength:
            rsi = compute_rsi(close)
            current_rsi = float(rsi.iloc[-1]) if len(rsi) > 0 else 50
            signals.append({
                "symbol": symbol,
                "strategy": "mean_reversion",
                "signal_type": "buy",
                "strength": round(mr, 4),
                "value": round(current_rsi, 2),
                "description": f"Oversold: RSI={current_rsi:.0f}, mean reversion score={mr:.2f}",
            })

        # MACD crossover
        if len(close) >= 35:
            macd_line, signal_line, histogram = compute_macd(close)
            if len(histogram) >= 2:
                prev_hist = float(histogram.iloc[-2])
                curr_hist = float(histogram.iloc[-1])
                if prev_hist < 0 and curr_hist > 0:
                    signals.append({
                        "symbol": symbol,
                        "strategy": "macd_crossover",
                        "signal_type": "buy",
                        "strength": round(min(abs(curr_hist) * 20, 1.0), 4),
                        "value": round(curr_hist, 4),
                        "description": "MACD bullish crossover",
                    })
                elif prev_hist > 0 and curr_hist < 0:
                    signals.append({
                        "symbol": symbol,
                        "strategy": "macd_crossover",
                        "signal_type": "sell",
                        "strength": round(min(abs(curr_hist) * 20, 1.0), 4),
                        "value": round(curr_hist, 4),
                        "description": "MACD bearish crossover",
                    })

    # Sort by strength
    signals.sort(key=lambda x: x["strength"], reverse=True)

    return {
        "signals": signals[:50],
        "total_scanned": len(price_data),
        "total_signals": len(signals),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/technicals/{symbol}")
async def get_technicals(symbol: str):
    """Get detailed technical indicators for a symbol."""
    data = await get_historical_data([symbol], period="1y")
    if symbol not in data:
        return {"error": f"No data for {symbol}"}

    df = data[symbol]
    close = df["Close"]
    if len(close) < 30:
        return {"error": "Insufficient data"}

    # RSI
    rsi = compute_rsi(close)
    current_rsi = float(rsi.iloc[-1]) if len(rsi) > 0 else 50

    # MACD
    macd_line, signal_line, histogram = compute_macd(close)

    # Bollinger Bands
    bb_mid, bb_upper, bb_lower = compute_bollinger_bands(close)

    # SMAs
    sma_20 = close.rolling(20).mean()
    sma_50 = close.rolling(50).mean()
    sma_200 = close.rolling(200).mean()

    # Factor scores
    mom = momentum_score(close)
    mr = mean_reversion_score(close)

    current_price = float(close.iloc[-1])

    return {
        "symbol": symbol,
        "price": current_price,
        "rsi": round(current_rsi, 2),
        "macd": {
            "macd_line": round(float(macd_line.iloc[-1]), 4) if len(macd_line) > 0 else 0,
            "signal_line": round(float(signal_line.iloc[-1]), 4) if len(signal_line) > 0 else 0,
            "histogram": round(float(histogram.iloc[-1]), 4) if len(histogram) > 0 else 0,
        },
        "bollinger_bands": {
            "upper": round(float(bb_upper.iloc[-1]), 2) if len(bb_upper.dropna()) > 0 else 0,
            "middle": round(float(bb_mid.iloc[-1]), 2) if len(bb_mid.dropna()) > 0 else 0,
            "lower": round(float(bb_lower.iloc[-1]), 2) if len(bb_lower.dropna()) > 0 else 0,
            "position": _bb_position(current_price, bb_upper, bb_lower),
        },
        "sma": {
            "sma_20": round(float(sma_20.iloc[-1]), 2) if len(sma_20.dropna()) > 0 else 0,
            "sma_50": round(float(sma_50.iloc[-1]), 2) if len(sma_50.dropna()) > 0 else 0,
            "sma_200": round(float(sma_200.iloc[-1]), 2) if len(sma_200.dropna()) > 0 else 0,
        },
        "factors": {
            "momentum": round(mom, 4),
            "mean_reversion": round(mr, 4),
        },
        "price_history": [
            {"date": str(idx), "close": round(float(row["Close"]), 2), "volume": int(row.get("Volume", 0))}
            for idx, row in df.tail(60).iterrows()
        ],
    }


@router.post("/log")
async def log_signal(
    symbol: str,
    strategy: str,
    signal_type: str,
    strength: float,
    metadata: str = "{}",
):
    """Log a signal to the database."""
    db = await get_db()
    await db.execute(
        """INSERT INTO signals (timestamp, symbol, strategy, signal_type, strength, metadata)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (datetime.now().isoformat(), symbol, strategy, signal_type, strength, metadata),
    )
    await db.commit()
    await db.close()
    return {"status": "logged"}


@router.get("/history")
async def get_signal_history(limit: int = 100, strategy: str = ""):
    """Get signal history."""
    db = await get_db()
    if strategy:
        cursor = await db.execute(
            "SELECT * FROM signals WHERE strategy = ? ORDER BY timestamp DESC LIMIT ?",
            (strategy, limit),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
    rows = await cursor.fetchall()
    await db.close()

    return {
        "signals": [
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "symbol": row["symbol"],
                "strategy": row["strategy"],
                "signal_type": row["signal_type"],
                "strength": row["strength"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
            }
            for row in rows
        ]
    }
