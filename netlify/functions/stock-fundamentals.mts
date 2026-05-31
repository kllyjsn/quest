import type { Context } from "@netlify/functions";

/**
 * Netlify serverless function that proxies Yahoo Finance quote data for fundamentals.
 * Returns P/E, market cap, 52-week range, volume, EPS, dividend yield, etc.
 *
 * Usage: GET /api/stock-fundamentals?symbols=AAPL,MSFT,NVDA
 */
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols") || "AAPL";
  const symbolList = symbols.split(",").slice(0, 25);

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    const results: Record<string, any> = {};

    for (let i = 0; i < symbolList.length; i += 5) {
      const batch = symbolList.slice(i, i + 5);
      const fetches = batch.map(async (sym) => {
        try {
          // Use Yahoo Finance quoteSummary for detailed fundamentals
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d&includePrePost=false`;
          const quoteUrl = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(sym)}`;

          const [chartRes, quoteRes] = await Promise.all([
            fetch(yahooUrl, { headers: { "User-Agent": "Mozilla/5.0" } }),
            fetch(quoteUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null),
          ]);

          const chartData = chartRes.ok ? await chartRes.json() : null;
          const quoteData = quoteRes?.ok ? await quoteRes.json() : null;

          const chart = chartData?.chart?.result?.[0];
          const quote = quoteData?.quoteResponse?.result?.[0];
          const meta = chart?.meta;
          const closes = chart?.indicators?.quote?.[0]?.close || [];
          const volumes = chart?.indicators?.quote?.[0]?.volume || [];

          // Compute 52-week high/low from chart data
          const validCloses = closes.filter((c: number | null) => c != null);
          const fiftyTwoWeekHigh = validCloses.length > 0 ? Math.max(...validCloses) : 0;
          const fiftyTwoWeekLow = validCloses.length > 0 ? Math.min(...validCloses) : 0;

          // Average volume
          const validVols = volumes.filter((v: number | null) => v != null);
          const avgVolume = validVols.length > 0 ? validVols.reduce((a: number, b: number) => a + b, 0) / validVols.length : 0;

          // Current price
          const price = meta?.regularMarketPrice || validCloses[validCloses.length - 1] || 0;
          const prevClose = meta?.chartPreviousClose || meta?.previousClose || price;
          const change = price - prevClose;
          const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

          return {
            symbol: sym,
            price: Math.round(price * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePct: Math.round(changePct * 100) / 100,
            marketCap: quote?.marketCap || meta?.marketCap || 0,
            pe: quote?.trailingPE || quote?.forwardPE || 0,
            forwardPe: quote?.forwardPE || 0,
            eps: quote?.epsTrailingTwelveMonths || 0,
            dividendYield: quote?.trailingAnnualDividendYield ? Math.round(quote.trailingAnnualDividendYield * 10000) / 100 : 0,
            volume: volumes[volumes.length - 1] || 0,
            avgVolume: Math.round(avgVolume),
            fiftyTwoWeekHigh: Math.round(fiftyTwoWeekHigh * 100) / 100,
            fiftyTwoWeekLow: Math.round(fiftyTwoWeekLow * 100) / 100,
            beta: quote?.beta || 1.0,
            exchange: meta?.exchangeName || quote?.exchange || "",
            currency: meta?.currency || "USD",
            shortName: quote?.shortName || quote?.longName || sym,
          };
        } catch {
          return null;
        }
      });

      const batchResults = await Promise.all(fetches);
      for (const r of batchResults) {
        if (r) results[r.symbol] = r;
      }
    }

    return new Response(JSON.stringify({ data: results, count: Object.keys(results).length }), { status: 200, headers });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
