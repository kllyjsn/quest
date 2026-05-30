"""Paper trading endpoints — simulate the strategy with real market data.

Supports both guest mode (in-memory) and authenticated mode (persisted to DB).
"""

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.auth import UserInfo, get_current_user
from app.db import get_db
from app.engine.paper_trader import PaperTrader, get_paper_trader, reset_paper_trader

router = APIRouter()


async def _save_session(user_id: int, trader: PaperTrader):
    """Persist paper trading state to DB for authenticated users."""
    db = await get_db()
    try:
        positions_json = json.dumps({
            sym: {
                "qty": round(p.quantity, 4),
                "entry_price": round(p.entry_price, 2),
                "current_price": round(p.current_price, 2),
                "sector": p.sector,
                "high_water_mark": round(p.high_water_mark, 2),
                "entry_time": p.entry_time.isoformat(),
            }
            for sym, p in trader.positions.items()
        })
        trade_log_json = json.dumps(trader.trade_log[-500:])

        existing = await db.execute(
            "SELECT id FROM paper_sessions WHERE user_id = ? AND is_active = 1", (user_id,)
        )
        row = await existing.fetchone()

        if row:
            await db.execute(
                """UPDATE paper_sessions SET current_cash = ?, positions_json = ?,
                   peak_value = ?, trade_log_json = ? WHERE id = ?""",
                (
                    round(trader.cash, 2),
                    positions_json,
                    round(trader.risk_manager.peak_portfolio_value, 2),
                    trade_log_json,
                    row["id"],
                ),
            )
        else:
            await db.execute(
                """INSERT INTO paper_sessions
                   (user_id, started_at, initial_capital, current_cash, positions_json, peak_value, trade_log_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    trader.started_at.isoformat(),
                    trader.initial_capital,
                    round(trader.cash, 2),
                    positions_json,
                    round(trader.risk_manager.peak_portfolio_value, 2),
                    trade_log_json,
                ),
            )

        # Also save individual trades for history
        for trade in trader.trade_log:
            vals = "?, ?, ?, ?, ?, ?, 'market', 'paper', ?, 'filled', ?, 1"
            sql = (
                "INSERT OR IGNORE INTO trades"
                " (user_id, timestamp, symbol, side, quantity, price,"
                f" order_type, broker, strategy, status, pnl, is_paper) VALUES ({vals})"
            )
            await db.execute(
                sql,
                (
                    user_id,
                    trade["timestamp"],
                    trade["symbol"],
                    trade["side"],
                    trade["quantity"],
                    trade["price"],
                    trade.get("reason", ""),
                    trade.get("pnl"),
                ),
            )

        await db.commit()
    finally:
        await db.close()


@router.get("/status")
async def paper_status(user: UserInfo | None = Depends(get_current_user)):
    """Get current paper trading status."""
    trader = get_paper_trader()
    return trader.get_status()


@router.post("/cycle")
async def run_paper_cycle(user: UserInfo | None = Depends(get_current_user)):
    """Execute one trading cycle (call daily or on-demand)."""
    trader = get_paper_trader()
    result = await trader.run_cycle()

    if user:
        await _save_session(user.user_id, trader)

    return result


@router.post("/reset")
async def reset_paper(
    initial_capital: float = 1000.0,
    user: UserInfo | None = Depends(get_current_user),
):
    """Reset paper trading with fresh capital."""
    if user:
        db = await get_db()
        try:
            await db.execute(
                "UPDATE paper_sessions SET is_active = 0, ended_at = ? WHERE user_id = ? AND is_active = 1",
                (datetime.now(UTC).isoformat(), user.user_id),
            )
            await db.commit()
        finally:
            await db.close()

    reset_paper_trader(initial_capital)
    return {
        "status": "reset",
        "initial_capital": initial_capital,
        "message": "Paper trading reset. Run /cycle to execute first trading day.",
    }


@router.get("/trades")
async def get_trades(user: UserInfo | None = Depends(get_current_user)):
    """Get trade history."""
    if user:
        db = await get_db()
        try:
            cursor = await db.execute(
                """SELECT timestamp, symbol, side, quantity, price, strategy as reason, pnl
                   FROM trades WHERE user_id = ? AND is_paper = 1
                   ORDER BY timestamp DESC LIMIT 200""",
                (user.user_id,),
            )
            rows = await cursor.fetchall()
            return {"trades": [dict(r) for r in rows]}
        finally:
            await db.close()

    trader = get_paper_trader()
    return {"trades": trader.trade_log}


@router.get("/performance")
async def get_performance(user: UserInfo | None = Depends(get_current_user)):
    """Get performance metrics."""
    trader = get_paper_trader()
    status = trader.get_status()

    winning_trades = [t for t in trader.trade_log if t.get("side") == "sell" and t.get("pnl", 0) > 0]
    losing_trades = [t for t in trader.trade_log if t.get("side") == "sell" and t.get("pnl", 0) < 0]
    all_sells = [t for t in trader.trade_log if t.get("side") == "sell"]

    win_rate = len(winning_trades) / len(all_sells) if all_sells else 0
    avg_win = sum(t.get("pnl", 0) for t in winning_trades) / len(winning_trades) if winning_trades else 0
    avg_loss = sum(t.get("pnl", 0) for t in losing_trades) / len(losing_trades) if losing_trades else 0

    return {
        "total_return_pct": status["total_return_pct"],
        "total_pnl": status["total_pnl"],
        "days_running": status["days_running"],
        "total_trades": status["total_trades"],
        "win_rate": round(win_rate * 100, 1),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(abs(avg_win / avg_loss), 2) if avg_loss != 0 else 0,
        "drawdown_pct": status["drawdown"],
        "peak_value": status["peak_value"],
    }


@router.get("/history")
async def get_session_history(user: UserInfo | None = Depends(get_current_user)):
    """Get paper trading session history (authenticated only)."""
    if not user:
        return {"sessions": []}

    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT id, started_at, initial_capital, current_cash, peak_value, is_active, ended_at
               FROM paper_sessions WHERE user_id = ?
               ORDER BY started_at DESC LIMIT 20""",
            (user.user_id,),
        )
        rows = await cursor.fetchall()
        return {"sessions": [dict(r) for r in rows]}
    finally:
        await db.close()
