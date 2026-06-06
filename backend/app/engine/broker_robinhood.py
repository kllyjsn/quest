"""Robinhood MCP broker integration — secondary execution venue.

Robinhood's MCP server lives at https://agent.robinhood.com/mcp/trading
and requires OAuth authentication via the Robinhood app.

Available tools:
- get_accounts, get_portfolio, get_equity_positions
- get_equity_quotes (max 20 symbols), get_equity_orders
- get_equity_tradability, review_equity_order
- place_equity_order, cancel_equity_order, search

Constraints: long equities only, no options/shorting/margin.
"""

import os

import httpx

RH_MCP_URL = os.getenv("ROBINHOOD_MCP_URL", "https://agent.robinhood.com/mcp/trading")
RH_ACCESS_TOKEN = os.getenv("ROBINHOOD_ACCESS_TOKEN", "")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {RH_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(RH_ACCESS_TOKEN)


async def _mcp_call(tool_name: str, arguments: dict | None = None) -> dict:
    """Make a JSON-RPC call to the Robinhood MCP server."""
    if not is_configured():
        return {"error": "Robinhood MCP not configured", "configured": False}

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(RH_MCP_URL, headers=_headers(), json=payload)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            return {"error": data["error"]}
        return data.get("result", data)


async def get_accounts() -> dict:
    return await _mcp_call("get_accounts")


async def get_portfolio() -> dict:
    return await _mcp_call("get_portfolio")


async def get_positions() -> list:
    result = await _mcp_call("get_equity_positions")
    if isinstance(result, dict) and "error" in result:
        return []
    return result if isinstance(result, list) else []


async def get_quotes(symbols: list[str]) -> dict:
    """Get quotes for up to 20 symbols."""
    return await _mcp_call("get_equity_quotes", {"symbols": symbols[:20]})


async def place_order(
    symbol: str,
    side: str,
    quantity: float,
    order_type: str = "market",
    limit_price: float | None = None,
    stop_price: float | None = None,
) -> dict:
    args: dict = {
        "symbol": symbol,
        "side": side,
        "quantity": str(quantity),
        "type": order_type,
    }
    if limit_price is not None:
        args["limit_price"] = str(limit_price)
    if stop_price is not None:
        args["stop_price"] = str(stop_price)

    # Review then place
    await _mcp_call("review_equity_order", args)
    return await _mcp_call("place_equity_order", args)


async def cancel_order(order_id: str) -> dict:
    return await _mcp_call("cancel_equity_order", {"order_id": order_id})


async def get_orders() -> list:
    result = await _mcp_call("get_equity_orders")
    if isinstance(result, dict) and "error" in result:
        return []
    return result if isinstance(result, list) else []


async def search_symbol(query: str) -> dict:
    return await _mcp_call("search", {"query": query})


async def check_tradability(symbol: str) -> dict:
    return await _mcp_call("get_equity_tradability", {"symbol": symbol})
