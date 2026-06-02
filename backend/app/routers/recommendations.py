"""Trade recommendation tracking endpoints — log, resolve, and query trade signals."""

import json
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import get_db

router = APIRouter()


class RecommendationIn(BaseModel):
    symbol: str
    score: float
    signal: str  # BUY, STRONG BUY, HOLD, etc.
    horizon: str  # "1-3 Days", "3-7 Days", "2-4 Weeks", "1-3 Months"
    entry_price: float
    target_price: float | None = None
    stop_price: float | None = None
    win_rate: float | None = None
    edge_score: float | None = None
    sector: str | None = None
    analysis: str | None = None


class ScanBatch(BaseModel):
    recommendations: list[RecommendationIn]
    market_regime: str | None = None
    total_scanned: int = 0


@router.post("/log")
async def log_recommendations(batch: ScanBatch):
    """Log a batch of trade recommendations from a scan."""
    now = datetime.now().isoformat()
    db = await get_db()
    try:
        for rec in batch.recommendations:
            await db.execute(
                """INSERT INTO trade_recommendations
                   (scan_timestamp, symbol, score, signal, horizon, entry_price,
                    target_price, stop_price, win_rate, edge_score, sector, analysis, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    now, rec.symbol, rec.score, rec.signal, rec.horizon,
                    rec.entry_price, rec.target_price, rec.stop_price,
                    rec.win_rate, rec.edge_score, rec.sector, rec.analysis,
                ),
            )

        # Log the daily scan summary
        top_picks = json.dumps([
            {"symbol": r.symbol, "score": r.score, "signal": r.signal}
            for r in batch.recommendations[:10]
        ])
        await db.execute(
            """INSERT INTO daily_scans (timestamp, total_scanned, total_signals, market_regime, top_picks)
               VALUES (?, ?, ?, ?, ?)""",
            (now, batch.total_scanned, len(batch.recommendations), batch.market_regime, top_picks),
        )

        await db.commit()
        return {
            "status": "ok",
            "logged": len(batch.recommendations),
            "timestamp": now,
        }
    finally:
        await db.close()


@router.post("/resolve/{rec_id}")
async def resolve_recommendation(
    rec_id: int,
    outcome_price: float,
    outcome_return: float,
    status: str = "resolved",
):
    """Resolve a pending recommendation with its outcome."""
    now = datetime.now().isoformat()
    db = await get_db()
    try:
        await db.execute(
            """UPDATE trade_recommendations
               SET status = ?, outcome_price = ?, outcome_return = ?,
                   outcome_date = ?, resolved_at = ?
               WHERE id = ?""",
            (status, outcome_price, outcome_return, now, now, rec_id),
        )
        await db.commit()
        return {"status": "ok", "id": rec_id, "outcome_return": outcome_return}
    finally:
        await db.close()


@router.post("/resolve-batch")
async def resolve_batch():
    """Auto-resolve expired recommendations by fetching current prices."""
    import yfinance as yf
    import asyncio

    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, symbol, entry_price, target_price, stop_price, scan_timestamp, horizon FROM trade_recommendations WHERE status = 'pending'"
        )
        pending = await cursor.fetchall()

        if not pending:
            return {"status": "ok", "resolved": 0, "message": "No pending recommendations"}

        # Group by symbol to batch price lookups
        symbols = list({row["symbol"] for row in pending})
        loop = asyncio.get_event_loop()

        prices: dict[str, float] = {}
        for sym in symbols:
            try:
                ticker = yf.Ticker(sym)
                info = await loop.run_in_executor(None, lambda t=ticker: t.fast_info)
                price = float(getattr(info, "last_price", 0) or 0)
                if price > 0:
                    prices[sym] = price
            except Exception:
                pass

        now = datetime.now().isoformat()
        resolved_count = 0

        for row in pending:
            sym = row["symbol"]
            if sym not in prices:
                continue

            current_price = prices[sym]
            entry = row["entry_price"]
            target = row["target_price"]
            stop = row["stop_price"]

            # Determine horizon expiry
            scan_ts = datetime.fromisoformat(row["scan_timestamp"])
            horizon = row["horizon"]
            days_elapsed = (datetime.now() - scan_ts).days

            horizon_days = {"1-3 Days": 3, "3-7 Days": 7, "2-4 Weeks": 28, "1-3 Months": 90}
            max_days = horizon_days.get(horizon, 30)

            # Resolve if: hit target, hit stop, or expired
            ret = round((current_price - entry) / entry, 4) if entry > 0 else 0
            status = "pending"

            if target and current_price >= target:
                status = "win"
            elif stop and current_price <= stop:
                status = "stopped_out"
            elif days_elapsed >= max_days:
                status = "win" if ret > 0 else "loss"

            if status != "pending":
                await db.execute(
                    """UPDATE trade_recommendations
                       SET status = ?, outcome_price = ?, outcome_return = ?,
                           outcome_date = ?, resolved_at = ?
                       WHERE id = ?""",
                    (status, current_price, ret, now, now, row["id"]),
                )
                resolved_count += 1

        await db.commit()
        return {
            "status": "ok",
            "resolved": resolved_count,
            "still_pending": len(pending) - resolved_count,
            "timestamp": now,
        }
    finally:
        await db.close()


@router.get("/history")
async def get_recommendation_history(
    status: str | None = None,
    symbol: str | None = None,
    limit: int = 200,
):
    """Get trade recommendation history with optional filters."""
    db = await get_db()
    try:
        query = "SELECT * FROM trade_recommendations WHERE 1=1"
        params: list = []

        if status:
            query += " AND status = ?"
            params.append(status)
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol.upper())

        query += " ORDER BY scan_timestamp DESC LIMIT ?"
        params.append(limit)

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        return {
            "recommendations": [
                {
                    "id": row["id"],
                    "scan_timestamp": row["scan_timestamp"],
                    "symbol": row["symbol"],
                    "score": row["score"],
                    "signal": row["signal"],
                    "horizon": row["horizon"],
                    "entry_price": row["entry_price"],
                    "target_price": row["target_price"],
                    "stop_price": row["stop_price"],
                    "win_rate": row["win_rate"],
                    "edge_score": row["edge_score"],
                    "sector": row["sector"],
                    "status": row["status"],
                    "outcome_price": row["outcome_price"],
                    "outcome_return": row["outcome_return"],
                    "outcome_date": row["outcome_date"],
                }
                for row in rows
            ],
            "total": len(rows),
        }
    finally:
        await db.close()


@router.get("/stats")
async def get_recommendation_stats():
    """Get aggregate statistics on recommendation accuracy."""
    db = await get_db()
    try:
        # Overall stats
        cursor = await db.execute("SELECT COUNT(*) as total FROM trade_recommendations")
        total = (await cursor.fetchone())["total"]

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM trade_recommendations WHERE status = 'pending'")
        pending = (await cursor.fetchone())["cnt"]

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM trade_recommendations WHERE status = 'win'")
        wins = (await cursor.fetchone())["cnt"]

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM trade_recommendations WHERE status IN ('loss', 'stopped_out')")
        losses = (await cursor.fetchone())["cnt"]

        resolved = wins + losses
        win_rate = round(wins / resolved, 4) if resolved > 0 else None

        cursor = await db.execute(
            "SELECT AVG(outcome_return) as avg_ret FROM trade_recommendations WHERE status IN ('win', 'loss', 'stopped_out')"
        )
        avg_return = (await cursor.fetchone())["avg_ret"]

        # By horizon
        cursor = await db.execute(
            """SELECT horizon,
                      COUNT(*) as total,
                      SUM(CASE WHEN status = 'win' THEN 1 ELSE 0 END) as wins,
                      AVG(CASE WHEN status != 'pending' THEN outcome_return END) as avg_ret
               FROM trade_recommendations
               GROUP BY horizon"""
        )
        by_horizon = [
            {
                "horizon": row["horizon"],
                "total": row["total"],
                "wins": row["wins"],
                "win_rate": round(row["wins"] / row["total"], 4) if row["total"] > 0 else 0,
                "avg_return": round(row["avg_ret"], 4) if row["avg_ret"] else None,
            }
            for row in await cursor.fetchall()
        ]

        # By score bucket
        cursor = await db.execute(
            """SELECT
                CASE
                    WHEN score >= 70 THEN '70+'
                    WHEN score >= 55 THEN '55-69'
                    WHEN score >= 40 THEN '40-54'
                    ELSE '<40'
                END as bucket,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'win' THEN 1 ELSE 0 END) as wins,
                AVG(CASE WHEN status != 'pending' THEN outcome_return END) as avg_ret
               FROM trade_recommendations
               GROUP BY bucket"""
        )
        by_score = [
            {
                "bucket": row["bucket"],
                "total": row["total"],
                "wins": row["wins"],
                "avg_return": round(row["avg_ret"], 4) if row["avg_ret"] else None,
            }
            for row in await cursor.fetchall()
        ]

        # Recent daily scans
        cursor = await db.execute(
            "SELECT * FROM daily_scans ORDER BY timestamp DESC LIMIT 30"
        )
        scans = [
            {
                "timestamp": row["timestamp"],
                "total_scanned": row["total_scanned"],
                "total_signals": row["total_signals"],
                "market_regime": row["market_regime"],
                "top_picks": json.loads(row["top_picks"]) if row["top_picks"] else [],
            }
            for row in await cursor.fetchall()
        ]

        return {
            "total_recommendations": total,
            "pending": pending,
            "resolved": resolved,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "avg_return": round(avg_return, 4) if avg_return else None,
            "by_horizon": by_horizon,
            "by_score_bucket": by_score,
            "recent_scans": scans[:10],
        }
    finally:
        await db.close()
