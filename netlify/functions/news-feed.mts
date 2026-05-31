import type { Context } from "@netlify/functions";

/**
 * Netlify serverless function that aggregates financial news from free RSS feeds.
 * Parses RSS XML into structured JSON with basic sentiment scoring.
 *
 * Usage: GET /api/news-feed?symbols=AAPL,MSFT&limit=20
 */

interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  symbols: string[];
  summary: string;
}

const RSS_FEEDS = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%SYMBOLS%&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
];

// Simple keyword-based sentiment scoring
const POSITIVE_WORDS = ["surge", "soar", "rally", "gain", "rise", "jump", "bull", "record", "high", "growth", "profit", "beat", "upgrade", "outperform", "breakout", "strong", "boost", "optimism", "recover", "positive"];
const NEGATIVE_WORDS = ["crash", "plunge", "drop", "fall", "decline", "loss", "bear", "low", "miss", "cut", "downgrade", "underperform", "selloff", "sell-off", "weak", "fear", "recession", "risk", "negative", "warning", "layoff"];

function scoreSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) { if (lower.includes(w)) score += 1; }
  for (const w of NEGATIVE_WORDS) { if (lower.includes(w)) score -= 1; }
  const normalized = Math.max(-1, Math.min(1, score / 3));
  return {
    sentiment: normalized > 0.15 ? "positive" : normalized < -0.15 ? "negative" : "neutral",
    score: Math.round(normalized * 100) / 100,
  };
}

function parseRSSXML(xml: string, source: string, watchSymbols: string[]): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                  block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                        block.match(/<description>(.*?)<\/description>/)?.[1] || "";

    if (!title) continue;

    const { sentiment, score } = scoreSentiment(title + " " + description);
    const mentionedSymbols = watchSymbols.filter(s => (title + " " + description).toUpperCase().includes(s));

    items.push({
      title: title.replace(/<[^>]*>/g, "").trim(),
      link,
      source,
      published: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      sentiment,
      sentimentScore: score,
      symbols: mentionedSymbols,
      summary: description.replace(/<[^>]*>/g, "").trim().slice(0, 200),
    });
  }
  return items;
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const symbols = (url.searchParams.get("symbols") || "AAPL,MSFT,NVDA,GOOGL,AMZN,TSLA,META").split(",").slice(0, 20);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 50);

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    const allNews: NewsItem[] = [];

    // Fetch Yahoo Finance RSS for watched symbols
    const yahooUrl = RSS_FEEDS[0].url.replace("%SYMBOLS%", symbols.join(","));
    try {
      const res = await fetch(yahooUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const xml = await res.text();
        allNews.push(...parseRSSXML(xml, "Yahoo Finance", symbols));
      }
    } catch { /* skip */ }

    // Fetch general financial news
    try {
      const res = await fetch(RSS_FEEDS[1].url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const xml = await res.text();
        allNews.push(...parseRSSXML(xml, "Investing.com", symbols));
      }
    } catch { /* skip */ }

    // Sort by date (newest first) and limit
    allNews.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
    const limited = allNews.slice(0, limit);

    // Compute aggregate sentiment
    const avgSentiment = limited.length > 0
      ? limited.reduce((s, n) => s + n.sentimentScore, 0) / limited.length
      : 0;

    return new Response(JSON.stringify({
      news: limited,
      count: limited.length,
      aggregateSentiment: Math.round(avgSentiment * 100) / 100,
      aggregateLabel: avgSentiment > 0.1 ? "Bullish" : avgSentiment < -0.1 ? "Bearish" : "Neutral",
    }), { status: 200, headers });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, news: [] }), { status: 500, headers });
  }
};
