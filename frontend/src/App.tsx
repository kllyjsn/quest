import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, TrendingDown, Shield, Zap,
  Target, AlertTriangle, DollarSign, Layers, RefreshCw,
  ChevronRight, ArrowUpRight, ArrowDownRight, Cpu,
  Eye, Crosshair, Gauge, PieChart as PieIcon,
  LogIn, LogOut, User, Clock, Flame, X,
  LayoutDashboard, LineChart, FlaskConical, ShieldCheck, Link2,
} from 'lucide-react';
import * as api from './lib/api';
import {
  runReal30DayBacktest, type RealBacktestResult,
  generateDashboardData, generateSignals, generateBacktest,
  generateRiskLimits, generateBrokerData, generateTechnicals,
  generateMonteCarlo, generateCorrelationMatrix, generatePerformanceAttribution,
} from './lib/simulation';

type Tab = 'dashboard' | 'signals' | 'backtest' | 'risk' | 'broker' | 'paper';

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
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Home' },
  { id: 'signals', icon: Crosshair, label: 'Signals', shortLabel: 'Signals' },
  { id: 'backtest', icon: FlaskConical, label: 'Backtest', shortLabel: 'Backtest' },
  { id: 'risk', icon: ShieldCheck, label: 'Risk', shortLabel: 'Risk' },
  { id: 'broker', icon: Link2, label: 'Broker', shortLabel: 'Broker' },
  { id: 'paper', icon: LineChart, label: 'Paper Trade', shortLabel: 'Paper' },
];

function App() {
  const [tab, setTab] = useState<Tab>('paper');
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

  useEffect(() => {
    if (tab === 'signals') loadSignals();
    if (tab === 'backtest') loadBacktest();
    if (tab === 'broker' || tab === 'risk') { loadBroker(); loadCorrelation(); }
    // paper tab manages its own data loading internally
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
        {tab === 'dashboard' && <DashboardTab regime={regime} rankings={rankings} sectors={sectors} onSelectSymbol={loadTechnicals} technicals={technicals} selectedSymbol={selectedSymbol} />}
        {tab === 'signals' && <SignalsTab signals={signals} loading={loading} onRefresh={loadSignals} onSelectSymbol={loadTechnicals} />}
        {tab === 'backtest' && <BacktestTab result={backtestResult} loading={loading} onRun={loadBacktest} monteCarlo={monteCarlo} attribution={attribution} />}
        {tab === 'risk' && <RiskTab limits={riskLimits} correlationMatrix={correlationMatrix} />}
        {tab === 'broker' && <BrokerTab status={brokerStatus} portfolio={targetPortfolio} />}
        {tab === 'paper' && <PaperTradingTab />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-[var(--border)] z-50 safe-bottom">
        <div className="grid grid-cols-6 h-16">
          {TABS.map(({ id, icon: Icon, shortLabel }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors
                ${tab === id ? 'text-[#3b82f6]' : 'text-[var(--text-faint)]'}`}>
              <Icon className={`w-5 h-5 ${tab === id ? 'text-[#3b82f6]' : ''}`} />
              {shortLabel}
            </button>
          ))}
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSubmit={handleLogin} />}
    </div>
  );
}

// ── Shared Components ──

function Card({ children, className = '', glow = '' }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] hover:border-[var(--border-emphasis)] transition-all card-hover gradient-border ${glow} ${className}`}>
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
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm min-w-[480px]">
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

// ── Broker ──
function BrokerTab({ status, portfolio }: any) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader icon={Link2} title="Broker Connections" subtitle="Manage execution endpoints" accent="#06b6d4" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card glow={status?.primary?.configured ? 'glow-green' : ''}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${status?.primary?.configured ? 'bg-[#22c55e] pulse-dot' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Alpaca</h3>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-faint)] bg-white/5 px-2 py-0.5 rounded-full">Primary</span>
          </div>
          {status?.primary?.configured ? (
            <div className="space-y-2.5">
              {[
                ['Equity', `$${Number(status.primary.equity).toLocaleString()}`],
                ['Cash', `$${Number(status.primary.cash).toLocaleString()}`],
                ['Buying Power', `$${Number(status.primary.buying_power).toLocaleString()}`],
                ['Day Trades', `${status.primary.daytrade_count}/3`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-[var(--text-muted)]">{label}</span>
                  <span className="font-mono font-semibold">{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)] space-y-2">
              <p>Not configured</p>
              <code className="block text-[10px] bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#3b82f6] font-mono">ALPACA_API_KEY<br/>ALPACA_SECRET_KEY</code>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline text-xs inline-block mt-2">Get paper trading keys &rarr;</a>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2.5 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${status?.secondary?.configured ? 'bg-[#22c55e] pulse-dot' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Robinhood</h3>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-faint)] bg-white/5 px-2 py-0.5 rounded-full">Secondary</span>
          </div>
          {status?.secondary?.configured ? (
            <p className="text-sm text-[#22c55e] font-medium">Connected via MCP</p>
          ) : (
            <div className="text-sm text-[var(--text-muted)] space-y-2">
              <p>Not configured</p>
              <code className="block text-[10px] bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#3b82f6] font-mono">ROBINHOOD_ACCESS_TOKEN</code>
            </div>
          )}
        </Card>
      </div>

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
function PaperTradingTab() {
  const [result, setResult] = useState<RealBacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await runReal30DayBacktest();
        if (!cancelled) setResult(data);
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
      <div className="text-center py-4 sm:py-6">
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> 30-Day Paper Backtest
          </p>
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${result.data_source === 'real' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
            {result.data_source === 'real' ? 'Real Data' : 'Simulated'}
          </span>
        </div>
        <p className="text-4xl sm:text-5xl font-bold font-mono tracking-tighter count-up">
          ${result.final_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-sm font-semibold
          ${isPositive ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          <span className="text-[var(--text-faint)] font-normal text-xs ml-1">{result.days_simulated} days</span>
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={handleRefresh} disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:bg-white/5 hover:text-white disabled:opacity-50 transition-all">
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

      {/* Statistical Analysis Panel */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Regime</p>
          <p className={`text-sm font-bold ${result.regime === 'bull' ? 'text-[#22c55e]' : result.regime === 'bear' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
            {result.regime === 'bull' ? '🐂 Bull' : result.regime === 'bear' ? '🐻 Bear' : '↔️ Sideways'}
          </p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Adaptive factor weights</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Trades</p>
          <p className="text-lg sm:text-xl font-bold font-mono">{result.total_trades}</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Signal-confirmed entries</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Positions</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-[#8b5cf6]">{result.positions.length}</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">Correlation-filtered</p>
        </Card>
        <Card>
          <p className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider mb-1 font-medium">Risk Model</p>
          <p className="text-sm font-bold text-[#22c55e]">ATR Stops</p>
          <p className="text-[8px] text-[var(--text-faint)] mt-0.5">2.5× ATR adaptive</p>
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

export default App;
