import {
  simGetRegime,
  simGetRankings,
  simGetSectorRotation,
  simScanSignals,
  simGetTechnicals,
  simQuickBacktest,
  simGetRiskLimits,
  simGetBrokerStatus,
  simGetTargetPortfolio,
  simGetPaperStatus,
  simRunPaperCycle,
  simResetPaper,
  simGetPaperTrades,
} from './simulation';

const API_URL = import.meta.env.VITE_API_URL || '';
const BASE = `${API_URL}/api`;

/** True when we've detected the backend is unreachable. */
let offlineMode = false;

function getToken(): string | null {
  return localStorage.getItem('quest_token');
}

export function setToken(token: string) {
  localStorage.setItem('quest_token', token);
}

export function clearToken() {
  localStorage.removeItem('quest_token');
  localStorage.removeItem('quest_user');
}

export function getStoredUser(): { user_id: number; email: string; display_name: string } | null {
  const raw = localStorage.getItem('quest_user');
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: { user_id: number; email: string; display_name: string }) {
  localStorage.setItem('quest_user', JSON.stringify(user));
}

export function isOffline(): boolean {
  return offlineMode;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...init?.headers as Record<string, string> };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired — please log in again');
  }
  if (res.status === 404) {
    const text = await res.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html') || !text.startsWith('{')) {
      offlineMode = true;
      throw new Error('OFFLINE');
    }
    throw new Error(`Not found: ${path}`);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

/** Wrap an API call: try remote, on network error or OFFLINE fall back to sim. */
function withFallback<T>(apiFn: () => Promise<T>, simFn: () => T): () => Promise<T> {
  return async () => {
    if (offlineMode) return simFn();
    try {
      return await apiFn();
    } catch (err: any) {
      if (err.message === 'OFFLINE' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        offlineMode = true;
        return simFn();
      }
      throw err;
    }
  };
}

// Auth — no simulation fallback (needs real backend)
export const register = (email: string, password: string, display_name?: string) =>
  fetchJson<any>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  });

export const login = (email: string, password: string) =>
  fetchJson<any>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getProfile = () => fetchJson<any>('/auth/me');

// Strategies
export const getRegime = withFallback(
  () => fetchJson<any>('/strategies/regime'),
  simGetRegime,
);
export const getRankings = (topN = 20) =>
  withFallback(
    () => fetchJson<any>(`/strategies/rankings?top_n=${topN}`),
    () => simGetRankings(topN),
  )();
export const getSectorRotation = withFallback(
  () => fetchJson<any>('/strategies/sector-rotation'),
  simGetSectorRotation,
);
export const getStrategyConfig = () =>
  withFallback(
    () => fetchJson<any>('/strategies/config'),
    () => ({
      universe_size: 20,
      max_positions: 8,
      rebalance_days: 21,
      regime: simGetRegime().regime,
    }),
  )();

// Portfolio
export const getTargetPortfolio = (value = 1000) =>
  withFallback(
    () => fetchJson<any>(`/portfolio/target?portfolio_value=${value}`),
    simGetTargetPortfolio,
  )();
export const getPortfolioHistory = (limit = 90) =>
  withFallback(
    () => fetchJson<any>(`/portfolio/history?limit=${limit}`),
    () => ({ snapshots: [] }),
  )();

// Signals
export const scanSignals = (minStrength = 0.2) =>
  withFallback(
    () => fetchJson<any>(`/signals/scan?min_strength=${minStrength}`),
    simScanSignals,
  )();
export const getTechnicals = (symbol: string) =>
  withFallback(
    () => fetchJson<any>(`/signals/technicals/${symbol}`),
    () => simGetTechnicals(symbol),
  )();

// Backtest
export const runBacktest = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  return withFallback(
    () => fetchJson<any>(`/backtest/run?${qs}`, { method: 'POST' }),
    simQuickBacktest,
  )();
};
export const quickBacktest = withFallback(
  () => fetchJson<any>('/backtest/quick'),
  simQuickBacktest,
);

// Broker
export const getBrokerStatus = withFallback(
  () => fetchJson<any>('/broker/status'),
  simGetBrokerStatus,
);
export const getAccount = (broker = 'alpaca') =>
  withFallback(
    () => fetchJson<any>(`/broker/account?broker=${broker}`),
    () => ({ status: 'not_configured' }),
  )();
export const getPositions = (broker = 'alpaca') =>
  withFallback(
    () => fetchJson<any>(`/broker/positions?broker=${broker}`),
    () => ({ positions: [] }),
  )();
export const getOrders = (broker = 'alpaca') =>
  withFallback(
    () => fetchJson<any>(`/broker/orders?broker=${broker}`),
    () => ({ orders: [] }),
  )();
export const placeOrder = (order: any) =>
  fetchJson<any>('/broker/order', { method: 'POST', body: JSON.stringify(order) });

// Risk
export const getRiskSummary = (value = 1000) =>
  withFallback(
    () => fetchJson<any>(`/risk/summary?portfolio_value=${value}`),
    () => ({ portfolio_value: value, risk_score: 'moderate', limits: simGetRiskLimits() }),
  )();
export const getRiskLimits = withFallback(
  () => fetchJson<any>('/risk/limits'),
  simGetRiskLimits,
);
export const getKellySize = (params: Record<string, number>) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  return withFallback(
    () => fetchJson<any>(`/risk/kelly?${qs}`),
    () => ({ kelly_fraction: 0.12, half_kelly: 0.06, recommended_pct: 6 }),
  )();
};

// Paper trading
export const getPaperStatus = withFallback(
  () => fetchJson<any>('/paper/status'),
  simGetPaperStatus,
);
export const runPaperCycle = withFallback(
  () => fetchJson<any>('/paper/cycle', { method: 'POST' }),
  simRunPaperCycle,
);
export const resetPaper = (capital = 1000) =>
  withFallback(
    () => fetchJson<any>(`/paper/reset?initial_capital=${capital}`, { method: 'POST' }),
    () => simResetPaper(capital),
  )();
export const getPaperTrades = withFallback(
  () => fetchJson<any>('/paper/trades'),
  simGetPaperTrades,
);
export const getPaperPerformance = withFallback(
  () => fetchJson<any>('/paper/performance'),
  () => ({ daily_returns: [], total_return: 0, sharpe: 0 }),
);
export const getPaperHistory = withFallback(
  () => fetchJson<any>('/paper/history'),
  () => ({ snapshots: [] }),
);

// Health
export const healthCheck = withFallback(
  () => fetchJson<any>('/health'),
  () => ({ status: 'demo', version: '0.1.0' }),
);
