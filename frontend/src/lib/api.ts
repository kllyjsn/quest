const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

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

// Health
export const healthCheck = () => fetchJson<any>('/health');
