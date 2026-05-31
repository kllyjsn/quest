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
  Trophy, Radio, Search, Compass, Timer, BarChart3,
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

type Tab = 'dashboard' | 'signals' | 'backtest' | 'risk' | 'broker' | 'paper' | 'research' | 'news' | 'track' | 'finder';

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
      // Auto-log recommendations for live tracking
      logRecommendations(result.opportunities);
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



  const handleLogin = async (email: string, password: string, isRegister: boolean) => {
    try {
      const data = isRegister
        ? await api.register(email, password, email.split('@')[0])
        : await api.login(email, password);
      api.setToken(data.access_token);
      api.setStoredUser({ user_id: data.user_id, email: data.email, display_name: data.display_name });
      setUser({ user_id: data.user_id, email: data.email, display_name: data.display_name });
      setShowAuth(false);
    } catch (e: any) { setError(e.message); }
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
    <div className="min-h-screen bg-[var(--bg-primary)] mesh-bg">
      {/* ── Header ── */}
      <header className="glass border-b border-[var(--border)] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="leading-none">
              <h1 className="text-base font-bold tracking-tight">Quest</h1>
              <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-[0.2em] font-medium">Trading</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {regime && (
              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                ${regime.regime === 'bull' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
                  regime.regime === 'bear' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                    'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${regime.regime === 'bull' ? 'bg-[#22c55e]' : regime.regime === 'bear' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                {regime.regime.toUpperCase()} {(regime.confidence * 100).toFixed(0)}%
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center text-[10px] font-bold">
                  {(user.display_name || user.email)?.[0]?.toUpperCase()}
                </div>
                <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-faint)] hover:text-white" title="Log out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-xs font-semibold hover:opacity-90">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
            )}

            <button onClick={loadDashboard}
              className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-faint)] hover:text-white" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hidden md:block max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all
                  ${tab === id
                    ? 'text-white bg-white/5'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-white/[0.02]'}`}>
                <Icon className="w-4 h-4" />
                {label}
                {tab === id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Error bar */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3">
          <div className="bg-[#ef4444]/8 border border-[#ef4444]/15 rounded-xl px-4 py-2.5 text-[#ef4444] text-sm flex items-center gap-2 slide-up">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 p-1 hover:bg-[#ef4444]/10 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-6 slide-up">
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
      </main>

      {/* Live Price Ticker */}
      <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex animate-ticker whitespace-nowrap py-1.5 gap-6 px-4">
          {Object.values(livePrices).length > 0 ? Object.values(livePrices).map(p => (
            <span key={p.symbol} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
              <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
              <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
              <span className={p.changePct >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
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
          {/* Repeat for seamless scroll */}
          {Object.values(livePrices).length > 0 && Object.values(livePrices).map(p => (
            <span key={`${p.symbol}-2`} className="inline-flex items-center gap-1.5 text-[10px] font-mono shrink-0">
              <span className="font-semibold text-[var(--text-secondary)]">{p.symbol}</span>
              <span className="text-[var(--text-primary)]">${p.price.toFixed(2)}</span>
              <span className={p.changePct >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Mobile bottom nav — shows 5 primary tabs + "More" */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-[var(--border)] z-50 safe-bottom">
        <div className="flex justify-around items-center h-[60px] px-1">
          {TABS.filter(t => MOBILE_TABS.includes(t.id)).map(({ id, icon: Icon, shortLabel }) => (
            <button key={id} onClick={() => { setTab(id); setShowMoreTabs(false); }}
              className={`flex flex-col items-center justify-center gap-[3px] min-w-[44px] min-h-[44px] rounded-xl transition-all press-scale
                ${tab === id ? 'text-[#3b82f6] nav-pill-active' : 'text-[var(--text-faint)]'}`}>
              <Icon className={`w-[22px] h-[22px] transition-transform ${tab === id ? 'text-[#3b82f6] scale-110' : ''}`} />
              <span className={`text-[9px] leading-none font-semibold ${tab === id ? 'text-[#3b82f6]' : ''}`}>{shortLabel}</span>
            </button>
          ))}
          {/* More button */}
          <button onClick={() => setShowMoreTabs(!showMoreTabs)}
            className={`flex flex-col items-center justify-center gap-[3px] min-w-[44px] min-h-[44px] rounded-xl transition-all press-scale
              ${!MOBILE_TABS.includes(tab) ? 'text-[#3b82f6] nav-pill-active' : 'text-[var(--text-faint)]'}`}>
            <Layers className="w-[22px] h-[22px]" />
            <span className="text-[9px] leading-none font-semibold">More</span>
          </button>
        </div>
        {/* More tabs dropdown */}
        {showMoreTabs && (
          <div className="absolute bottom-[64px] left-2 right-2 glass border border-[var(--border)] rounded-2xl p-2 scale-in">
            <div className="grid grid-cols-4 gap-1">
              {TABS.filter(t => !MOBILE_TABS.includes(t.id)).map(({ id, icon: Icon, shortLabel }) => (
                <button key={id} onClick={() => { setTab(id); setShowMoreTabs(false); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl press-scale
                    ${tab === id ? 'text-[#3b82f6] bg-[#3b82f6]/10' : 'text-[var(--text-faint)] hover:bg-white/5'}`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-semibold">{shortLabel}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSubmit={handleLogin} />}
    </div>
  );
}

// ── Shared Components ──

function Card({ children, className = '', glow = '' }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] rounded-2xl p-3.5 sm:p-5 border border-[var(--border)] hover:border-[var(--border-emphasis)] transition-all card-hover gradient-border press-scale ${glow} ${className}`}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, accent = '#3b82f6' }: { label: string; value: string; sub?: string; icon: any; accent?: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] sm:text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}12`, color: accent }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold tracking-tight count-up" style={{ color: accent === '#22c55e' || accent === '#ef4444' ? accent : 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[10px] sm:text-xs text-[var(--text-faint)] mt-1.5 truncate">{sub}</p>}
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, accent = '#3b82f6', action }: { icon: any; title: string; subtitle?: string; accent?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}12`, color: accent }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--text-faint)] mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, variant = 'primary' }: { onClick: () => void; loading?: boolean; icon: any; label: string; variant?: 'primary' | 'green' | 'ghost' }) {
  const styles = {
    primary: 'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white hover:opacity-90',
    green: 'bg-gradient-to-r from-[#22c55e] to-[#10b981] text-white hover:opacity-90',
    ghost: 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-white/5 hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${styles[variant]}`}>
      <Icon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(' ')[0]}</span>
    </button>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <Card className="text-center py-12 sm:py-16">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
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
      case 'STRONG BUY': return '#22c55e';
      case 'BUY': return '#10b981';
      case 'ACCUMULATE': return '#f59e0b';
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
    if (signal === 'bullish' || signal === 'oversold' || signal === 'strong' || signal === 'squeeze' || signal === 'surge' || signal === 'above_avg' || signal === 'low') return '#22c55e';
    if (signal === 'bearish' || signal === 'overbought' || signal === 'weak' || signal === 'high' || signal === 'below_avg') return '#ef4444';
    return '#f59e0b';
  };

  const filtered = data?.opportunities.filter(o => {
    if (filterHorizon === 'all') return true;
    return o.timeHorizon.type === filterHorizon;
  }) || [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={Compass} title="Trade Finder" subtitle="Real-time opportunity scanner with AI-powered analysis" accent="#8b5cf6"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Scan Now" variant="primary" />} />

      {/* Market Condition Banner */}
      {data && (
        <Card glow={data.marketBias === 'bullish' ? 'glow-green' : data.marketBias === 'bearish' ? 'glow-red' : ''}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Market Condition</p>
              <p className={`text-lg sm:text-xl font-bold ${data.marketBias === 'bullish' ? 'text-[#22c55e]' : data.marketBias === 'bearish' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                {data.marketCondition}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-[#8b5cf6]">{data.opportunities.length}</p>
              <p className="text-[10px] text-[var(--text-faint)]">opportunities found</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--text-faint)]">
            <span>Scanned: {data.totalScanned} stocks</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {data.dataSource === 'real' ? <><Radio className="w-3 h-3 text-[#22c55e]" /> Live Data</> : 'Simulated'}
            </span>
            <span>·</span>
            <span>{new Date(data.scannedAt).toLocaleTimeString()}</span>
          </div>
        </Card>
      )}

      {/* Filter Bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { id: 'all', label: 'All', icon: '🔍' },
          { id: 'scalp', label: '1-3 Days', icon: '⚡' },
          { id: 'swing', label: '3-7 Days', icon: '🎯' },
          { id: 'position', label: '2-4 Weeks', icon: '📊' },
          { id: 'trend', label: '1-3 Months', icon: '🚀' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilterHorizon(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${filterHorizon === f.id ? 'bg-[#8b5cf6] text-white' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[#8b5cf6]/50'}`}>
            <span>{f.icon}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Sector Rotation Quick View */}
      {data && data.sectorRotation.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {data.sectorRotation.slice(0, 6).map(s => (
            <div key={s.sector} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] whitespace-nowrap shrink-0">
              <div className={`w-2 h-2 rounded-full ${s.recommendation === 'Overweight' ? 'bg-[#22c55e]' : s.recommendation === 'Neutral' ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'}`} />
              <span className="text-[10px] font-medium text-[var(--text-muted)]">{s.sector}</span>
              <span className="text-[10px] font-bold font-mono" style={{ color: s.strength > 55 ? '#22c55e' : s.strength > 40 ? '#f59e0b' : '#ef4444' }}>{s.strength}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live Tracking Stats + Walk-Forward Toggle */}
      {(trackingStats || walkForwardData) && (
        <div className="space-y-3">
          {/* Toggle bar */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowValidation(false)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all ${!showValidation ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
              Live Tracking
            </button>
            <button onClick={() => setShowValidation(true)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all ${showValidation ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
              Walk-Forward Validation
            </button>
          </div>

          {/* Live Tracking Panel */}
          {!showValidation && trackingStats && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-[#22c55e]" /> Live Recommendation Tracker
                </h3>
                <span className="text-[9px] text-[var(--text-faint)]">{trackingStats.totalTracked} tracked · {trackingStats.resolved} resolved</span>
              </div>

              {trackingStats.resolved > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-[#22c55e]/5 border border-[#22c55e]/20 text-center">
                      <p className="text-[9px] text-[#22c55e]/70 uppercase font-semibold">Measured Win Rate</p>
                      <p className="font-mono font-bold text-xl text-[#22c55e]">{trackingStats.winRate.toFixed(1)}%</p>
                      <p className="text-[8px] text-[var(--text-faint)]">{trackingStats.wins}W / {trackingStats.losses}L</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#3b82f6]/5 border border-[#3b82f6]/20 text-center">
                      <p className="text-[9px] text-[#3b82f6]/70 uppercase font-semibold">Avg Return</p>
                      <p className={`font-mono font-bold text-xl ${trackingStats.avgReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {trackingStats.avgReturn >= 0 ? '+' : ''}{trackingStats.avgReturn.toFixed(2)}%
                      </p>
                      <p className="text-[8px] text-[var(--text-faint)]">per trade</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#f59e0b]/5 border border-[#f59e0b]/20 text-center">
                      <p className="text-[9px] text-[#f59e0b]/70 uppercase font-semibold">Profit Factor</p>
                      <p className="font-mono font-bold text-xl text-[#f59e0b]">{trackingStats.profitFactor.toFixed(2)}x</p>
                      <p className="text-[8px] text-[var(--text-faint)]">gross W/L</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 text-center">
                      <p className="text-[9px] text-[#8b5cf6]/70 uppercase font-semibold">MTF Edge</p>
                      <p className="font-mono font-bold text-xl text-[#8b5cf6]">
                        {trackingStats.mtfWinRate > 0 ? `${trackingStats.mtfWinRate.toFixed(0)}%` : '--'}
                      </p>
                      <p className="text-[8px] text-[var(--text-faint)]">vs {trackingStats.nonMtfWinRate.toFixed(0)}% non-MTF</p>
                    </div>
                  </div>

                  {/* By Score Bucket */}
                  <div className="space-y-1">
                    <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Performance by Score</p>
                    {Object.entries(trackingStats.byScoreBucket).map(([bucket, stats]) => (
                      <div key={bucket} className="flex items-center gap-2 text-[10px]">
                        <span className="w-14 font-mono text-[var(--text-muted)]">{bucket}</span>
                        <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${stats.count > 0 ? (stats.wins / stats.count) * 100 : 0}%`, background: (stats.wins / stats.count) > 0.6 ? '#22c55e' : (stats.wins / stats.count) > 0.5 ? '#f59e0b' : '#ef4444' }} />
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
                  <BarChart3 className="w-3.5 h-3.5 text-[#8b5cf6]" /> Walk-Forward Validation
                </h3>
                {walkForwardData && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${walkForwardData.statSignificant ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
                    {walkForwardData.statSignificant ? 'Statistically Significant' : 'Needs More Data'}
                  </span>
                )}
              </div>

              {wfLoading ? (
                <div className="text-center py-8">
                  <Search className="w-6 h-6 text-[#8b5cf6] animate-pulse mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-muted)]">Running walk-forward backtest on historical data...</p>
                </div>
              ) : walkForwardData ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
                      <p className="text-[9px] text-[var(--text-faint)] uppercase font-semibold">Trades Tested</p>
                      <p className="font-mono font-bold text-lg">{walkForwardData.totalTrades}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
                      <p className="text-[9px] text-[var(--text-faint)] uppercase font-semibold">Score-Return r</p>
                      <p className={`font-mono font-bold text-lg ${walkForwardData.scoreCorrelation > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {walkForwardData.scoreCorrelation > 0 ? '+' : ''}{walkForwardData.scoreCorrelation.toFixed(3)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
                      <p className="text-[9px] text-[var(--text-faint)] uppercase font-semibold">High vs Low Edge</p>
                      <p className={`font-mono font-bold text-lg ${walkForwardData.highScoreEdge > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {walkForwardData.highScoreEdge > 0 ? '+' : ''}{walkForwardData.highScoreEdge.toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
                      <p className="text-[9px] text-[var(--text-faint)] uppercase font-semibold">t-Statistic</p>
                      <p className={`font-mono font-bold text-lg ${Math.abs(walkForwardData.tStatistic) > 1.96 ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>
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
                              background: b.winRate > 60 ? '#22c55e' : b.winRate > 50 ? '#f59e0b' : '#ef4444'
                            }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <span className="text-[10px] font-mono font-semibold" style={{ color: b.winRate > 55 ? '#22c55e' : b.winRate > 50 ? '#f59e0b' : '#ef4444' }}>
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
          <div className="w-12 h-12 rounded-2xl bg-[#8b5cf6]/10 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-[#8b5cf6] animate-pulse" />
          </div>
          <p className="text-[var(--text-muted)] font-medium">Scanning 500+ stocks with IC-weighted multi-factor model...</p>
          <p className="text-xs text-[var(--text-faint)] mt-1">Multi-timeframe confirmation · Relative strength · Adaptive volatility filters</p>
        </Card>
      )}

      {/* Opportunity Cards */}
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
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Target className="w-7 h-7 text-[var(--text-faint)]" />
          </div>
          <p className="text-[var(--text-muted)] font-medium">No opportunities match your filter</p>
          <p className="text-xs text-[var(--text-faint)] mt-1">Try selecting a different time horizon</p>
        </Card>
      ) : null}
    </div>
  );
}

function TradeOpportunityCard({ opportunity: opp, rank, expanded, onToggle, actionColor, horizonIcon, signalDot }: {
  opportunity: TradeOpportunity; rank: number; expanded: boolean; onToggle: () => void;
  actionColor: (a: string) => string; horizonIcon: (t: string) => string; signalDot: (s: string) => string;
}) {
  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${expanded ? 'border-[#8b5cf6]/40 bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-emphasis)]'}`}>
      {/* Header — always visible */}
      <button onClick={onToggle} className="w-full p-3.5 sm:p-4 text-left">
        <div className="flex items-center gap-3">
          {/* Rank badge */}
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm" style={{ background: `${actionColor(opp.action)}15`, color: actionColor(opp.action) }}>
            #{rank}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-mono font-bold text-sm sm:text-base">{opp.symbol}</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${actionColor(opp.action)}15`, color: actionColor(opp.action) }}>
                {opp.action}
              </span>
              {opp.multiTimeframeAlign && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] font-semibold">MTF✓</span>
              )}
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold hidden sm:inline-flex items-center gap-1">
                {horizonIcon(opp.timeHorizon.type)} {opp.timeHorizon.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-faint)]">
              <span>{opp.sector}</span>
              <span className="font-mono">${opp.currentPrice.toFixed(2)}</span>
              <span className="text-[#22c55e] font-semibold">{opp.historicalWinRate}% win</span>
              <span className="sm:hidden">{horizonIcon(opp.timeHorizon.type)} {opp.timeHorizon.label}</span>
            </div>
          </div>

          {/* Score + R:R */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 justify-end mb-0.5">
              <div className="w-12 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${opp.score}%`, background: opp.score > 70 ? '#22c55e' : opp.score > 50 ? '#f59e0b' : '#6b7280' }} />
              </div>
              <span className="text-xs font-bold font-mono" style={{ color: opp.score > 70 ? '#22c55e' : opp.score > 50 ? '#f59e0b' : '#6b7280' }}>{opp.score}</span>
            </div>
            <p className="text-[10px] text-[var(--text-faint)]">R:R {opp.riskRewardRatio}x · +{opp.expectedReturn}%</p>
          </div>

          <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3.5 sm:px-4 pb-4 space-y-4 border-t border-[var(--border)] pt-4">
          {/* Price Levels */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-[#22c55e]/5 border border-[#22c55e]/20 text-center">
              <p className="text-[9px] text-[#22c55e]/70 uppercase tracking-wider font-semibold mb-1">Target</p>
              <p className="font-mono font-bold text-sm text-[#22c55e]">${opp.targetPrice.toFixed(2)}</p>
              <p className="text-[9px] text-[#22c55e]/60">+{opp.expectedReturn}%</p>
            </div>
            <div className="p-3 rounded-xl bg-[#3b82f6]/5 border border-[#3b82f6]/20 text-center">
              <p className="text-[9px] text-[#3b82f6]/70 uppercase tracking-wider font-semibold mb-1">Entry</p>
              <p className="font-mono font-bold text-sm text-[#3b82f6]">${opp.entryPrice.toFixed(2)}</p>
              <p className="text-[9px] text-[#3b82f6]/60">Now</p>
            </div>
            <div className="p-3 rounded-xl bg-[#ef4444]/5 border border-[#ef4444]/20 text-center">
              <p className="text-[9px] text-[#ef4444]/70 uppercase tracking-wider font-semibold mb-1">Stop Loss</p>
              <p className="font-mono font-bold text-sm text-[#ef4444]">${opp.stopLoss.toFixed(2)}</p>
              <p className="text-[9px] text-[#ef4444]/60">-{opp.maxRisk}%</p>
            </div>
          </div>

          {/* Time Horizon + Position Size */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-3.5 h-3.5 text-[#8b5cf6]" />
                <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Hold Period</span>
              </div>
              <p className="font-bold text-sm">{opp.timeHorizon.label}</p>
              <p className="text-[10px] text-[var(--text-faint)] capitalize">{opp.timeHorizon.type} trade · ~{opp.timeHorizon.days} days</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-[#22c55e]" />
                <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Position Size</span>
              </div>
              <p className="font-bold text-sm">${opp.positionSize.dollarAmount.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--text-faint)]">{opp.positionSize.shares} shares · {opp.positionSize.pctOfPortfolio}% of portfolio</p>
            </div>
          </div>

          {/* Accuracy Metrics — NEW */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-[#22c55e]/5 border border-[#22c55e]/20 text-center">
              <p className="text-[9px] text-[#22c55e]/70 uppercase tracking-wider font-semibold mb-0.5">Win Rate</p>
              <p className="font-mono font-bold text-lg text-[#22c55e]">{opp.historicalWinRate}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">historical similar</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 text-center">
              <p className="text-[9px] text-[#8b5cf6]/70 uppercase tracking-wider font-semibold mb-0.5">Edge Score</p>
              <p className="font-mono font-bold text-lg text-[#8b5cf6]">{opp.edgeScore > 0 ? '+' : ''}{opp.edgeScore}</p>
              <p className="text-[8px] text-[var(--text-faint)]">vol-adjusted</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#3b82f6]/5 border border-[#3b82f6]/20 text-center">
              <p className="text-[9px] text-[#3b82f6]/70 uppercase tracking-wider font-semibold mb-0.5">vs Sector</p>
              <p className="font-mono font-bold text-lg text-[#3b82f6]">{opp.relativeStrength > 1 ? '+' : ''}{((opp.relativeStrength - 1) * 100).toFixed(0)}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">rel. strength</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center">
              <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-0.5">Entry</p>
              <p className={`font-bold text-sm capitalize ${opp.entryQuality === 'optimal' ? 'text-[#22c55e]' : opp.entryQuality === 'good' ? 'text-[#3b82f6]' : opp.entryQuality === 'extended' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>{opp.entryQuality}</p>
              <p className="text-[8px] text-[var(--text-faint)]">{opp.momentumPersistence}w momentum</p>
            </div>
          </div>

          {/* Multi-Timeframe + Persistence */}
          <div className="flex items-center gap-2 flex-wrap">
            {opp.multiTimeframeAlign && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#22c55e]/10 text-[#22c55e] font-semibold border border-[#22c55e]/20">
                Weekly + Daily Aligned
              </span>
            )}
            {opp.momentumPersistence >= 3 && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border border-[#3b82f6]/20">
                {opp.momentumPersistence}W Sustained Momentum
              </span>
            )}
            {opp.entryQuality === 'optimal' && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold border border-[#8b5cf6]/20">
                Pullback to Support
              </span>
            )}
            {opp.relativeStrength > 1.3 && (
              <span className="text-[9px] px-2.5 py-1 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] font-semibold border border-[#f59e0b]/20">
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
              <p className="text-[10px] text-[#22c55e] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> Catalysts
              </p>
              <div className="space-y-1">
                {opp.catalysts.map((c, i) => (
                  <p key={i} className="text-[10px] text-[var(--text-muted)] pl-3 border-l-2 border-[#22c55e]/30">{c}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#ef4444] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Risks
              </p>
              <div className="space-y-1">
                {opp.risks.map((r, i) => (
                  <p key={i} className="text-[10px] text-[var(--text-muted)] pl-3 border-l-2 border-[#ef4444]/30">{r}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Confidence meter */}
          <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Signal Confidence</span>
              <span className="text-xs font-bold font-mono" style={{ color: opp.confidence > 0.7 ? '#22c55e' : opp.confidence > 0.5 ? '#f59e0b' : '#ef4444' }}>
                {(opp.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${opp.confidence * 100}%`, background: opp.confidence > 0.7 ? '#22c55e' : opp.confidence > 0.5 ? '#f59e0b' : '#ef4444' }} />
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
            ${regime.regime === 'bull' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
              regime.regime === 'bear' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
            <span className={`w-2 h-2 rounded-full pulse-dot ${regime.regime === 'bull' ? 'bg-[#22c55e]' : regime.regime === 'bear' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
            {regime.regime.toUpperCase()} Market
            <span className="text-[var(--text-faint)] font-normal">{(regime.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-in">
        <MetricCard label="Regime" value={regime?.regime?.toUpperCase() || '--'} sub={`Confidence: ${regime ? (regime.confidence * 100).toFixed(0) : '--'}%`} icon={Gauge} accent={regime?.regime === 'bull' ? '#22c55e' : regime?.regime === 'bear' ? '#ef4444' : '#f59e0b'} />
        <MetricCard label="Universe" value={rankings.length.toString()} sub="Stocks ranked" icon={Target} accent="#3b82f6" />
        <MetricCard label="Top Pick" value={topBuys[0]?.symbol || '--'} sub={topBuys[0] ? `Score: ${topBuys[0].composite.toFixed(3)}` : ''} icon={Flame} accent="#22c55e" />
        <MetricCard label="Sectors" value={sectors.length.toString()} sub="GICS sectors" icon={PieIcon} accent="#8b5cf6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Card className="lg:col-span-1">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Cpu className="w-3.5 h-3.5 text-[#3b82f6]" /> Regime Signals
          </h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 shimmer rounded-xl" />}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-[#22c55e]" /> Rankings
          </h3>
          {/* Mobile: Card list */}
          <div className="md:hidden space-y-2">
            {topBuys.map((r: RankingEntry) => (
              <button key={r.symbol} onClick={() => onSelectSymbol(r.symbol)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-[var(--border)] press-scale text-left">
                <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center shrink-0">
                  <span className="font-mono font-bold text-[10px] text-[#3b82f6]">#{r.rank}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-sm text-[#3b82f6]">{r.symbol}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className={`text-[10px] font-mono ${r.momentum > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>Mom {(r.momentum * 100).toFixed(1)}%</span>
                    <span className="text-[10px] font-mono text-[#8b5cf6]">Q {r.quality.toFixed(3)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono font-bold text-sm ${r.composite > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{r.composite.toFixed(3)}</p>
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
                      <span className="font-mono font-bold text-[#3b82f6] text-xs">{r.symbol}</span>
                    </td>
                    <td className={`py-2.5 pr-2 text-right font-mono font-semibold text-xs ${r.composite > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {r.composite.toFixed(3)}
                    </td>
                    <td className={`py-2.5 pr-2 text-right font-mono text-[10px] ${r.momentum > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {(r.momentum * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono text-[10px] text-[#06b6d4]">{r.mean_reversion.toFixed(3)}</td>
                    <td className="py-2.5 pr-2 text-right font-mono text-[10px] text-[#8b5cf6]">{r.quality.toFixed(3)}</td>
                    <td className="py-2.5 text-right font-mono text-[10px] text-[#f59e0b]">{r.volatility.toFixed(3)}</td>
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
          <Layers className="w-3.5 h-3.5 text-[#8b5cf6]" /> Sector Rotation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sectors.map((s: any) => (
            <div key={s.etf}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all
                ${s.above_50sma ? 'border-[#22c55e]/10 bg-[#22c55e]/[0.03]' : 'border-[#ef4444]/10 bg-[#ef4444]/[0.03]'}`}>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{s.sector}</p>
                <p className="text-[10px] text-[var(--text-faint)]">{s.etf} #{s.rank}</p>
              </div>
              <p className={`font-mono font-bold text-sm shrink-0 ml-3 ${s.return_1m > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
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
            <Eye className="w-3.5 h-3.5 text-[#3b82f6]" /> {selectedSymbol}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mb-4">
            {[
              ['Price', `$${technicals.price?.toFixed(2)}`, ''],
              ['RSI', technicals.rsi?.toFixed(1), technicals.rsi < 30 ? '#22c55e' : technicals.rsi > 70 ? '#ef4444' : ''],
              ['MACD', technicals.macd?.histogram?.toFixed(3), technicals.macd?.histogram > 0 ? '#22c55e' : '#ef4444'],
              ['Mom', `${((technicals.factors?.momentum || 0) * 100).toFixed(1)}%`, (technicals.factors?.momentum || 0) > 0 ? '#22c55e' : '#ef4444'],
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
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={50} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="url(#priceGrad)" strokeWidth={2} dot={false} />
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
      <SectionHeader icon={Crosshair} title="Signal Scanner" subtitle="Multi-factor signal detection" accent="#3b82f6"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Scan" />} />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total" value={signals.length.toString()} icon={Activity} accent="#3b82f6" />
        <MetricCard label="Buy" value={buySignals.length.toString()} icon={ArrowUpRight} accent="#22c55e" />
        <MetricCard label="Sell" value={sellSignals.length.toString()} icon={ArrowDownRight} accent="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card glow="glow-green">
          <h3 className="text-xs font-bold text-[#22c55e] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <ArrowUpRight className="w-3.5 h-3.5" /> Buy <span className="text-[var(--text-faint)] font-normal ml-auto">{buySignals.length}</span>
          </h3>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {buySignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-[#22c55e]/[0.03] border border-[#22c55e]/8 hover:border-[#22c55e]/20 cursor-pointer transition-all"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#3b82f6] text-sm">{s.symbol}</span>
                  <p className="text-[10px] text-[var(--text-faint)] truncate max-w-[160px]">{s.description}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono font-bold text-sm text-[#22c55e]">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-[9px] text-[var(--text-faint)] uppercase">{s.strategy}</p>
                </div>
              </div>
            ))}
            {buySignals.length === 0 && <p className="text-[var(--text-faint)] text-sm py-6 text-center">No buy signals</p>}
          </div>
        </Card>

        <Card glow="glow-red">
          <h3 className="text-xs font-bold text-[#ef4444] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <ArrowDownRight className="w-3.5 h-3.5" /> Sell <span className="text-[var(--text-faint)] font-normal ml-auto">{sellSignals.length}</span>
          </h3>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {sellSignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-[#ef4444]/[0.03] border border-[#ef4444]/8 hover:border-[#ef4444]/20 cursor-pointer transition-all"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#3b82f6] text-sm">{s.symbol}</span>
                  <p className="text-[10px] text-[var(--text-faint)] truncate max-w-[160px]">{s.description}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono font-bold text-sm text-[#ef4444]">{(s.strength * 100).toFixed(0)}%</p>
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
                  <Cell key={i} fill={s.signal_type === 'buy' ? '#22c55e' : s.signal_type === 'sell' ? '#ef4444' : '#f59e0b'} fillOpacity={0.8} />
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
      <SectionHeader icon={FlaskConical} title="Backtest Engine" subtitle="Walk-forward validation" accent="#8b5cf6"
        action={<ActionButton onClick={onRun} loading={loading} icon={RefreshCw} label="Run Backtest" />} />

      {result && !result.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-in">
            <MetricCard label="Total Return" value={`${isPositive ? '+' : ''}${(result.total_return * 100).toFixed(1)}%`}
              sub={`$${result.initial_capital?.toLocaleString()} -> $${result.final_value?.toLocaleString()}`}
              icon={isPositive ? TrendingUp : TrendingDown} accent={isPositive ? '#22c55e' : '#ef4444'} />
            <MetricCard label="Annual Return" value={`${(result.annual_return * 100).toFixed(1)}%`}
              icon={DollarSign} accent={result.annual_return > 0 ? '#22c55e' : '#ef4444'} />
            <MetricCard label="Sharpe" value={result.sharpe_ratio?.toFixed(2) || '--'}
              sub={`Sortino: ${result.sortino_ratio?.toFixed(2) || '--'}`}
              icon={Target} accent={result.sharpe_ratio > 1 ? '#22c55e' : '#f59e0b'} />
            <MetricCard label="Max DD" value={`${(result.max_drawdown * 100).toFixed(1)}%`}
              sub={`${result.total_trades} trades`}
              icon={AlertTriangle} accent={result.max_drawdown > -0.15 ? '#22c55e' : '#ef4444'} />
          </div>

          {result.equity_curve && (
            <>
              <Card>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Equity Curve</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={result.equity_curve}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={55} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Portfolio']} />
                    <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} fill="url(#eqGrad)" strokeWidth={2} dot={false} />
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
                    <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
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
                  <span>Median: <span className="text-[#22c55e] font-bold">${monteCarlo.stats.median_outcome?.toLocaleString()}</span></span>
                  <span>Best: <span className="text-[#3b82f6]">${monteCarlo.stats.best_case?.toLocaleString()}</span></span>
                  <span>Worst: <span className="text-[#ef4444]">${monteCarlo.stats.worst_case?.toLocaleString()}</span></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monteCarlo.cone}>
                  <defs>
                    <linearGradient id="mcOuter" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mcInner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Days', position: 'bottom', fill: 'var(--text-faint)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={60} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }}
                    formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'p95' ? '95th %ile' : name === 'p75' ? '75th' : name === 'p50' ? 'Median' : name === 'p25' ? '25th' : '5th %ile']} />
                  <Area type="monotone" dataKey="p95" stroke="#3b82f6" strokeWidth={1} fill="url(#mcOuter)" strokeDasharray="3 3" dot={false} />
                  <Area type="monotone" dataKey="p75" stroke="#8b5cf6" strokeWidth={1} fill="url(#mcInner)" dot={false} />
                  <Area type="monotone" dataKey="p50" stroke="#22c55e" strokeWidth={2.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="p25" stroke="#8b5cf6" strokeWidth={1} fill="none" dot={false} />
                  <Area type="monotone" dataKey="p5" stroke="#ef4444" strokeWidth={1} fill="none" strokeDasharray="3 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2 text-[10px] text-[var(--text-faint)]">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#3b82f6] inline-block" style={{ borderTop: '1px dashed #3b82f6' }}></span> 5th/95th</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#8b5cf6] inline-block"></span> 25th/75th</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#22c55e] inline-block"></span> Median</span>
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
                      <div className={`h-full rounded-full transition-all ${f.contribution >= 0 ? 'bg-gradient-to-r from-[#22c55e]/50 to-[#22c55e]' : 'bg-gradient-to-r from-[#ef4444] to-[#ef4444]/50'}`}
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
                  <div className="flex-1 text-sm font-bold" style={{ color: attribution.total_return >= 0 ? '#22c55e' : '#ef4444' }}>
                    {attribution.total_return >= 0 ? '+' : ''}{attribution.total_return.toFixed(2)}%
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {result?.error && <Card><p className="text-[#ef4444]">{result.error}</p></Card>}

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
      <SectionHeader icon={ShieldCheck} title="Risk Management" subtitle="Position sizing & drawdown controls" accent="#f59e0b" />

      {limits ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Position Limits</h3>
            <div className="space-y-4">
              <LimitBar label="Max Position" value={limits.max_position_pct} color="#3b82f6" />
              <LimitBar label="Max Sector" value={limits.max_sector_pct} color="#8b5cf6" />
              <LimitBar label="Cash Reserve" value={limits.min_cash_reserve_pct} color="#06b6d4" />
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Drawdown Controls</h3>
            <div className="space-y-4">
              <LimitBar label="Warning" value={Math.abs(limits.max_drawdown_warning)} color="#f59e0b" />
              <LimitBar label="Reduce" value={Math.abs(limits.max_drawdown_reduce)} color="#ef4444" />
              <LimitBar label="Liquidation" value={Math.abs(limits.max_drawdown_liquidate)} color="#ef4444" />
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Trade Controls</h3>
            <div className="space-y-3">
              {[
                ['Trailing Stop-Loss', `${(limits.trailing_stop_pct * 100).toFixed(0)}%`, '#ef4444'],
                ['Take-Profit', `+${(limits.take_profit_pct * 100).toFixed(0)}%`, '#22c55e'],
                ['Partial Sell at TP', `${(limits.take_profit_sell_pct * 100).toFixed(0)}%`, 'var(--text-primary)'],
                ['PDT Day Trades', `${limits.pdt_max_day_trades}/5 days`, '#f59e0b'],
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
                  <ChevronRight className="w-3.5 h-3.5 text-[#3b82f6] shrink-0 mt-0.5" />
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
      <SectionHeader icon={Cpu} title="Institutional Research" subtitle="Loading analytics..." accent="#8b5cf6"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Refresh" />} />
      {[1,2,3,4].map(i => <div key={i} className="h-32 sm:h-48 shimmer rounded-2xl" />)}
    </div>
  );

  if (!data) return (
    <div className="space-y-4">
      <SectionHeader icon={Cpu} title="Institutional Research" subtitle="Quant-grade validation suite" accent="#8b5cf6"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Run Analysis" />} />
      <EmptyState icon={Cpu} title="Run Research Suite" subtitle="Walk-forward CV, deflated Sharpe, PCA, stress tests, IC analysis, HRP, macro regime" />
    </div>
  );

  const { walkForward, deflatedSharpe, pca, stressTests, ic, hrp, macro, txCost } = data;

  return (
    <div className="space-y-3 sm:space-y-5">
      <SectionHeader icon={Cpu} title="Research" subtitle="Institutional-grade validation" accent="#8b5cf6"
        action={<ActionButton onClick={onRefresh} loading={loading} icon={RefreshCw} label="Re-run" />} />

      {/* Summary chips (mobile horizontal scroll) */}
      <div className="scroll-x -mx-3.5 px-3.5 sm:hidden swipe-hint">
        {walkForward && <div className="metric-chip"><p className="text-base font-bold" style={{ color: walkForward.is_robust ? '#22c55e' : '#ef4444' }}>{walkForward.is_robust ? 'ROBUST' : 'WEAK'}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Walk-Forward</p></div>}
        {deflatedSharpe && <div className="metric-chip"><p className="text-base font-bold" style={{ color: deflatedSharpe.is_significant ? '#22c55e' : '#ef4444' }}>{deflatedSharpe.deflated_sharpe}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Deflated SR</p></div>}
        {pca && <div className="metric-chip"><p className="text-base font-bold text-[#3b82f6]">{pca.systematic_risk_pct}%</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Systematic</p></div>}
        {stressTests && <div className="metric-chip"><p className="text-base font-bold text-[#ef4444]">{stressTests.tail_risk_var95}%</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">VaR 95%</p></div>}
        {macro && <div className="metric-chip"><p className="text-[11px] font-bold" style={{ color: macro.regime.includes('Expansion') ? '#22c55e' : '#ef4444' }}>{macro.regime.includes('Expansion') ? 'Risk-On' : macro.regime.includes('Contraction') ? 'Risk-Off' : 'Mixed'}</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Regime</p></div>}
        {txCost && <div className="metric-chip"><p className="text-base font-bold text-[#f59e0b]">{txCost.total_portfolio_cost_bps}bps</p><p className="text-[9px] text-[var(--text-faint)] mt-0.5">Avg Cost</p></div>}
      </div>

      {/* Walk-Forward Cross-Validation */}
      {walkForward && (
        <ResearchPanel title={`Walk-Forward CV (${walkForward.folds.length} folds)`} badge={walkForward.is_robust ? 'ROBUST' : 'WEAK'} defaultOpen>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.avg_test_sharpe > 0.5 ? '#22c55e' : '#f59e0b' }}>{walkForward.avg_test_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Avg OOS Sharpe</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold text-[var(--text-primary)]">±{walkForward.sharpe_std}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Sharpe Std</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.overfit_ratio < 0.5 ? '#22c55e' : '#ef4444' }}>{(walkForward.overfit_ratio * 100).toFixed(0)}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Overfit Ratio</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold" style={{ color: walkForward.is_robust ? '#22c55e' : '#ef4444' }}>{walkForward.is_robust ? 'ROBUST' : 'WEAK'}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Verdict</p>
            </div>
          </div>
          {/* Mobile: Card per fold */}
          <div className="md:hidden space-y-2">
            {walkForward.folds.map((f: any) => (
              <div key={f.fold} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-[var(--border)]">
                <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-faint)]">F{f.fold}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-faint)]">OOS Sharpe</span>
                    <span className="font-mono font-bold text-xs" style={{ color: f.test_sharpe > 0 ? '#22c55e' : '#ef4444' }}>{f.test_sharpe}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-[10px]" style={{ color: f.test_return > 0 ? '#22c55e' : '#ef4444' }}>{f.test_return > 0 ? '+' : ''}{f.test_return}%</span>
                    <span className="font-mono text-[10px] text-[#ef4444]">DD {f.test_max_dd}%</span>
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
                    <td className="py-2 px-1 text-right font-mono" style={{ color: f.test_sharpe > 0 ? '#22c55e' : '#ef4444' }}>{f.test_sharpe}</td>
                    <td className="py-2 px-1 text-right font-mono" style={{ color: f.test_return > 0 ? '#22c55e' : '#ef4444' }}>{f.test_return > 0 ? '+' : ''}{f.test_return}%</td>
                    <td className="py-2 px-1 text-right font-mono text-[#ef4444]">{f.test_max_dd}%</td>
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
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base font-bold text-[var(--text-primary)]">{deflatedSharpe.observed_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Observed</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.deflated_sharpe > 0 ? '#22c55e' : '#ef4444' }}>{deflatedSharpe.deflated_sharpe}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Deflated</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.p_value < 0.05 ? '#22c55e' : '#ef4444' }}>{deflatedSharpe.p_value}</p>
              <p className="text-[9px] text-[var(--text-faint)]">p-value</p>
            </div>
            <div className="text-center p-2.5 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base font-bold" style={{ color: deflatedSharpe.is_significant ? '#22c55e' : '#ef4444' }}>{deflatedSharpe.is_significant ? 'YES' : 'NO'}</p>
              <p className="text-[9px] text-[var(--text-faint)]">Significant</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Haircut </span><span className="font-mono text-[#f59e0b]">{deflatedSharpe.haircut_pct}%</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">P(Overfit) </span><span className="font-mono text-[#ef4444]">{(deflatedSharpe.prob_overfit * 100).toFixed(0)}%</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Trials </span><span className="font-mono">{deflatedSharpe.trials_equivalent}</span></div>
            <div className="p-2 rounded-lg bg-white/[0.02]"><span className="text-[var(--text-faint)]">Min Track </span><span className="font-mono">{deflatedSharpe.min_track_record_months}mo</span></div>
          </div>
        </ResearchPanel>
      )}

      {/* PCA Risk Decomposition */}
      {pca && (
        <ResearchPanel title="PCA Risk Decomposition" badge={`${pca.systematic_risk_pct}% sys`}>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-lg sm:text-xl font-bold text-[#3b82f6]">{pca.systematic_risk_pct}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Systematic</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-lg sm:text-xl font-bold text-[#8b5cf6]">{pca.idiosyncratic_risk_pct}%</p>
              <p className="text-[9px] text-[var(--text-faint)]">Alpha</p>
            </div>
          </div>
          <div className="space-y-2">
            {pca.components.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 sm:gap-3">
                <span className="w-6 text-xs font-mono text-[var(--text-faint)]">PC{c.id}</span>
                <div className="flex-1 h-3.5 sm:h-4 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6]" style={{ width: `${c.variance_pct}%` }} />
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
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold text-[#ef4444]">{stressTests.tail_risk_var95}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">VaR 95%</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold text-[#ef4444]">{stressTests.tail_risk_cvar95}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">CVaR</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold text-[#f59e0b]">{stressTests.current_vulnerability}%</p>
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
                  <p className="text-xs font-mono font-bold text-[#ef4444]">{s.portfolio_impact.toFixed(1)}%</p>
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
              <div key={f.name} className="p-2.5 rounded-xl bg-white/[0.02] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">{f.name}</span>
                  {f.is_significant ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e]">Sig</span> : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#ef4444]/10 text-[#ef4444]">N/S</span>}
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div><p className="font-mono text-[11px] font-bold" style={{ color: f.ic_mean > 0 ? '#22c55e' : '#ef4444' }}>{f.ic_mean.toFixed(3)}</p><p className="text-[8px] text-[var(--text-faint)]">IC</p></div>
                  <div><p className="font-mono text-[11px] font-bold" style={{ color: f.icir > 0.5 ? '#22c55e' : '#f59e0b' }}>{f.icir.toFixed(2)}</p><p className="text-[8px] text-[var(--text-faint)]">ICIR</p></div>
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
                    <td className="py-2 text-right font-mono" style={{ color: f.ic_mean > 0 ? '#22c55e' : '#ef4444' }}>{f.ic_mean.toFixed(3)}</td>
                    <td className="py-2 text-right font-mono" style={{ color: f.icir > 0.5 ? '#22c55e' : '#f59e0b' }}>{f.icir.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{f.t_stat.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{(f.hit_rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right font-mono">{f.decay_halflife}d</td>
                    <td className="py-2 text-right">{f.is_significant ? <span className="text-[#22c55e]">✓</span> : <span className="text-[#ef4444]">✗</span>}</td>
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
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold text-[#3b82f6]">{hrp.diversification_ratio}x</p>
              <p className="text-[9px] text-[var(--text-faint)]">Diversification</p>
            </div>
            <div className="text-center p-2.5 sm:p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-base sm:text-lg font-bold text-[#8b5cf6]">{hrp.effective_n}</p>
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
          <div className="flex items-center gap-3 mb-4 p-2.5 sm:p-3 rounded-xl" style={{ background: macro.regime.includes('Expansion') ? 'rgba(34,197,94,0.08)' : macro.regime.includes('Contraction') ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)' }}>
            <div className="text-xs sm:text-sm font-bold" style={{ color: macro.regime.includes('Expansion') ? '#22c55e' : macro.regime.includes('Contraction') ? '#ef4444' : '#f59e0b' }}>
              {macro.regime}
            </div>
            <div className="ml-auto text-[11px] sm:text-xs font-mono">{macro.confidence}%</div>
          </div>
          <div className="space-y-2 mb-4">
            {macro.signals.map((s: any) => (
              <div key={s.name} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)]/30 last:border-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.signal === 'bullish' ? '#22c55e' : s.signal === 'bearish' ? '#ef4444' : '#f59e0b' }}></span>
                <span className="flex-1 text-[11px] sm:text-xs truncate">{s.name}</span>
                <span className="text-[11px] sm:text-xs font-mono shrink-0">{s.value > 0 ? '+' : ''}{s.value}%</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: s.signal === 'bullish' ? 'rgba(34,197,94,0.15)' : s.signal === 'bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: s.signal === 'bullish' ? '#22c55e' : s.signal === 'bearish' ? '#ef4444' : '#f59e0b' }}>{s.signal}</span>
              </div>
            ))}
          </div>
          <h4 className="text-[10px] font-bold text-[var(--text-faint)] mb-2 uppercase">Allocation</h4>
          <div className="space-y-1.5">
            {macro.recommended_allocation.map((a: any) => (
              <div key={a.asset_class} className="flex items-center gap-2">
                <span className="w-14 sm:w-16 text-[11px] sm:text-xs truncate">{a.asset_class}</span>
                <div className="flex-1 h-3 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#22c55e]" style={{ width: `${a.weight}%` }} />
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
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold" style={{ color: txCost.total_portfolio_cost_bps < 10 ? '#22c55e' : '#f59e0b' }}>{txCost.total_portfolio_cost_bps}bps</p>
              <p className="text-[8px] text-[var(--text-faint)]">Cost/Trade</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold" style={{ color: txCost.annual_drag_pct < 1 ? '#22c55e' : '#ef4444' }}>{txCost.annual_drag_pct}%</p>
              <p className="text-[8px] text-[var(--text-faint)]">Ann. Drag</p>
            </div>
            <div className="text-center p-2 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-sm font-bold text-[var(--text-primary)]">{txCost.turnover_assumption}x</p>
              <p className="text-[8px] text-[var(--text-faint)]">Turnover</p>
            </div>
          </div>
          <p className="text-[11px] mb-3 p-2.5 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)] leading-relaxed">{txCost.recommendation}</p>
          {/* Mobile: Compact list */}
          <div className="md:hidden space-y-1.5">
            {txCost.estimates.slice(0, 8).map((e: any) => (
              <div key={e.symbol} className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/20 last:border-0">
                <span className="font-mono text-xs font-bold text-[#3b82f6]">{e.symbol}</span>
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
            <div className={`w-2.5 h-2.5 rounded-full ${alpacaStatus?.connected ? 'bg-[#22c55e] pulse-dot' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Alpaca Paper Trading</h3>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-faint)] bg-white/5 px-2 py-0.5 rounded-full">Primary</span>
          </div>
          {alpacaStatus?.connected && (
            <button onClick={handleDisconnect} className="text-[10px] text-[#ef4444] hover:underline">Disconnect</button>
          )}
        </div>

        {alpacaStatus?.connected && alpacaStatus.account ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Portfolio', `$${Number(alpacaStatus.account.portfolio_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#22c55e'],
                ['Cash', `$${Number(alpacaStatus.account.cash).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#3b82f6'],
                ['Buying Power', `$${Number(alpacaStatus.account.buying_power).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '#8b5cf6'],
                ['Day Trades', `${alpacaStatus.account.daytrade_count}/3`, '#f59e0b'],
              ].map(([label, val, color]) => (
                <div key={label} className="p-3 rounded-xl bg-white/[0.02] border border-[var(--border)] text-center">
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
                        <span className="font-mono font-bold text-sm text-[#3b82f6]">{p.symbol}</span>
                        <span className="text-[10px] text-[var(--text-faint)]">{p.qty} shares</span>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono text-sm font-bold ${Number(p.unrealized_pl) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                          {Number(p.unrealized_pl) >= 0 ? '+' : ''}${Number(p.unrealized_pl).toFixed(2)}
                        </p>
                        <p className={`text-[10px] font-mono ${Number(p.unrealized_plpc) >= 0 ? 'text-[#22c55e]/70' : 'text-[#ef4444]/70'}`}>
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
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.side === 'buy' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>{o.side.toUpperCase()}</span>
                        <span className="font-mono text-sm font-semibold">{o.symbol}</span>
                        <span className="text-[10px] text-[var(--text-faint)]">{o.qty} @ {o.filled_avg_price || 'pending'}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${o.status === 'filled' ? 'bg-[#22c55e]/10 text-[#22c55e]' : o.status === 'canceled' ? 'bg-[#ef4444]/10 text-[#ef4444]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
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
              <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20">
                <p className="text-xs text-[#ef4444]">{alpacaStatus.error}</p>
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">Connect your free Alpaca paper trading account for live simulated trading with real market data.</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">API Key</label>
                <input type="text" value={alpacaKey} onChange={e => setAlpacaKey(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm font-mono placeholder:text-[var(--text-faint)]"
                  placeholder="PKXXXXXXXXXXXXXXXXXX" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">Secret Key</label>
                <input type="password" value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm font-mono placeholder:text-[var(--text-faint)]"
                  placeholder="Enter your secret key" />
              </div>
              <button onClick={handleConnect} disabled={connecting || !alpacaKey || !alpacaSecret}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] font-semibold text-sm disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2">
                {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                {connecting ? 'Connecting...' : 'Connect to Alpaca'}
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <a href="https://app.alpaca.markets/signup" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline text-xs flex items-center gap-1">
                Create free account <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-[var(--text-faint)] text-[10px]">|</span>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline text-xs flex items-center gap-1">
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
          <code className="block text-[10px] bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#3b82f6] font-mono">agent.robinhood.com/mcp/trading</code>
        </div>
      </Card>

      {/* Target Portfolio (from simulation) */}
      {portfolio?.allocations && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 uppercase tracking-wider flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-[#3b82f6]" /> Target Allocation
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5 pb-5 border-b border-[var(--border)]">
            {[
              [portfolio.num_positions, 'Positions', ''],
              [`${((1 - portfolio.cash_pct) * 100).toFixed(0)}%`, 'Invested', '#22c55e'],
              [`${(portfolio.cash_pct * 100).toFixed(0)}%`, 'Cash', '#3b82f6'],
              [portfolio.regime?.toUpperCase(), 'Regime', '#8b5cf6'],
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
                <span className="font-mono font-bold text-sm text-[#3b82f6] w-12">{sym}</span>
                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] transition-all duration-500" style={{ width: `${(weight as number) * 100 * 4}%` }} />
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
                    <span className={`font-mono font-bold ${o.side === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
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
function AuthModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string, password: string, isRegister: boolean) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(email, password, isRegister);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border-t sm:border border-[var(--border)] rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-sm scale-in" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

        <div className="text-center mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center mx-auto mb-3">
            <User className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-bold">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="text-xs text-[var(--text-faint)] mt-1">
            {isRegister ? 'Start tracking your trades' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--text-faint)]"
              placeholder="you@example.com" required autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-medium text-[var(--text-faint)] block mb-1 uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--text-faint)]"
              placeholder="Min 6 characters" required minLength={6} />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] font-semibold text-sm disabled:opacity-50 hover:opacity-90 mt-1">
            {submitting ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-[var(--text-faint)] mt-4">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-[#3b82f6] hover:underline font-medium">
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
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
        <div className="w-12 h-12 rounded-full border-4 border-[#3b82f6]/20 border-t-[#3b82f6] animate-spin mb-4" />
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
          <span className={`text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${result.data_source === 'real' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
            {result.data_source === 'real' ? 'Real Data' : 'Simulated'}
          </span>
        </div>
        <p className="text-[42px] sm:text-5xl font-bold font-mono tracking-tighter count-up leading-none">
          ${result.final_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-full text-sm font-semibold
          ${isPositive ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          <span className="text-[var(--text-faint)] font-normal text-xs ml-1">{result.days_simulated} days</span>
        </div>

        <div className="flex items-center justify-center gap-3 mt-3 sm:mt-4">
          <button onClick={handleRefresh} disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:bg-white/5 hover:text-white disabled:opacity-50 transition-all press-scale min-h-[44px]">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Running...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Return</p>
          <p className={`text-lg sm:text-xl font-bold font-mono ${isPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          </p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Max Drawdown</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-[#ef4444]">{(result.max_drawdown * 100).toFixed(2)}%</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Sharpe Ratio</p>
          <p className={`text-lg sm:text-xl font-bold font-mono ${result.sharpe_ratio > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {result.sharpe_ratio.toFixed(2)}
          </p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Win Rate</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-[#3b82f6]">{(result.win_rate * 100).toFixed(0)}%</p>
        </Card>
      </div>

      {/* Statistical Analysis Panel — horizontal scroll on mobile */}
      <div className="scroll-x -mx-3.5 px-3.5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 sm:gap-3">
        <Card className="min-w-[140px] sm:min-w-0">
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Regime</p>
          <p className={`text-sm font-bold ${result.regime === 'bull' ? 'text-[#22c55e]' : result.regime === 'bear' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
            {result.regime === 'bull' ? 'Bull' : result.regime === 'bear' ? 'Bear' : 'Sideways'}
          </p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Adaptive weights</p>
        </Card>
        <Card className="min-w-[120px] sm:min-w-0">
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Trades</p>
          <p className="text-lg font-bold font-mono">{result.total_trades}</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Signal-confirmed</p>
        </Card>
        <Card className="min-w-[120px] sm:min-w-0">
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Positions</p>
          <p className="text-lg font-bold font-mono text-[#8b5cf6]">{result.positions.length}</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Corr-filtered</p>
        </Card>
        <Card className="min-w-[120px] sm:min-w-0">
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Risk Model</p>
          <p className="text-sm font-bold text-[#22c55e]">ATR Stops</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">2.5× adaptive</p>
        </Card>
      </div>

      {/* Equity Curve */}
      {equityCurve.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-[#3b82f6]" /> Equity Curve
          </h3>
          <div className="h-[220px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Portfolio']} labelFormatter={(l: any) => `Date: ${l}`} />
                <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} fill="url(#equityGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Drawdown Chart */}
      {equityCurve.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <TrendingDown className="w-3.5 h-3.5 text-[#ef4444]" /> Drawdown
          </h3>
          <div className="h-[150px] sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }} formatter={(v: any) => [`${(Number(v) * 100).toFixed(2)}%`, 'Drawdown']} />
                <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Current Positions */}
      {positions.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-[#22c55e]" /> Current Holdings ({positions.length})
          </h3>
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-[var(--border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center shrink-0">
                    <span className="font-mono font-bold text-[10px] text-[#3b82f6]">{p.symbol.slice(0, 3)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{p.symbol}</p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{p.quantity.toFixed(2)} shares @ ${p.entry_price}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`font-mono font-bold text-sm ${p.pnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                    {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                  </p>
                  <p className={`text-[10px] font-mono ${p.pnl_pct >= 0 ? 'text-[#22c55e]/70' : 'text-[#ef4444]/70'}`}>
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
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${t.side === 'buy' ? 'bg-[#22c55e]/10' : 'bg-[#ef4444]/10'}`}>
                    {t.side === 'buy' ? <ArrowUpRight className="w-3 h-3 text-[#22c55e]" /> : <ArrowDownRight className="w-3 h-3 text-[#ef4444]" />}
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
  const sentimentColor = (s: string) => s === 'positive' ? '#22c55e' : s === 'negative' ? '#ef4444' : 'var(--text-faint)';
  const sentimentBg = (s: string) => s === 'positive' ? '#22c55e' : s === 'negative' ? '#ef4444' : 'var(--text-faint)';
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

      {/* Aggregate Sentiment Banner */}
      {data && (
        <Card glow={data.aggregateLabel === 'Bullish' ? 'glow-green' : data.aggregateLabel === 'Bearish' ? 'glow-red' : ''}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Market Sentiment</p>
              <p className={`text-xl font-bold ${data.aggregateLabel === 'Bullish' ? 'text-[#22c55e]' : data.aggregateLabel === 'Bearish' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
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
              <div className="h-full bg-gradient-to-r from-[#22c55e] to-[#10b981] rounded-full transition-all" style={{ width: `${Math.max(0, data.aggregateSentiment * 50 + 50)}%` }} />
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
              className="block p-3.5 sm:p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-emphasis)] transition-all press-scale">
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
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] font-mono font-bold">{s}</span>
                    ))}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0 mt-0.5" />
              </div>
            </a>
          ))}
        </div>
      ) : loading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 shimmer rounded-2xl" />)}</div>
      ) : (
        <EmptyState icon={Newspaper} title="No news available" subtitle="News feed will populate when the API is reachable" />
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
      const granted = await requestNotificationPermission();
      if (!granted) return;
    }
    const updated = { ...notifPrefs, enabled: !notifPrefs.enabled };
    saveNotificationPrefs(updated);
    setLocalPrefs(updated);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={History} title="Track Record" subtitle="Every signal logged \u2014 immutable performance audit" accent="#f59e0b"
        action={
          <button onClick={toggleNotifications}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale
              ${notifPrefs.enabled ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20' : 'bg-white/5 text-[var(--text-faint)] border border-[var(--border)]'}`}>
            {notifPrefs.enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            {notifPrefs.enabled ? 'Alerts On' : 'Alerts Off'}
          </button>
        } />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Total Signals</p>
          <p className="text-2xl font-bold font-mono">{stats.totalSignals}</p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">{stats.unresolvedCount} pending</p>
        </Card>
        <Card glow={stats.accuracy >= 60 ? 'glow-green' : stats.accuracy < 40 ? 'glow-red' : ''}>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Accuracy</p>
          <p className={`text-2xl font-bold font-mono ${stats.accuracy >= 55 ? 'text-[#22c55e]' : stats.accuracy < 45 ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
            {stats.accuracy}%
          </p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">{stats.resolvedCount} resolved</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Avg Return</p>
          <p className={`text-2xl font-bold font-mono ${stats.avgReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            {stats.avgReturn >= 0 ? '+' : ''}{stats.avgReturn}%
          </p>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">per signal</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1">Streak</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold font-mono ${stats.streak.type === 'win' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              {stats.streak.count}
            </p>
            <Trophy className={`w-5 h-5 ${stats.streak.type === 'win' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`} />
          </div>
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">{stats.streak.type === 'win' ? 'wins' : 'losses'} in a row</p>
        </Card>
      </div>

      {/* Daily Run History */}
      {runHistory.length > 0 && (
        <Card>
          <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-[#3b82f6]" /> Daily Runs
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] font-mono ml-auto">{streak}-day streak</span>
          </h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {runHistory.slice(0, 30).map((run, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${run.dailyReturn >= 0 ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                  <span className="text-xs font-mono text-[var(--text-muted)]">{run.date}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${run.regime.includes('bull') || run.regime.includes('Expansion') ? 'bg-[#22c55e]/10 text-[#22c55e]' : run.regime.includes('bear') || run.regime.includes('Contraction') ? 'bg-[#ef4444]/10 text-[#ef4444]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
                    {run.regime}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-[var(--text-faint)]">{run.tradesExecuted} trades</span>
                  <span className={`font-mono text-xs font-bold ${run.dailyReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
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
              <div key={strategy} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-[var(--border)]">
                <div>
                  <p className="text-sm font-semibold capitalize">{strategy.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">{data.count} signals</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-xs font-mono font-bold ${data.winRate >= 55 ? 'text-[#22c55e]' : data.winRate < 45 ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                      {data.winRate}% WR
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-mono font-bold ${data.avgReturn >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
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
          <Radio className="w-3.5 h-3.5 text-[#f59e0b]" /> Signal Log ({stats.entries.length})
        </h3>
        {stats.entries.length > 0 ? (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {stats.entries.slice(0, 50).map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${entry.resolved ? (entry.actualReturn && entry.actualReturn > 0 ? 'bg-[#22c55e]/10' : 'bg-[#ef4444]/10') : 'bg-[#f59e0b]/10'}`}>
                    {entry.resolved ? (entry.actualReturn && entry.actualReturn > 0 ? <CheckCircle2 className="w-3 h-3 text-[#22c55e]" /> : <XCircle className="w-3 h-3 text-[#ef4444]" />) : <Clock className="w-3 h-3 text-[#f59e0b]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{entry.symbol} <span className={`text-[10px] ${entry.action === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{entry.action.toUpperCase()}</span></p>
                    <p className="text-[10px] text-[var(--text-faint)] truncate">{entry.strategy} \u00b7 {(entry.confidence * 100).toFixed(0)}% conf</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {entry.resolved ? (
                    <p className={`font-mono text-sm font-bold ${(entry.actualReturn || 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {(entry.actualReturn || 0) >= 0 ? '+' : ''}{(entry.actualReturn || 0).toFixed(2)}%
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#f59e0b] font-semibold">PENDING</p>
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

      {/* Notification Settings */}
      <Card>
        <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Bell className="w-3.5 h-3.5 text-[#8b5cf6]" /> Alert Settings
        </h3>
        <div className="space-y-3">
          {[
            { key: 'signals', label: 'New Signal Alerts', desc: 'Get notified when a new buy/sell signal fires' },
            { key: 'stops', label: 'Stop-Loss Alerts', desc: 'Get notified when a position hits its trailing stop' },
            { key: 'dailyReport', label: 'Daily Performance Report', desc: 'Summary of daily P&L and trades at market close' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-[var(--border)]">
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
                className={`w-10 h-6 rounded-full transition-all ${notifPrefs.enabled && notifPrefs[key as keyof NotificationPrefs] ? 'bg-[#22c55e]' : 'bg-[var(--bg-secondary)]'}`}>
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

export default App;
