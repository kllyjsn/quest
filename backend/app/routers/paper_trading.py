"""Paper trading endpoints — simulate the strategy with real market data."""

from fastapi import APIRouter

from app.engine.paper_trader import get_paper_trader, reset_paper_trader

router = APIRouter()


@router.get("/status")
async def paper_status():
    """Get current paper trading status."""
    trader = get_paper_trader()
    return trader.get_status()


@router.post("/cycle")
async def run_paper_cycle():
    """Execute one trading cycle (call daily or on-demand)."""
    trader = get_paper_trader()
    result = await trader.run_cycle()
    return result


@router.post("/reset")
async def reset_paper(initial_capital: float = 1000.0):
    """Reset paper trading with fresh capital."""
    reset_paper_trader(initial_capital)
    return {
        "status": "reset",
        "initial_capital": initial_capital,
        "message": "Paper trading reset. Run /cycle to execute first trading day.",
    }


@router.get("/trades")
async def get_trades():
    """Get trade history."""
    trader = get_paper_trader()
    return {"trades": trader.trade_log}


@router.get("/performance")
async def get_performance():
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
