import type { Context } from "@netlify/functions";

/**
 * Netlify serverless function that proxies Alpaca API calls.
 * The user provides their API key/secret via request headers.
 * This avoids CORS issues when calling Alpaca from the browser.
 *
 * Usage:
 *   GET /api/alpaca/account
 *   GET /api/alpaca/positions
 *   GET /api/alpaca/orders?status=open
 *   POST /api/alpaca/orders { symbol, qty, side, type, time_in_force }
 *
 * Headers:
 *   X-Alpaca-Key: <api_key>
 *   X-Alpaca-Secret: <api_secret>
 *   X-Alpaca-Paper: "true" (default) or "false"
 */

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Alpaca-Key, X-Alpaca-Secret, X-Alpaca-Paper",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const apiKey = req.headers.get("X-Alpaca-Key");
  const apiSecret = req.headers.get("X-Alpaca-Secret");
  const isPaper = req.headers.get("X-Alpaca-Paper") !== "false";

  if (!apiKey || !apiSecret) {
    return new Response(JSON.stringify({ error: "Missing X-Alpaca-Key or X-Alpaca-Secret headers" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Extract the Alpaca path from the URL
  // /api/alpaca/account -> /v2/account
  // /api/alpaca/positions -> /v2/positions
  // /api/alpaca/orders -> /v2/orders
  const pathMatch = url.pathname.match(/\/api\/alpaca\/(.*)/);
  const alpacaPath = pathMatch ? pathMatch[1] : "account";

  const baseUrl = isPaper
    ? "https://paper-api.alpaca.markets"
    : "https://api.alpaca.markets";

  const alpacaUrl = `${baseUrl}/v2/${alpacaPath}${url.search}`;

  try {
    const fetchInit: RequestInit = {
      method: req.method,
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
        "Content-Type": "application/json",
      },
    };

    if (req.method === "POST" || req.method === "PATCH") {
      fetchInit.body = await req.text();
    }

    const alpacaRes = await fetch(alpacaUrl, fetchInit);
    const body = await alpacaRes.text();

    return new Response(body, {
      status: alpacaRes.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};
