"""Historical price data endpoints — ingest from yfinance and serve from SQLite."""

import asyncio
import json
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter
from pydantic import BaseModel

from app.db import get_db

router = APIRouter()


class IngestRequest(BaseModel):
    symbols: list[str] | None = None
    period: str = "2y"
    interval: str = "1d"


async def _fetch_and_store(symbol: str, period: str = "2y", interval: str = "1d") -> int:
    """Fetch OHLCV from yfinance and upsert into historical_prices. Returns row count."""
    loop = asyncio.get_event_loop()
    try:
        ticker = yf.Ticker(symbol)
        df = await loop.run_in_executor(
            None, lambda: ticker.history(period=period, interval=interval)
        )
    except Exception:
        return 0

    if df is None or df.empty:
        return 0

    db = await get_db()
    try:
        rows = []
        for idx, row in df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            rows.append((
                symbol, date_str,
                round(float(row["Open"]), 4),
                round(float(row["High"]), 4),
                round(float(row["Low"]), 4),
                round(float(row["Close"]), 4),
                round(float(row.get("Volume", 0)), 0),
                interval,
            ))

        await db.executemany(
            """INSERT OR REPLACE INTO historical_prices
               (symbol, date, open, high, low, close, volume, interval)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        await db.commit()
        return len(rows)
    finally:
        await db.close()


@router.post("/ingest")
async def ingest_historical(body: IngestRequest | None = None):
    """Pull historical OHLCV data from yfinance and store in the database.

    If no symbols provided, ingests the full universe (~90 stocks).
    """
    from app.engine.market_data import UNIVERSE

    req = body or IngestRequest()
    symbols = req.symbols
    period = req.period
    interval = req.interval
    targets = symbols or UNIVERSE
    results: dict[str, int] = {}

    # Process in batches of 10 to avoid overwhelming yfinance
    batch_size = 10
    for i in range(0, len(targets), batch_size):
        batch = targets[i : i + batch_size]
        tasks = [_fetch_and_store(sym, period, interval) for sym in batch]
        counts = await asyncio.gather(*tasks)
        for sym, count in zip(batch, counts):
            results[sym] = count

    total_rows = sum(results.values())
    return {
        "status": "ok",
        "symbols_processed": len(results),
        "total_rows_stored": total_rows,
        "period": period,
        "interval": interval,
        "timestamp": datetime.now().isoformat(),
        "details": results,
    }


@router.get("/prices/{symbol}")
async def get_prices(
    symbol: str,
    interval: str = "1d",
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 500,
):
    """Get stored historical prices for a symbol."""
    db = await get_db()
    try:
        query = "SELECT date, open, high, low, close, volume FROM historical_prices WHERE symbol = ? AND interval = ?"
        params: list = [symbol.upper(), interval]

        if start_date:
            query += " AND date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date <= ?"
            params.append(end_date)

        query += " ORDER BY date DESC LIMIT ?"
        params.append(limit)

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "count": len(rows),
            "prices": [
                {
                    "date": row["date"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "close": row["close"],
                    "volume": row["volume"],
                }
                for row in reversed(rows)
            ],
        }
    finally:
        await db.close()


@router.get("/symbols")
async def list_stored_symbols():
    """List all symbols with stored historical data and their date ranges."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT symbol, COUNT(*) as bar_count,
                      MIN(date) as first_date, MAX(date) as last_date
               FROM historical_prices
               WHERE interval = '1d'
               GROUP BY symbol
               ORDER BY symbol"""
        )
        rows = await cursor.fetchall()
        return {
            "symbols": [
                {
                    "symbol": row["symbol"],
                    "bar_count": row["bar_count"],
                    "first_date": row["first_date"],
                    "last_date": row["last_date"],
                }
                for row in rows
            ],
            "total": len(rows),
        }
    finally:
        await db.close()


@router.get("/bulk")
async def get_bulk_prices(
    symbols: str = "",
    interval: str = "1d",
    start_date: str | None = None,
    limit: int = 252,
):
    """Get stored prices for multiple symbols (comma-separated)."""
    if not symbols:
        return {"error": "Provide comma-separated symbols query param"}

    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    db = await get_db()
    try:
        result: dict[str, list] = {}
        for sym in sym_list:
            query = "SELECT date, open, high, low, close, volume FROM historical_prices WHERE symbol = ? AND interval = ?"
            params: list = [sym, interval]
            if start_date:
                query += " AND date >= ?"
                params.append(start_date)
            query += " ORDER BY date DESC LIMIT ?"
            params.append(limit)

            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            result[sym] = [
                {
                    "date": row["date"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "close": row["close"],
                    "volume": row["volume"],
                }
                for row in reversed(rows)
            ]
        return {"data": result, "symbols_returned": len(result)}
    finally:
        await db.close()


@router.get("/stats")
async def get_data_stats():
    """Get summary statistics about stored historical data."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT COUNT(*) as total_rows, COUNT(DISTINCT symbol) as total_symbols FROM historical_prices"
        )
        row = await cursor.fetchone()
        cursor2 = await db.execute(
            "SELECT MIN(date) as earliest, MAX(date) as latest FROM historical_prices"
        )
        row2 = await cursor2.fetchone()
        return {
            "total_rows": row["total_rows"],
            "total_symbols": row["total_symbols"],
            "earliest_date": row2["earliest"],
            "latest_date": row2["latest"],
        }
    finally:
        await db.close()
