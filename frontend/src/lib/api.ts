const API_URL = import.meta.env.VITE_API_URL || '';
const BASE = `${API_URL}/api`;

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
      throw new Error('Backend not connected — set VITE_API_URL to your backend URL');
    }
    throw new Error(`Not found: ${path}`);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

// Auth
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
export const getRegime = () => fetchJson<any>('/strategies/regime');
export const getRankings = (topN = 20) => fetchJson<any>(`/strategies/rankings?top_n=${topN}`);
export const getSectorRotation = () => fetchJson<any>('/strategies/sector-rotation');
export const getStrategyConfig = () => fetchJson<any>('/strategies/config');

// Portfolio
export const getTargetPortfolio = (value = 1000) =>
  fetchJson<any>(`/portfolio/target?portfolio_value=${value}`);
export const getPortfolioHistory = (limit = 90) =>
  fetchJson<any>(`/portfolio/history?limit=${limit}`);

// Signals
export const scanSignals = (minStrength = 0.2) =>
  fetchJson<any>(`/signals/scan?min_strength=${minStrength}`);
export const getTechnicals = (symbol: string) =>
  fetchJson<any>(`/signals/technicals/${symbol}`);

// Backtest
export const runBacktest = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  return fetchJson<any>(`/backtest/run?${qs}`, { method: 'POST' });
};
export const quickBacktest = () => fetchJson<any>('/backtest/quick');

// Broker
export const getBrokerStatus = () => fetchJson<any>('/broker/status');
export const getAccount = (broker = 'alpaca') =>
  fetchJson<any>(`/broker/account?broker=${broker}`);
export const getPositions = (broker = 'alpaca') =>
  fetchJson<any>(`/broker/positions?broker=${broker}`);
export const getOrders = (broker = 'alpaca') =>
  fetchJson<any>(`/broker/orders?broker=${broker}`);
export const placeOrder = (order: any) =>
  fetchJson<any>('/broker/order', { method: 'POST', body: JSON.stringify(order) });

// Risk
export const getRiskSummary = (value = 1000) =>
  fetchJson<any>(`/risk/summary?portfolio_value=${value}`);
export const getRiskLimits = () => fetchJson<any>('/risk/limits');
export const getKellySize = (params: Record<string, number>) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  return fetchJson<any>(`/risk/kelly?${qs}`);
};

// Paper trading
export const getPaperStatus = () => fetchJson<any>('/paper/status');
export const runPaperCycle = () => fetchJson<any>('/paper/cycle', { method: 'POST' });
export const resetPaper = (capital = 1000) =>
  fetchJson<any>(`/paper/reset?initial_capital=${capital}`, { method: 'POST' });
export const getPaperTrades = () => fetchJson<any>('/paper/trades');
export const getPaperPerformance = () => fetchJson<any>('/paper/performance');
export const getPaperHistory = () => fetchJson<any>('/paper/history');

// Health
export const healthCheck = () => fetchJson<any>('/health');
