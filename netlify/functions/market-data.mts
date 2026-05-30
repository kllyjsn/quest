import type { Context } from "@netlify/functions";

/**
 * Netlify serverless function that proxies Yahoo Finance chart data.
 * Handles CORS and caches responses for 5 minutes.
 *
 * Usage: GET /.netlify/functions/market-data?symbols=AAPL,MSFT,NVDA&range=1mo&interval=1d
 */
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols") || "AAPL";
  const range = url.searchParams.get("range") || "1mo";
  const interval = url.searchParams.get("interval") || "1d";

  const symbolList = symbols.split(",").slice(0, 25); // max 25 symbols

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300", // 5 min cache
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const results: Record<string, { dates: string[]; closes: number[]; symbol: string }> = {};

    // Fetch in parallel, batches of 5
    for (let i = 0; i < symbolList.length; i += 5) {
      const batch = symbolList.slice(i, i + 5);
      const fetches = batch.map(async (sym) => {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
        const res = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return null;

        const timestamps: number[] = result.timestamp || [];
        const closes: number[] = result.indicators?.quote?.[0]?.close || [];

        // Filter out null/undefined closes
        const validDates: string[] = [];
        const validCloses: number[] = [];
        for (let j = 0; j < timestamps.length; j++) {
          if (closes[j] != null) {
            validDates.push(new Date(timestamps[j] * 1000).toISOString().slice(0, 10));
            validCloses.push(Math.round(closes[j] * 100) / 100);
          }
        }

        return { symbol: sym, dates: validDates, closes: validCloses };
      });

      const batchResults = await Promise.all(fetches);
      for (const r of batchResults) {
        if (r) results[r.symbol] = r;
      }
    }

    return new Response(JSON.stringify({ data: results, count: Object.keys(results).length }), {
      status: 200,
      headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
};
