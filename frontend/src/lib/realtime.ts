/**
 * Real-time data services: live prices, fundamentals, news, Alpaca broker,
 * track record, notifications, and scheduled auto-runs.
 */

// ── Types ──

export interface LivePrice {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  updatedAt: number;
}

export interface StockFundamentals {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  marketCap: number;
  pe: number;
  forwardPe: number;
  eps: number;
  dividendYield: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number;
  shortName: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  symbols: string[];
  summary: string;
}

export interface NewsFeed {
  news: NewsItem[];
  count: number;
  aggregateSentiment: number;
  aggregateLabel: string;
}

export interface AlpacaAccount {
  id: string;
  status: string;
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  daytrade_count: number;
  last_equity: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
}

export interface TrackRecordEntry {
  id: string;
  timestamp: string;
  type: 'signal' | 'trade' | 'rebalance' | 'stop' | 'alert';
  symbol: string;
  action: string;
  predictedDirection: 'long' | 'short' | 'hold';
  entryPrice: number;
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
  confidence: number;
  strategy: string;
  resolved: boolean;
  resolvedAt?: string;
  actualReturn?: number;
}

export interface DailyRunLog {
  date: string;
  ranAt: string;
  regime: string;
  signalsGenerated: number;
  tradesExecuted: number;
  portfolioValue: number;
  dailyReturn: number;
}

// ── Storage Keys ──
const ALPACA_KEYS_STORAGE = 'quest_alpaca_keys';
const TRACK_RECORD_STORAGE = 'quest_track_record';
const DAILY_RUNS_STORAGE = 'quest_daily_runs';
const NOTIFICATION_PREF_STORAGE = 'quest_notification_prefs';
const LAST_RUN_DATE_STORAGE = 'quest_last_run_date';

// ── 1. Real-Time Price Streaming ──

let priceCache: Record<string, LivePrice> = {};
let priceListeners: ((prices: Record<string, LivePrice>) => void)[] = [];
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeToPrices(symbols: string[], callback: (prices: Record<string, LivePrice>) => void): () => void {
  priceListeners.push(callback);
  if (!pollInterval) {
    startPricePoll(symbols);
  }
  // Return unsubscribe
  return () => {
    priceListeners = priceListeners.filter(l => l !== callback);
    if (priceListeners.length === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
}

async function fetchLivePrices(symbols: string[]): Promise<Record<string, LivePrice>> {
  try {
    const res = await fetch(`/api/stock-fundamentals?symbols=${symbols.join(',')}`);
    if (!res.ok) return {};
    const data = await res.json();
    const prices: Record<string, LivePrice> = {};
    for (const [sym, info] of Object.entries(data.data || {})) {
      const d = info as any;
      prices[sym] = {
        symbol: sym,
        price: d.price,
        change: d.change,
        changePct: d.changePct,
        updatedAt: Date.now(),
      };
    }
    return prices;
  } catch {
    return {};
  }
}

function startPricePoll(symbols: string[]) {
  const poll = async () => {
    const prices = await fetchLivePrices(symbols);
    if (Object.keys(prices).length > 0) {
      priceCache = { ...priceCache, ...prices };
      priceListeners.forEach(l => l(priceCache));
    }
  };
  poll(); // immediate first fetch
  pollInterval = setInterval(poll, 30000); // every 30s
}

export function getCachedPrices(): Record<string, LivePrice> {
  return priceCache;
}

// ── 2. Stock Fundamentals ──

let fundamentalsCache: Record<string, StockFundamentals> = {};
const FUNDAMENTALS_CACHE_DURATION = 600000; // 10 min
let fundamentalsFetchedAt = 0;

export async function fetchFundamentals(symbols: string[]): Promise<Record<string, StockFundamentals>> {
  if (Date.now() - fundamentalsFetchedAt < FUNDAMENTALS_CACHE_DURATION && Object.keys(fundamentalsCache).length > 0) {
    return fundamentalsCache;
  }
  try {
    const res = await fetch(`/api/stock-fundamentals?symbols=${symbols.join(',')}`);
    if (!res.ok) return fundamentalsCache;
    const data = await res.json();
    fundamentalsCache = data.data || {};
    fundamentalsFetchedAt = Date.now();
    return fundamentalsCache;
  } catch {
    return fundamentalsCache;
  }
}

export function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
  return vol.toString();
}

// ── 3. News Feed ──

let newsCache: NewsFeed | null = null;
let newsFetchedAt = 0;
const NEWS_CACHE_DURATION = 300000; // 5 min

export async function fetchNews(symbols?: string[]): Promise<NewsFeed> {
  if (newsCache && Date.now() - newsFetchedAt < NEWS_CACHE_DURATION) {
    return newsCache;
  }
  try {
    const syms = symbols?.join(',') || 'AAPL,MSFT,NVDA,GOOGL,AMZN,TSLA,META';
    const res = await fetch(`/api/news-feed?symbols=${syms}&limit=30`);
    if (!res.ok) return newsCache || { news: [], count: 0, aggregateSentiment: 0, aggregateLabel: 'Neutral' };
    const data = await res.json();
    newsCache = data;
    newsFetchedAt = Date.now();
    return data;
  } catch {
    return newsCache || { news: [], count: 0, aggregateSentiment: 0, aggregateLabel: 'Neutral' };
  }
}

// ── 4. Alpaca Broker Integration ──

export function getAlpacaKeys(): { apiKey: string; secretKey: string; isPaper: boolean } | null {
  const raw = localStorage.getItem(ALPACA_KEYS_STORAGE);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveAlpacaKeys(apiKey: string, secretKey: string, isPaper = true) {
  localStorage.setItem(ALPACA_KEYS_STORAGE, JSON.stringify({ apiKey, secretKey, isPaper }));
}

export function clearAlpacaKeys() {
  localStorage.removeItem(ALPACA_KEYS_STORAGE);
}

async function alpacaFetch(path: string, method = 'GET', body?: any): Promise<any> {
  const keys = getAlpacaKeys();
  if (!keys) throw new Error('Alpaca not configured');

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Alpaca-Key': keys.apiKey,
      'X-Alpaca-Secret': keys.secretKey,
      'X-Alpaca-Paper': keys.isPaper ? 'true' : 'false',
    },
  };
  if (body) init.body = JSON.stringify(body);

  const res = await fetch(`/api/alpaca/${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getAlpacaAccount(): Promise<AlpacaAccount> {
  return alpacaFetch('account');
}

export async function getAlpacaPositions(): Promise<AlpacaPosition[]> {
  return alpacaFetch('positions');
}

export async function getAlpacaOrders(status = 'all'): Promise<AlpacaOrder[]> {
  return alpacaFetch(`orders?status=${status}&limit=50`);
}

export async function placeAlpacaOrder(symbol: string, qty: number, side: 'buy' | 'sell', type = 'market', timeInForce = 'day'): Promise<AlpacaOrder> {
  return alpacaFetch('orders', 'POST', { symbol, qty: String(qty), side, type, time_in_force: timeInForce });
}

export async function cancelAlpacaOrder(orderId: string): Promise<void> {
  await alpacaFetch(`orders/${orderId}`, 'DELETE');
}

export async function testAlpacaConnection(): Promise<{ connected: boolean; account?: AlpacaAccount; error?: string }> {
  try {
    const account = await getAlpacaAccount();
    return { connected: true, account };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

// ── 5. Track Record System ──

function getTrackRecord(): TrackRecordEntry[] {
  const raw = localStorage.getItem(TRACK_RECORD_STORAGE);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveTrackRecord(entries: TrackRecordEntry[]) {
  localStorage.setItem(TRACK_RECORD_STORAGE, JSON.stringify(entries));
}

export function addTrackRecordEntry(entry: Omit<TrackRecordEntry, 'id' | 'timestamp'>): TrackRecordEntry {
  const entries = getTrackRecord();
  const newEntry: TrackRecordEntry = {
    ...entry,
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  // Keep last 500 entries
  if (entries.length > 500) entries.length = 500;
  saveTrackRecord(entries);
  return newEntry;
}

export function resolveTrackRecordEntry(id: string, currentPrice: number): TrackRecordEntry | null {
  const entries = getTrackRecord();
  const entry = entries.find(e => e.id === id);
  if (!entry || entry.resolved) return null;
  entry.resolved = true;
  entry.resolvedAt = new Date().toISOString();
  entry.currentPrice = currentPrice;
  entry.pnl = currentPrice - entry.entryPrice;
  entry.pnlPct = entry.entryPrice > 0 ? ((currentPrice - entry.entryPrice) / entry.entryPrice) * 100 : 0;
  entry.actualReturn = entry.predictedDirection === 'long' ? entry.pnlPct : -entry.pnlPct;
  saveTrackRecord(entries);
  return entry;
}

export function getTrackRecordStats() {
  const entries = getTrackRecord();
  const resolved = entries.filter(e => e.resolved);
  const correct = resolved.filter(e => (e.actualReturn || 0) > 0);
  const avgReturn = resolved.length > 0 ? resolved.reduce((s, e) => s + (e.actualReturn || 0), 0) / resolved.length : 0;
  const totalSignals = entries.length;
  const streak = calculateStreak(resolved);

  return {
    entries,
    totalSignals,
    resolvedCount: resolved.length,
    unresolvedCount: entries.filter(e => !e.resolved).length,
    accuracy: resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0,
    avgReturn: Math.round(avgReturn * 100) / 100,
    bestTrade: resolved.length > 0 ? resolved.reduce((best, e) => (e.actualReturn || 0) > (best.actualReturn || 0) ? e : best) : null,
    worstTrade: resolved.length > 0 ? resolved.reduce((worst, e) => (e.actualReturn || 0) < (worst.actualReturn || 0) ? e : worst) : null,
    streak,
    byStrategy: groupByStrategy(resolved),
  };
}

function calculateStreak(resolved: TrackRecordEntry[]): { count: number; type: 'win' | 'loss' } {
  if (resolved.length === 0) return { count: 0, type: 'win' };
  const sorted = [...resolved].sort((a, b) => new Date(b.resolvedAt || b.timestamp).getTime() - new Date(a.resolvedAt || a.timestamp).getTime());
  const firstType = (sorted[0].actualReturn || 0) > 0 ? 'win' : 'loss';
  let count = 0;
  for (const e of sorted) {
    const isWin = (e.actualReturn || 0) > 0;
    if ((isWin && firstType === 'win') || (!isWin && firstType === 'loss')) count++;
    else break;
  }
  return { count, type: firstType };
}

function groupByStrategy(entries: TrackRecordEntry[]): Record<string, { count: number; winRate: number; avgReturn: number }> {
  const groups: Record<string, TrackRecordEntry[]> = {};
  for (const e of entries) {
    if (!groups[e.strategy]) groups[e.strategy] = [];
    groups[e.strategy].push(e);
  }
  const result: Record<string, { count: number; winRate: number; avgReturn: number }> = {};
  for (const [strategy, list] of Object.entries(groups)) {
    const wins = list.filter(e => (e.actualReturn || 0) > 0).length;
    const avg = list.reduce((s, e) => s + (e.actualReturn || 0), 0) / list.length;
    result[strategy] = {
      count: list.length,
      winRate: Math.round((wins / list.length) * 100),
      avgReturn: Math.round(avg * 100) / 100,
    };
  }
  return result;
}

// ── 6. Daily Auto-Run Scheduler ──

function getDailyRuns(): DailyRunLog[] {
  const raw = localStorage.getItem(DAILY_RUNS_STORAGE);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveDailyRuns(runs: DailyRunLog[]) {
  localStorage.setItem(DAILY_RUNS_STORAGE, JSON.stringify(runs));
}

export function getLastRunDate(): string | null {
  return localStorage.getItem(LAST_RUN_DATE_STORAGE);
}

export function shouldAutoRun(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const lastRun = getLastRunDate();
  if (lastRun === today) return false;
  // Only run on weekdays
  const dow = new Date().getDay();
  return dow >= 1 && dow <= 5;
}

export function logDailyRun(log: Omit<DailyRunLog, 'date' | 'ranAt'>) {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(LAST_RUN_DATE_STORAGE, today);
  const runs = getDailyRuns();
  runs.unshift({
    ...log,
    date: today,
    ranAt: new Date().toISOString(),
  });
  if (runs.length > 90) runs.length = 90; // keep 90 days
  saveDailyRuns(runs);
}

export function getDailyRunHistory(): DailyRunLog[] {
  return getDailyRuns();
}

export function getRunStreak(): number {
  const runs = getDailyRuns();
  if (runs.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < runs.length; i++) {
    const prev = new Date(runs[i - 1].date);
    const curr = new Date(runs[i].date);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
    if (diffDays <= 3) streak++; // allow weekends
    else break;
  }
  return streak;
}

// ── 7. Browser Notifications ──

export interface NotificationPrefs {
  enabled: boolean;
  signals: boolean;
  stops: boolean;
  dailyReport: boolean;
}

export function getNotificationPrefs(): NotificationPrefs {
  const raw = localStorage.getItem(NOTIFICATION_PREF_STORAGE);
  if (!raw) return { enabled: false, signals: true, stops: true, dailyReport: true };
  try { return JSON.parse(raw); } catch { return { enabled: false, signals: true, stops: true, dailyReport: true }; }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, JSON.stringify(prefs));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotification(title: string, body: string, icon?: string) {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: icon || '/quest-icon.png', badge: '/quest-icon.png' });
  } catch { /* ignore */ }
}

export function notifyNewSignal(symbol: string, action: string, confidence: number) {
  const prefs = getNotificationPrefs();
  if (prefs.signals) {
    sendNotification(
      `Quest Signal: ${action.toUpperCase()} ${symbol}`,
      `Confidence: ${(confidence * 100).toFixed(0)}% — ${action === 'buy' ? 'Bullish signal detected' : 'Bearish signal detected'}`
    );
  }
}

export function notifyStopLoss(symbol: string, exitPrice: number, pnlPct: number) {
  const prefs = getNotificationPrefs();
  if (prefs.stops) {
    sendNotification(
      `Quest Stop: ${symbol} Exited`,
      `Exit at $${exitPrice.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`
    );
  }
}

export function notifyDailyReport(portfolioValue: number, dailyReturn: number, tradesCount: number) {
  const prefs = getNotificationPrefs();
  if (prefs.dailyReport) {
    sendNotification(
      'Quest Daily Report',
      `Portfolio: $${portfolioValue.toFixed(2)} (${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(2)}%) | ${tradesCount} trades today`
    );
  }
}
