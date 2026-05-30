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
