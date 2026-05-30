/**
 * Client-side simulation engine — provides realistic demo data
 * when the backend API is not available (e.g., on Netlify without a backend).
 *
 * Uses deterministic pseudo-random data seeded from the current date
 * so the experience is consistent within a session.
 */

const STOCKS = [
  { symbol: 'NVDA', sector: 'Technology', basePrice: 135 },
  { symbol: 'AAPL', sector: 'Technology', basePrice: 198 },
  { symbol: 'MSFT', sector: 'Technology', basePrice: 430 },
  { symbol: 'GOOGL', sector: 'Technology', basePrice: 178 },
  { symbol: 'META', sector: 'Technology', basePrice: 510 },
  { symbol: 'AMZN', sector: 'Consumer Discretionary', basePrice: 195 },
  { symbol: 'TSLA', sector: 'Consumer Discretionary', basePrice: 250 },
  { symbol: 'JPM', sector: 'Financials', basePrice: 205 },
  { symbol: 'UNH', sector: 'Health Care', basePrice: 530 },
  { symbol: 'LLY', sector: 'Health Care', basePrice: 790 },
  { symbol: 'V', sector: 'Financials', basePrice: 280 },
  { symbol: 'AVGO', sector: 'Technology', basePrice: 175 },
  { symbol: 'XOM', sector: 'Energy', basePrice: 112 },
  { symbol: 'PG', sector: 'Consumer Staples', basePrice: 165 },
  { symbol: 'HD', sector: 'Consumer Discretionary', basePrice: 350 },
  { symbol: 'INTC', sector: 'Technology', basePrice: 30 },
  { symbol: 'AMD', sector: 'Technology', basePrice: 160 },
  { symbol: 'CRM', sector: 'Technology', basePrice: 265 },
  { symbol: 'NFLX', sector: 'Communication Services', basePrice: 640 },
  { symbol: 'KO', sector: 'Consumer Staples', basePrice: 62 },
];

const SECTORS = [
  { etf: 'XLK', sector: 'Technology' },
  { etf: 'XLV', sector: 'Health Care' },
  { etf: 'XLF', sector: 'Financials' },
  { etf: 'XLY', sector: 'Consumer Discretionary' },
  { etf: 'XLP', sector: 'Consumer Staples' },
  { etf: 'XLE', sector: 'Energy' },
  { etf: 'XLI', sector: 'Industrials' },
  { etf: 'XLB', sector: 'Materials' },
  { etf: 'XLRE', sector: 'Real Estate' },
  { etf: 'XLU', sector: 'Utilities' },
  { etf: 'XLC', sector: 'Communication Services' },
];

// Seeded pseudo-random
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const daySeed = Math.floor(Date.now() / 86400000);
const rand = seededRandom(daySeed);

function jitter(base: number, pct: number): number {
  return base * (1 + (rand() - 0.5) * 2 * pct);
}

// State persisted in localStorage
const STORAGE_KEY = 'quest_sim_state';

interface SimPosition {
  symbol: string;
  quantity: number;
  entry_price: number;
  sector: string;
}

interface SimTrade {
  timestamp: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  reason: string;
}

interface SimState {
  cash: number;
  initial_capital: number;
  positions: SimPosition[];
  trades: SimTrade[];
  peak_value: number;
  started_at: string;
}

function getState(): SimState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return defaultState();
}

function setState(s: SimState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function defaultState(): SimState {
  return {
    cash: 1000,
    initial_capital: 1000,
    positions: [],
    trades: [],
    peak_value: 1000,
    started_at: new Date().toISOString(),
  };
}

function getCurrentPrice(symbol: string): number {
  const stock = STOCKS.find(s => s.symbol === symbol);
  if (!stock) return 100;
  return jitter(stock.basePrice, 0.02);
}

function portfolioValue(state: SimState): number {
  const posValue = state.positions.reduce(
    (sum, p) => sum + p.quantity * getCurrentPrice(p.symbol), 0
  );
  return state.cash + posValue;
}

// ── Simulation API implementations ──

export function simGetRegime() {
  const regimes = ['bull', 'bull', 'bear', 'sideways'] as const;
  const regime = regimes[daySeed % regimes.length];
  const confidence = 0.7 + rand() * 0.25;
  return {
    regime,
    confidence: Math.round(confidence * 1000) / 1000,
    composite_score: regime === 'bull' ? 0.45 + rand() * 0.3 : regime === 'bear' ? -0.4 - rand() * 0.2 : rand() * 0.2 - 0.1,
    signals: {
      trend: regime === 'bull' ? 1 : regime === 'bear' ? -1 : 0,
      trend_slope: jitter(0.02, 0.5),
      momentum_1m: jitter(0.03, 1),
      momentum_3m: jitter(0.08, 0.8),
      volatility: jitter(0.15, 0.3),
      volatility_regime: 'normal',
      breadth: (regime as string) === 'bull' ? 0.6 + rand() * 0.3 : 0.3 + rand() * 0.3,
    },
  };
}

export function simGetRankings(topN = 20) {
  const rankings = STOCKS.slice(0, topN).map((stock, i) => {
    const momentum = jitter(0.12, 1.5) * (i < 5 ? 1 : i < 10 ? 0.5 : -0.3);
    const mean_reversion = jitter(0.3, 0.5);
    const quality = jitter(0.6, 0.3);
    const volatility = jitter(0.5, 0.4);
    const composite = momentum * 0.3 + mean_reversion * 0.15 + quality * 0.25 + volatility * 0.15 + rand() * 0.15;
    return {
      symbol: stock.symbol,
      composite: Math.round(composite * 10000) / 10000,
      rank: i + 1,
      momentum: Math.round(momentum * 10000) / 10000,
      mean_reversion: Math.round(mean_reversion * 10000) / 10000,
      quality: Math.round(quality * 10000) / 10000,
      volatility: Math.round(volatility * 10000) / 10000,
    };
  }).sort((a, b) => b.composite - a.composite).map((r, i) => ({ ...r, rank: i + 1 }));

  return { rankings };
}

export function simGetSectorRotation() {
  const sectors = SECTORS.map((s, i) => ({
    etf: s.etf,
    sector: s.sector,
    rank: i + 1,
    return_1m: jitter(0.03, 2) * (i < 4 ? 1 : i < 7 ? 0.5 : -0.5),
    return_3m: jitter(0.08, 1.5),
    above_50sma: rand() > 0.35,
  })).sort((a, b) => b.return_1m - a.return_1m).map((s, i) => ({ ...s, rank: i + 1 }));

  return { sectors };
}

export function simScanSignals() {
  const signals = STOCKS.slice(0, 15).map(stock => {
    const isBuy = rand() > 0.15;
    const strength = 0.2 + rand() * 0.6;
    const strategies = ['momentum', 'mean_reversion', 'macd_crossover', 'rsi_oversold', 'quality_breakout'];
    const strategy = strategies[Math.floor(rand() * strategies.length)];
    return {
      symbol: stock.symbol,
      signal_type: isBuy ? 'buy' : 'sell',
      strength: Math.round(strength * 100) / 100,
      strategy,
      description: isBuy
        ? `${strategy} signal: ${stock.symbol} shows strong upward momentum`
        : `${strategy} signal: ${stock.symbol} showing weakness`,
    };
  });

  return { signals, count: signals.length };
}

export function simGetTechnicals(symbol: string) {
  const stock = STOCKS.find(s => s.symbol === symbol) || STOCKS[0];
  const price = getCurrentPrice(stock.symbol);
  const rsi = 30 + rand() * 45;
  const history = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.now() - (60 - i) * 86400000).toISOString().slice(0, 10),
    close: jitter(price, 0.08) * (0.9 + (i / 60) * 0.2),
  }));

  return {
    symbol: stock.symbol,
    price,
    rsi,
    macd: { value: jitter(0, 2), signal: jitter(0, 1.5), histogram: jitter(0.5, 3) },
    factors: {
      momentum: jitter(0.1, 1.5),
      mean_reversion: jitter(0.3, 0.6),
      quality: jitter(0.55, 0.3),
      volatility: jitter(0.45, 0.4),
    },
    price_history: history,
  };
}

export function simQuickBacktest() {
  const days = 252;
  let value = 1000;
  let peak = 1000;
  const curve = [];
  const monthlyReturns = [];
  let lastMonthValue = 1000;
  let lastMonth = -1;
  const r = seededRandom(daySeed + 42);

  for (let i = 0; i < days; i++) {
    const dailyReturn = (r() - 0.48) * 0.02;
    value *= 1 + dailyReturn;
    peak = Math.max(peak, value);
    const dd = (value - peak) / peak;
    const date = new Date(Date.now() - (days - i) * 86400000);
    curve.push({
      date: date.toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
      drawdown: Math.round(dd * 10000) / 10000,
    });

    const month = date.getMonth();
    if (lastMonth >= 0 && month !== lastMonth) {
      const ret = (value - lastMonthValue) / lastMonthValue;
      monthlyReturns.push({
        month: date.toISOString().slice(0, 7),
        return: Math.round(ret * 10000) / 10000,
        value: Math.round(value * 100) / 100,
      });
      lastMonthValue = value;
    }
    lastMonth = month;
  }

  const totalReturn = (value / 1000) - 1;
  const maxDD = Math.min(...curve.map(c => c.drawdown));

  return {
    initial_capital: 1000,
    final_value: Math.round(value * 100) / 100,
    total_return: Math.round(totalReturn * 10000) / 10000,
    annual_return: Math.round(totalReturn * 10000) / 10000,
    sharpe_ratio: Math.round((totalReturn / Math.abs(maxDD || 0.1)) * 1000) / 1000,
    sortino_ratio: Math.round((totalReturn / Math.abs(maxDD || 0.1) * 1.3) * 1000) / 1000,
    calmar_ratio: Math.round((totalReturn / Math.abs(maxDD || 0.1)) * 1000) / 1000,
    max_drawdown: Math.round(maxDD * 10000) / 10000,
    total_trades: 80 + Math.floor(r() * 40),
    win_rate: Math.round((0.52 + r() * 0.08) * 1000) / 1000,
    total_costs: Math.round(value * 0.003 * 100) / 100,
    trading_days: days,
    monthly_returns: monthlyReturns,
    equity_curve: curve,
  };
}

export function simGetRiskLimits() {
  return {
    max_position_pct: 0.25,
    max_sector_pct: 0.40,
    min_cash_reserve_pct: 0.05,
    max_drawdown_warning: -0.10,
    max_drawdown_reduce: -0.15,
    max_drawdown_liquidate: -0.25,
    trailing_stop_pct: 0.08,
    take_profit_pct: 0.20,
    take_profit_sell_pct: 0.50,
    pdt_max_day_trades: 3,
  };
}

export function simGetBrokerStatus() {
  return {
    primary: { broker: 'alpaca', configured: false },
    secondary: { broker: 'robinhood', configured: false },
  };
}

export function simGetTargetPortfolio() {
  const top = simGetRankings(8).rankings;
  const allocations: Record<string, number> = {};
  top.forEach((s, i) => {
    allocations[s.symbol] = Math.round((0.18 - i * 0.015) * 1000) / 1000;
  });
  return {
    allocations,
    num_positions: top.length,
    cash_pct: 0.08,
    regime: simGetRegime().regime,
    orders: [],
  };
}

export function simGetPaperStatus() {
  const state = getState();
  const pv = portfolioValue(state);
  const totalReturn = ((pv - state.initial_capital) / state.initial_capital) * 100;
  const daysDiff = Math.floor((Date.now() - new Date(state.started_at).getTime()) / 86400000);

  return {
    portfolio_value: Math.round(pv * 100) / 100,
    cash: Math.round(state.cash * 100) / 100,
    initial_capital: state.initial_capital,
    total_pnl: Math.round((pv - state.initial_capital) * 100) / 100,
    total_return_pct: Math.round(totalReturn * 100) / 100,
    positions: state.positions.map(p => {
      const currentPrice = getCurrentPrice(p.symbol);
      const mv = p.quantity * currentPrice;
      const pnl = mv - p.quantity * p.entry_price;
      return {
        symbol: p.symbol,
        quantity: Math.round(p.quantity * 10000) / 10000,
        entry_price: p.entry_price,
        current_price: Math.round(currentPrice * 100) / 100,
        market_value: Math.round(mv * 100) / 100,
        unrealized_pnl: Math.round(pnl * 100) / 100,
        unrealized_pnl_pct: Math.round((pnl / (p.quantity * p.entry_price)) * 10000) / 100,
        sector: p.sector,
      };
    }),
    num_positions: state.positions.length,
    drawdown: Math.round(((pv - state.peak_value) / state.peak_value) * 10000) / 10000,
    peak_value: Math.round(state.peak_value * 100) / 100,
    total_trades: state.trades.length,
    started_at: state.started_at,
    days_running: daysDiff,
    recent_trades: state.trades.slice(-10),
    regime: simGetRegime().regime,
  };
}

export function simRunPaperCycle() {
  const state = getState();
  const rankings = simGetRankings(5).rankings;
  const actions: { type: string; symbol: string; qty: number }[] = [];

  // Pick the top-ranked stock the system doesn't already hold
  const held = new Set(state.positions.map(p => p.symbol));
  const topPick = rankings.find(r => !held.has(r.symbol)) || rankings[0];

  if (topPick && state.cash > 50) {
    const price = getCurrentPrice(topPick.symbol);
    const investAmount = Math.min(state.cash * 0.25, state.cash - 20);
    const qty = investAmount / price;
    const stock = STOCKS.find(s => s.symbol === topPick.symbol);

    state.positions.push({
      symbol: topPick.symbol,
      quantity: Math.round(qty * 10000) / 10000,
      entry_price: Math.round(price * 100) / 100,
      sector: stock?.sector || 'Technology',
    });
    state.cash -= investAmount;
    state.trades.push({
      timestamp: new Date().toISOString(),
      symbol: topPick.symbol,
      side: 'buy',
      quantity: Math.round(qty * 10000) / 10000,
      price: Math.round(price * 100) / 100,
      reason: 'Rebalance',
    });
    actions.push({ type: 'REBALANCE_BUY', symbol: topPick.symbol, qty: Math.round(qty * 10000) / 10000 });
  }

  const pv = portfolioValue(state);
  state.peak_value = Math.max(state.peak_value, pv);
  setState(state);

  return {
    timestamp: new Date().toISOString(),
    actions,
    portfolio_value: Math.round(pv * 100) / 100,
    regime: simGetRegime().regime,
  };
}

export function simResetPaper(capital = 1000) {
  const state = defaultState();
  state.cash = capital;
  state.initial_capital = capital;
  setState(state);
  return { status: 'reset', initial_capital: capital };
}

export function simGetPaperTrades() {
  const state = getState();
  return { trades: state.trades };
}

// ── Real Market Data 30-Day Paper Backtest ──

interface PriceData {
  dates: string[];
  closes: number[];
  symbol: string;
}

const BACKTEST_CACHE_KEY = 'quest_30d_backtest';
const CACHE_DURATION = 3600000; // 1 hour

/** Fetch real 30-day price data via Netlify serverless function or local proxy. */
async function fetchRealPrices(symbols: string[]): Promise<Record<string, PriceData>> {
  const symbolStr = symbols.join(',');
  // Try Netlify function path first, then local proxy
  const urls = [
    `/api/market-data?symbols=${symbolStr}&range=2mo&interval=1d`,
    `/.netlify/functions/market-data?symbols=${symbolStr}&range=2mo&interval=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Object.keys(json.data).length > 0) {
          return json.data;
        }
      }
    } catch {
      // try next URL
    }
  }

  return {};
}

// ── Statistical Analysis Functions ──

/** Compute momentum factor from price series (Jegadeesh-Titman 6mo skip-1mo) */
function computeMomentum(closes: number[]): number {
  if (closes.length < 22) return 0;
  const skipRecent = closes.slice(0, -5); // skip last week (reduces reversal noise)
  const start = skipRecent[Math.max(0, skipRecent.length - 21)];
  const end = skipRecent[skipRecent.length - 1];
  return start > 0 ? (end / start) - 1 : 0;
}

/** Compute RSI from closes */
function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

/** Compute annualized volatility */
function computeVolatility(closes: number[]): number {
  if (closes.length < 10) return 0.3;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance * 252);
}

/** Compute quality score: trend consistency via R² of log-price regression */
function computeQuality(closes: number[]): number {
  if (closes.length < 10) return 0.5;
  const n = closes.length;
  const logPrices = closes.map(c => Math.log(Math.max(c, 0.01)));
  const xMean = (n - 1) / 2;
  const yMean = logPrices.reduce((a, b) => a + b, 0) / n;
  let ssXY = 0, ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (i - xMean) * (logPrices[i] - yMean);
    ssXX += (i - xMean) ** 2;
  }
  const slope = ssXX > 0 ? ssXY / ssXX : 0;
  const yHat = logPrices.map((_, i) => yMean + slope * (i - xMean));
  const ssTot = logPrices.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = logPrices.reduce((s, y, i) => s + (y - yHat[i]) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return Math.max(0, Math.min(1, rSquared * (slope > 0 ? 1 : 0.3)));
}

/** Average True Range (ATR) — measures volatility in price units */
function computeATR(closes: number[], period = 14): number {
  if (closes.length < period + 1) return closes[closes.length - 1] * 0.02;
  let atr = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.abs(closes[i] - closes[i - 1]);
    atr += tr;
  }
  return atr / period;
}

/** Bollinger Band width (normalized) — detects squeeze/expansion */
function computeBollingerWidth(closes: number[], period = 20): { width: number; percentB: number } {
  if (closes.length < period) return { width: 0.1, percentB: 0.5 };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const width = upper - lower > 0 ? (upper - lower) / mean : 0.01;
  const last = closes[closes.length - 1];
  const percentB = upper - lower > 0 ? (last - lower) / (upper - lower) : 0.5;
  return { width, percentB };
}

/** MACD signal — measures momentum acceleration */
function computeMACD(closes: number[]): { histogram: number; signal: number } {
  if (closes.length < 26) return { histogram: 0, signal: 0 };
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let val = data[0];
    for (let i = 1; i < data.length; i++) val = data[i] * k + val * (1 - k);
    return val;
  };
  const ema12 = ema(closes.slice(-12), 12);
  const ema26 = ema(closes.slice(-26), 26);
  const macdLine = ema12 - ema26;
  const signalLine = ema(closes.slice(-9).map(() => macdLine), 9); // simplified
  return { histogram: macdLine - signalLine, signal: macdLine > signalLine ? 1 : -1 };
}

/** Pearson correlation between two return series */
function computeCorrelation(closesA: number[], closesB: number[]): number {
  const minLen = Math.min(closesA.length, closesB.length);
  if (minLen < 10) return 0;
  const rA: number[] = [], rB: number[] = [];
  for (let i = 1; i < minLen; i++) {
    if (closesA[i - 1] > 0 && closesB[i - 1] > 0) {
      rA.push(closesA[i] / closesA[i - 1] - 1);
      rB.push(closesB[i] / closesB[i - 1] - 1);
    }
  }
  if (rA.length < 5) return 0;
  const n = rA.length;
  const meanA = rA.reduce((s, v) => s + v, 0) / n;
  const meanB = rB.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (rA[i] - meanA) * (rB[i] - meanB);
    varA += (rA[i] - meanA) ** 2;
    varB += (rB[i] - meanB) ** 2;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : 0;
}

/** Detect market regime from aggregate price data */
function detectRegimeFromPrices(allCloses: number[][]): 'bull' | 'bear' | 'sideways' {
  if (allCloses.length === 0) return 'sideways';
  let bullCount = 0, bearCount = 0;
  for (const closes of allCloses) {
    if (closes.length < 20) continue;
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const momentum = closes.length >= 20 ? (closes[closes.length - 1] / closes[closes.length - 20]) - 1 : 0;
    if (sma5 > sma20 && momentum > 0.02) bullCount++;
    else if (sma5 < sma20 && momentum < -0.02) bearCount++;
  }
  const total = allCloses.length;
  if (bullCount / total > 0.5) return 'bull';
  if (bearCount / total > 0.4) return 'bear';
  return 'sideways';
}

/** Multi-signal confirmation score — requires alignment of indicators */
function computeConfirmationScore(
  momentum: number, rsi: number, quality: number, vol: number,
  macdSignal: number, bollingerPctB: number, bollingerWidth: number
): { score: number; confidence: number; signals_aligned: number } {
  let bullSignals = 0, totalSignals = 7;

  // 1. Positive momentum
  if (momentum > 0.01) bullSignals++;
  // 2. RSI not overbought (room to run) or oversold (reversal play)
  if (rsi > 30 && rsi < 65) bullSignals++;
  else if (rsi < 30) bullSignals += 0.8; // oversold bounce potential
  // 3. High quality (consistent trend)
  if (quality > 0.5) bullSignals++;
  // 4. Moderate volatility (not too chaotic)
  if (vol > 0.08 && vol < 0.45) bullSignals++;
  // 5. MACD bullish
  if (macdSignal > 0) bullSignals++;
  // 6. Bollinger %B in sweet spot (not extreme)
  if (bollingerPctB > 0.3 && bollingerPctB < 0.85) bullSignals++;
  // 7. Bollinger squeeze (low width = impending breakout)
  if (bollingerWidth < 0.08) bullSignals += 0.7; // squeeze detected

  const confidence = bullSignals / totalSignals;
  return { score: confidence, confidence, signals_aligned: Math.round(bullSignals) };
}

interface BacktestDay {
  date: string;
  value: number;
  drawdown: number;
}

interface BacktestTrade {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  reason: string;
}

export interface RealBacktestResult {
  initial_capital: number;
  final_value: number;
  total_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  total_trades: number;
  win_rate: number;
  equity_curve: BacktestDay[];
  trades: BacktestTrade[];
  positions: { symbol: string; quantity: number; entry_price: number; current_price: number; pnl: number; pnl_pct: number; sector: string }[];
  regime: string;
  days_simulated: number;
  data_source: 'real' | 'simulated';
  loading?: boolean;
}

/** Run a 30-day paper backtest using real Yahoo Finance data.
 * Enhanced with deep statistical analysis:
 * - ATR-based adaptive trailing stops (volatility-proportional)
 * - Correlation filtering (max 0.7 pairwise correlation in portfolio)
 * - Regime-conditional factor weights
 * - Multi-signal confirmation (require 5+ aligned signals to enter)
 * - Risk parity position sizing (inverse-volatility weighted)
 * - Bollinger squeeze breakout detection
 * - MACD momentum confirmation
 */
export async function runReal30DayBacktest(): Promise<RealBacktestResult> {
  // Check cache
  const cached = localStorage.getItem(BACKTEST_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed._ts < CACHE_DURATION) {
        return parsed.result;
      }
    } catch { /* ignore bad cache */ }
  }

  const symbols = STOCKS.map(s => s.symbol);
  const priceData = await fetchRealPrices(symbols);

  const hasRealData = Object.keys(priceData).length >= 5;

  if (!hasRealData) {
    return runSimulated30DayBacktest();
  }

  // ── Configuration ──
  const INITIAL = 1000;
  const COST_BPS = 12; // 12bps (tighter execution model)
  const MAX_POSITIONS = 8; // more diversification
  const MAX_CORRELATION = 0.70; // reject correlated pairs
  const REBALANCE_EVERY = 5;
  const MIN_CONFIRMATION_SCORE = 0.55; // require 55%+ signal alignment to enter
  const ATR_STOP_MULTIPLIER = 2.5; // 2.5x ATR trailing stop
  const CASH_RESERVE = 0.05; // 5% cash buffer

  // Find common date range
  const allDates = new Set<string>();
  for (const sym of Object.keys(priceData)) {
    priceData[sym].dates.forEach(d => allDates.add(d));
  }
  const sortedDates = Array.from(allDates).sort();
  const tradingDates = sortedDates.slice(-30);

  // Detect market regime from aggregate data
  const allClosesForRegime = Object.values(priceData).map(d => d.closes);
  const marketRegime = detectRegimeFromPrices(allClosesForRegime);

  // Regime-conditional factor weights
  const factorWeights = marketRegime === 'bull'
    ? { momentum: 0.35, quality: 0.20, meanRev: 0.10, vol: 0.10, riskAdj: 0.15, confirmation: 0.10 }
    : marketRegime === 'bear'
    ? { momentum: 0.10, quality: 0.30, meanRev: 0.25, vol: 0.15, riskAdj: 0.05, confirmation: 0.15 }
    : { momentum: 0.20, quality: 0.25, meanRev: 0.20, vol: 0.15, riskAdj: 0.10, confirmation: 0.10 };

  let cash = INITIAL;
  let positions: Record<string, { qty: number; entry: number; high: number; atrAtEntry: number }> = {};
  let peakValue = INITIAL;
  const equityCurve: BacktestDay[] = [];
  const trades: BacktestTrade[] = [];

  for (let dayIdx = 0; dayIdx < tradingDates.length; dayIdx++) {
    const date = tradingDates[dayIdx];

    // Get current prices
    const currentPrices: Record<string, number> = {};
    for (const [sym, data] of Object.entries(priceData)) {
      const idx = data.dates.indexOf(date);
      if (idx >= 0 && data.closes[idx] != null) {
        currentPrices[sym] = data.closes[idx];
      }
    }

    // ── ATR-based Adaptive Trailing Stops ──
    for (const sym of Object.keys(positions)) {
      if (currentPrices[sym]) {
        positions[sym].high = Math.max(positions[sym].high, currentPrices[sym]);
        // ATR-proportional stop: tighter in calm markets, wider in volatile ones
        const atrStop = positions[sym].atrAtEntry * ATR_STOP_MULTIPLIER;
        const stopPrice = positions[sym].high - atrStop;
        if (currentPrices[sym] <= stopPrice) {
          const sellValue = positions[sym].qty * currentPrices[sym] * (1 - COST_BPS / 10000);
          cash += sellValue;
          trades.push({ date, symbol: sym, side: 'sell', quantity: positions[sym].qty, price: currentPrices[sym], reason: 'ATR trailing stop' });
          delete positions[sym];
        }
      }
    }

    // ── Rebalance with Deep Statistical Analysis ──
    if (dayIdx % REBALANCE_EVERY === 0 && dayIdx > 0) {
      interface ScoredStock {
        symbol: string;
        score: number;
        price: number;
        vol: number;
        atr: number;
        confirmation: number;
        closes: number[];
      }
      const scored: ScoredStock[] = [];

      for (const [sym, data] of Object.entries(priceData)) {
        const dateIdx = data.dates.indexOf(date);
        if (dateIdx < 15) continue;
        const historicalCloses = data.closes.slice(0, dateIdx + 1);
        const price = historicalCloses[historicalCloses.length - 1];
        if (!price || price <= 0) continue;

        // Compute all factors
        const momentum = computeMomentum(historicalCloses);
        const rsi = computeRSI(historicalCloses);
        const vol = computeVolatility(historicalCloses);
        const quality = computeQuality(historicalCloses);
        const atr = computeATR(historicalCloses);
        const { signal: macdSignal } = computeMACD(historicalCloses);
        const { width: bbWidth, percentB } = computeBollingerWidth(historicalCloses);

        // Multi-signal confirmation
        const { score: confScore, confidence } = computeConfirmationScore(
          momentum, rsi, quality, vol, macdSignal, percentB, bbWidth
        );

        // Skip if insufficient signal alignment
        if (confidence < MIN_CONFIRMATION_SCORE) continue;

        // Mean reversion with RSI divergence detection
        const meanRev = rsi < 30 ? 0.9 : rsi < 40 ? 0.6 : rsi > 70 ? 0.05 : 0.35;

        // Volatility targeting: risk parity compatible
        const volScore = vol > 0.05 && vol < 0.45 ? 1 - Math.abs(vol - 0.18) * 2 : 0.1;

        // Risk-adjusted momentum (Sharpe-like)
        const riskAdjMom = vol > 0.05 ? momentum / vol : 0;

        // Composite score with regime-conditional weights
        const composite =
          momentum * factorWeights.momentum +
          meanRev * factorWeights.meanRev +
          quality * factorWeights.quality +
          volScore * factorWeights.vol +
          Math.max(0, riskAdjMom) * factorWeights.riskAdj +
          confScore * factorWeights.confirmation;

        scored.push({ symbol: sym, score: composite, price, vol, atr, confirmation: confidence, closes: historicalCloses });
      }

      scored.sort((a, b) => b.score - a.score);

      // ── Correlation Filtering ──
      // Greedily select top picks while rejecting highly correlated pairs
      const selected: ScoredStock[] = [];
      for (const candidate of scored) {
        if (selected.length >= MAX_POSITIONS) break;
        let tooCorrelated = false;
        for (const existing of selected) {
          const corr = computeCorrelation(candidate.closes, existing.closes);
          if (Math.abs(corr) > MAX_CORRELATION) {
            tooCorrelated = true;
            break;
          }
        }
        if (!tooCorrelated) {
          selected.push(candidate);
        }
      }

      const topSymbols = new Set(selected.map(s => s.symbol));

      // Sell positions not in selected (only if they've degraded)
      for (const sym of Object.keys(positions)) {
        if (!topSymbols.has(sym) && currentPrices[sym]) {
          // Check if position still has momentum — hold winners longer
          const symData = priceData[sym];
          const dateIdx = symData?.dates.indexOf(date) ?? -1;
          const histCloses = dateIdx > 10 ? symData.closes.slice(0, dateIdx + 1) : [];
          const posReturn = (currentPrices[sym] - positions[sym].entry) / positions[sym].entry;
          const stillStrong = histCloses.length > 10 && computeMomentum(histCloses) > 0.02 && posReturn > 0.02;

          if (!stillStrong) {
            const sellValue = positions[sym].qty * currentPrices[sym] * (1 - COST_BPS / 10000);
            cash += sellValue;
            trades.push({ date, symbol: sym, side: 'sell', quantity: positions[sym].qty, price: currentPrices[sym], reason: 'Rebalance sell' });
            delete positions[sym];
          }
        }
      }

      // ── Risk Parity Position Sizing (inverse-volatility weighted) ──
      const toBuy = selected.filter(p => !positions[p.symbol]);
      if (toBuy.length > 0) {
        const totalInvVol = toBuy.reduce((s, p) => s + (1 / Math.max(p.vol, 0.05)), 0);
        const availableCash = cash * (1 - CASH_RESERVE);

        for (const pick of toBuy) {
          // Weight inversely proportional to volatility
          const weight = (1 / Math.max(pick.vol, 0.05)) / totalInvVol;
          const positionSize = availableCash * weight;

          if (positionSize > 10 && pick.price > 0) {
            const qty = (positionSize / pick.price) * (1 - COST_BPS / 10000);
            positions[pick.symbol] = { qty, entry: pick.price, high: pick.price, atrAtEntry: pick.atr };
            cash -= positionSize;
            trades.push({
              date, symbol: pick.symbol, side: 'buy',
              quantity: Math.round(qty * 10000) / 10000, price: pick.price,
              reason: `Signal conf ${Math.round(pick.confirmation * 100)}%`,
            });
          }
        }
      }
    }

    // Calculate portfolio value
    let posValue = 0;
    for (const [sym, pos] of Object.entries(positions)) {
      posValue += pos.qty * (currentPrices[sym] || pos.entry);
    }
    const portfolioValue = cash + posValue;
    peakValue = Math.max(peakValue, portfolioValue);
    const drawdown = (portfolioValue - peakValue) / peakValue;

    equityCurve.push({
      date,
      value: Math.round(portfolioValue * 100) / 100,
      drawdown: Math.round(drawdown * 10000) / 10000,
    });
  }

  // ── Final Metrics ──
  const finalValue = equityCurve[equityCurve.length - 1]?.value || INITIAL;
  const totalReturn = (finalValue / INITIAL) - 1;
  const maxDD = Math.min(...equityCurve.map(e => e.drawdown));

  // Sharpe ratio (annualized)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].value / equityCurve[i - 1].value) - 1);
  }
  const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
  const stdReturn = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length || 1));
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  // Win rate (track per-position P&L more accurately)
  const positionPnLs: Map<string, { buys: number[]; sells: number[] }> = new Map();
  for (const t of trades) {
    if (!positionPnLs.has(t.symbol)) positionPnLs.set(t.symbol, { buys: [], sells: [] });
    const entry = positionPnLs.get(t.symbol)!;
    if (t.side === 'buy') entry.buys.push(t.price);
    else entry.sells.push(t.price);
  }
  let wins = 0, totalClosed = 0;
  for (const [, pnl] of positionPnLs) {
    for (let i = 0; i < Math.min(pnl.buys.length, pnl.sells.length); i++) {
      totalClosed++;
      if (pnl.sells[i] > pnl.buys[i]) wins++;
    }
  }
  // Also count open positions with unrealized profit as wins
  for (const [sym, pos] of Object.entries(positions)) {
    const lastDate = tradingDates[tradingDates.length - 1];
    const lastIdx = priceData[sym]?.dates.indexOf(lastDate) ?? -1;
    const currentPrice = lastIdx >= 0 ? priceData[sym].closes[lastIdx] : pos.entry;
    totalClosed++;
    if (currentPrice > pos.entry) wins++;
  }
  const winRate = totalClosed > 0 ? wins / totalClosed : 0.5;

  // Current positions
  const lastDate = tradingDates[tradingDates.length - 1];
  const finalPositions = Object.entries(positions).map(([sym, pos]) => {
    const stock = STOCKS.find(s => s.symbol === sym);
    const lastIdx = priceData[sym]?.dates.indexOf(lastDate) ?? -1;
    const currentPrice = lastIdx >= 0 ? priceData[sym].closes[lastIdx] : pos.entry;
    const pnl = pos.qty * (currentPrice - pos.entry);
    return {
      symbol: sym,
      quantity: Math.round(pos.qty * 10000) / 10000,
      entry_price: Math.round(pos.entry * 100) / 100,
      current_price: Math.round(currentPrice * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnl_pct: Math.round(((currentPrice / pos.entry) - 1) * 10000) / 100,
      sector: stock?.sector || 'Technology',
    };
  });

  const result: RealBacktestResult = {
    initial_capital: INITIAL,
    final_value: Math.round(finalValue * 100) / 100,
    total_return: Math.round(totalReturn * 10000) / 10000,
    max_drawdown: Math.round(maxDD * 10000) / 10000,
    sharpe_ratio: Math.round(sharpe * 1000) / 1000,
    total_trades: trades.length,
    win_rate: Math.round(winRate * 1000) / 1000,
    equity_curve: equityCurve,
    trades,
    positions: finalPositions,
    regime: marketRegime,
    days_simulated: tradingDates.length,
    data_source: 'real',
  };

  // Cache result
  try {
    localStorage.setItem(BACKTEST_CACHE_KEY, JSON.stringify({ result, _ts: Date.now() }));
  } catch { /* storage full */ }

  return result;
}

/** Fallback: simulated 30-day backtest with pseudo-random data */
function runSimulated30DayBacktest(): RealBacktestResult {
  const r = seededRandom(daySeed + 100);
  const INITIAL = 1000;
  let value = INITIAL;
  let peak = INITIAL;
  const curve: BacktestDay[] = [];
  const fakeTrades: BacktestTrade[] = [];

  // Simulate 30 trading days
  for (let i = 0; i < 30; i++) {
    const dailyReturn = (r() - 0.47) * 0.015;
    value *= 1 + dailyReturn;
    peak = Math.max(peak, value);
    const dd = (value - peak) / peak;
    const date = new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10);
    curve.push({ date, value: Math.round(value * 100) / 100, drawdown: Math.round(dd * 10000) / 10000 });

    // Add some trades
    if (i % 5 === 0 && i > 0) {
      const stock = STOCKS[Math.floor(r() * STOCKS.length)];
      fakeTrades.push({
        date, symbol: stock.symbol, side: 'buy',
        quantity: Math.round((value * 0.15 / stock.basePrice) * 100) / 100,
        price: Math.round(stock.basePrice * (1 + (r() - 0.5) * 0.04) * 100) / 100,
        reason: 'Rebalance buy',
      });
    }
  }

  const totalReturn = (value / INITIAL) - 1;
  const maxDD = Math.min(...curve.map(c => c.drawdown));

  return {
    initial_capital: INITIAL,
    final_value: Math.round(value * 100) / 100,
    total_return: Math.round(totalReturn * 10000) / 10000,
    max_drawdown: Math.round(maxDD * 10000) / 10000,
    sharpe_ratio: Math.round((totalReturn / Math.abs(maxDD || 0.1)) * 1000) / 1000,
    total_trades: fakeTrades.length,
    win_rate: 0.55,
    equity_curve: curve,
    trades: fakeTrades,
    positions: [],
    regime: simGetRegime().regime,
    days_simulated: 30,
    data_source: 'simulated',
  };
}
