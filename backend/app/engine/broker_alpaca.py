"""Alpaca broker integration — primary execution venue."""

import os

import httpx

ALPACA_BASE_URL = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
ALPACA_DATA_URL = os.getenv("ALPACA_DATA_URL", "https://data.alpaca.markets")
ALPACA_API_KEY = os.getenv("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY", "")


def _headers() -> dict:
    return {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(ALPACA_API_KEY and ALPACA_SECRET_KEY)


async def get_account() -> dict:
    if not is_configured():
        return {"error": "Alpaca not configured", "configured": False}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{ALPACA_BASE_URL}/v2/account", headers=_headers())
        r.raise_for_status()
        data = r.json()
        return {
            "id": data.get("id"),
            "status": data.get("status"),
            "equity": float(data.get("equity", 0)),
            "cash": float(data.get("cash", 0)),
            "buying_power": float(data.get("buying_power", 0)),
            "portfolio_value": float(data.get("portfolio_value", 0)),
            "pattern_day_trader": data.get("pattern_day_trader", False),
            "daytrade_count": int(data.get("daytrade_count", 0)),
            "daytrading_buying_power": float(data.get("daytrading_buying_power", 0)),
            "broker": "alpaca",
            "configured": True,
        }


async def get_positions() -> list[dict]:
    if not is_configured():
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{ALPACA_BASE_URL}/v2/positions", headers=_headers())
        r.raise_for_status()
        return [
            {
                "symbol": p["symbol"],
                "quantity": float(p["qty"]),
                "market_value": float(p["market_value"]),
                "cost_basis": float(p["cost_basis"]),
                "unrealized_pl": float(p["unrealized_pl"]),
                "unrealized_plpc": float(p["unrealized_plpc"]),
                "current_price": float(p["current_price"]),
                "avg_entry_price": float(p["avg_entry_price"]),
                "side": p["side"],
            }
            for p in r.json()
        ]


async def get_quote(symbol: str) -> dict:
    if not is_configured():
        return {"error": "Alpaca not configured"}
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{ALPACA_DATA_URL}/v2/stocks/{symbol}/quotes/latest",
            headers=_headers(),
        )
        r.raise_for_status()
        data = r.json()
        quote = data.get("quote", data)
        return {
            "symbol": symbol,
            "ask_price": float(quote.get("ap", 0)),
            "bid_price": float(quote.get("bp", 0)),
            "ask_size": int(quote.get("as", 0)),
            "bid_size": int(quote.get("bs", 0)),
        }


async def place_order(
    symbol: str,
    qty: float | None = None,
    notional: float | None = None,
    side: str = "buy",
    order_type: str = "market",
    time_in_force: str = "day",
    limit_price: float | None = None,
    stop_price: float | None = None,
    trail_percent: float | None = None,
) -> dict:
    if not is_configured():
        return {"error": "Alpaca not configured"}

    payload: dict = {
        "symbol": symbol,
        "side": side,
        "type": order_type,
        "time_in_force": time_in_force,
    }

    if qty is not None:
        payload["qty"] = str(qty)
    elif notional is not None:
        payload["notional"] = str(notional)

    if limit_price is not None:
        payload["limit_price"] = str(limit_price)
    if stop_price is not None:
        payload["stop_price"] = str(stop_price)
    if trail_percent is not None:
        payload["trail_percent"] = str(trail_percent)

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{ALPACA_BASE_URL}/v2/orders",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
        return {
            "id": data["id"],
            "symbol": data["symbol"],
            "side": data["side"],
            "type": data["type"],
            "qty": data.get("qty"),
            "notional": data.get("notional"),
            "status": data["status"],
            "created_at": data["created_at"],
        }


async def get_orders(status: str = "open") -> list[dict]:
    if not is_configured():
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{ALPACA_BASE_URL}/v2/orders",
            headers=_headers(),
            params={"status": status, "limit": 50},
        )
        r.raise_for_status()
        return [
            {
                "id": o["id"],
                "symbol": o["symbol"],
                "side": o["side"],
                "type": o["type"],
                "qty": o.get("qty"),
                "filled_qty": o.get("filled_qty"),
                "status": o["status"],
                "created_at": o["created_at"],
                "filled_at": o.get("filled_at"),
                "filled_avg_price": o.get("filled_avg_price"),
            }
            for o in r.json()
        ]


async def cancel_order(order_id: str) -> dict:
    if not is_configured():
        return {"error": "Alpaca not configured"}
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{ALPACA_BASE_URL}/v2/orders/{order_id}",
            headers=_headers(),
        )
        if r.status_code == 204:
            return {"status": "cancelled", "order_id": order_id}
        r.raise_for_status()
        return r.json()


async def cancel_all_orders() -> dict:
    if not is_configured():
        return {"error": "Alpaca not configured"}
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{ALPACA_BASE_URL}/v2/orders",
            headers=_headers(),
        )
        r.raise_for_status()
        return {"status": "all_cancelled"}
