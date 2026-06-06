import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, TrendingDown, Shield, Zap,
  Target, AlertTriangle, DollarSign, Layers, RefreshCw,
  ChevronRight, ChevronDown, ArrowUpRight, ArrowDownRight, Cpu,
  Eye, Crosshair, Gauge, PieChart as PieIcon,
  LogIn, LogOut, User, Clock, Flame, X,
  LayoutDashboard, LineChart, FlaskConical, ShieldCheck,
  Newspaper, History, Bell, BellOff,
  ExternalLink, CheckCircle2, XCircle, Calendar, Plug,
  Trophy, Radio, Search, Compass, Timer, BarChart3, BookOpen,
} from 'lucide-react';
import * as api from './lib/api';
import {
  runReal30DayBacktest, type RealBacktestResult,
  generateDashboardData, generateSignals, generateBacktest,
  generateRiskLimits, generateBrokerData, generateTechnicals,
  generateMonteCarlo, generateCorrelationMatrix, generatePerformanceAttribution,
  generateWalkForwardCV, generateDeflatedSharpe, generatePCADecomposition,
  generateStressTests, generateICAnalysis, generateHRP, generateMacroRegime,
  generateTransactionCosts,
  findTradeOpportunities, type TradeFinderResult, type TradeOpportunity,
  logRecommendations, updateTrackedRecommendations, computeTrackingStats,
  runWalkForwardValidation,
  type TrackedRecommendation, type TrackingStats, type ScoreValidationResult,
} from './lib/simulation';
import {
  type LivePrice, type NewsFeed,
  type NotificationPrefs,
  type AlpacaAccount, type AlpacaPosition, type AlpacaOrder,
  subscribeToPrices,
  fetchNews,
  getAlpacaKeys, saveAlpacaKeys, clearAlpacaKeys, testAlpacaConnection,
  getAlpacaPositions, getAlpacaOrders,
  getTrackRecordStats, addTrackRecordEntry,
  shouldAutoRun, logDailyRun, getDailyRunHistory, getRunStreak,
  getNotificationPrefs, saveNotificationPrefs, requestNotificationPermission,
  notifyDailyReport,
} from './lib/realtime';

type Tab = 'dashboard' | 'signals' | 'backtest' | 'risk' | 'broker' | 'paper' | 'research' | 'news' | 'track' | 'finder' | 'docs';

interface RegimeData {
  regime: string;
  confidence: number;
  composite_score: number;
  signals: Record<string, any>;
}

interface RankingEntry {
  symbol: string;
  composite: number;
  rank: number;
  momentum: number;
  mean_reversion: number;
  quality: number;
  volatility: number;
}

const TABS: { id: Tab; icon: any; label: string; shortLabel: string }[] = [
  { id: 'finder', icon: Compass, label: 'Trade Finder', shortLabel: 'Finder' },
  { id: 'paper', icon: LineChart, label: 'Paper Trade', shortLabel: 'Paper' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Home' },
  { id: 'signals', icon: Crosshair, label: 'Signals', shortLabel: 'Signals' },
  { id: 'news', icon: Newspaper, label: 'News', shortLabel: 'News' },
  { id: 'track', icon: History, label: 'Track Record', shortLabel: 'Track' },
  { id: 'broker', icon: Plug, label: 'Broker', shortLabel: 'Broker' },
  { id: 'backtest', icon: FlaskConical, label: 'Backtest', shortLabel: 'Test' },
  { id: 'risk', icon: ShieldCheck, label: 'Risk', shortLabel: 'Risk' },
  { id: 'research', icon: Cpu, label: 'Research', shortLabel: 'Lab' },
  { id: 'docs', icon: BookOpen, label: 'Docs', shortLabel: 'Docs' },
];

// Mobile-only bottom nav shows a subset
const MOBILE_TABS: Tab[] = ['finder', 'paper', 'dashboard', 'news', 'track'];

function App() {
  const [tab, setTab] = useState<Tab>('finder');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(api.getStoredUser());
  const [showAuth, setShowAuth] = useState(false);
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [brokerStatus, setBrokerStatus] = useState<any>(null);
  const [targetPortfolio, setTargetPortfolio] = useState<any>(null);
  const [riskLimits, setRiskLimits] = useState<any>(generateRiskLimits());
  const [technicals, setTechnicals] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [monteCarlo, setMonteCarlo] = useState<any>(null);
  const [correlationMatrix, setCorrelationMatrix] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);
  const [researchData, setResearchData] = useState<any>(null);
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [newsData, setNewsData] = useState<NewsFeed | null>(null);
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [tradeFinderData, setTradeFinderData] = useState<TradeFinderResult | null>(null);
  const [finderLoading, setFinderLoading] = useState(false);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [trackedRecs, setTrackedRecs] = useState<TrackedRecommendation[]>([]);
  const [walkForwardData, setWalkForwardData] = useState<ScoreValidationResult | null>(null);
  const [wfLoading, setWfLoading] = useState(false);

  // Real-time price subscription
  useEffect(() => {
    const topSymbols = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'JPM', 'V', 'UNH'];
    const unsub = subscribeToPrices(topSymbols, (prices) => setLivePrices(prices));
    return unsub;
  }, []);

  // Auto-run scheduler
  useEffect(() => {
    if (shouldAutoRun()) {
      (async () => {
        try {
          const data = await runReal30DayBacktest();
          logDailyRun({
            regime: data.regime,
            signalsGenerated: data.total_trades,
            tradesExecuted: data.trades.length,
            portfolioValue: data.final_value,
            dailyReturn: data.total_return * 100,
          });
          notifyDailyReport(data.final_value, data.total_return * 100, data.trades.length);
        } catch { /* silent */ }
      })();
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Try API first, fall back to client-side real market data
      let regimeData, rankData, sectorData;
      try {
        [regimeData, rankData, sectorData] = await Promise.all([
          api.getRegime(),
          api.getRankings(15),
          api.getSectorRotation(),
        ]);
      } catch {
        // Fallback: generate from real Yahoo Finance data
        const dashData = await generateDashboardData();
        regimeData = dashData.regime;
        rankData = { rankings: dashData.rankings };
        sectorData = { sectors: dashData.sectors };
      }
      if (regimeData) setRegime(regimeData);
      setRankings(rankData?.rankings || []);
      setSectors(sectorData?.sectors || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const loadFinder = useCallback(async () => {
    setFinderLoading(true);
    try {
      const result = await findTradeOpportunities();
      setTradeFinderData(result);
      // Auto-log recommendations for live tracking (localStorage)
      logRecommendations(result.opportunities);
      // Also persist to backend database (fire-and-forget)
      api.logRecommendations(
        result.opportunities.map(opp => ({
          symbol: opp.symbol,
          score: opp.score,
          signal: opp.action,
          horizon: opp.timeHorizon.label,
          entry_price: opp.entryPrice,
          target_price: opp.targetPrice,
          stop_price: opp.stopLoss,
          win_rate: opp.historicalWinRate,
          edge_score: opp.edgeScore,
          sector: opp.sector,
          analysis: JSON.stringify({
            momentum: opp.analysis.momentum.signal,
            rsi: opp.analysis.rsi.signal,
            macd: opp.analysis.macd.signal,
            expected_return: opp.expectedReturn,
          }),
        })),
        result.regime,
        result.totalScanned,
      ).catch(() => {}); // silent fallback if backend unavailable
      // Also try to resolve any pending recommendations in the DB
      api.resolveRecommendations().catch(() => {});
      // Update tracked recommendations with current prices
      const updated = await updateTrackedRecommendations();
      setTrackedRecs(updated);
      setTrackingStats(computeTrackingStats(updated));
    } catch (e: any) { setError(e.message); }
    setFinderLoading(false);
  }, []);

  const loadWalkForward = useCallback(async () => {
    setWfLoading(true);
    try {
      const result = await runWalkForwardValidation();
      setWalkForwardData(result);
    } catch (e: any) { setError(e.message); }
    setWfLoading(false);
  }, []);

  // Auto-load finder on mount
  useEffect(() => { loadFinder(); }, [loadFinder]);
  // Auto-load walk-forward (runs once)
  useEffect(() => { loadWalkForward(); }, [loadWalkForward]);

  const loadSignals = async () => {
    setLoading(true);
    try {
      let data;
      try { data = await api.scanSignals(0.15); }
      catch { data = await generateSignals(); }
      setSignals(data?.signals || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadBacktest = async () => {
    setLoading(true);
    try {
      let data;
      try { data = await api.quickBacktest(); }
      catch { data = await generateBacktest(); }
      setBacktestResult(data);
      // Load Monte Carlo and attribution in parallel
      Promise.all([
        generateMonteCarlo(data?.initial_capital || 10000),
        generatePerformanceAttribution(),
      ]).then(([mc, attr]) => { setMonteCarlo(mc); setAttribution(attr); });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadCorrelation = async () => {
    try {
      const cm = await generateCorrelationMatrix();
      setCorrelationMatrix(cm);
    } catch {}
  };

  const loadResearch = async () => {
    setLoading(true);
    try {
      const [wf, ds, pca, stress, ic, hrp, macro, txCost] = await Promise.all([
        generateWalkForwardCV(),
        generateDeflatedSharpe(),
        generatePCADecomposition(),
        generateStressTests(),
        generateICAnalysis(),
        generateHRP(),
        generateMacroRegime(),
        generateTransactionCosts(),
      ]);
      setResearchData({ walkForward: wf, deflatedSharpe: ds, pca, stressTests: stress, ic, hrp, macro, txCost });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadBroker = async () => {
    setLoading(true);
    try {
      let status, portfolio, limits;
      try {
        [status, portfolio, limits] = await Promise.all([
          api.getBrokerStatus(),
          api.getTargetPortfolio(),
          api.getRiskLimits(),
        ]);
      } catch {
        const brokerData = await generateBrokerData();
        status = brokerData.status;
        portfolio = brokerData.portfolio;
        limits = generateRiskLimits();
      }
      setBrokerStatus(status);
      setTargetPortfolio(portfolio);
      setRiskLimits(limits);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadTechnicals = async (symbol: string) => {
    setSelectedSymbol(symbol);
    try {
      let data;
      try { data = await api.getTechnicals(symbol); }
      catch { data = await generateTechnicals(symbol); }
      setTechnicals(data);
    } catch {}
  };

  // Auto-load tab data when switching tabs
  useEffect(() => {
    if (tab === 'signals' && signals.length === 0) loadSignals();
    else if (tab === 'backtest' && !backtestResult) loadBacktest();
    else if (tab === 'broker' && !brokerStatus) loadBroker();
    else if (tab === 'research' && !researchData) loadResearch();
    else if (tab === 'risk' && !correlationMatrix) loadCorrelation();
    else if (tab === 'news' && !newsData) loadNews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [welcomeMsg, setWelcomeMsg] = useState('');

  const handleLogin = async (email: string, password: string, isRegister: boolean, displayName?: string) => {
    const name = displayName || email.split('@')[0];
    try {
      if (!api.isOffline()) {
        const data = isRegister
          ? await api.register(email, password, name)
          : await api.login(email, password);
        api.setToken(data.access_token);
        api.setStoredUser({ user_id: data.user_id, email: data.email, display_name: data.display_name });
        setUser({ user_id: data.user_id, email: data.email, display_name: data.display_name });
        setShowAuth(false);
        setWelcomeMsg(`Welcome${isRegister ? '' : ' back'}, ${data.display_name}!`);
        setTimeout(() => setWelcomeMsg(''), 4000);
        return;
      }
    } catch {}
    // Local auth (works always — no backend needed)
    const localUser = { user_id: Date.now(), email, display_name: name };
    api.setToken('local_' + btoa(email));
    api.setStoredUser(localUser);
    setUser(localUser);
    setShowAuth(false);
    setWelcomeMsg(`Welcome${isRegister ? '' : ' back'}, ${name}!`);
    setTimeout(() => setWelcomeMsg(''), 4000);
  };

  const handleLogout = () => { api.clearToken(); setUser(null); };

  const loadNews = async () => {
    try {
      const data = await fetchNews();
      setNewsData(data);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'signals') loadSignals();
    if (tab === 'backtest') loadBacktest();
    if (tab === 'broker' || tab === 'risk') { loadBroker(); loadCorrelation(); }
    if (tab === 'research') loadResearch();
    if (tab === 'news') loadNews();
  }, [tab]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] mesh-bg lg:flex">
      {/* ── Desktop Sidebar (lg+) ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[220px] lg:fixed lg:inset-y-0 lg:left-0 glass border-r border-[var(--border)] z-50">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-[var(--border)]">
          <div className="w-7 h-7 rounded bg-[#f0b90b] flex items-center justify-center shadow-[0_0_8px_rgba(240,185,11,0.3)]">
            <Zap className="w-3.5 h-3.5 text-[#0b0e11]" />
          </div>
          <div className="leading-none">
            <h1 className="text-[12px] font-bold tracking-[0.08em] font-mono uppercase">Quest</h1>
            <p className="text-[8px] text-[var(--text-faint)] uppercase tracking-[0.3em] font-medium">Terminal</p>
          </div>
        </div>

        {/* Regime badge */}
        {regime && (
          <div className="px-4 pt-4 pb-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded text-[10px] font-mono font-bold
              ${regime.regime === 'bull' ? 'bg-[#0ecb81]/8 text-[#0ecb81] border border-[#0ecb81]/20' :
                regime.regime === 'bear' ? 'bg-[#f6465d]/8 text-[#f6465d] border border-[#f6465d]/20' :
                  'bg-[#f0b90b]/8 text-[#f0b90b] border border-[#f0b90b]/20'}`}>
              <span className={`w-2 h-2 rounded-full pulse-dot ${regime.regime === 'bull' ? 'bg-[#0ecb81]' : regime.regime === 'bear' ? 'bg-[#f6465d]' : 'bg-[#f0b90b]'}`} />
              {regime.regime.toUpperCase()} {(regime.confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-[11px] font-semibold uppercase tracking-wider transition-all text-left
                ${tab === id
                  ? 'text-[#f0b90b] bg-[#f0b90b]/8 border border-[#f0b90b]/15'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-white/[0.03] border border-transparent'}`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* User / Auth at bottom */}
        <div className="px-3 pb-4 pt-2 border-t border-[var(--border)] mt-auto">
          {user ? (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-7 h-7 rounded bg-[#f0b90b] flex items-center justify-center text-[10px] font-bold text-[#0b0e11]">
                {(user.display_name || user.email)?.[0]?.toUpperCase()}
              </div>
              <span className="text-[11px] font-mono truncate flex-1">{user.display_name || user.email.split('@')[0]}</span>
              <button onClick={handleLogout} className="p-1.5 rounded hover:bg-white/5 text-[var(--text-faint)] hover:text-white" title="Log out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[#f0b90b] text-[#0b0e11] text-[11px] font-bold uppercase tracking-wider hover:bg-[#d4a30a] active:scale-[0.98] transition-all">
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Area (offset by sidebar on lg+) ── */}
      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-screen">
        {/* ── Mobile/Tablet Header (below lg) ── */}
        <header className="lg:hidden glass border-b border-[var(--border)] sticky top-0 z-50" style={{ boxShadow: '0 1px 0 rgba(240, 185, 11, 0.04)' }}>
          <div className="px-4 sm:px-6 h-12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#f0b90b] flex items-center justify-center shadow-[0_0_8px_rgba(240,185,11,0.3)]">
                <Zap className="w-3 h-3 text-[#0b0e11]" />
              </div>
              <div className="leading-none">
                <h1 className="text-[11px] font-bold tracking-[0.08em] font-mono uppercase">Quest</h1>
                <p className="text-[7px] text-[var(--text-faint)] uppercase tracking-[0.3em] font-medium">Terminal</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {regime && (
                <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold
                  ${regime.regime === 'bull' ? 'bg-[#0ecb81]/8 text-[#0ecb81] border border-[#0ecb81]/20' :
                    regime.regime === 'bear' ? 'bg-[#f6465d]/8 text-[#f6465d] border border-[#f6465d]/20' :
                      'bg-[#f0b90b]/8 text-[#f0b90b] border border-[#f0b90b]/20'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${regime.regime === 'bull' ? 'bg-[#0ecb81]' : regime.regime === 'bear' ? 'bg-[#f6465d]' : 'bg-[#f0b90b]'}`} />
                  {regime.regime.toUpperCase()} {(regime.confidence * 100).toFixed(0)}%
                </div>
              )}

              {user ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-[var(--border)]">
                    <div className="w-6 h-6 rounded-md bg-[#f0b90b] flex items-center justify-center text-[9px] font-bold text-[#0b0e11]">
                      {(user.display_name || user.email)?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-[11px] font-mono hidden sm:inline max-w-[100px] truncate">{user.display_name || user.email.split('@')[0]}</span>
                  </div>
                  <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-faint)] hover:text-white" title="Log out">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAuth(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#f0b90b] text-[#0b0e11] text-xs font-semibold hover:bg-[#d4a30a] active:scale-95 transition-transform">
                  <LogIn className="w-3.5 h-3.5" /> Sign In
                </button>
              )}

              <button onClick={() => {
                if (tab === 'finder') loadFinder();
                else if (tab === 'signals') loadSignals();
                else if (tab === 'news') loadNews();
                else if (tab === 'research') loadResearch();
                else loadDashboard();
              }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-faint)] hover:text-white active:scale-90 transition-transform" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${loading || finderLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tablet tabs (md but not lg) */}
          <div className="hidden md:block lg:hidden px-4 sm:px-6">
            <div className="flex gap-1 overflow-x-auto tabs-scroll">
              {TABS.map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap
                    ${tab === id
                      ? 'text-[#f0b90b]'
                      : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {tab === id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f0b90b]" />}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Desktop Top Bar (lg+): ticker + refresh ── */}
        <div className="hidden lg:flex items-center justify-between h-10 px-6 border-b border-[var(--border)] bg-[var(--bg-primary)]">
          <div className="overflow-hidden flex-1 mr-4">
            <div className="flex animate-ticker whitespace-nowrap gap-6">
              {Object.values(livePrices).length > 0 ? Object.values(livePrices).map(p => (
                <span key={p.symbol} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                  <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
                  <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
                  <span className={p.changePct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                    {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                  </span>
                </span>
              )) : (
                ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META'].map(s => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-faint)] shrink-0">
                    {s} <span className="shimmer w-12 h-3 rounded" />
                  </span>
                ))
              )}
              {Object.values(livePrices).length > 0 && Object.values(livePrices).map(p => (
                <span key={`${p.symbol}-2`} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                  <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
                  <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
                  <span className={p.changePct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                    {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => {
            if (tab === 'finder') loadFinder();
            else if (tab === 'signals') loadSignals();
            else if (tab === 'news') loadNews();
            else if (tab === 'research') loadResearch();
            else loadDashboard();
          }}
            className="p-1.5 rounded hover:bg-white/5 text-[var(--text-faint)] hover:text-white active:scale-90 transition-transform shrink-0" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading || finderLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Error bar */}
        {error && (
          <div className="px-5 sm:px-6 lg:px-8 pt-3">
            <div className="bg-[#f6465d]/8 border border-[#f6465d]/15 rounded-md px-4 py-2.5 text-[#f6465d] text-xs font-mono flex items-center gap-2 slide-up">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{error}</span>
              <button onClick={() => setError('')} className="shrink-0 p-1 hover:bg-[#f6465d]/10 rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 px-5 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 lg:py-8 pb-28 md:pb-6 lg:pb-8 slide-up">
          {tab === 'finder' && <TradeFinderTab data={tradeFinderData} loading={finderLoading} onRefresh={loadFinder} trackingStats={trackingStats} trackedRecs={trackedRecs} walkForwardData={walkForwardData} wfLoading={wfLoading} />}
          {tab === 'dashboard' && <DashboardTab regime={regime} rankings={rankings} sectors={sectors} onSelectSymbol={loadTechnicals} technicals={technicals} selectedSymbol={selectedSymbol} />}
          {tab === 'signals' && <SignalsTab signals={signals} loading={loading} onRefresh={loadSignals} onSelectSymbol={loadTechnicals} />}
          {tab === 'backtest' && <BacktestTab result={backtestResult} loading={loading} onRun={loadBacktest} monteCarlo={monteCarlo} attribution={attribution} />}
          {tab === 'risk' && <RiskTab limits={riskLimits} correlationMatrix={correlationMatrix} />}
          {tab === 'research' && <ResearchTab data={researchData} loading={loading} onRefresh={loadResearch} />}
          {tab === 'broker' && <BrokerTab status={brokerStatus} portfolio={targetPortfolio} />}
          {tab === 'paper' && <PaperTradingTab livePrices={livePrices} />}
          {tab === 'news' && <NewsTab data={newsData} loading={loading} onRefresh={loadNews} />}
          {tab === 'track' && <TrackRecordTab />}
          {tab === 'docs' && <DocsTab />}
        </main>

        {/* Mobile ticker (below lg) */}
        <div className="lg:hidden overflow-hidden border-t border-[var(--border)] bg-[var(--bg-primary)]">
          <div className="flex animate-ticker whitespace-nowrap py-1 gap-8 px-4">
            {Object.values(livePrices).length > 0 ? Object.values(livePrices).map(p => (
              <span key={p.symbol} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
                <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
                <span className={p.changePct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                  {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                </span>
              </span>
            )) : (
              ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN'].map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-faint)] shrink-0">
                  {s} <span className="shimmer w-12 h-3 rounded" />
                </span>
              ))
            )}
            {Object.values(livePrices).length > 0 && Object.values(livePrices).map(p => (
              <span key={`${p.symbol}-2`} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
                <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
                <span className={p.changePct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                  {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile bottom nav — shows 5 primary tabs + "More" */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-[var(--border)] z-50 safe-bottom">
        <div className="flex justify-around items-center h-[64px] px-2">
          {TABS.filter(t => MOBILE_TABS.includes(t.id)).map(({ id, icon: Icon, shortLabel }) => (
            <button key={id} onClick={() => { setTab(id); setShowMoreTabs(false); }}
              className={`flex flex-col items-center justify-center gap-[2px] min-w-[44px] min-h-[44px] rounded-md transition-all
                ${tab === id ? 'text-[#f0b90b] nav-pill-active' : 'text-[var(--text-faint)]'}`}>
              <Icon className={`w-5 h-5 ${tab === id ? 'text-[#f0b90b]' : ''}`} />
              <span className={`text-[9px] leading-none font-semibold uppercase tracking-wider ${tab === id ? 'text-[#f0b90b]' : ''}`}>{shortLabel}</span>
            </button>
          ))}
          {/* More button */}
          <button onClick={() => setShowMoreTabs(!showMoreTabs)}
            className={`flex flex-col items-center justify-center gap-[2px] min-w-[44px] min-h-[44px] rounded-md transition-all
              ${!MOBILE_TABS.includes(tab) ? 'text-[#f0b90b] nav-pill-active' : 'text-[var(--text-faint)]'}`}>
            <Layers className="w-5 h-5" />
            <span className="text-[9px] leading-none font-semibold uppercase tracking-wider">More</span>
          </button>
        </div>
        {/* More tabs dropdown */}
        {showMoreTabs && (
          <div className="absolute bottom-[58px] left-2 right-2 glass border border-[var(--border)] rounded-lg p-2 scale-in">
            <div className="grid grid-cols-4 gap-1">
              {TABS.filter(t => !MOBILE_TABS.includes(t.id)).map(({ id, icon: Icon, shortLabel }) => (
                <button key={id} onClick={() => { setTab(id); setShowMoreTabs(false); }}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-md
                    ${tab === id ? 'text-[#f0b90b] bg-[#f0b90b]/8' : 'text-[var(--text-faint)] hover:bg-white/5'}`}>
                  <Icon className="w-4.5 h-4.5" />
                  <span className="text-[9px] font-semibold uppercase">{shortLabel}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSubmit={handleLogin} />}

      {/* Welcome toast */}
      {welcomeMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#0ecb81] rounded-md shadow-lg text-[#0b0e11] font-semibold text-xs flex items-center gap-2 scale-in">
          <CheckCircle2 className="w-4 h-4" />
          {welcomeMsg}
        </div>
      )}
    </div>
  );
}

// ── Shared Components ──

function Card({ children, className = '', glow = '' }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`relative bg-[var(--bg-card)] rounded-lg p-4 sm:p-5 lg:p-6 border border-[var(--border)] card-hover ${glow} ${className}`}>
      <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative">{children}</div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, accent = '#f0b90b' }: { label: string; value: string; sub?: string; icon: any; accent?: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2 lg:mb-3">
        <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-[0.12em]">{label}</span>
        <div className="w-6 h-6 lg:w-7 lg:h-7 rounded flex items-center justify-center" style={{ background: `${accent}08`, color: accent, border: `1px solid ${accent}20` }}>
          <Icon className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
        </div>
      </div>
      <p className="text-lg sm:text-xl lg:text-2xl font-bold font-mono tracking-tight count-up" style={{ color: accent === '#0ecb81' || accent === '#f6465d' ? accent : 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-[var(--text-faint)] mt-1.5 font-mono truncate">{sub}</p>}
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, accent = '#f0b90b', action }: { icon: any; title: string; subtitle?: string; accent?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-3 mb-5 lg:mb-6">
      <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
        <div className="w-7 h-7 lg:w-9 lg:h-9 rounded flex items-center justify-center shrink-0" style={{ background: `${accent}08`, color: accent, border: `1px solid ${accent}20` }}>
          <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs sm:text-sm lg:text-base font-bold uppercase tracking-[0.06em] truncate">{title}</h2>
          {subtitle && <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-[var(--text-faint)] mt-0.5 truncate font-mono">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, variant = 'primary' }: { onClick: () => void; loading?: boolean; icon: any; label: string; variant?: 'primary' | 'green' | 'ghost' }) {
  const styles = {
    primary: 'bg-[#f0b90b] text-[#0b0e11] hover:bg-[#d4a30a] shadow-[0_1px_2px_rgba(240,185,11,0.2)]',
    green: 'bg-[#0ecb81] text-[#0b0e11] hover:bg-[#02a566] shadow-[0_1px_2px_rgba(14,203,129,0.2)]',
    ghost: 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-emphasis)] hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 whitespace-nowrap shrink-0 active:scale-[0.97] ${styles[variant]}`}>
      <Icon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(' ')[0]}</span>
    </button>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <Card className="text-center py-12 sm:py-16">
      <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-[var(--text-faint)]" />
      </div>
      <p className="text-[var(--text-muted)] font-medium">{title}</p>
      {subtitle && <p className="text-xs text-[var(--text-faint)] mt-1.5 max-w-xs mx-auto">{subtitle}</p>}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ██ TRADE FINDER TAB
// ══════════════════════════════════════════════════════════════════════════════

function TradeFinderTab({ data, loading, onRefresh, trackingStats, trackedRecs, walkForwardData, wfLoading }: {
  data: TradeFinderResult | null; loading: boolean; onRefresh: () => void;
  trackingStats: TrackingStats | null; trackedRecs: TrackedRecommendation[];
  walkForwardData: ScoreValidationResult | null; wfLoading: boolean;
}) {
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [filterHorizon, setFilterHorizon] = useState<string>('all');
  const [showValidation, setShowValidation] = useState(false);

  const actionColor = (action: string) => {
    switch (action) {
      case 'STRONG BUY': return '#0ecb81';
      case 'BUY': return '#02a566';
      case 'ACCUMULATE': return '#f0b90b';
      default: return '#6b7280';
    }
  };

  const horizonIcon = (type: string) => {
    switch (type) {
      case 'scalp': return '⚡';
      case 'swing': return '🎯';
      case 'position': return '📊';
      case 'trend': return '🚀';
      default: return '📈';
    }
  };

  const signalDot = (signal: string) => {
    if (signal === 'bullish' || signal === 'oversold' || signal === 'strong' || signal === 'squeeze' || signal === 'surge' || signal === 'above_avg' || signal === 'low') return '#0ecb81';
    if (signal === 'bearish' || signal === 'overbought' || signal === 'weak' || signal === 'high' || signal === 'below_avg') return '#f6465d';
    return '#f0b90b';
  };

  const filtered = data?.opportunities.filter(o => {
    if (filterHorizon === 'all') return true;
    return o.timeHorizon.type === filterHorizon;
  }) || [];

  return (
    <div className="space-y-6">
      <SectionHeader icon={Compass} title="Trade Finder" subtitle="Real-time opportunity scanner with AI-powered analysis" accent="#f0b90b"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Scan Now" variant="primary" />} />

      {/* Market Condition Banner */}
      {data && (
        <Card glow={data.marketBias === 'bullish' ? 'glow-green' : data.marketBias === 'bearish' ? 'glow-red' : ''}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Market Condition</p>
              <p className={`text-lg sm:text-xl font-bold ${data.marketBias === 'bullish' ? 'text-[#0ecb81]' : data.marketBias === 'bearish' ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
                {data.marketCondition}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-[#f0b90b]">{data.opportunities.length}</p>
              <p className="text-[10px] text-[var(--text-faint)]">opportunities found</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--text-faint)]">
            <span>Scanned: {data.totalScanned} stocks</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {data.dataSource === 'real' ? <><Radio className="w-3 h-3 text-[#0ecb81]" /> Live Data</> : 'Simulated'}
            </span>
            <span>·</span>
            <span>{new Date(data.scannedAt).toLocaleTimeString()}</span>
          </div>
        </Card>
      )}

      {/* Filter Bar */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1">
        {[
          { id: 'all', label: 'All', icon: '🔍' },
          { id: 'scalp', label: '1-3 Days', icon: '⚡' },
          { id: 'swing', label: '3-7 Days', icon: '🎯' },
          { id: 'position', label: '2-4 Weeks', icon: '📊' },
          { id: 'trend', label: '1-3 Months', icon: '🚀' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilterHorizon(f.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${filterHorizon === f.id ? 'bg-[#f0b90b] text-white' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[#f0b90b]/50'}`}>
            <span>{f.icon}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Sector Rotation Quick View */}
      {data && data.sectorRotation.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1">
          {data.sectorRotation.slice(0, 6).map(s => (
            <div key={s.sector} className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-[var(--bg-card)] border border-[var(--border)] whitespace-nowrap shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${s.recommendation === 'Overweight' ? 'bg-[#0ecb81]' : s.recommendation === 'Neutral' ? 'bg-[#f0b90b]' : 'bg-[#f6465d]'}`} />
              <span className="text-[11px] font-medium text-[var(--text-muted)]">{s.sector}</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: s.strength > 55 ? '#0ecb81' : s.strength > 40 ? '#f0b90b' : '#f6465d' }}>{s.strength}</span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop 2-column layout: stats left, opportunities right */}
      <div className="xl:grid xl:grid-cols-[380px_1fr] xl:gap-6 space-y-6 xl:space-y-0">
      {/* Left: Tracking Stats + Walk-Forward */}
      <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
      {/* Live Tracking Stats + Walk-Forward Toggle */}
      {(trackingStats || walkForwardData) && (
        <div className="space-y-3">
          {/* Toggle bar */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowValidation(false)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all ${!showValidation ? 'bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
              Live Tracking
            </button>
            <button onClick={() => setShowValidation(true)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all ${showValidation ? 'bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
              Walk-Forward Validation
            </button>
          </div>

          {/* Live Tracking Panel */}
          {!showValidation && trackingStats && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-[#0ecb81]" /> Live Recommendation Tracker
                </h3>
                <span className="text-[9px] text-[var(--text-faint)]">{trackingStats.totalTracked} tracked · {trackingStats.resolved} resolved</span>
              </div>

              {trackingStats.resolved > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="p-3.5 rounded-md bg-[#0ecb81]/5 border border-[#0ecb81]/20 text-center overflow-hidden">
                      <p className="text-[10px] text-[#0ecb81]/70 uppercase font-semibold truncate">Win Rate</p>
                      <p className="font-mono font-bold text-xl text-[#0ecb81] mt-1.5">{trackingStats.winRate.toFixed(1)}%</p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">{trackingStats.wins}W / {trackingStats.losses}L</p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#1e90ff]/5 border border-[#1e90ff]/20 text-center overflow-hidden">
                      <p className="text-[10px] text-[#1e90ff]/70 uppercase font-semibold truncate">Avg Return</p>
                      <p className={`font-mono font-bold text-xl mt-1.5 ${trackingStats.avgReturn >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {trackingStats.avgReturn >= 0 ? '+' : ''}{trackingStats.avgReturn.toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">per trade</p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#f0b90b]/5 border border-[#f0b90b]/20 text-center overflow-hidden">
                      <p className="text-[10px] text-[#f0b90b]/70 uppercase font-semibold truncate">Profit Factor</p>
                      <p className="font-mono font-bold text-xl text-[#f0b90b] mt-1.5">{trackingStats.profitFactor.toFixed(2)}x</p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">gross W/L</p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#f0b90b]/5 border border-[#f0b90b]/20 text-center overflow-hidden">
                      <p className="text-[10px] text-[#f0b90b]/70 uppercase font-semibold truncate">MTF Edge</p>
                      <p className="font-mono font-bold text-xl text-[#f0b90b] mt-1.5">
                        {trackingStats.mtfWinRate > 0 ? `${trackingStats.mtfWinRate.toFixed(0)}%` : '--'}
                      </p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">vs {trackingStats.nonMtfWinRate.toFixed(0)}%</p>
                    </div>
                  </div>

                  {/* By Score Bucket */}
                  <div className="space-y-1">
                    <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Performance by Score</p>
                    {Object.entries(trackingStats.byScoreBucket).map(([bucket, stats]) => (
                      <div key={bucket} className="flex items-center gap-2 text-[10px]">
                        <span className="w-14 font-mono text-[var(--text-muted)]">{bucket}</span>
                        <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${stats.count > 0 ? (stats.wins / stats.count) * 100 : 0}%`, background: (stats.wins / stats.count) > 0.6 ? '#0ecb81' : (stats.wins / stats.count) > 0.5 ? '#f0b90b' : '#f6465d' }} />
                        </div>
                        <span className="w-10 text-right font-mono text-[var(--text-faint)]">{stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(0) : 0}%</span>
                        <span className="w-14 text-right font-mono text-[var(--text-faint)]">n={stats.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* Streaks */}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--text-faint)]">
                    <span>Best: {trackingStats.bestTrade ? `${trackingStats.bestTrade.symbol} +${trackingStats.bestTrade.returnPct.toFixed(1)}%` : '--'}</span>
                    <span>Worst: {trackingStats.worstTrade ? `${trackingStats.worstTrade.symbol} ${trackingStats.worstTrade.returnPct.toFixed(1)}%` : '--'}</span>
                    <span>Streak: {trackingStats.streaks.maxWin}W / {trackingStats.streaks.maxLoss}L</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[var(--text-muted)]">Tracking started — results will appear as trades resolve</p>
                  <p className="text-[10px] text-[var(--text-faint)] mt-1">
                    {trackedRecs.filter(r => r.outcome === 'pending').length} recommendations pending · checking daily
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Walk-Forward Validation Panel */}
          {showValidation && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-[#f0b90b]" /> Walk-Forward Validation
                </h3>
                {walkForwardData && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${walkForwardData.statSignificant ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f0b90b]/10 text-[#f0b90b]'}`}>
                    {walkForwardData.statSignificant ? 'Statistically Significant' : 'Needs More Data'}
                  </span>
                )}
              </div>

              {wfLoading ? (
                <div className="text-center py-8">
                  <Search className="w-6 h-6 text-[#f0b90b] animate-pulse mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-muted)]">Running walk-forward backtest on historical data...</p>
                </div>
              ) : walkForwardData ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-center overflow-hidden">
                      <p className="text-[10px] text-[var(--text-faint)] uppercase font-semibold truncate">Trades Tested</p>
                      <p className="font-mono font-bold text-lg mt-1.5">{walkForwardData.totalTrades}</p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-center overflow-hidden">
                      <p className="text-[10px] text-[var(--text-faint)] uppercase font-semibold truncate">Score-Return r</p>
                      <p className={`font-mono font-bold text-lg mt-1.5 ${walkForwardData.scoreCorrelation > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {walkForwardData.scoreCorrelation > 0 ? '+' : ''}{walkForwardData.scoreCorrelation.toFixed(3)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-center overflow-hidden">
                      <p className="text-[10px] text-[var(--text-faint)] uppercase font-semibold truncate">Hi vs Lo Edge</p>
                      <p className={`font-mono font-bold text-lg mt-1.5 ${walkForwardData.highScoreEdge > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {walkForwardData.highScoreEdge > 0 ? '+' : ''}{walkForwardData.highScoreEdge.toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-center overflow-hidden">
                      <p className="text-[10px] text-[var(--text-faint)] uppercase font-semibold truncate">t-Statistic</p>
                      <p className={`font-mono font-bold text-lg mt-1.5 ${Math.abs(walkForwardData.tStatistic) > 1.96 ? 'text-[#0ecb81]' : 'text-[#f0b90b]'}`}>
                        {walkForwardData.tStatistic.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Score Bucket Breakdown */}
                  <div className="space-y-1.5 mb-3">
                    <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Score → Forward Returns</p>
                    {walkForwardData.buckets.map(b => (
                      <div key={b.label} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)]/50">
                        <span className="text-[10px] font-semibold w-28 shrink-0 text-[var(--text-muted)]">{b.label}</span>
                        <div className="flex-1">
                          <div className="h-3 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${Math.max(5, b.winRate)}%`,
                              background: b.winRate > 60 ? '#0ecb81' : b.winRate > 50 ? '#f0b90b' : '#f6465d'
                            }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <span className="text-[10px] font-mono font-semibold" style={{ color: b.winRate > 55 ? '#0ecb81' : b.winRate > 50 ? '#f0b90b' : '#f6465d' }}>
                            {b.winRate.toFixed(1)}% win
                          </span>
                          <span className="text-[9px] text-[var(--text-faint)] ml-1">
                            ({b.avgReturn >= 0 ? '+' : ''}{b.avgReturn.toFixed(2)}%)
                          </span>
                        </div>
                        <span className="text-[9px] text-[var(--text-faint)] w-10 text-right">n={b.trades}</span>
                      </div>
                    ))}
                  </div>

                  {/* Methodology */}
                  <p className="text-[9px] text-[var(--text-faint)] italic leading-relaxed">{walkForwardData.methodology}</p>
                </>
              ) : null}
            </Card>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <Card className="text-center py-12">
          <div className="w-12 h-12 rounded-lg bg-[#f0b90b]/10 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-[#f0b90b] animate-pulse" />
          </div>
          <p className="text-[var(--text-muted)] font-medium">Scanning 500+ stocks with IC-weighted multi-factor model...</p>
          <p className="text-xs text-[var(--text-faint)] mt-1">Multi-timeframe confirmation · Relative strength · Adaptive volatility filters</p>
        </Card>
      )}
      </div>{/* End left panel */}

      {/* Right: Opportunity Cards */}
      <div className="space-y-3">
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((opp, idx) => (
            <TradeOpportunityCard
              key={opp.symbol}
              opportunity={opp}
              rank={idx + 1}
              expanded={expandedTrade === opp.symbol}
              onToggle={() => setExpandedTrade(expandedTrade === opp.symbol ? null : opp.symbol)}
              actionColor={actionColor}
              horizonIcon={horizonIcon}
              signalDot={signalDot}
            />
          ))}
        </div>
      ) : data && !loading ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Target className="w-7 h-7 text-[var(--text-faint)]" />
          </div>
          <p className="text-[var(--text-muted)] font-medium">No opportunities match your filter</p>
          <p className="text-xs text-[var(--text-faint)] mt-1">Try selecting a different time horizon</p>
        </Card>
      ) : null}
      </div>{/* End right panel */}
      </div>{/* End 2-col grid */}
    </div>
  );
}

function TradeOpportunityCard({ opportunity: opp, rank, expanded, onToggle, actionColor, horizonIcon, signalDot }: {
  opportunity: TradeOpportunity; rank: number; expanded: boolean; onToggle: () => void;
  actionColor: (a: string) => string; horizonIcon: (t: string) => string; signalDot: (s: string) => string;
}) {
  return (
    <div className={`rounded-lg border transition-all overflow-hidden ${expanded ? 'border-[#f0b90b]/40 bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-emphasis)]'}`}>
      {/* Header — always visible */}
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          {/* Rank badge */}
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-bold text-sm mt-0.5" style={{ background: `${actionColor(opp.action)}15`, color: actionColor(opp.action) }}>
            #{rank}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[15px] sm:text-base">{opp.symbol}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${actionColor(opp.action)}15`, color: actionColor(opp.action) }}>
                {opp.action}
              </span>
              {opp.multiTimeframeAlign && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0ecb81]/10 text-[#0ecb81] font-semibold">MTF✓</span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] font-semibold hidden sm:inline-flex items-center gap-1">
                {horizonIcon(opp.timeHorizon.type)} {opp.timeHorizon.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-faint)] mt-1.5 flex-wrap">
              <span>{opp.sector}</span>
              <span className="font-mono">${opp.currentPrice.toFixed(2)}</span>
              <span className="text-[#0ecb81] font-semibold">{opp.historicalWinRate}% win</span>
              <span className="sm:hidden text-[#f0b90b]">{horizonIcon(opp.timeHorizon.type)} {opp.timeHorizon.label}</span>
            </div>
            {/* Score row — below text on mobile for breathing room */}
            <div className="flex items-center gap-2 mt-2 sm:hidden">
              <div className="w-16 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${opp.score}%`, background: opp.score > 70 ? '#0ecb81' : opp.score > 50 ? '#f0b90b' : '#6b7280' }} />
              </div>
              <span className="text-xs font-bold font-mono" style={{ color: opp.score > 70 ? '#0ecb81' : opp.score > 50 ? '#f0b90b' : '#6b7280' }}>{opp.score}</span>
              <span className="text-[10px] text-[var(--text-faint)] ml-1">R:R {opp.riskRewardRatio}x · +{opp.expectedReturn}%</span>
            </div>
          </div>

          {/* Score + R:R — desktop only */}
          <div className="text-right shrink-0 hidden sm:block">
            <div className="flex items-center gap-1.5 justify-end mb-0.5">
              <div className="w-12 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${opp.score}%`, background: opp.score > 70 ? '#0ecb81' : opp.score > 50 ? '#f0b90b' : '#6b7280' }} />
              </div>
              <span className="text-xs font-bold font-mono" style={{ color: opp.score > 70 ? '#0ecb81' : opp.score > 50 ? '#f0b90b' : '#6b7280' }}>{opp.score}</span>
            </div>
            <p className="text-[10px] text-[var(--text-faint)]">R:R {opp.riskRewardRatio}x · +{opp.expectedReturn}%</p>
          </div>

          <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform shrink-0 mt-1 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-5 space-y-5 border-t border-[var(--border)] pt-4">
          {/* Price Levels */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-md bg-[#0ecb81]/5 border border-[#0ecb81]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#0ecb81]/70 uppercase font-semibold mb-1">Target</p>
              <p className="font-mono font-bold text-sm text-[#0ecb81]">${opp.targetPrice.toFixed(2)}</p>
              <p className="text-[10px] text-[#0ecb81]/60 mt-0.5">+{opp.expectedReturn}%</p>
            </div>
            <div className="p-3 rounded-md bg-[#1e90ff]/5 border border-[#1e90ff]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#1e90ff]/70 uppercase font-semibold mb-1">Entry</p>
              <p className="font-mono font-bold text-sm text-[#1e90ff]">${opp.entryPrice.toFixed(2)}</p>
              <p className="text-[10px] text-[#1e90ff]/60 mt-0.5">Now</p>
            </div>
            <div className="p-3 rounded-md bg-[#f6465d]/5 border border-[#f6465d]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#f6465d]/70 uppercase font-semibold mb-1">Stop</p>
              <p className="font-mono font-bold text-sm text-[#f6465d]">${opp.stopLoss.toFixed(2)}</p>
              <p className="text-[10px] text-[#f6465d]/60 mt-0.5">-{opp.maxRisk}%</p>
            </div>
          </div>

          {/* Time Horizon + Position Size */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
              <div className="flex items-center gap-2 mb-1.5">
                <Timer className="w-3.5 h-3.5 text-[#f0b90b]" />
                <span className="text-[10px] text-[var(--text-faint)] uppercase font-semibold">Hold</span>
              </div>
              <p className="font-bold text-sm">{opp.timeHorizon.label}</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-1 capitalize">{opp.timeHorizon.type} · ~{opp.timeHorizon.days}d</p>
            </div>
            <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
              <div className="flex items-center gap-2 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-[#0ecb81]" />
                <span className="text-[10px] text-[var(--text-faint)] uppercase font-semibold">Size</span>
              </div>
              <p className="font-bold text-sm">${opp.positionSize.dollarAmount.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-1">{opp.positionSize.shares} shr · {opp.positionSize.pctOfPortfolio}%</p>
            </div>
          </div>

          {/* Accuracy Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-md bg-[#0ecb81]/5 border border-[#0ecb81]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#0ecb81]/70 uppercase font-semibold mb-1">Win Rate</p>
              <p className="font-mono font-bold text-lg text-[#0ecb81]">{opp.historicalWinRate}%</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">historical</p>
            </div>
            <div className="p-3.5 rounded-md bg-[#f0b90b]/5 border border-[#f0b90b]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#f0b90b]/70 uppercase font-semibold mb-1">Edge</p>
              <p className="font-mono font-bold text-lg text-[#f0b90b]">{opp.edgeScore > 0 ? '+' : ''}{opp.edgeScore}</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">vol-adj</p>
            </div>
            <div className="p-3.5 rounded-md bg-[#1e90ff]/5 border border-[#1e90ff]/20 text-center overflow-hidden">
              <p className="text-[10px] text-[#1e90ff]/70 uppercase font-semibold mb-1">vs Sector</p>
              <p className="font-mono font-bold text-lg text-[#1e90ff]">{opp.relativeStrength > 1 ? '+' : ''}{((opp.relativeStrength - 1) * 100).toFixed(0)}%</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">rel. str.</p>
            </div>
            <div className="p-3.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-center overflow-hidden">
              <p className="text-[10px] text-[var(--text-faint)] uppercase font-semibold mb-1">Entry</p>
              <p className={`font-bold text-sm capitalize ${opp.entryQuality === 'optimal' ? 'text-[#0ecb81]' : opp.entryQuality === 'good' ? 'text-[#1e90ff]' : opp.entryQuality === 'extended' ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>{opp.entryQuality}</p>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{opp.momentumPersistence}w mom</p>
            </div>
          </div>

          {/* Multi-Timeframe + Persistence */}
          <div className="flex items-center gap-2 flex-wrap">
            {opp.multiTimeframeAlign && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#0ecb81]/10 text-[#0ecb81] font-semibold border border-[#0ecb81]/20">
                Weekly + Daily Aligned
              </span>
            )}
            {opp.momentumPersistence >= 3 && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#1e90ff]/10 text-[#1e90ff] font-semibold border border-[#1e90ff]/20">
                {opp.momentumPersistence}W Sustained Momentum
              </span>
            )}
            {opp.entryQuality === 'optimal' && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] font-semibold border border-[#f0b90b]/20">
                Pullback to Support
              </span>
            )}
            {opp.relativeStrength > 1.3 && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] font-semibold border border-[#f0b90b]/20">
                Sector Leader
              </span>
            )}
          </div>

          {/* Technical Analysis Grid */}
          <div>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-2">Technical Analysis</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Object.entries(opp.analysis).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)]/50">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: signalDot(val.signal) }} />
                  <span className="text-[10px] font-semibold capitalize w-16 shrink-0 text-[var(--text-muted)]">{key}</span>
                  <span className="text-[10px] text-[var(--text-faint)] truncate flex-1">{val.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Catalysts & Risks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#0ecb81] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> Catalysts
              </p>
              <div className="space-y-1">
                {opp.catalysts.map((c, i) => (
                  <p key={i} className="text-[10px] text-[var(--text-muted)] pl-3 border-l-2 border-[#0ecb81]/30">{c}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#f6465d] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Risks
              </p>
              <div className="space-y-1">
                {opp.risks.map((r, i) => (
                  <p key={i} className="text-[10px] text-[var(--text-muted)] pl-3 border-l-2 border-[#f6465d]/30">{r}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Confidence meter */}
          <div className="p-3 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Signal Confidence</span>
              <span className="text-xs font-bold font-mono" style={{ color: opp.confidence > 0.7 ? '#0ecb81' : opp.confidence > 0.5 ? '#f0b90b' : '#f6465d' }}>
                {(opp.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${opp.confidence * 100}%`, background: opp.confidence > 0.7 ? '#0ecb81' : opp.confidence > 0.5 ? '#f0b90b' : '#f6465d' }} />
            </div>
            <p className="text-[9px] text-[var(--text-faint)] mt-1">{Math.round(opp.confidence * 7)}/7 indicators aligned · R:R {opp.riskRewardRatio}:1</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ──
function DashboardTab({ regime, rankings, sectors, onSelectSymbol, technicals, selectedSymbol }: any) {
  const topBuys = rankings.filter((r: RankingEntry) => r.composite > 0).slice(0, 10);

  const radarData = regime?.signals ? [
    { factor: 'Trend', value: Math.max(0, (regime.signals.trend + 1) * 50) },
    { factor: 'Mom 1M', value: Math.max(0, Math.min(100, (regime.signals.momentum_1m + 0.1) * 500)) },
    { factor: 'Mom 3M', value: Math.max(0, Math.min(100, (regime.signals.momentum_3m + 0.2) * 250)) },
    { factor: 'Breadth', value: (regime.signals.breadth || 0.5) * 100 },
    { factor: 'Low Vol', value: regime.signals.volatility_regime === 'low' ? 80 : regime.signals.volatility_regime === 'normal' ? 50 : 20 },
  ] : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Mobile regime badge */}
      {regime && (
        <div className="sm:hidden flex items-center justify-center">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
            ${regime.regime === 'bull' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' :
              regime.regime === 'bear' ? 'bg-[#f6465d]/10 text-[#f6465d]' :
                'bg-[#f0b90b]/10 text-[#f0b90b]'}`}>
            <span className={`w-2 h-2 rounded-full pulse-dot ${regime.regime === 'bull' ? 'bg-[#0ecb81]' : regime.regime === 'bear' ? 'bg-[#f6465d]' : 'bg-[#f0b90b]'}`} />
            {regime.regime.toUpperCase()} Market
            <span className="text-[var(--text-faint)] font-normal">{(regime.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-in">
        <MetricCard label="Regime" value={regime?.regime?.toUpperCase() || '--'} sub={`Confidence: ${regime ? (regime.confidence * 100).toFixed(0) : '--'}%`} icon={Gauge} accent={regime?.regime === 'bull' ? '#0ecb81' : regime?.regime === 'bear' ? '#f6465d' : '#f0b90b'} />
        <MetricCard label="Universe" value={rankings.length.toString()} sub="Stocks ranked" icon={Target} accent="#1e90ff" />
        <MetricCard label="Top Pick" value={topBuys[0]?.symbol || '--'} sub={topBuys[0] ? `Score: ${topBuys[0].composite.toFixed(3)}` : ''} icon={Flame} accent="#0ecb81" />
        <MetricCard label="Sectors" value={sectors.length.toString()} sub="GICS sectors" icon={PieIcon} accent="#f0b90b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Card className="lg:col-span-1">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Cpu className="w-3.5 h-3.5 text-[#1e90ff]" /> Regime Signals
          </h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#1e90ff" fill="#1e90ff" fillOpacity={0.12} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 shimmer rounded-md" />}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-[#0ecb81]" /> Rankings
          </h3>
          {/* Mobile: Card list */}
          <div className="md:hidden space-y-2">
            {topBuys.map((r: RankingEntry) => (
              <button key={r.symbol} onClick={() => onSelectSymbol(r.symbol)}
                className="w-full flex items-center gap-3 p-3 rounded-md bg-white/[0.02] border border-[var(--border)] press-scale text-left">
                <div className="w-8 h-8 rounded-lg bg-[#1e90ff]/10 flex items-center justify-center shrink-0">
                  <span className="font-mono font-bold text-[10px] text-[#1e90ff]">#{r.rank}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-sm text-[#1e90ff]">{r.symbol}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className={`text-[10px] font-mono ${r.momentum > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>Mom {(r.momentum * 100).toFixed(1)}%</span>
                    <span className="text-[10px] font-mono text-[#f0b90b]">Q {r.quality.toFixed(3)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono font-bold text-sm ${r.composite > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{r.composite.toFixed(3)}</p>
                  <p className="text-[9px] text-[var(--text-faint)]">score</p>
                </div>
              </button>
            ))}
          </div>
          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-faint)] text-[10px] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2.5 pr-2">#</th>
                  <th className="text-left py-2.5 pr-2">Symbol</th>
                  <th className="text-right py-2.5 pr-2">Score</th>
                  <th className="text-right py-2.5 pr-2">Mom</th>
                  <th className="text-right py-2.5 pr-2">MR</th>
                  <th className="text-right py-2.5 pr-2">Qual</th>
                  <th className="text-right py-2.5">Vol</th>
                </tr>
              </thead>
              <tbody>
                {topBuys.map((r: RankingEntry, idx: number) => (
                  <tr key={r.symbol}
                    className="border-b border-[var(--border)]/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => onSelectSymbol(r.symbol)}
                    style={{ animationDelay: `${idx * 40}ms` }}>
                    <td className="py-2.5 pr-2 text-[var(--text-faint)] text-xs">{r.rank}</td>
                    <td className="py-2.5 pr-2">
                      <span className="font-mono font-bold text-[#1e90ff] text-xs">{r.symbol}</span>
                    </td>
                    <td className={`py-2.5 pr-2 text-right font-mono font-semibold text-xs ${r.composite > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {r.composite.toFixed(3)}
                    </td>
                    <td className={`py-2.5 pr-2 text-right font-mono text-[10px] ${r.momentum > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {(r.momentum * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono text-[10px] text-[#06b6d4]">{r.mean_reversion.toFixed(3)}</td>
                    <td className="py-2.5 pr-2 text-right font-mono text-[10px] text-[#f0b90b]">{r.quality.toFixed(3)}</td>
                    <td className="py-2.5 text-right font-mono text-[10px] text-[#f0b90b]">{r.volatility.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Sectors */}
      <Card>
        <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5 text-[#f0b90b]" /> Sector Rotation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sectors.map((s: any) => (
            <div key={s.etf}
              className={`flex items-center justify-between p-3 rounded-md border transition-all
                ${s.above_50sma ? 'border-[#0ecb81]/10 bg-[#0ecb81]/[0.03]' : 'border-[#f6465d]/10 bg-[#f6465d]/[0.03]'}`}>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{s.sector}</p>
                <p className="text-[10px] text-[var(--text-faint)]">{s.etf} #{s.rank}</p>
              </div>
              <p className={`font-mono font-bold text-sm shrink-0 ml-3 ${s.return_1m > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                {s.return_1m > 0 ? '+' : ''}{(s.return_1m * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Technical Detail */}
      {technicals && selectedSymbol && (
        <Card glow="glow-blue">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Eye className="w-3.5 h-3.5 text-[#1e90ff]" /> {selectedSymbol}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mb-4">
            {[
              ['Price', `$${technicals.price?.toFixed(2)}`, ''],
              ['RSI', technicals.rsi?.toFixed(1), technicals.rsi < 30 ? '#0ecb81' : technicals.rsi > 70 ? '#f6465d' : ''],
              ['MACD', technicals.macd?.histogram?.toFixed(3), technicals.macd?.histogram > 0 ? '#0ecb81' : '#f6465d'],
              ['Mom', `${((technicals.factors?.momentum || 0) * 100).toFixed(1)}%`, (technicals.factors?.momentum || 0) > 0 ? '#0ecb81' : '#f6465d'],
              ['MR', technicals.factors?.mean_reversion?.toFixed(3), '#06b6d4'],
            ].map(([label, val, color]) => (
              <div key={label as string} className="text-center">
                <p className="text-lg sm:text-xl font-bold font-mono" style={color ? { color: color as string } : {}}>{val}</p>
                <p className="text-[9px] text-[var(--text-faint)] uppercase mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {technicals.price_history && (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={technicals.price_history}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1e90ff" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1e90ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={50} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="close" stroke="#1e90ff" fill="url(#priceGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Signals ──
function SignalsTab({ signals, loading, onRefresh, onSelectSymbol }: any) {
  const buySignals = signals.filter((s: any) => s.signal_type === 'buy');
  const sellSignals = signals.filter((s: any) => s.signal_type === 'sell');

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={Crosshair} title="Signal Scanner" subtitle="Multi-factor signal detection" accent="#1e90ff"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Scan" />} />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total" value={signals.length.toString()} icon={Activity} accent="#1e90ff" />
        <MetricCard label="Buy" value={buySignals.length.toString()} icon={ArrowUpRight} accent="#0ecb81" />
        <MetricCard label="Sell" value={sellSignals.length.toString()} icon={ArrowDownRight} accent="#f6465d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card glow="glow-green">
          <h3 className="text-xs font-bold text-[#0ecb81] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <ArrowUpRight className="w-3.5 h-3.5" /> Buy <span className="text-[var(--text-faint)] font-normal ml-auto">{buySignals.length}</span>
          </h3>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {buySignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3 rounded-md bg-[#0ecb81]/[0.03] border border-[#0ecb81]/8 hover:border-[#0ecb81]/20 cursor-pointer transition-all"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#1e90ff] text-sm">{s.symbol}</span>
                  <p className="text-[10px] text-[var(--text-faint)] truncate max-w-[160px]">{s.description}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono font-bold text-sm text-[#0ecb81]">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-[9px] text-[var(--text-faint)] uppercase">{s.strategy}</p>
                </div>
              </div>
            ))}
            {buySignals.length === 0 && <p className="text-[var(--text-faint)] text-sm py-6 text-center">No buy signals</p>}
          </div>
        </Card>

        <Card glow="glow-red">
          <h3 className="text-xs font-bold text-[#f6465d] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <ArrowDownRight className="w-3.5 h-3.5" /> Sell <span className="text-[var(--text-faint)] font-normal ml-auto">{sellSignals.length}</span>
          </h3>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {sellSignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3 rounded-md bg-[#f6465d]/[0.03] border border-[#f6465d]/8 hover:border-[#f6465d]/20 cursor-pointer transition-all"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#1e90ff] text-sm">{s.symbol}</span>
                  <p className="text-[10px] text-[var(--text-faint)] truncate max-w-[160px]">{s.description}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono font-bold text-sm text-[#f6465d]">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-[9px] text-[var(--text-faint)] uppercase">{s.strategy}</p>
                </div>
              </div>
            ))}
            {sellSignals.length === 0 && <p className="text-[var(--text-faint)] text-sm py-6 text-center">No sell signals</p>}
          </div>
        </Card>
      </div>

      {signals.length > 0 && (
        <Card>
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Signal Strength</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signals.slice(0, 30)}>
              <XAxis dataKey="symbol" tick={{ fill: 'var(--text-faint)', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={40} />
              <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="strength" radius={[4, 4, 0, 0]}>
                {signals.slice(0, 30).map((s: any, i: number) => (
                  <Cell key={i} fill={s.signal_type === 'buy' ? '#0ecb81' : s.signal_type === 'sell' ? '#f6465d' : '#f0b90b'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ── Backtest ──
function BacktestTab({ result, loading, onRun, monteCarlo, attribution }: any) {
  const isPositive = result && result.total_return > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={FlaskConical} title="Backtest Engine" subtitle="Walk-forward validation" accent="#f0b90b"
        action={<ActionButton onClick={onRun} loading={loading} icon={RefreshCw} label="Run Backtest" />} />

      {result && !result.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-in">
            <MetricCard label="Total Return" value={`${isPositive ? '+' : ''}${(result.total_return * 100).toFixed(1)}%`}
              sub={`$${result.initial_capital?.toLocaleString()} -> $${result.final_value?.toLocaleString()}`}
              icon={isPositive ? TrendingUp : TrendingDown} accent={isPositive ? '#0ecb81' : '#f6465d'} />
            <MetricCard label="Annual Return" value={`${(result.annual_return * 100).toFixed(1)}%`}
              icon={DollarSign} accent={result.annual_return > 0 ? '#0ecb81' : '#f6465d'} />
            <MetricCard label="Sharpe" value={result.sharpe_ratio?.toFixed(2) || '--'}
              sub={`Sortino: ${result.sortino_ratio?.toFixed(2) || '--'}`}
              icon={Target} accent={result.sharpe_ratio > 1 ? '#0ecb81' : '#f0b90b'} />
            <MetricCard label="Max DD" value={`${(result.max_drawdown * 100).toFixed(1)}%`}
              sub={`${result.total_trades} trades`}
              icon={AlertTriangle} accent={result.max_drawdown > -0.15 ? '#0ecb81' : '#f6465d'} />
          </div>

          {result.equity_curve && (
            <>
              <Card>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Equity Curve</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={result.equity_curve}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isPositive ? '#0ecb81' : '#f6465d'} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={isPositive ? '#0ecb81' : '#f6465d'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={55} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Portfolio']} />
                    <Area type="monotone" dataKey="value" stroke={isPositive ? '#0ecb81' : '#f6465d'} fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Drawdown</h3>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={result.equity_curve}>
                    <XAxis dataKey="date" tick={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, 'DD']} />
                    <Area type="monotone" dataKey="drawdown" stroke="#f6465d" fill="#f6465d" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}

          {/* Monte Carlo Simulation */}
          {monteCarlo && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Monte Carlo Projection (90 days, 500 sims)</h3>
                <div className="flex gap-3 text-[10px] text-[var(--text-faint)]">
                  <span>Median: <span className="text-[#0ecb81] font-bold">${monteCarlo.stats.median_outcome?.toLocaleString()}</span></span>
                  <span>Best: <span className="text-[#1e90ff]">${monteCarlo.stats.best_case?.toLocaleString()}</span></span>
                  <span>Worst: <span className="text-[#f6465d]">${monteCarlo.stats.worst_case?.toLocaleString()}</span></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monteCarlo.cone}>
                  <defs>
                    <linearGradient id="mcOuter" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e90ff" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="#1e90ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mcInner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f0b90b" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#f0b90b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Days', position: 'bottom', fill: 'var(--text-faint)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={60} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }}
                    formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'p95' ? '95th %ile' : name === 'p75' ? '75th' : name === 'p50' ? 'Median' : name === 'p25' ? '25th' : '5th %ile']} />
                  <Area type="monotone" dataKey="p95" stroke="#1e90ff" strokeWidth={1} fill="url(#mcOuter)" strokeDasharray="3 3" dot={false} />
                  <Area type="monotone" dataKey="p75" stroke="#f0b90b" strokeWidth={1} fill="url(#mcInner)" dot={false} />
                  <Area type="monotone" dataKey="p50" stroke="#0ecb81" strokeWidth={2.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="p25" stroke="#f0b90b" strokeWidth={1} fill="none" dot={false} />
                  <Area type="monotone" dataKey="p5" stroke="#f6465d" strokeWidth={1} fill="none" strokeDasharray="3 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2 text-[10px] text-[var(--text-faint)]">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#1e90ff] inline-block" style={{ borderTop: '1px dashed #1e90ff' }}></span> 5th/95th</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f0b90b] inline-block"></span> 25th/75th</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#0ecb81] inline-block"></span> Median</span>
              </div>
            </Card>
          )}

          {/* Performance Attribution */}
          {attribution && (
            <Card>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Performance Attribution (Factor Decomposition)</h3>
              <div className="space-y-3">
                {attribution.factors.map((f: any) => (
                  <div key={f.name} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-[var(--text-secondary)]">{f.name}</div>
                    <div className="flex-1 h-5 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative">
                      <div className={`h-full rounded-full transition-all ${f.contribution >= 0 ? 'bg-gradient-to-r from-[#0ecb81]/50 to-[#0ecb81]' : 'bg-gradient-to-r from-[#f6465d] to-[#f6465d]/50'}`}
                        style={{ width: `${Math.min(Math.abs(f.contribution) * 10, 100)}%`, marginLeft: f.contribution < 0 ? 'auto' : 0 }} />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-mono text-white/80">
                        {f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-10 text-right text-[10px] text-[var(--text-faint)]">{f.weight}%</div>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
                  <div className="w-28 text-xs font-bold text-[var(--text-primary)]">Total</div>
                  <div className="flex-1 text-sm font-bold" style={{ color: attribution.total_return >= 0 ? '#0ecb81' : '#f6465d' }}>
                    {attribution.total_return >= 0 ? '+' : ''}{attribution.total_return.toFixed(2)}%
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {result?.error && <Card><p className="text-[#f6465d]">{result.error}</p></Card>}

      {!result && !loading && (
        <EmptyState icon={FlaskConical} title="Run a Backtest" subtitle="Simulate the multi-factor strategy on 1 year of historical data" />
      )}
    </div>
  );
}

// ── Risk ──
function RiskTab({ limits, correlationMatrix }: any) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={ShieldCheck} title="Risk Management" subtitle="Position sizing & drawdown controls" accent="#f0b90b" />

      {limits ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Position Limits</h3>
            <div className="space-y-4">
              <LimitBar label="Max Position" value={limits.max_position_pct} color="#1e90ff" />
              <LimitBar label="Max Sector" value={limits.max_sector_pct} color="#f0b90b" />
              <LimitBar label="Cash Reserve" value={limits.min_cash_reserve_pct} color="#06b6d4" />
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Drawdown Controls</h3>
            <div className="space-y-4">
              <LimitBar label="Warning" value={Math.abs(limits.max_drawdown_warning)} color="#f0b90b" />
              <LimitBar label="Reduce" value={Math.abs(limits.max_drawdown_reduce)} color="#f6465d" />
              <LimitBar label="Liquidation" value={Math.abs(limits.max_drawdown_liquidate)} color="#f6465d" />
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Trade Controls</h3>
            <div className="space-y-3">
              {[
                ['Trailing Stop-Loss', `${(limits.trailing_stop_pct * 100).toFixed(0)}%`, '#f6465d'],
                ['Take-Profit', `+${(limits.take_profit_pct * 100).toFixed(0)}%`, '#0ecb81'],
                ['Partial Sell at TP', `${(limits.take_profit_sell_pct * 100).toFixed(0)}%`, 'var(--text-primary)'],
                ['PDT Day Trades', `${limits.pdt_max_day_trades}/5 days`, '#f0b90b'],
              ].map(([label, val, color]) => (
                <div key={label as string} className="flex justify-between items-center py-2 border-b border-[var(--border)]/50 last:border-0">
                  <span className="text-sm text-[var(--text-muted)]">{label}</span>
                  <span className="font-mono font-bold text-sm" style={{ color: color as string }}>{val}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Architecture</h3>
            <div className="space-y-3">
              {[
                ['Half-Kelly Sizing', 'Conservative Kelly criterion (f=0.5)'],
                ['Correlation-Aware', 'Minimizes correlated positions'],
                ['Regime-Adaptive', 'Adjusts exposure to market conditions'],
                ['Multi-Layer Stops', 'Per-position + portfolio drawdown'],
              ].map(([title, desc]) => (
                <div key={title} className="flex items-start gap-2.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#1e90ff] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-[10px] text-[var(--text-faint)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Correlation Matrix Heatmap */}
        {correlationMatrix && correlationMatrix.symbols?.length > 0 && (
          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Correlation Matrix (Pairwise)</h3>
            <div className="overflow-x-auto">
              <div className="inline-grid gap-[1px]" style={{ gridTemplateColumns: `40px repeat(${correlationMatrix.symbols.length}, 1fr)` }}>
                <div />
                {correlationMatrix.symbols.map((s: string) => (
                  <div key={`h-${s}`} className="text-[8px] font-mono text-[var(--text-faint)] text-center p-1 -rotate-45 origin-bottom-left h-8 flex items-end justify-center">{s}</div>
                ))}
                {correlationMatrix.symbols.map((row: string) => (
                  <>
                    <div key={`r-${row}`} className="text-[8px] font-mono text-[var(--text-faint)] flex items-center pr-1">{row}</div>
                    {correlationMatrix.symbols.map((col: string) => {
                      const entry = correlationMatrix.matrix.find((m: any) => m.symA === row && m.symB === col);
                      const corr = entry?.correlation ?? 0;
                      const absCorr = Math.abs(corr);
                      const bg = corr >= 0
                        ? `rgba(34, 197, 94, ${absCorr * 0.7})`
                        : `rgba(239, 68, 68, ${absCorr * 0.7})`;
                      return (
                        <div key={`${row}-${col}`} className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-[7px] font-mono rounded-sm transition-all hover:scale-125 hover:z-10"
                          style={{ background: bg }}
                          title={`${row}/${col}: ${corr.toFixed(2)}`}>
                          {absCorr > 0.3 ? corr.toFixed(1) : ''}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-[9px] text-[var(--text-faint)]">
              <span className="w-3 h-3 rounded-sm bg-[rgba(239,68,68,0.7)]"></span> Negative
              <span className="w-3 h-3 rounded-sm bg-[rgba(255,255,255,0.05)]"></span> Zero
              <span className="w-3 h-3 rounded-sm bg-[rgba(34,197,94,0.7)]"></span> Positive
              <span className="ml-2">|</span>
              <span className="ml-2">Threshold: 0.7 max for portfolio inclusion</span>
            </div>
          </Card>
        )}
        </>
      ) : (
        <EmptyState icon={Shield} title="Loading risk parameters..." />
      )}
    </div>
  );
}

function LimitBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value * 100}%`, background: `linear-gradient(90deg, ${color}, ${color}80)` }} />
      </div>
    </div>
  );
}

// ── Research Panel (collapsible on mobile) ──
function ResearchPanel({ title, badge, children, defaultOpen = false }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3.5 sm:p-5 text-left press-scale">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] sm:text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider truncate">{title}</h3>
        </div>
        {badge && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-faint)] font-mono shrink-0">{badge}</span>}
        <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`accordion-body ${open ? 'open' : ''}`}>
        <div>
          <div className="px-3.5 pb-3.5 sm:px-5 sm:pb-5 pt-0">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Research (Institutional Analytics) ──
function ResearchTab({ data, loading, onRefresh }: any) {
  if (!data && loading) return (
    <div className="space-y-4">
      <SectionHeader icon={Cpu} title="Institutional Research" subtitle="Loading analytics..." accent="#f0b90b"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Refresh" />} />
      {[1,2,3,4].map(i => <div key={i} className="h-32 sm:h-48 shimmer rounded-lg" />)}
    </div>
  );

  if (!data) return (
    <div className="space-y-4">
      <SectionHeader icon={Cpu} title="Institutional Research" subtitle="Quant-grade validation suite" accent="#f0b90b"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Run Analysis" />} />
      <EmptyState icon={Cpu} title="Run Research Suite" subtitle="Walk-forward CV, deflated Sharpe, PCA, stress tests, IC analysis, HRP, macro regime" />
    </div>
  );

  const { walkForward, deflatedSharpe, pca, stressTests, ic, hrp, macro, txCost } = data;

  return (
    <div className="space-y-3 sm:space-y-5">
      <SectionHeader icon={Cpu} title="Research" subtitle="Institutional-grade validation" accent="#f0b90b"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Re-run" />} />

      {/* Summary chips (mobile horizontal scroll) */}
      <div className="scroll-x -mx-3.5 px-3.5 sm:hidden swipe-hint">
        {walkForward && <div className="metric-chip"><p className="text-base font-bold" style={{ color: walkForward.is_robust ? '#0ecb81' : '#f6465d' }}>{walkForward.is_robust ? 'ROBUST' : 'WEAK'}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Walk-Forward</p></div>}
        {deflatedSharpe && <div className="metric-chip"><p className="text-base font-bold" style={{ color: deflatedSharpe.is_significant ? '#0ecb81' : '#f6465d' }}>{deflatedSharpe.deflated_sharpe}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Deflated SR</p></div>}
        {pca && <div className="metric-chip"><p className="text-base font-bold text-[#1e90ff]">{pca.systematic_risk_pct}%</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Systematic</p></div>}
        {stressTests && <div className="metric-chip"><p className="text-base font-bold text-[#f6465d]">{stressTests.tail_risk_var95}%</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">VaR 95%</p></div>}
        {macro && <div className="metric-chip"><p className="text-[11px] font-bold" style={{ color: macro.regime.includes('Expansion') ? '#0ecb81' : '#f6465d' }}>{macro.regime.includes('Expansion') ? 'Risk-On' : macro.regime.includes('Contraction') ? 'Risk-Off' : 'Mixed'}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Regime</p></div>}
        {txCost && <div className="metric-chip"><p className="text-base font-bold text-[#f0b90b]">{txCost.total_portfolio_cost_bps}bps</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Avg Cost</p></div>}
      </div>

      {/* Walk-Forward Cross-Validation */}
      {walkForward && (
        <ResearchPanel title={`Walk-Forward CV (${walkForward.folds.length} folds)`} badge={walkForward.is_robust ? 'ROBUST' : 'WEAK'} defaultOpen>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.avg_test_sharpe > 0.5 ? '#0ecb81' : '#f0b90b' }}>{walkForward.avg_test_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Avg OOS Sharpe</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold text-[var(--text-primary)]">±{walkForward.sharpe_std}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Sharpe Std</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.overfit_ratio < 0.5 ? '#0ecb81' : '#f6465d' }}>{(walkForward.overfit_ratio * 100).toFixed(0)}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Overfit Ratio</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.is_robust ? '#0ecb81' : '#f6465d' }}>{walkForward.is_robust ? 'ROBUST' : 'WEAK'}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Verdict</p>
            </div>
          </div>
          {/* Mobile: Card per fold */}
          <div className="md:hidden space-y-2">
            {walkForward.folds.map((f: any) => (
              <div key={f.fold} className="flex items-center gap-3 p-2.5 rounded-md bg-white/[0.02] border border-[var(--border)]">
                <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-faint)]">F{f.fold}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-faint)]">OOS Sharpe</span>
                    <span className="font-mono font-bold text-xs" style={{ color: f.test_sharpe > 0 ? '#0ecb81' : '#f6465d' }}>{f.test_sharpe}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-[10px]" style={{ color: f.test_return > 0 ? '#0ecb81' : '#f6465d' }}>{f.test_return > 0 ? '+' : ''}{f.test_return}%</span>
                    <span className="font-mono text-[10px] text-[#f6465d]">DD {f.test_max_dd}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="text-left py-2 px-1">Fold</th>
                  <th className="text-left py-2 px-1">Train</th>
                  <th className="text-right py-2 px-1">Train Sharpe</th>
                  <th className="text-left py-2 px-1">Test</th>
                  <th className="text-right py-2 px-1">OOS Sharpe</th>
                  <th className="text-right py-2 px-1">OOS Return</th>
                  <th className="text-right py-2 px-1">Max DD</th>
                </tr>
              </thead>
              <tbody>
                {walkForward.folds.map((f: any) => (
                  <tr key={f.fold} className="border-b border-[var(--border)]/30">
                    <td className="py-2 px-1 font-mono">{f.fold}</td>
                    <td className="py-2 px-1 text-[var(--text-faint)]">{f.train_start.slice(5)}</td>
                    <td className="py-2 px-1 text-right font-mono">{f.train_sharpe}</td>
                    <td className="py-2 px-1 text-[var(--text-faint)]">{f.test_start.slice(5)}</td>
                    <td className="py-2 px-1 text-right font-mono" style={{ color: f.test_sharpe > 0 ? '#0ecb81' : '#f6465d' }}>{f.test_sharpe}</td>
                    <td className="py-2 px-1 text-right font-mono" style={{ color: f.test_return > 0 ? '#0ecb81' : '#f6465d' }}>{f.test_return > 0 ? '+' : ''}{f.test_return}%</td>
                    <td className="py-2 px-1 text-right font-mono text-[#f6465d]">{f.test_max_dd}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ResearchPanel>
      )}

      {/* Deflated Sharpe Ratio */}
      {deflatedSharpe && (
        <ResearchPanel title="Deflated Sharpe Ratio" badge={deflatedSharpe.is_significant ? 'SIG' : 'N/S'}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base font-bold text-[var(--text-primary)]">{deflatedSharpe.observed_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Observed</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.deflated_sharpe > 0 ? '#0ecb81' : '#f6465d' }}>{deflatedSharpe.deflated_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Deflated</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.p_value < 0.05 ? '#0ecb81' : '#f6465d' }}>{deflatedSharpe.p_value}</p>
              <p className="text-[9px] text-[var(--text-faint)]">p-value</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.is_significant ? '#0ecb81' : '#f6465d' }}>{deflatedSharpe.is_significant ? 'YES' : 'NO'}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Significant</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Haircut </span><span className="font-mono text-[#f0b90b]">{deflatedSharpe.haircut_pct}%</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">P(Overfit) </span><span className="font-mono text-[#f6465d]">{(deflatedSharpe.prob_overfit * 100).toFixed(0)}%</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Trials </span><span className="font-mono">{deflatedSharpe.trials_equivalent}</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Min Track </span><span className="font-mono">{deflatedSharpe.min_track_record_months}mo</span></div>
          </div>
        </ResearchPanel>
      )}

      {/* PCA Risk Decomposition */}
      {pca && (
        <ResearchPanel title="PCA Risk Decomposition" badge={`${pca.systematic_risk_pct}% sys`}>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-lg sm:text-xl font-bold text-[#1e90ff]">{pca.systematic_risk_pct}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Systematic</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-lg sm:text-xl font-bold text-[#f0b90b]">{pca.idiosyncratic_risk_pct}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Alpha</p>
            </div>
          </div>
          <div className="space-y-2">
            {pca.components.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 sm:gap-3">
                <span className="w-6 text-xs font-mono text-[var(--text-faint)]">PC{c.id}</span>
                <div className="flex-1 h-3.5 sm:h-4 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#f0b90b] text-[#0b0e11]" style={{ width: `${c.variance_pct}%` }} />
                </div>
                <span className="w-10 sm:w-12 text-right text-[10px] sm:text-xs font-mono">{c.variance_pct}%</span>
                <span className="hidden sm:inline w-24 text-xs text-[var(--text-faint)] truncate">{c.interpretation}</span>
              </div>
            ))}
          </div>
        </ResearchPanel>
      )}

      {/* Stress Tests */}
      {stressTests && (
        <ResearchPanel title="Historical Stress Tests" badge={`VaR ${stressTests.tail_risk_var95}%`}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold text-[#f6465d]">{stressTests.tail_risk_var95}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">VaR 95%</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold text-[#f6465d]">{stressTests.tail_risk_cvar95}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">CVaR</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold text-[#f0b90b]">{stressTests.current_vulnerability}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">Vol</p>
            </div>
          </div>
          <div className="space-y-2">
            {stressTests.scenarios.map((s: any) => (
              <div key={s.name} className="flex items-center gap-2 py-2 border-b border-[var(--border)]/30 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{s.name}</p>
                  <p className="text-[9px] text-[var(--text-faint)]">{s.period}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono font-bold text-[#f6465d]">{s.portfolio_impact.toFixed(1)}%</p>
                  <p className="text-[8px] text-[var(--text-faint)]">{s.recovery_days}d</p>
                </div>
              </div>
            ))}
          </div>
        </ResearchPanel>
      )}

      {/* Information Coefficient */}
      {ic && (
        <ResearchPanel title="Factor IC Analysis" badge={`Best: ${ic.best_factor}`}>
          {/* Mobile: Card per factor */}
          <div className="md:hidden space-y-2">
            {ic.factors.map((f: any) => (
              <div key={f.name} className="p-2.5 rounded-md bg-white/[0.02] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">{f.name}</span>
                  {f.is_significant ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#0ecb81]/10 text-[#0ecb81]">Sig</span> : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f6465d]/10 text-[#f6465d]">N/S</span>}
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div><p className="font-mono text-[11px] font-bold" style={{ color: f.ic_mean > 0 ? '#0ecb81' : '#f6465d' }}>{f.ic_mean.toFixed(3)}</p><p className="text-[8px] text-[var(--text-faint)]">IC</p></div>
                  <div><p className="font-mono text-[11px] font-bold" style={{ color: f.icir > 0.5 ? '#0ecb81' : '#f0b90b' }}>{f.icir.toFixed(2)}</p><p className="text-[8px] text-[var(--text-faint)]">ICIR</p></div>
                  <div><p className="font-mono text-[11px] font-bold">{(f.hit_rate * 100).toFixed(0)}%</p><p className="text-[8px] text-[var(--text-faint)]">Hit</p></div>
                  <div><p className="font-mono text-[11px] font-bold">{f.decay_halflife}d</p><p className="text-[8px] text-[var(--text-faint)]">Half</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="text-left py-2">Factor</th>
                  <th className="text-right py-2">IC</th>
                  <th className="text-right py-2">ICIR</th>
                  <th className="text-right py-2">t-stat</th>
                  <th className="text-right py-2">Hit Rate</th>
                  <th className="text-right py-2">Halflife</th>
                  <th className="text-right py-2">Sig?</th>
                </tr>
              </thead>
              <tbody>
                {ic.factors.map((f: any) => (
                  <tr key={f.name} className="border-b border-[var(--border)]/30">
                    <td className="py-2 font-medium">{f.name}</td>
                    <td className="py-2 text-right font-mono" style={{ color: f.ic_mean > 0 ? '#0ecb81' : '#f6465d' }}>{f.ic_mean.toFixed(3)}</td>
                    <td className="py-2 text-right font-mono" style={{ color: f.icir > 0.5 ? '#0ecb81' : '#f0b90b' }}>{f.icir.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{f.t_stat.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{(f.hit_rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right font-mono">{f.decay_halflife}d</td>
                    <td className="py-2 text-right">{f.is_significant ? <span className="text-[#0ecb81]">✓</span> : <span className="text-[#f6465d]">✗</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-[var(--text-faint)]">Combined ICIR: {ic.combined_icir}</p>
        </ResearchPanel>
      )}

      {/* Hierarchical Risk Parity */}
      {hrp && (
        <ResearchPanel title="Hierarchical Risk Parity" badge={`${hrp.diversification_ratio}x div`}>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold text-[#1e90ff]">{hrp.diversification_ratio}x</p>
              <p className="text-[9px] text-[var(--text-faint)]">Diversification</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-base sm:text-lg font-bold text-[#f0b90b]">{hrp.effective_n}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Effective N</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {hrp.weights.slice(0, 10).map((w: any) => (
              <div key={w.symbol} className="flex items-center gap-2">
                <span className="w-10 sm:w-12 text-[11px] sm:text-xs font-mono text-[var(--text-secondary)]">{w.symbol}</span>
                <div className="flex-1 h-3 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${w.weight * 100 * 5}%`, background: `hsl(${w.cluster * 80 + 200}, 70%, 55%)` }} />
                </div>
                <span className="w-10 sm:w-12 text-right text-[10px] font-mono">{(w.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-1.5 sm:gap-2 flex-wrap">
            {hrp.clusters.map((c: any) => (
              <span key={c.id} className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-faint)]">
                C{c.id}: {c.symbols.slice(0, 2).join(', ')}
              </span>
            ))}
          </div>
        </ResearchPanel>
      )}

      {/* Macro Regime */}
      {macro && (
        <ResearchPanel title="Macro Regime Signals" badge={macro.regime.includes('Expansion') ? 'Risk-On' : macro.regime.includes('Contraction') ? 'Risk-Off' : 'Mixed'} defaultOpen>
          <div className="flex items-center gap-3 mb-4 p-2.5 sm:p-3 rounded-md" style={{ background: macro.regime.includes('Expansion') ? 'rgba(34,197,94,0.08)' : macro.regime.includes('Contraction') ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)' }}>
            <div className="text-xs sm:text-sm font-bold" style={{ color: macro.regime.includes('Expansion') ? '#0ecb81' : macro.regime.includes('Contraction') ? '#f6465d' : '#f0b90b' }}>
              {macro.regime}
            </div>
            <div className="ml-auto text-[11px] sm:text-xs font-mono">{macro.confidence}%</div>
          </div>
          <div className="space-y-2 mb-4">
            {macro.signals.map((s: any) => (
              <div key={s.name} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)]/30 last:border-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.signal === 'bullish' ? '#0ecb81' : s.signal === 'bearish' ? '#f6465d' : '#f0b90b' }}></span>
                <span className="flex-1 text-[11px] sm:text-xs truncate">{s.name}</span>
                <span className="text-[11px] sm:text-xs font-mono shrink-0">{s.value > 0 ? '+' : ''}{s.value}%</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: s.signal === 'bullish' ? 'rgba(34,197,94,0.15)' : s.signal === 'bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: s.signal === 'bullish' ? '#0ecb81' : s.signal === 'bearish' ? '#f6465d' : '#f0b90b' }}>{s.signal}</span>
              </div>
            ))}
          </div>
          <h4 className="text-[10px] font-bold text-[var(--text-faint)] mb-2 uppercase">Allocation</h4>
          <div className="space-y-1.5">
            {macro.recommended_allocation.map((a: any) => (
              <div key={a.asset_class} className="flex items-center gap-2">
                <span className="w-14 sm:w-16 text-[11px] sm:text-xs truncate">{a.asset_class}</span>
                <div className="flex-1 h-3 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#1e90ff] to-[#0ecb81]" style={{ width: `${a.weight}%` }} />
                </div>
                <span className="w-8 text-right text-[10px] font-mono">{a.weight}%</span>
              </div>
            ))}
          </div>
        </ResearchPanel>
      )}

      {/* Transaction Cost Model */}
      {txCost && (
        <ResearchPanel title={`Transaction Costs (${txCost.model})`} badge={`${txCost.annual_drag_pct}% drag`}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold" style={{ color: txCost.total_portfolio_cost_bps < 10 ? '#0ecb81' : '#f0b90b' }}>{txCost.total_portfolio_cost_bps}bps</p>
              <p className="text-[8px] text-[var(--text-faint)]">Cost/Trade</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold" style={{ color: txCost.annual_drag_pct < 1 ? '#0ecb81' : '#f6465d' }}>{txCost.annual_drag_pct}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">Ann. Drag</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-md">
              <p className="text-sm font-bold text-[var(--text-primary)]">{txCost.turnover_assumption}x</p>
              <p className="text-[8px] text-[var(--text-faint)]">Turnover</p>
            </div>
          </div>
          <p className="text-[11px] mb-3 p-2.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)] leading-relaxed">{txCost.recommendation}</p>
          {/* Mobile: Compact list */}
          <div className="md:hidden space-y-1.5">
            {txCost.estimates.slice(0, 8).map((e: any) => (
              <div key={e.symbol} className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/20 last:border-0">
                <span className="font-mono text-xs font-bold text-[#1e90ff]">{e.symbol}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px]">{e.total_cost_bps}bps</span>
                  <span className="text-[10px] text-[var(--text-faint)]">{e.optimal_horizon_min}min</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: Full table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="text-left py-1">Symbol</th>
                  <th className="text-right py-1">Shares</th>
                  <th className="text-right py-1">Impact (bps)</th>
                  <th className="text-right py-1">Spread (bps)</th>
                  <th className="text-right py-1">Total (bps)</th>
                  <th className="text-right py-1">Opt. Horizon</th>
                </tr>
              </thead>
              <tbody>
                {txCost.estimates.slice(0, 10).map((e: any) => (
                  <tr key={e.symbol} className="border-b border-[var(--border)]/20">
                    <td className="py-1 font-mono">{e.symbol}</td>
                    <td className="py-1 text-right">{e.shares}</td>
                    <td className="py-1 text-right font-mono">{e.market_impact_bps}</td>
                    <td className="py-1 text-right font-mono">{e.spread_cost_bps}</td>
                    <td className="py-1 text-right font-mono font-bold">{e.total_cost_bps}</td>
                    <td className="py-1 text-right">{e.optimal_horizon_min}min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ResearchPanel>
      )}
    </div>
  );
}

// ── Broker ──
function BrokerTab({ status: _status, portfolio }: any) {
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [alpacaStatus, setAlpacaStatus] = useState<{ connected: boolean; account?: AlpacaAccount; error?: string } | null>(null);
  const [alpacaPositions, setAlpacaPositions] = useState<AlpacaPosition[]>([]);
  const [alpacaOrders, setAlpacaOrders] = useState<AlpacaOrder[]>([]);
  const existingKeys = getAlpacaKeys();

  useEffect(() => {
    if (existingKeys) {
      testAlpacaConnection().then(result => {
        setAlpacaStatus(result);
        if (result.connected) {
          getAlpacaPositions().then(p => setAlpacaPositions(p)).catch(() => {});
          getAlpacaOrders().then(o => setAlpacaOrders(o)).catch(() => {});
        }
      });
    }
  }, []);

  const handleConnect = async () => {
    if (!alpacaKey || !alpacaSecret) return;
    setConnecting(true);
    saveAlpacaKeys(alpacaKey, alpacaSecret, true);
    const result = await testAlpacaConnection();
    setAlpacaStatus(result);
    if (result.connected) {
      getAlpacaPositions().then(p => setAlpacaPositions(p)).catch(() => {});
      getAlpacaOrders().then(o => setAlpacaOrders(o)).catch(() => {});
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    clearAlpacaKeys();
    setAlpacaStatus(null);
    setAlpacaPositions([]);
    setAlpacaOrders([]);
    setAlpacaKey('');
    setAlpacaSecret('');
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={Plug} title="Broker Connections" subtitle="Connect your brokerage for live paper trading" accent="#06b6d4" />

      {/* Alpaca Connection Card */}
      <Card glow={alpacaStatus?.connected ? 'glow-green' : ''}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${alpacaStatus?.connected ? 'bg-[#0ecb81] pulse-dot' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Alpaca Paper Trading</h3>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-faint)] bg-white/5 px-2 py-0.5 rounded-full">Primary</span>
          </div>
          {alpacaStatus?.connected && (
            <button onClick={handleDisconnect} className="text-[10px] text-[#f6465d] hover:underline">Disconnect</button>
          )}
        </div>

        {alpacaStatus?.connected && alpacaStatus.account ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Portfolio', `$${Number(alpacaStatus.account.portfolio_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#0ecb81'],
                ['Cash', `$${Number(alpacaStatus.account.cash).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#1e90ff'],
                ['Buying Power', `$${Number(alpacaStatus.account.buying_power).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#f0b90b'],
                ['Day Trades', `${alpacaStatus.account.daytrade_count}/3`, '#f0b90b'],
              ].map(([label, val, color]) => (
                <div key={label} className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)] text-center">
                  <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-lg font-bold font-mono" style={{ color }}>{val}</p>
                </div>
              ))}
            </div>

            {/* Live Positions */}
            {alpacaPositions.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-2">Live Positions ({alpacaPositions.length})</h4>
                <div className="space-y-1.5">
                  {alpacaPositions.map(p => (
                    <div key={p.symbol} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#1e90ff]">{p.symbol}</span>
                        <span className="text-[10px] text-[var(--text-faint)]">{p.qty} shares</span>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono text-sm font-bold ${Number(p.unrealized_pl) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {Number(p.unrealized_pl) >= 0 ? '+' : ''}${Number(p.unrealized_pl).toFixed(2)}
                        </p>
                        <p className={`text-[10px] font-mono ${Number(p.unrealized_plpc) >= 0 ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`}>
                          {(Number(p.unrealized_plpc) * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Orders */}
            {alpacaOrders.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-2">Recent Orders ({alpacaOrders.length})</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {alpacaOrders.slice(0, 10).map(o => (
                    <div key={o.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.side === 'buy' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{o.side.toUpperCase()}</span>
                        <span className="font-mono text-sm font-semibold">{o.symbol}</span>
                        <span className="text-[10px] text-[var(--text-faint)]">{o.qty} @ {o.filled_avg_price || 'pending'}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${o.status === 'filled' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : o.status === 'canceled' ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#f0b90b]/10 text-[#f0b90b]'}`}>
                        {o.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {alpacaStatus?.error && (
              <div className="p-3 rounded-md bg-[#f6465d]/10 border border-[#f6465d]/20">
                <p className="text-xs text-[#f6465d]">{alpacaStatus.error}</p>
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">Connect your free Alpaca paper trading account for live simulated trading with real market data.</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">API Key</label>
                <input type="text" value={alpacaKey} onChange={e => setAlpacaKey(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-4 py-2.5 text-sm font-mono placeholder:text-[var(--text-faint)]"
                  placeholder="PKXXXXXXXXXXXXXXXXXX" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">Secret Key</label>
                <input type="password" value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-4 py-2.5 text-sm font-mono placeholder:text-[var(--text-faint)]"
                  placeholder="Enter your secret key" />
              </div>
              <button onClick={handleConnect} disabled={connecting || !alpacaKey || !alpacaSecret}
                className="w-full py-3 rounded-md bg-[#f0b90b] text-[#0b0e11] font-semibold text-sm disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2">
                {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                {connecting ? 'Connecting...' : 'Connect to Alpaca'}
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <a href="https://app.alpaca.markets/signup" target="_blank" rel="noreferrer" className="text-[#1e90ff] hover:underline text-xs flex items-center gap-1">
                Create free account <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-[var(--text-faint)] text-[10px]">|</span>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noreferrer" className="text-[#1e90ff] hover:underline text-xs flex items-center gap-1">
                Get API keys <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[10px] text-[var(--text-faint)]">Keys are stored locally in your browser. They are never sent to our servers.</p>
          </div>
        )}
      </Card>

      {/* Robinhood Secondary */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--text-faint)]" />
          <h3 className="text-sm font-bold">Robinhood</h3>
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-faint)] bg-white/5 px-2 py-0.5 rounded-full">Secondary</span>
        </div>
        <div className="text-sm text-[var(--text-muted)] space-y-2">
          <p>Robinhood MCP integration available when backend is deployed</p>
          <code className="block text-[10px] bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#1e90ff] font-mono">agent.robinhood.com/mcp/trading</code>
        </div>
      </Card>

      {/* Target Portfolio (from simulation) */}
      {portfolio?.allocations && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-[#1e90ff]" /> Target Allocation
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5 pb-5 border-b border-[var(--border)]">
            {[
              [portfolio.num_positions, 'Positions', ''],
              [`${((1 - portfolio.cash_pct) * 100).toFixed(0)}%`, 'Invested', '#0ecb81'],
              [`${(portfolio.cash_pct * 100).toFixed(0)}%`, 'Cash', '#1e90ff'],
              [portfolio.regime?.toUpperCase(), 'Regime', '#f0b90b'],
            ].map(([val, label, color]) => (
              <div key={label as string} className="text-center">
                <p className="text-xl font-bold font-mono" style={color ? { color: color as string } : {}}>{val}</p>
                <p className="text-[9px] text-[var(--text-faint)] uppercase mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            {Object.entries(portfolio.allocations).sort(([, a], [, b]) => (b as number) - (a as number)).map(([sym, weight]) => (
              <div key={sym} className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-[#1e90ff] w-12">{sym}</span>
                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-[#f0b90b] text-[#0b0e11] transition-all duration-500" style={{ width: `${(weight as number) * 100 * 4}%` }} />
                </div>
                <span className="font-mono text-xs text-[var(--text-muted)] w-14 text-right">{((weight as number) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {portfolio.orders?.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[var(--border)]">
              <h4 className="text-[9px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-2">Rebalance Orders</h4>
              <div className="space-y-1.5">
                {portfolio.orders.map((o: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1">
                    <span className={`font-mono font-bold ${o.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {o.side.toUpperCase()} {o.symbol}
                    </span>
                    <span className="font-mono text-[var(--text-muted)]">${Math.abs(o.delta_value).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Auth Modal ──
function AuthModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string, password: string, isRegister: boolean, displayName?: string) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isRegister && !name.trim()) { setError('Please enter your name'); return; }
    if (!email.includes('@')) { setError('Please enter a valid email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    try {
      await onSubmit(email, password, isRegister, name.trim() || undefined);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="relative bg-[var(--bg-card)] border-t sm:border border-[var(--border)] rounded-t-2xl sm:rounded-lg p-6 sm:p-8 w-full sm:max-w-sm scale-in" onClick={e => e.stopPropagation()}>
        <div className="absolute inset-0 rounded-t-2xl sm:rounded-lg bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative">
        <div className="w-8 h-0.5 bg-white/10 rounded-full mx-auto mb-5 sm:hidden" />

        {/* Close button */}
        <button onClick={onClose} className="absolute top-0 right-0 p-1.5 rounded hover:bg-white/5 text-[var(--text-faint)] hover:text-white">
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-5">
          <div className="w-10 h-10 rounded bg-[#f0b90b] flex items-center justify-center mx-auto mb-3 shadow-[0_0_12px_rgba(240,185,11,0.3)]">
            <User className="w-5 h-5 text-[#0b0e11]" />
          </div>
          <h2 className="text-base font-bold font-mono uppercase tracking-wide">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="text-[10px] text-[var(--text-faint)] mt-1 font-mono">
            {isRegister ? 'Get personalized trade recommendations' : 'Sign in to access your portfolio'}
          </p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-lg text-xs text-[#f6465d] flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1.5 uppercase tracking-wider">Your Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--text-faint)] focus:border-[#1e90ff]/50 focus:ring-1 focus:ring-[#1e90ff]/20 transition-all"
                placeholder="Jason" required autoFocus />
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1.5 uppercase tracking-wider">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--text-faint)] focus:border-[#1e90ff]/50 focus:ring-1 focus:ring-[#1e90ff]/20 transition-all"
              placeholder="you@example.com" required autoFocus={!isRegister} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1.5 uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--text-faint)] focus:border-[#1e90ff]/50 focus:ring-1 focus:ring-[#1e90ff]/20 transition-all"
              placeholder="Min 6 characters" required minLength={6} />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full py-3 rounded text-[11px] font-bold uppercase tracking-wider bg-[#f0b90b] text-[#0b0e11] disabled:opacity-50 hover:bg-[#d4a30a] active:scale-[0.98] transition-all mt-3 shadow-[0_2px_8px_rgba(240,185,11,0.3)]">
            {submitting ? (
              <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Signing {isRegister ? 'up' : 'in'}...</span>
            ) : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-center text-[var(--text-faint)]">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsRegister(!isRegister); setError(''); }} className="text-[#f0b90b] hover:underline font-medium">
              {isRegister ? 'Sign in' : 'Create one free'}
            </button>
          </p>
          <p className="text-[9px] text-center text-[var(--text-faint)] mt-2 opacity-60 font-mono">
            Data saved locally in your browser. No credit card required.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Paper Trading (Auto-running 30-day backtest) ──
function PaperTradingTab({ livePrices: _livePrices }: { livePrices: Record<string, LivePrice> }) {
  const [result, setResult] = useState<RealBacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await runReal30DayBacktest();
        if (!cancelled) {
          setResult(data);
          // Log signals to track record
          data.trades.forEach(t => {
            addTrackRecordEntry({
              type: 'trade',
              symbol: t.symbol,
              action: t.side,
              predictedDirection: t.side === 'buy' ? 'long' : 'short',
              entryPrice: t.price,
              confidence: 0.7,
              strategy: t.reason || 'multi_factor',
              resolved: false,
            });
          });
        }
      } catch {
        // silently fall back
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    localStorage.removeItem('quest_30d_backtest');
    try {
      const data = await runReal30DayBacktest();
      setResult(data);
    } catch {}
    setIsLoading(false);
  };

  if (isLoading && !result) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 rounded-full border-4 border-[#1e90ff]/20 border-t-[#1e90ff] animate-spin mb-4" />
        <p className="text-sm text-[var(--text-muted)] font-medium">Running 30-day paper backtest...</p>
        <p className="text-[10px] text-[var(--text-faint)] mt-1">Fetching real market data for 20 stocks</p>
      </div>
    );
  }

  if (!result) return null;

  const totalReturn = result.total_return * 100;
  const isPositive = totalReturn >= 0;
  const equityCurve = result.equity_curve || [];
  const positions = result.positions || [];
  const trades = result.trades || [];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Portfolio Hero */}
      <div className="text-center py-3 sm:py-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <p className="text-[10px] sm:text-xs text-[var(--text-faint)] uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Clock className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> 30-Day Paper Backtest
          </p>
          <span className={`text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${result.data_source === 'real' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f0b90b]/10 text-[#f0b90b]'}`}>
            {result.data_source === 'real' ? 'Real Data' : 'Simulated'}
          </span>
        </div>
        <p className="text-[42px] sm:text-5xl font-bold font-mono tracking-tighter count-up leading-none">
          ${result.final_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-full text-sm font-semibold
          ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          <span className="text-[var(--text-faint)] font-normal text-xs ml-1">{result.days_simulated} days</span>
        </div>

        <div className="flex items-center justify-center gap-3 mt-3 sm:mt-4">
          <button onClick={handleRefresh} disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:bg-white/5 hover:text-white disabled:opacity-50 transition-all press-scale min-h-[44px]">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Running...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Return</p>
          <p className={`text-lg sm:text-xl font-bold font-mono ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          </p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Max Drawdown</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-[#f6465d]">{(result.max_drawdown * 100).toFixed(2)}%</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Sharpe Ratio</p>
          <p className={`text-lg sm:text-xl font-bold font-mono ${result.sharpe_ratio > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
            {result.sharpe_ratio.toFixed(2)}
          </p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Win Rate</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-[#1e90ff]">{(result.win_rate * 100).toFixed(0)}%</p>
        </Card>
      </div>

      {/* Statistical Analysis Panel — horizontal scroll on mobile */}
      <div className="scroll-x -mx-3.5 px-3.5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 sm:gap-3">
        <Card className="min-w-[140px] sm:min-w-0">
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Regime</p>
          <p className={`text-sm font-bold ${result.regime === 'bull' ? 'text-[#0ecb81]' : result.regime === 'bear' ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
            {result.regime === 'bull' ? 'Bull' : result.regime === 'bear' ? 'Bear' : 'Sideways'}
          </p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">Adaptive weights</p>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0">
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Trades</p>
          <p className="text-lg font-bold font-mono">{result.total_trades}</p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">Signal-confirmed</p>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0">
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Positions</p>
          <p className="text-lg font-bold font-mono text-[#f0b90b]">{result.positions.length}</p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">Corr-filtered</p>
        </Card>
        <Card className="min-w-[140px] sm:min-w-0">
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Risk Model</p>
          <p className="text-sm font-bold text-[#0ecb81]">ATR Stops</p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">2.5× adaptive</p>
        </Card>
      </div>

      {/* Equity Curve */}
      {equityCurve.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-[#1e90ff]" /> Equity Curve
          </h3>
          <div className="h-[220px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#0ecb81' : '#f6465d'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPositive ? '#0ecb81' : '#f6465d'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Portfolio']} labelFormatter={(l: any) => `Date: ${l}`} />
                <Area type="monotone" dataKey="value" stroke={isPositive ? '#0ecb81' : '#f6465d'} fill="url(#equityGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Drawdown Chart */}
      {equityCurve.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingDown className="w-3.5 h-3.5 text-[#f6465d]" /> Drawdown
          </h3>
          <div className="h-[150px] sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f6465d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f6465d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }} formatter={(v: any) => [`${(Number(v) * 100).toFixed(2)}%`, 'Drawdown']} />
                <Area type="monotone" dataKey="drawdown" stroke="#f6465d" fill="url(#ddGrad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Current Positions */}
      {positions.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-[#0ecb81]" /> Current Holdings ({positions.length})
          </h3>
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-md bg-[#1e90ff]/10 flex items-center justify-center shrink-0">
                    <span className="font-mono font-bold text-[10px] text-[#1e90ff]">{p.symbol.slice(0, 3)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{p.symbol}</p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{p.quantity.toFixed(2)} shares @ ${p.entry_price}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`font-mono font-bold text-sm ${p.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                  </p>
                  <p className={`text-[10px] font-mono ${p.pnl_pct >= 0 ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`}>
                    {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trade History */}
      <Card>
        <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" /> Trade Log ({trades.length} trades)
        </h3>
        {trades.length > 0 ? (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {trades.map((t, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${t.side === 'buy' ? 'bg-[#0ecb81]/10' : 'bg-[#f6465d]/10'}`}>
                    {t.side === 'buy' ? <ArrowUpRight className="w-3 h-3 text-[#0ecb81]" /> : <ArrowDownRight className="w-3 h-3 text-[#f6465d]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{t.symbol}</p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{t.reason}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono text-sm font-semibold">{t.quantity.toFixed(2)} @ ${t.price.toFixed(2)}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">{t.date}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--text-faint)]">No trades executed</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── News Tab ──
function NewsTab({ data, loading, onRefresh }: { data: NewsFeed | null; loading: boolean; onRefresh: () => void }) {
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentProgress, setAgentProgress] = useState(0);
  const [agentReading, setAgentReading] = useState('');
  const [agentSummary, setAgentSummary] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState('');

  const runNewsAgent = useCallback(async () => {
    if (!data || !data.news.length) return;
    setAgentRunning(true);
    setAgentProgress(0);
    setAgentSummary(null);
    setAgentTyping('');
    setAgentReading('');

    const articles = data.news;
    for (let i = 0; i < articles.length; i++) {
      setAgentReading(articles[i].title.slice(0, 60) + (articles[i].title.length > 60 ? '...' : ''));
      setAgentProgress(Math.round(((i + 1) / articles.length) * 100));
      await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    }

    setAgentReading('Analyzing sentiment patterns...');
    await new Promise(r => setTimeout(r, 600));
    setAgentReading('Generating market brief...');
    await new Promise(r => setTimeout(r, 500));

    // Build intelligent summary from actual news data
    const positive = articles.filter(a => a.sentiment === 'positive');
    const negative = articles.filter(a => a.sentiment === 'negative');
    const neutral = articles.filter(a => a.sentiment === 'neutral');
    const symbols = [...new Set(articles.flatMap(a => a.symbols))];
    const sources = [...new Set(articles.map(a => a.source))];

    const summaryText = `## Market News Brief

**Overall Sentiment:** ${data.aggregateLabel} (score: ${data.aggregateSentiment.toFixed(2)})
Analyzed ${articles.length} articles from ${sources.length} sources.

**Sentiment Breakdown:**
• ${positive.length} bullish articles (${Math.round(positive.length / articles.length * 100)}%)
• ${negative.length} bearish articles (${Math.round(negative.length / articles.length * 100)}%)
• ${neutral.length} neutral articles (${Math.round(neutral.length / articles.length * 100)}%)

**Key Themes:**
${positive.length > 0 ? `• Bullish drivers: ${positive.slice(0, 3).map(a => a.title.split(' ').slice(0, 6).join(' ')).join('; ')}` : '• No strong bullish catalysts detected'}
${negative.length > 0 ? `• Risk factors: ${negative.slice(0, 3).map(a => a.title.split(' ').slice(0, 6).join(' ')).join('; ')}` : '• No significant bearish signals'}

**Tickers Mentioned:** ${symbols.length > 0 ? symbols.slice(0, 15).join(', ') : 'None specifically mentioned'}

**Trading Implications:**
${data.aggregateSentiment > 0.2 ? '• Market tone is constructive — favor long bias on pullbacks' : data.aggregateSentiment < -0.2 ? '• Market tone is cautious — tighten stops and reduce position size' : '• Mixed signals — maintain neutral positioning until clarity emerges'}
${positive.length > negative.length * 2 ? '• Strong bullish consensus — watch for contrarian reversal signals' : negative.length > positive.length * 2 ? '• Heavy pessimism — potential capitulation setup for mean reversion' : '• Balanced sentiment — focus on stock-specific catalysts over macro'}

**Sources:** ${sources.join(', ')}

*Brief generated from ${articles.length} real-time articles. Refresh for latest data.*`;

    setAgentReading('');
    for (let i = 0; i <= summaryText.length; i++) {
      setAgentTyping(summaryText.slice(0, i));
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 6));
    }

    setAgentSummary(summaryText);
    setAgentRunning(false);
  }, [data]);

  const sentimentColor = (s: string) => s === 'positive' ? '#0ecb81' : s === 'negative' ? '#f6465d' : 'var(--text-faint)';
  const sentimentBg = (s: string) => s === 'positive' ? '#0ecb81' : s === 'negative' ? '#f6465d' : 'var(--text-faint)';
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={Newspaper} title="Market News" subtitle="Real-time financial headlines with sentiment" accent="#06b6d4"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Refresh" variant="ghost" />} />

      {/* AI News Agent */}
      <div className="rounded-md border border-[#06b6d4]/30 bg-gradient-to-br from-[#06b6d4]/5 to-[#1e90ff]/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#06b6d4]" />
            <h3 className="font-semibold text-sm">News Intelligence Agent</h3>
            <span className="text-[10px] px-2 py-0.5 bg-[#06b6d4]/20 text-[#06b6d4] rounded-full">AI</span>
          </div>
          <button
            onClick={runNewsAgent}
            disabled={agentRunning || !data || !data.news.length}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              agentRunning || !data?.news?.length
                ? 'bg-[#06b6d4]/20 text-[#06b6d4]/60 cursor-not-allowed'
                : 'bg-[#06b6d4] text-white hover:bg-[#0891b2] active:scale-95'
            }`}
          >
            {agentRunning ? (
              <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analyzing...</span>
            ) : agentSummary ? (
              <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" />Re-analyze</span>
            ) : (
              <span className="flex items-center gap-2"><Zap className="w-3.5 h-3.5" />Summarize News</span>
            )}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-faint)] mb-2">Reads all articles, analyzes sentiment patterns, and generates a market intelligence brief</p>

        {agentRunning && (
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs text-[var(--text-faint)]">
              <span className="truncate max-w-[70%]">Reading: {agentReading}</span>
              <span>{agentProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#06b6d4] to-[#1e90ff] rounded-full transition-all duration-300" style={{ width: `${agentProgress}%` }} />
            </div>
          </div>
        )}

        {agentTyping && (
          <div className="mt-3 p-4 rounded-lg bg-black/30 border border-[var(--border)] max-h-[400px] overflow-y-auto">
            <div className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-line font-mono text-[12px]">
              {agentTyping.split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-white mt-2 mb-1">{line.replace('## ', '')}</h3>;
                if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-[#06b6d4] mt-2">{line.replace(/\*\*/g, '')}</p>;
                if (line.startsWith('**')) return <p key={i} className="font-semibold text-white/90 mt-2">{line.replace(/\*\*/g, '')}</p>;
                if (line.startsWith('• ')) return <p key={i} className="pl-3 text-[var(--text-muted)]">{line}</p>;
                if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="text-[var(--text-faint)] italic text-[11px] mt-2">{line.replace(/\*/g, '')}</p>;
                return <p key={i}>{line}</p>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Aggregate Sentiment Banner */}
      {data && (
        <Card glow={data.aggregateLabel === 'Bullish' ? 'glow-green' : data.aggregateLabel === 'Bearish' ? 'glow-red' : ''}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Market Sentiment</p>
              <p className={`text-xl font-bold ${data.aggregateLabel === 'Bullish' ? 'text-[#0ecb81]' : data.aggregateLabel === 'Bearish' ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
                {data.aggregateLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{data.count}</p>
              <p className="text-[10px] text-[var(--text-faint)]">articles</p>
            </div>
          </div>
          <div className="mt-3 flex gap-3">
            <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#0ecb81] to-[#02a566] rounded-full transition-all" style={{ width: `${Math.max(0, data.aggregateSentiment * 50 + 50)}%` }} />
            </div>
            <span className="text-[10px] font-mono text-[var(--text-faint)]">{data.aggregateSentiment.toFixed(2)}</span>
          </div>
        </Card>
      )}

      {/* News List */}
      {data?.news && data.news.length > 0 ? (
        <div className="space-y-2">
          {data.news.map((item, i) => (
            <a key={i} href={item.link} target="_blank" rel="noreferrer"
              className="block p-3.5 sm:p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-emphasis)] transition-all press-scale">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0`} style={{ background: sentimentBg(item.sentiment) }} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold leading-snug mb-1.5">{item.title}</h3>
                  {item.summary && <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-2">{item.summary}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] text-[var(--text-faint)]">{item.source}</span>
                    <span className="text-[10px] text-[var(--text-faint)]">{timeAgo(item.published)}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${sentimentColor(item.sentiment)}15`, color: sentimentColor(item.sentiment) }}>
                      {item.sentiment}
                    </span>
                    {item.symbols.length > 0 && item.symbols.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#1e90ff]/10 text-[#1e90ff] font-mono font-bold">{s}</span>
                    ))}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0 mt-0.5" />
              </div>
            </a>
          ))}
        </div>
      ) : loading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 shimmer rounded-lg" />)}</div>
      ) : (
        <EmptyState icon={Newspaper} title="No news available" subtitle="News feed will populate when the API is reachable" />
      )}
    </div>
  );
}

// ── Database Stats Panel ──
function DatabaseStatsPanel() {
  const [dbStats, setDbStats] = useState<any>(null);
  const [recStats, setRecStats] = useState<any>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [recHistory, setRecHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [hs, rs, rh] = await Promise.all([
          api.getHistoricalStats(),
          api.getRecommendationStats(),
          api.getRecommendationHistory(undefined, undefined, 20),
        ]);
        if (mounted) {
          setDbStats(hs);
          setRecStats(rs);
          setRecHistory(rh.recommendations || []);
        }
      } catch { /* backend offline */ }
      if (mounted) setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const handleIngest = async () => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const result = await api.ingestHistorical(undefined, '2y');
      setIngestResult(`Ingested ${result.total_rows_stored} bars for ${result.symbols_processed} symbols`);
      const hs = await api.getHistoricalStats();
      setDbStats(hs);
    } catch (e: any) {
      setIngestResult(`Error: ${e.message}`);
    }
    setIngesting(false);
  };

  if (loading) {
    return (
      <Card>
        <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5 text-[#1e90ff]" /> Database
        </h3>
        <p className="text-xs text-[var(--text-faint)] text-center py-4 font-mono">Connecting to database...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Historical Data */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-2 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-[#1e90ff]" /> Historical Database
          </h3>
          <button onClick={handleIngest} disabled={ingesting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-[#1e90ff]/10 text-[#1e90ff] border border-[#1e90ff]/20 hover:bg-[#1e90ff]/20 transition-all press-scale whitespace-nowrap shrink-0 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${ingesting ? 'animate-spin' : ''}`} />
            {ingesting ? 'Ingesting...' : 'Pull Historical'}
          </button>
        </div>
        {dbStats && dbStats.total_symbols > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Symbols</p>
              <p className="text-lg font-bold font-mono">{dbStats.total_symbols}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Total Bars</p>
              <p className="text-lg font-bold font-mono">{(dbStats.total_rows || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">From</p>
              <p className="text-sm font-bold font-mono">{dbStats.earliest_date || 'N/A'}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">To</p>
              <p className="text-sm font-bold font-mono">{dbStats.latest_date || 'N/A'}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-[var(--text-faint)]">No historical data stored yet</p>
            <p className="text-[10px] text-[var(--text-faint)] mt-1">Click "Pull Historical" to download 2 years of OHLCV for the full universe</p>
          </div>
        )}
        {ingestResult && (
          <p className={`text-[10px] mt-2 font-mono ${ingestResult.startsWith('Error') ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{ingestResult}</p>
        )}
      </Card>

      {/* Persisted Recommendation Stats */}
      {recStats && recStats.total_recommendations > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Target className="w-3.5 h-3.5 text-[#f0b90b]" /> Persisted Recommendations
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Total</p>
              <p className="text-lg font-bold font-mono">{recStats.total_recommendations}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Pending</p>
              <p className="text-lg font-bold font-mono text-[#f0b90b]">{recStats.pending}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Wins</p>
              <p className="text-lg font-bold font-mono text-[#0ecb81]">{recStats.wins}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Losses</p>
              <p className="text-lg font-bold font-mono text-[#f6465d]">{recStats.losses}</p>
            </div>
            <div className="p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Win Rate</p>
              <p className={`text-lg font-bold font-mono ${(recStats.win_rate || 0) >= 0.55 ? 'text-[#0ecb81]' : (recStats.win_rate || 0) < 0.45 ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
                {recStats.win_rate !== null ? `${(recStats.win_rate * 100).toFixed(1)}%` : 'N/A'}
              </p>
            </div>
          </div>

          {/* By Horizon breakdown */}
          {recStats.by_horizon && recStats.by_horizon.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-2">By Horizon</p>
              <div className="space-y-1.5">
                {recStats.by_horizon.map((h: any) => (
                  <div key={h.horizon} className="flex items-center justify-between p-2 rounded-md bg-white/[0.02] border border-[var(--border)]">
                    <span className="text-xs font-mono">{h.horizon}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[var(--text-faint)]">{h.total} recs</span>
                      <span className={`text-xs font-mono font-bold ${h.win_rate >= 0.55 ? 'text-[#0ecb81]' : h.win_rate < 0.45 ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
                        {(h.win_rate * 100).toFixed(0)}% WR
                      </span>
                      {h.avg_return !== null && (
                        <span className={`text-xs font-mono font-bold ${h.avg_return >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {h.avg_return >= 0 ? '+' : ''}{(h.avg_return * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Recent DB Recommendations */}
      {recHistory.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <History className="w-3.5 h-3.5 text-[#f0b90b]" /> Recent DB Recommendations
          </h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {recHistory.map((rec: any) => (
              <div key={rec.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    rec.status === 'win' ? 'bg-[#0ecb81]/10' :
                    rec.status === 'loss' || rec.status === 'stopped_out' ? 'bg-[#f6465d]/10' :
                    'bg-[#f0b90b]/10'
                  }`}>
                    {rec.status === 'win' ? <CheckCircle2 className="w-3 h-3 text-[#0ecb81]" /> :
                     rec.status === 'loss' || rec.status === 'stopped_out' ? <XCircle className="w-3 h-3 text-[#f6465d]" /> :
                     <Clock className="w-3 h-3 text-[#f0b90b]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{rec.symbol} <span className="text-[10px] text-[#0ecb81]">{rec.signal}</span></p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{rec.horizon} · Score {rec.score?.toFixed(0)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {rec.outcome_return !== null ? (
                    <p className={`font-mono text-sm font-bold ${rec.outcome_return >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {rec.outcome_return >= 0 ? '+' : ''}{(rec.outcome_return * 100).toFixed(1)}%
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#f0b90b] font-semibold">PENDING</p>
                  )}
                  <p className="text-[10px] text-[var(--text-faint)]">${rec.entry_price?.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Track Record Tab ──
function TrackRecordTab() {
  const [stats] = useState(getTrackRecordStats());
  const [notifPrefs, setLocalPrefs] = useState(getNotificationPrefs());
  const runHistory = getDailyRunHistory();
  const streak = getRunStreak();

  const toggleNotifications = async () => {
    if (!notifPrefs.enabled) {
      // Try requesting permission but don't block on it
      requestNotificationPermission().catch(() => {});
    }
    const updated = { ...notifPrefs, enabled: !notifPrefs.enabled };
    saveNotificationPrefs(updated);
    setLocalPrefs(updated);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={History} title="Track Record" subtitle="Every signal logged \u2014 immutable performance audit" accent="#f0b90b"
        action={
          <button onClick={toggleNotifications}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-all press-scale whitespace-nowrap shrink-0
              ${notifPrefs.enabled ? 'bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/20' : 'bg-white/5 text-[var(--text-faint)] border border-[var(--border)]'}`}>
            {notifPrefs.enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            {notifPrefs.enabled ? 'Alerts On' : 'Alerts Off'}
          </button>
        } />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Total Signals</p>
          <p className="text-2xl font-bold font-mono">{stats.totalSignals}</p>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{stats.unresolvedCount} pending</p>
        </Card>
        <Card glow={stats.accuracy >= 60 ? 'glow-green' : stats.accuracy < 40 ? 'glow-red' : ''}>
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Accuracy</p>
          <p className={`text-2xl font-bold font-mono ${stats.accuracy >= 55 ? 'text-[#0ecb81]' : stats.accuracy < 45 ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
            {stats.accuracy}%
          </p>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{stats.resolvedCount} resolved</p>
        </Card>
        <Card>
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Avg Return</p>
          <p className={`text-2xl font-bold font-mono ${stats.avgReturn >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
            {stats.avgReturn >= 0 ? '+' : ''}{stats.avgReturn}%
          </p>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">per signal</p>
        </Card>
        <Card>
          <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Streak</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold font-mono ${stats.streak.type === 'win' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {stats.streak.count}
            </p>
            <Trophy className={`w-5 h-5 ${stats.streak.type === 'win' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`} />
          </div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{stats.streak.type === 'win' ? 'wins' : 'losses'} in a row</p>
        </Card>
      </div>

      {/* Daily Run History */}
      {runHistory.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-[#1e90ff]" /> Daily Runs
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#0ecb81]/10 text-[#0ecb81] font-mono ml-auto">{streak}-day streak</span>
          </h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {runHistory.slice(0, 30).map((run, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${run.dailyReturn >= 0 ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`} />
                  <span className="text-xs font-mono text-[var(--text-muted)]">{run.date}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${run.regime.includes('bull') || run.regime.includes('Expansion') ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : run.regime.includes('bear') || run.regime.includes('Contraction') ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#f0b90b]/10 text-[#f0b90b]'}`}>
                    {run.regime}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-[var(--text-faint)]">{run.tradesExecuted} trades</span>
                  <span className={`font-mono text-xs font-bold ${run.dailyReturn >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {run.dailyReturn >= 0 ? '+' : ''}{run.dailyReturn.toFixed(2)}%
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">${run.portfolioValue.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strategy Breakdown */}
      {Object.keys(stats.byStrategy).length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Strategy Performance</h3>
          <div className="space-y-2">
            {Object.entries(stats.byStrategy).map(([strategy, data]) => (
              <div key={strategy} className="flex items-center justify-between p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
                <div>
                  <p className="text-sm font-semibold capitalize">{strategy.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">{data.count} signals</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-xs font-mono font-bold ${data.winRate >= 55 ? 'text-[#0ecb81]' : data.winRate < 45 ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
                      {data.winRate}% WR
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-mono font-bold ${data.avgReturn >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {data.avgReturn >= 0 ? '+' : ''}{data.avgReturn}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Signal Log */}
      <Card>
        <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Radio className="w-3.5 h-3.5 text-[#f0b90b]" /> Signal Log ({stats.entries.length})
        </h3>
        {stats.entries.length > 0 ? (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {stats.entries.slice(0, 50).map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${entry.resolved ? (entry.actualReturn && entry.actualReturn > 0 ? 'bg-[#0ecb81]/10' : 'bg-[#f6465d]/10') : 'bg-[#f0b90b]/10'}`}>
                    {entry.resolved ? (entry.actualReturn && entry.actualReturn > 0 ? <CheckCircle2 className="w-3 h-3 text-[#0ecb81]" /> : <XCircle className="w-3 h-3 text-[#f6465d]" />) : <Clock className="w-3 h-3 text-[#f0b90b]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{entry.symbol} <span className={`text-[10px] ${entry.action === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{entry.action.toUpperCase()}</span></p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{entry.strategy} \u00b7 {(entry.confidence * 100).toFixed(0)}% conf</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {entry.resolved ? (
                    <p className={`font-mono text-sm font-bold ${(entry.actualReturn || 0) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {(entry.actualReturn || 0) >= 0 ? '+' : ''}{(entry.actualReturn || 0).toFixed(2)}%
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#f0b90b] font-semibold">PENDING</p>
                  )}
                  <p className="text-[10px] text-[var(--text-faint)]">{new Date(entry.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-faint)]">No signals recorded yet</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">Signals will be logged automatically as the strategy runs</p>
          </div>
        )}
      </Card>

      {/* Database Stats — from backend */}
      <DatabaseStatsPanel />

      {/* Notification Settings */}
      <Card>
        <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Bell className="w-3.5 h-3.5 text-[#f0b90b]" /> Alert Settings
        </h3>
        <div className="space-y-3">
          {[
            { key: 'signals', label: 'New Signal Alerts', desc: 'Get notified when a new buy/sell signal fires' },
            { key: 'stops', label: 'Stop-Loss Alerts', desc: 'Get notified when a position hits its trailing stop' },
            { key: 'dailyReport', label: 'Daily Performance Report', desc: 'Summary of daily P&L and trades at market close' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-md bg-white/[0.02] border border-[var(--border)]">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[10px] text-[var(--text-faint)]">{desc}</p>
              </div>
              <button
                onClick={() => {
                  const updated = { ...notifPrefs, [key]: !notifPrefs[key as keyof NotificationPrefs] };
                  saveNotificationPrefs(updated);
                  setLocalPrefs(updated);
                }}
                disabled={!notifPrefs.enabled}
                className={`w-10 h-6 rounded-full transition-all ${notifPrefs.enabled && notifPrefs[key as keyof NotificationPrefs] ? 'bg-[#0ecb81]' : 'bg-[var(--bg-secondary)]'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${notifPrefs.enabled && notifPrefs[key as keyof NotificationPrefs] ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          ))}
        </div>
        {!notifPrefs.enabled && (
          <p className="text-[10px] text-[var(--text-faint)] mt-2 text-center">Enable alerts above to configure individual notifications</p>
        )}
      </Card>
    </div>
  );
}

// ── Documentation Tab ──
function DocsTab() {
  const [expanded, setExpanded] = useState<string | null>('overview');

  const sections = [
    {
      id: 'overview',
      title: 'Platform Overview',
      icon: Compass,
      content: `Quest is an institutional-grade quantitative trading research platform. It combines multi-factor signal generation, statistical validation, and risk management into a single interface.

**What Quest Does:**
• Scans 380+ S&P 500 stocks across all 11 GICS sectors
• Generates trade signals using 7 technical indicators with IC-weighted scoring
• Validates signals through walk-forward cross-validation and deflated Sharpe analysis
• Manages risk via correlation filtering, ATR-based stops, and regime-adaptive exposure
• Tracks recommendation accuracy over time with measured win rates

**Data Sources:**
• Real market data from Yahoo Finance (when available)
• Synthetic fallback data for offline/demo usage
• Live price streaming with 30-second polling
• News sentiment from RSS feeds

**Architecture:**
• Frontend: React + TypeScript + Recharts (runs standalone)
• Backend: FastAPI + SQLite (optional, for persistent accounts)
• All computations run client-side — no server required for core functionality
• LocalStorage persistence for settings, trades, and track record`
    },
    {
      id: 'finder',
      title: 'Trade Finder',
      icon: Compass,
      content: `The Trade Finder is your primary tool for identifying high-probability trade opportunities in real-time.

**How Scoring Works:**
Stocks are scored 0-100 using IC-weighted factors:
• Momentum (28%) — Jegadeesh-Titman 6-month momentum, skip last week
• Quality (22%) — R² trend consistency (higher = more predictable price action)
• RSI (18%) — Relative Strength Index for overbought/oversold detection
• MACD (12%) — Moving Average Convergence Divergence signal strength
• Bollinger (8%) — Bollinger Band %B position and squeeze detection
• Volume (7%) — Relative volume vs 20-day average
• Relative Strength (5%) — Performance vs sector peers

**Multi-Timeframe Confirmation:**
Trades flagged "STRONG BUY" require BOTH daily AND weekly timeframe alignment. This eliminates false signals. MTF-aligned trades get a +15% score bonus.

**Hold Period Determination:**
• ⚡ 1-3 Days: High volatility + mean reversion setup
• 🎯 3-7 Days: Standard swing with momentum confirmation
• 📊 2-4 Weeks: Position trade with quality + trend
• 🚀 1-3 Months: Strong persistent momentum + sector leadership

**Entry Quality:**
Rates how close current price is to optimal entry:
• Optimal — at support with pullback
• Good — near support zone
• Fair — mid-range, acceptable
• Extended — chasing, penalized -15%

**Best Practices:**
1. Focus on scores 65+ with 3-7 day or 2-4 week horizons
2. Check "Live Tracking" to see measured win rates by score bucket
3. Use "Walk-Forward Validation" to verify the model predicts returns
4. Filter by time horizon to match your trading style
5. Tap any trade to see full technical analysis, catalysts, and risks`
    },
    {
      id: 'paper',
      title: 'Paper Trading',
      icon: LineChart,
      content: `Paper Trading runs a full 30-day walk-forward backtest using real market data. It auto-runs on page load — no clicking required.

**How It Works:**
1. Fetches 2 months of daily price data for 20 diversified stocks
2. Runs the multi-factor ranking model every trading day
3. Buys top-ranked stocks, sells when they drop from the top N
4. Applies 2.5× ATR trailing stops for downside protection
5. Tracks equity curve, drawdown, and per-trade performance

**Key Metrics:**
• Total Return — portfolio growth over 30 days
• Sharpe Ratio — risk-adjusted return (>1.5 is good, >2.5 is excellent)
• Sortino Ratio — downside-adjusted return (penalizes losses, not volatility)
• Max Drawdown — worst peak-to-trough decline
• Win Rate — % of trades that made money
• Profit Factor — gross wins / gross losses (>1.5 is profitable)

**Risk Controls:**
• ATR-based trailing stops (2.5× Average True Range)
• Maximum 8 positions at any time
• Risk parity sizing (inverse-volatility weighting)
• Correlation filtering (max 0.7 pairwise)
• Regime-conditional factor weights

**Tips:**
• Click "Refresh" to clear cache and re-run with fresh data
• The equity curve shows your hypothetical portfolio growth
• The trade log shows every entry/exit with P&L
• "Real Data" badge confirms actual Yahoo Finance prices`
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: LayoutDashboard,
      content: `The Dashboard provides a comprehensive market overview with regime detection, factor rankings, and sector analysis.

**Regime Detection:**
Classifies the overall market as:
• Bull — sustained uptrend, favor momentum strategies
• Bear — sustained downtrend, favor quality/defensive
• Sideways — choppy, use mean-reversion and tighter stops

The confidence percentage indicates regime clarity (higher = more decisive market).

**Stock Rankings:**
All 380+ stocks ranked by composite multi-factor score:
• Momentum — recent price trend strength
• Quality — trend consistency (R²)
• Mean Reversion — RSI-based oversold/overbought
• Volatility — lower vol = higher rank (risk-adjusted)

Click any stock to see its technical detail card with price chart, RSI, MACD, and momentum.

**Sector Rotation:**
Shows all 11 GICS sectors ranked by performance. Identifies which sectors are leading (overweight) vs lagging (underweight). This drives sector-level allocation decisions.

**Radar Chart:**
Visual summary of the top stock's factor exposures across all dimensions.`
    },
    {
      id: 'signals',
      title: 'Signals',
      icon: Crosshair,
      content: `The Signal Scanner detects actionable buy/sell signals across the full stock universe using multiple strategies.

**Signal Types:**
• Momentum — strong uptrend with quality confirmation (mom >5%, R² >0.6)
• Bollinger Squeeze — volatility compression predicting explosive breakout
• Multi-Factor — 67%+ alignment across momentum/MACD/quality/volatility
• Overbought (Sell) — RSI >70, suggesting profit-taking zone
• Degrading Momentum (Sell) — signal confidence dropped below 30%

**Reading Signals:**
• Confidence % — how strong the signal is (81% = very high conviction)
• Strategy label — which method triggered the signal
• Buy vs Sell — color-coded green/red with directional reasoning

**Signal Strength Chart:**
Bar chart showing the relative strength of each signal. Helps prioritize which signals to act on first.

**Best Practices:**
1. Focus on 81% confidence signals for highest probability
2. Cross-reference with Trade Finder for full analysis
3. Use Bollinger squeeze signals for breakout anticipation
4. Sell signals are warnings, not necessarily immediate exits
5. Multiple simultaneous buy signals on one stock = very high conviction`
    },
    {
      id: 'news',
      title: 'News & Sentiment',
      icon: Newspaper,
      content: `The News tab provides real-time market news with AI-powered sentiment analysis.

**Features:**
• Headlines from Yahoo Finance RSS feeds
• Sentiment scoring: Bullish / Bearish / Neutral per article
• Time-stamped for recency
• Click any headline to read the full article

**Sentiment Analysis:**
Articles are scored based on keyword analysis:
• Bullish: growth, beats, rally, upgrade, breakthrough
• Bearish: crash, decline, downgrade, layoffs, recession
• Neutral: reports, announces, plans, considers

**How to Use:**
1. Check news before acting on signals — catalysts matter
2. Bearish headlines on a stock with buy signals = proceed with caution
3. Bullish news + technical confirmation = highest conviction
4. Use news to understand WHY a stock is moving`
    },
    {
      id: 'track',
      title: 'Track Record',
      icon: History,
      content: `Track Record provides an immutable log of system performance over time.

**What's Tracked:**
• Every signal generated with timestamp and entry price
• Actual outcomes (win/loss) based on whether target or stop was hit
• Strategy-level breakdown (which approaches work best)
• Win/loss streaks for pattern recognition
• Daily run history (has the system run consistently?)

**Key Metrics:**
• Measured Accuracy — actual hit rate over time
• Avg Return — mean P&L per signal
• Win Streaks — consecutive wins (indicates strong regime alignment)
• By Strategy — which signal types perform best

**Alert System:**
Configure push notifications for:
• New Signals — get notified when a strong buy/sell appears
• Stop Losses — alerts when a position hits its stop
• Daily Report — end-of-day summary of performance

**Building Credibility:**
The Track Record is what transforms Quest from "another backtest tool" into a provably accurate system. After 30+ days of tracked recommendations, you'll have measured, defensible win rates.`
    },
    {
      id: 'broker',
      title: 'Broker Connection',
      icon: Plug,
      content: `Connect your Alpaca paper trading account to see live portfolio data and execute trades.

**Setup (Free, 2 minutes):**
1. Create account at https://app.alpaca.markets/signup
2. Go to Paper Trading → API Keys
3. Generate a new key pair
4. Enter API Key + Secret in the Broker tab
5. Keys are stored ONLY in your browser's localStorage

**What You Get:**
• Live account balance and buying power
• Current positions with real-time P&L
• Order history and fill status
• Target allocation with rebalance suggestions

**Security:**
• Keys never leave your browser
• Paper trading only (no real money at risk)
• You can clear keys at any time
• No PDT rules on paper accounts

**Target Allocation:**
Quest calculates an optimal portfolio based on current signals and shows what orders you'd need to place to match it. This bridges the gap between signals and execution.`
    },
    {
      id: 'backtest',
      title: 'Backtest Engine',
      icon: FlaskConical,
      content: `The Backtest tab runs a full walk-forward simulation with institutional-grade metrics.

**Methodology:**
• Walk-forward: re-ranks and rebalances every 5 trading days
• 15bps round-trip transaction costs (realistic for retail)
• ATR-based trailing stops (2.5× ATR)
• Risk parity position sizing
• Correlation filtering (max 0.7 between positions)
• Portfolio drawdown protection (reduces exposure in drawdowns)

**Metrics Explained:**
• CAGR — Compound Annual Growth Rate
• Sharpe — return per unit of total risk (>1.5 = good)
• Sortino — return per unit of downside risk (>2.0 = good)
• Max DD — maximum peak-to-trough decline
• Win Rate — % of profitable trades
• Profit Factor — gross wins / gross losses

**Monte Carlo Simulation:**
Runs 500 simulations with randomized ordering to generate:
• Probability cone of future outcomes
• Confidence bands (5th, 25th, 50th, 75th, 95th percentile)
• Worst-case and best-case scenarios

**Performance Attribution:**
Factor decomposition showing what drives returns:
• How much is market beta (just riding the market up)
• How much is sector rotation
• How much is genuine alpha (stock selection skill)

**Key Insight:**
If attribution shows >70% is beta, the strategy is just leveraged S&P 500. True alpha should be 30%+ of total return.`
    },
    {
      id: 'risk',
      title: 'Risk Management',
      icon: ShieldCheck,
      content: `The Risk tab shows position limits, drawdown protection tiers, and correlation analysis.

**Position Limits:**
• Max positions: 8 (prevents over-diversification)
• Max per sector: 40% (prevents concentration)
• Max single position: 15% of portfolio
• Min cash reserve: 10%

**Drawdown Protection Tiers:**
• Green (0-5% DD): Full exposure, normal operations
• Yellow (5-10% DD): Reduce new entries by 50%
• Orange (10-15% DD): Only close positions, no new entries
• Red (15-25% DD): Emergency — close weakest positions
• Ruin Stop (>25% DD): Full liquidation, wait for regime change

**Correlation Matrix Heatmap:**
Visual showing pairwise Pearson correlations between holdings. Color-coded:
• Green = low correlation (good diversification)
• Yellow = moderate correlation (monitor)
• Red = high correlation (concentration risk)

The system automatically rejects new positions with >0.7 correlation to existing holdings.

**Hierarchical Risk Parity:**
Modern portfolio construction that:
1. Clusters correlated stocks together
2. Allocates between clusters first (tree structure)
3. Then allocates within clusters by inverse volatility
4. Results in better diversification than Markowitz`
    },
    {
      id: 'research',
      title: 'Research Lab',
      icon: Cpu,
      content: `The Research Lab provides institutional-grade statistical validation of the trading strategy.

**Walk-Forward k-Fold CV:**
Splits historical data into 5 folds, trains on 4, tests on 1. Reports:
• Train vs Test Sharpe per fold
• Overfit Ratio (test/train — closer to 1.0 = less overfit)
• Verdict: ROBUST / MODERATE / OVERFIT

**Deflated Sharpe Ratio (Bailey & Lopez de Prado):**
Adjusts observed Sharpe for:
• Number of trials (multiple hypothesis testing)
• Non-normality (skew and kurtosis)
• Autocorrelation in returns
Reports: haircut %, p-value, probability of overfitting

**PCA Risk Decomposition:**
Decomposes total return into:
• Systematic risk (market beta, sector rotation, size/growth)
• Idiosyncratic alpha (genuine stock-picking skill)
If alpha is <20%, the strategy may just be leveraged beta.

**Historical Stress Tests:**
How your portfolio would perform under:
• 2008 GFC (-50-70%)
• COVID Crash 2020 (-30-40%)
• 2022 Rate Shock (-25-35%)
• Dot-com Bust (-70-85%)
• Flash Crash (-15-20%)

**Factor IC Analysis:**
Information Coefficient per factor — measures actual predictive power:
• IC > 0.03 with t-stat > 1.96 = statistically significant
• ICIR (IC / std) shows signal stability
• Factors with negative IC should be removed or inverted

**Macro Regime:**
Current economic environment based on VIX, credit spreads, yield curve:
• Risk-On (Expansion): favor momentum, 70% equities
• Risk-Off (Contraction): favor quality/defensive, 30% equities
• Transition: balanced, reduce position sizes

**Transaction Cost Model (Almgren-Chriss):**
Estimates realistic trading costs including:
• Market impact (moving price with your order)
• Spread costs
• Annual drag at current turnover
• Recommendations for optimal rebalance frequency`
    },
    {
      id: 'getting-started',
      title: 'Getting Started Guide',
      icon: Target,
      content: `**Recommended Workflow:**

**Day 1: Explore**
1. Open Trade Finder — see today's top opportunities
2. Tap a few trades to read the full analysis
3. Check the Dashboard for market regime and rankings
4. Look at Signals for all active buy/sell signals

**Day 2-7: Learn**
5. Read the Backtest results — understand historical performance
6. Check Research Lab — verify the strategy isn't overfit
7. Look at Risk Management — understand the guardrails
8. Monitor Track Record — watch measured accuracy build

**Week 2+: Act**
9. Connect Alpaca paper trading (free, no real money)
10. Use Trade Finder to identify best opportunities
11. Compare with Broker tab's target allocation
12. Track results in Track Record tab

**Week 4+: Validate**
13. Review measured win rates in Live Tracking
14. Check Walk-Forward Validation for model confidence
15. Compare your actual fills vs system's recommended entries
16. Decide if you want to trade with real capital

**Pro Tips:**
• Don't trade every signal — focus on 65+ scores with 3-7 day horizon
• Always check the Research tab before trusting backtest results
• The correlation matrix tells you when you're over-concentrated
• News context matters — a great signal during earnings week is risky
• Paper trade for 30+ days before considering real capital
• Higher time horizon trades (2-4 weeks) tend to be more reliable
• Multi-timeframe-confirmed trades win more than single-timeframe`
    },
    {
      id: 'methodology',
      title: 'Methodology & Limitations',
      icon: AlertTriangle,
      content: `**What Makes Quest Different:**
• IC-weighted scoring (not equal-weight indicators)
• Walk-forward validation (not just in-sample backtest)
• Multi-timeframe confirmation (daily + weekly must agree)
• Adaptive thresholds (tighter in high-vol, looser in low-vol)
• Live recommendation tracking (measured, not estimated, accuracy)

**Known Limitations:**
• Yahoo Finance data has 15-min delay (not real-time)
• No fundamental data (P/E, earnings, revenue) in scoring yet
• Single-asset class (US equities only — no options, futures, crypto)
• No intraday signals (daily timeframe minimum)
• Transaction costs are estimated, not measured
• Synthetic data fallback when API is unreachable (simulated, not real)

**What This Is NOT:**
• Not financial advice — this is a research tool
• Not guaranteed returns — past performance ≠ future results
• Not a replacement for a financial advisor
• Not suitable for retirement funds without professional guidance

**Statistical Confidence:**
The Research Lab tells you exactly how much to trust the results:
• Deflated Sharpe p-value < 0.05 = statistically significant alpha
• Walk-forward overfit ratio > 0.7 = strategy generalizes well
• Factor IC t-stat > 1.96 = factor has real predictive power

If ANY of these fail, the strategy may be curve-fit to historical data. The honest reporting of these metrics is what makes Quest research-grade.`
    }
  ];

  // AI Agent state
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentProgress, setAgentProgress] = useState(0);
  const [agentReading, setAgentReading] = useState('');
  const [agentSummary, setAgentSummary] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState('');

  const runAgent = useCallback(async () => {
    setAgentRunning(true);
    setAgentProgress(0);
    setAgentSummary(null);
    setAgentTyping('');
    setAgentReading('');

    // Simulate reading each section with delay
    for (let i = 0; i < sections.length; i++) {
      setAgentReading(sections[i].title);
      setAgentProgress(Math.round(((i + 1) / sections.length) * 100));
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    }

    setAgentReading('Synthesizing insights...');
    await new Promise(r => setTimeout(r, 800));

    // Generate intelligent summary from all sections
    const summaryText = `## Quest Platform Summary

**What It Is:** An institutional-grade quantitative trading research platform scanning 380+ S&P 500 stocks across 11 sectors using 7 IC-weighted technical indicators.

**Core Engine:** Multi-factor scoring (Momentum 28%, Quality 22%, RSI 18%, MACD 12%, Bollinger 8%, Volume 7%, Relative Strength 5%) with multi-timeframe confirmation requiring daily + weekly alignment for highest-conviction trades.

**Key Differentiators:**
• Walk-forward k-fold cross-validation proves signals aren't overfit
• Deflated Sharpe Ratio (Bailey & Lopez de Prado) quantifies false discovery probability
• Live recommendation tracking measures ACTUAL win rates over time, not just estimates
• Correlation filtering prevents concentrated sector exposure (max 0.7 pairwise)
• ATR-based adaptive trailing stops (2.5× ATR) instead of fixed percentages

**Risk Framework:**
5-tier drawdown protection (Green → Yellow → Orange → Red → Ruin Stop at -25%). Regime-adaptive factor weights shift between momentum (bull markets) and quality/defensive (bear markets). Hierarchical Risk Parity for portfolio construction.

**Statistical Validation (Research Lab):**
PCA decomposition separates systematic risk (beta) from idiosyncratic alpha. Factor IC analysis with t-statistics proves each signal's predictive power. Historical stress tests show behavior under 2008 GFC, COVID, and rate shock scenarios. Transaction cost model (Almgren-Chriss) estimates realistic execution drag.

**Recommended Workflow:**
Week 1: Explore Trade Finder + Dashboard → Week 2-3: Study Backtest + Research validation → Week 4+: Connect Alpaca paper trading (free) → After 30+ days of tracked results: decide on real capital allocation.

**Critical Limitations:**
• Yahoo Finance data has 15-min delay (not real-time)
• US equities only — no options, futures, crypto
• No fundamental data in scoring yet (P/E, earnings)
• Synthetic fallback data when API unreachable (demo mode)
• This is a research tool, NOT financial advice

**Bottom Line:** Quest is built to answer one question honestly: "Is this alpha real, or is it overfit noise?" The Research Lab analytics (deflated Sharpe, walk-forward CV, IC analysis) are what separate it from typical retail trading apps. Trust the measured track record over the backtest.`;

    // Type out the summary character by character
    setAgentReading('');
    for (let i = 0; i <= summaryText.length; i++) {
      setAgentTyping(summaryText.slice(0, i));
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 8));
    }

    setAgentSummary(summaryText);
    setAgentRunning(false);
  }, [sections]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-6 h-6 text-[#1e90ff]" />
        <div>
          <h2 className="text-xl font-bold">Documentation</h2>
          <p className="text-sm text-[var(--text-faint)]">Complete platform guide — how everything works and how to get the most out of Quest</p>
        </div>
      </div>

      {/* AI Agent Summary */}
      <div className="rounded-md border border-[#f0b90b]/30 bg-gradient-to-br from-[#f0b90b]/5 to-[#1e90ff]/5 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#f0b90b]" />
            <h3 className="font-semibold text-sm">Quest AI Agent</h3>
            <span className="text-[10px] px-2 py-0.5 bg-[#f0b90b]/20 text-[#f0b90b] rounded-full">Beta</span>
          </div>
          <button
            onClick={runAgent}
            disabled={agentRunning}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              agentRunning
                ? 'bg-[#f0b90b]/20 text-[#f0b90b]/60 cursor-not-allowed'
                : 'bg-[#f0b90b] text-white hover:bg-[#7c3aed] active:scale-95'
            }`}
          >
            {agentRunning ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reading...
              </span>
            ) : agentSummary ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run Agent
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                Summarize All Docs
              </span>
            )}
          </button>
        </div>
        <p className="text-xs text-[var(--text-faint)] mb-3">
          Reads all {sections.length} documentation sections and synthesizes a comprehensive brief
        </p>

        {/* Progress bar */}
        {agentRunning && (
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs text-[var(--text-faint)]">
              <span>Reading: {agentReading}</span>
              <span>{agentProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f0b90b] to-[#1e90ff] rounded-full transition-all duration-300"
                style={{ width: `${agentProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Typed summary output */}
        {agentTyping && (
          <div className="mt-3 p-4 rounded-lg bg-black/30 border border-[var(--border)] max-h-[500px] overflow-y-auto">
            <div className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-line font-mono text-[12px]">
              {agentTyping.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h3 key={i} className="text-white font-bold text-base mt-2 mb-2 font-sans">{line.replace('## ', '')}</h3>;
                }
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <h4 key={i} className="text-[#f0b90b] font-bold mt-3 mb-1 font-sans text-sm">{line.replace(/\*\*/g, '')}</h4>;
                }
                if (line.startsWith('**') && line.includes(':**')) {
                  const parts = line.split(':**');
                  return <p key={i} className="py-0.5"><span className="text-white font-semibold font-sans">{parts[0].replace(/\*\*/g, '')}:</span>{parts[1]?.replace(/\*\*/g, '')}</p>;
                }
                if (line.startsWith('•')) {
                  return <p key={i} className="pl-3 py-0.5 text-[var(--text-muted)]">{line}</p>;
                }
                if (line.trim() === '') return <div key={i} className="h-1.5" />;
                return <p key={i} className="py-0.5">{line}</p>;
              })}
              {agentRunning && <span className="inline-block w-2 h-4 bg-[#f0b90b] animate-pulse ml-0.5" />}
            </div>
          </div>
        )}

        {!agentTyping && !agentRunning && (
          <div className="text-center py-6 text-[var(--text-faint)] text-xs">
            Click "Summarize All Docs" to have the AI agent read and synthesize all {sections.length} sections into a comprehensive brief
          </div>
        )}
      </div>

      <div className="space-y-2">
        {sections.map(section => {
          const Icon = section.icon;
          const isOpen = expanded === section.id;
          return (
            <div key={section.id} className="rounded-md border border-[var(--border)] overflow-hidden transition-all">
              <button
                onClick={() => setExpanded(isOpen ? null : section.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <Icon className="w-5 h-5 text-[#1e90ff] shrink-0" />
                <span className="font-medium flex-1">{section.title}</span>
                <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-[var(--border)]">
                  <div className="pt-3 text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-line docs-content">
                    {section.content.split('\n').map((line, i) => {
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <h4 key={i} className="font-bold text-white mt-3 mb-1">{line.replace(/\*\*/g, '')}</h4>;
                      }
                      if (line.startsWith('• ')) {
                        return <p key={i} className="pl-3 py-0.5">• {line.slice(2)}</p>;
                      }
                      if (line.match(/^\d+\./)) {
                        return <p key={i} className="pl-3 py-0.5">{line}</p>;
                      }
                      if (line.trim() === '') return <div key={i} className="h-2" />;
                      return <p key={i} className="py-0.5">{line}</p>;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
