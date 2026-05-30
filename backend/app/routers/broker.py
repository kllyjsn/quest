"""Broker integration endpoints — Alpaca (primary) + Robinhood (secondary)."""


from fastapi import APIRouter
from pydantic import BaseModel

from app.engine import broker_alpaca, broker_robinhood

router = APIRouter()


class OrderRequest(BaseModel):
    symbol: str
    side: str = "buy"
    qty: float | None = None
    notional: float | None = None
    order_type: str = "market"
    limit_price: float | None = None
    stop_price: float | None = None
    trail_percent: float | None = None
    broker: str = "alpaca"


@router.get("/status")
async def broker_status():
    """Check connection status of both brokers."""
    alpaca_status = {"broker": "alpaca", "configured": broker_alpaca.is_configured()}
    rh_status = {"broker": "robinhood", "configured": broker_robinhood.is_configured()}

    if broker_alpaca.is_configured():
        try:
            account = await broker_alpaca.get_account()
            alpaca_status.update(account)
        except Exception as e:
            alpaca_status["error"] = str(e)

    return {
        "primary": alpaca_status,
        "secondary": rh_status,
    }


@router.get("/account")
async def get_account(broker: str = "alpaca"):
    """Get account info from specified broker."""
    if broker == "robinhood":
        return await broker_robinhood.get_accounts()
    return await broker_alpaca.get_account()


@router.get("/positions")
async def get_positions(broker: str = "alpaca"):
    """Get open positions."""
    if broker == "robinhood":
        return await broker_robinhood.get_positions()
    return await broker_alpaca.get_positions()


@router.get("/orders")
async def get_orders(broker: str = "alpaca", status: str = "open"):
    """Get orders."""
    if broker == "robinhood":
        return await broker_robinhood.get_orders()
    return await broker_alpaca.get_orders(status=status)


@router.post("/order")
async def place_order(order: OrderRequest):
    """Place an order through the specified broker."""
    if order.broker == "robinhood":
        return await broker_robinhood.place_order(
            symbol=order.symbol,
            side=order.side,
            quantity=order.qty or 0,
            order_type=order.order_type,
            limit_price=order.limit_price,
            stop_price=order.stop_price,
        )
    return await broker_alpaca.place_order(
        symbol=order.symbol,
        qty=order.qty,
        notional=order.notional,
        side=order.side,
        order_type=order.order_type,
        limit_price=order.limit_price,
        stop_price=order.stop_price,
        trail_percent=order.trail_percent,
    )


@router.delete("/order/{order_id}")
async def cancel_order(order_id: str, broker: str = "alpaca"):
    """Cancel an order."""
    if broker == "robinhood":
        return await broker_robinhood.cancel_order(order_id)
    return await broker_alpaca.cancel_order(order_id)


@router.get("/quote/{symbol}")
async def get_quote(symbol: str, broker: str = "alpaca"):
    """Get a real-time quote."""
    if broker == "robinhood":
        return await broker_robinhood.get_quotes([symbol])
    return await broker_alpaca.get_quote(symbol)
