import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, TrendingDown, Shield, Zap, BarChart3,
  Target, AlertTriangle, DollarSign, Layers, RefreshCw,
  ChevronRight, ArrowUpRight, ArrowDownRight, Cpu,
  Eye, Crosshair, Gauge, Wallet, PieChart as PieIcon,
  LogIn, LogOut, User, PlayCircle,
} from 'lucide-react';
import * as api from './lib/api';

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

function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auth state
  const [user, setUser] = useState<any>(api.getStoredUser());
  const [showAuth, setShowAuth] = useState(false);

  // Data states
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [brokerStatus, setBrokerStatus] = useState<any>(null);
  const [targetPortfolio, setTargetPortfolio] = useState<any>(null);
  const [riskLimits, setRiskLimits] = useState<any>(null);
  const [technicals, setTechnicals] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [, setHealth] = useState<any>(null);
  const [paperStatus, setPaperStatus] = useState<any>(null);
  const [paperTrades, setPaperTrades] = useState<any[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [regimeData, rankData, sectorData, healthData] = await Promise.all([
        api.getRegime().catch(() => null),
        api.getRankings(15).catch(() => ({ rankings: [] })),
        api.getSectorRotation().catch(() => ({ sectors: [] })),
        api.healthCheck().catch(() => null),
      ]);
      if (regimeData) setRegime(regimeData);
      setRankings(rankData?.rankings || []);
      setSectors(sectorData?.sectors || []);
      setHealth(healthData);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const loadSignals = async () => {
    setLoading(true);
    try {
      const data = await api.scanSignals(0.15);
      setSignals(data?.signals || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadBacktest = async () => {
    setLoading(true);
    try {
      const data = await api.quickBacktest();
      setBacktestResult(data);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadBroker = async () => {
    setLoading(true);
    try {
      const [status, portfolio, limits] = await Promise.all([
        api.getBrokerStatus().catch(() => null),
        api.getTargetPortfolio().catch(() => null),
        api.getRiskLimits().catch(() => null),
      ]);
      setBrokerStatus(status);
      setTargetPortfolio(portfolio);
      setRiskLimits(limits);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadTechnicals = async (symbol: string) => {
    setSelectedSymbol(symbol);
    try {
      const data = await api.getTechnicals(symbol);
      setTechnicals(data);
    } catch {}
  };

  const loadPaper = async () => {
    setLoading(true);
    try {
      const [status, trades] = await Promise.all([
        api.getPaperStatus().catch(() => null),
        api.getPaperTrades().catch(() => ({ trades: [] })),
      ]);
      if (status) setPaperStatus(status);
      setPaperTrades(trades?.trades || []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
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
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleLogout = () => {
    api.clearToken();
    setUser(null);
  };

  useEffect(() => {
    if (tab === 'signals') loadSignals();
    if (tab === 'backtest') loadBacktest();
    if (tab === 'broker' || tab === 'risk') loadBroker();
    if (tab === 'paper') loadPaper();
  }, [tab]);

  const regimeColor = regime?.regime === 'bull' ? 'text-emerald-400' :
    regime?.regime === 'bear' ? 'text-red-400' : 'text-amber-400';
  const regimeBg = regime?.regime === 'bull' ? 'bg-emerald-500/10 border-emerald-500/30' :
    regime?.regime === 'bear' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] grid-bg">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Quant Edge</h1>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] px-2 py-0.5 rounded-full">v0.1</span>
          </div>
          <div className="flex items-center gap-2">
            {regime && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm ${regimeBg}`}>
                <span className={`w-2 h-2 rounded-full pulse-live ${regime.regime === 'bull' ? 'bg-emerald-400' : regime.regime === 'bear' ? 'bg-red-400' : 'bg-amber-400'}`} />
                <span className={regimeColor}>{regime.regime.toUpperCase()}</span>
                <span className="text-[var(--text-muted)]">{(regime.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--bg-card)] text-sm">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--text-secondary)]">{user.display_name || user.email}</span>
                <button onClick={handleLogout} className="p-1 rounded hover:bg-[var(--bg-primary)] transition-colors" title="Log out">
                  <LogOut className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
            )}
            <button onClick={loadDashboard} className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 text-[var(--text-muted)] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1">
          {([
            ['dashboard', Activity, 'Dashboard'],
            ['signals', Crosshair, 'Signals'],
            ['backtest', BarChart3, 'Backtest'],
            ['risk', Shield, 'Risk'],
            ['broker', Wallet, 'Broker'],
            ['paper', PlayCircle, 'Paper Trading'],
          ] as [Tab, any, string][]).map(([t, Icon, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors
                ${tab === t ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-t-2 border-blue-500' :
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-card)]/50'}`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="max-w-[1400px] mx-auto px-6 py-2">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-100">Dismiss</button>
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {tab === 'dashboard' && <DashboardTab regime={regime} rankings={rankings} sectors={sectors} onSelectSymbol={loadTechnicals} technicals={technicals} selectedSymbol={selectedSymbol} />}
        {tab === 'signals' && <SignalsTab signals={signals} loading={loading} onRefresh={loadSignals} onSelectSymbol={loadTechnicals} technicals={technicals} selectedSymbol={selectedSymbol} />}
        {tab === 'backtest' && <BacktestTab result={backtestResult} loading={loading} onRun={loadBacktest} />}
        {tab === 'risk' && <RiskTab limits={riskLimits} />}
        {tab === 'broker' && <BrokerTab status={brokerStatus} portfolio={targetPortfolio} />}
        {tab === 'paper' && <PaperTradingTab status={paperStatus} trades={paperTrades} loading={loading} onRunCycle={async () => { setLoading(true); try { await api.runPaperCycle(); await loadPaper(); } catch (e: any) { setError(e.message); } setLoading(false); }} onReset={async () => { setLoading(true); try { await api.resetPaper(); await loadPaper(); } catch (e: any) { setError(e.message); } setLoading(false); }} />}
      </main>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSubmit={handleLogin} />}
    </div>
  );
}

// Card component
function Card({ children, className = '', glow = '' }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 ${glow} ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: { label: string; value: string; sub?: string; icon: any; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-emerald-400 bg-emerald-500/10',
    red: 'text-red-400 bg-red-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
  };
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
    </Card>
  );
}

// ── Dashboard ──
function DashboardTab({ regime, rankings, sectors, onSelectSymbol, technicals, selectedSymbol }: any) {
  const topBuys = rankings.filter((r: RankingEntry) => r.composite > 0).slice(0, 8);

  const radarData = regime?.signals ? [
    { factor: 'Trend', value: Math.max(0, (regime.signals.trend + 1) * 50) },
    { factor: 'Mom 1M', value: Math.max(0, Math.min(100, (regime.signals.momentum_1m + 0.1) * 500)) },
    { factor: 'Mom 3M', value: Math.max(0, Math.min(100, (regime.signals.momentum_3m + 0.2) * 250)) },
    { factor: 'Breadth', value: (regime.signals.breadth || 0.5) * 100 },
    { factor: 'Low Vol', value: regime.signals.volatility_regime === 'low' ? 80 : regime.signals.volatility_regime === 'normal' ? 50 : 20 },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Market Regime" value={regime?.regime?.toUpperCase() || '—'} sub={`Confidence: ${regime ? (regime.confidence * 100).toFixed(0) : '—'}%`} icon={Gauge} color={regime?.regime === 'bull' ? 'green' : regime?.regime === 'bear' ? 'red' : 'amber'} />
        <StatCard label="Universe Size" value={rankings.length.toString()} sub="Stocks scored" icon={Target} color="blue" />
        <StatCard label="Top Signal" value={topBuys[0]?.symbol || '—'} sub={topBuys[0] ? `Score: ${topBuys[0].composite.toFixed(2)}` : ''} icon={TrendingUp} color="green" />
        <StatCard label="Sectors Tracked" value={sectors.length.toString()} sub="GICS sectors" icon={PieIcon} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Regime Radar */}
        <Card className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" /> Regime Signals
          </h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className="text-[var(--text-muted)] text-sm">Loading regime data...</p>}
        </Card>

        {/* Top Rankings Table */}
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Multi-Factor Rankings
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Symbol</th>
                  <th className="text-right py-2 pr-3">Composite</th>
                  <th className="text-right py-2 pr-3">Momentum</th>
                  <th className="text-right py-2 pr-3">Mean Rev</th>
                  <th className="text-right py-2 pr-3">Quality</th>
                  <th className="text-right py-2">Vol Score</th>
                </tr>
              </thead>
              <tbody>
                {topBuys.map((r: RankingEntry) => (
                  <tr key={r.symbol} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors" onClick={() => onSelectSymbol(r.symbol)}>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">{r.rank}</td>
                    <td className="py-2 pr-3 font-mono font-semibold text-blue-400">{r.symbol}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${r.composite > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.composite.toFixed(3)}</td>
                    <td className={`py-2 pr-3 text-right font-mono text-xs ${r.momentum > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{(r.momentum * 100).toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right font-mono text-xs text-cyan-400/80">{r.mean_reversion.toFixed(3)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-xs text-purple-400/80">{r.quality.toFixed(3)}</td>
                    <td className="py-2 text-right font-mono text-xs text-amber-400/80">{r.volatility.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Sector Rotation */}
      <Card>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" /> Sector Relative Strength
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sectors.map((s: any) => (
            <div key={s.etf} className={`flex items-center justify-between p-3 rounded-lg border ${s.above_50sma ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              <div>
                <p className="font-mono text-sm font-semibold">{s.sector}</p>
                <p className="text-xs text-[var(--text-muted)]">{s.etf} · Rank #{s.rank}</p>
              </div>
              <div className="text-right">
                <p className={`font-mono text-sm ${s.return_1m > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.return_1m > 0 ? '+' : ''}{(s.return_1m * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-[var(--text-muted)]">1M</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Technical Detail */}
      {technicals && selectedSymbol && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" /> {selectedSymbol} — Technical Detail
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold font-mono">${technicals.price?.toFixed(2)}</p>
              <p className="text-xs text-[var(--text-muted)]">Price</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold font-mono ${technicals.rsi < 30 ? 'text-emerald-400' : technicals.rsi > 70 ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>{technicals.rsi?.toFixed(1)}</p>
              <p className="text-xs text-[var(--text-muted)]">RSI</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold font-mono ${technicals.macd?.histogram > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{technicals.macd?.histogram?.toFixed(3)}</p>
              <p className="text-xs text-[var(--text-muted)]">MACD Hist</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold font-mono ${(technicals.factors?.momentum || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{((technicals.factors?.momentum || 0) * 100).toFixed(1)}%</p>
              <p className="text-xs text-[var(--text-muted)]">Momentum</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-cyan-400">{technicals.factors?.mean_reversion?.toFixed(3)}</p>
              <p className="text-xs text-[var(--text-muted)]">Mean Rev</p>
            </div>
          </div>
          {technicals.price_history && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={technicals.price_history}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={60} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-muted)' }} />
                <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="url(#priceGrad)" strokeWidth={2} />
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-blue-400" /> Signal Scanner
        </h2>
        <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan Universe
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Signals" value={signals.length.toString()} icon={Activity} color="blue" />
        <StatCard label="Buy Signals" value={buySignals.length.toString()} icon={ArrowUpRight} color="green" />
        <StatCard label="Sell Signals" value={sellSignals.length.toString()} icon={ArrowDownRight} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Buy signals */}
        <Card glow="glow-green">
          <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4" /> Buy Signals ({buySignals.length})
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {buySignals.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 cursor-pointer transition-colors" onClick={() => onSelectSymbol(s.symbol)}>
                <div>
                  <span className="font-mono font-semibold text-blue-400">{s.symbol}</span>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-emerald-400">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-xs text-[var(--text-muted)]">{s.strategy}</p>
                </div>
              </div>
            ))}
            {buySignals.length === 0 && <p className="text-[var(--text-muted)] text-sm py-4 text-center">No buy signals found</p>}
          </div>
        </Card>

        {/* Sell signals */}
        <Card glow="glow-red">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4" /> Sell / Caution Signals ({sellSignals.length})
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {sellSignals.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10 hover:border-red-500/30 cursor-pointer transition-colors" onClick={() => onSelectSymbol(s.symbol)}>
                <div>
                  <span className="font-mono font-semibold text-blue-400">{s.symbol}</span>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-red-400">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-xs text-[var(--text-muted)]">{s.strategy}</p>
                </div>
              </div>
            ))}
            {sellSignals.length === 0 && <p className="text-[var(--text-muted)] text-sm py-4 text-center">No sell signals found</p>}
          </div>
        </Card>
      </div>

      {/* Signal strength distribution */}
      {signals.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Signal Strength Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signals.slice(0, 30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="symbol" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Bar dataKey="strength" radius={[4, 4, 0, 0]}>
                {signals.slice(0, 30).map((s: any, i: number) => (
                  <Cell key={i} fill={s.signal_type === 'buy' ? '#10b981' : s.signal_type === 'sell' ? '#ef4444' : '#f59e0b'} />
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
function BacktestTab({ result, loading, onRun }: any) {
  const isPositive = result && result.total_return > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" /> Backtest Engine
        </h2>
        <button onClick={onRun} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Run Backtest
        </button>
      </div>

      {result && !result.error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Return" value={`${isPositive ? '+' : ''}${(result.total_return * 100).toFixed(1)}%`} sub={`$${result.initial_capital} → $${result.final_value}`} icon={isPositive ? TrendingUp : TrendingDown} color={isPositive ? 'green' : 'red'} />
            <StatCard label="Annual Return" value={`${(result.annual_return * 100).toFixed(1)}%`} icon={DollarSign} color={result.annual_return > 0 ? 'green' : 'red'} />
            <StatCard label="Sharpe Ratio" value={result.sharpe_ratio?.toFixed(2) || '—'} sub={`Sortino: ${result.sortino_ratio?.toFixed(2) || '—'}`} icon={Target} color={result.sharpe_ratio > 1 ? 'green' : result.sharpe_ratio > 0 ? 'amber' : 'red'} />
            <StatCard label="Max Drawdown" value={`${(result.max_drawdown * 100).toFixed(1)}%`} sub={`${result.total_trades} trades`} icon={AlertTriangle} color={result.max_drawdown > -0.15 ? 'green' : 'red'} />
          </div>

          {result.equity_curve && (
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Equity Curve</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={result.equity_curve}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={60} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Value']} />
                  <Area type="monotone" dataKey="value" stroke={isPositive ? '#10b981' : '#ef4444'} fill="url(#eqGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {result.equity_curve && (
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Drawdown</h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={result.equity_curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, 'Drawdown']} />
                  <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {result?.error && (
        <Card>
          <p className="text-red-400">{result.error}</p>
        </Card>
      )}

      {!result && !loading && (
        <Card className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Click "Run Backtest" to simulate the multi-factor strategy on historical data</p>
        </Card>
      )}
    </div>
  );
}

// ── Risk ──
function RiskTab({ limits }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="w-5 h-5 text-amber-400" /> Risk Management
      </h2>

      {limits && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Position Limits</h3>
            <div className="space-y-3">
              <LimitBar label="Max Position" value={limits.max_position_pct} color="blue" />
              <LimitBar label="Max Sector" value={limits.max_sector_pct} color="purple" />
              <LimitBar label="Min Cash Reserve" value={limits.min_cash_reserve_pct} color="cyan" />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Drawdown Controls</h3>
            <div className="space-y-3">
              <LimitBar label="Warning Level" value={Math.abs(limits.max_drawdown_warning)} color="amber" />
              <LimitBar label="Reduce Level" value={Math.abs(limits.max_drawdown_reduce)} color="red" />
              <LimitBar label="Liquidation Level" value={Math.abs(limits.max_drawdown_liquidate)} color="red" />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Trade Controls</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-muted)]">Trailing Stop-Loss</span>
                <span className="font-mono text-red-400">{(limits.trailing_stop_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-muted)]">Take-Profit Target</span>
                <span className="font-mono text-emerald-400">+{(limits.take_profit_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-muted)]">Partial Sell at TP</span>
                <span className="font-mono">{(limits.take_profit_sell_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-muted)]">PDT Day Trades</span>
                <span className="font-mono text-amber-400">{limits.pdt_max_day_trades}/5 days</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Risk Architecture</h3>
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)]">Half-Kelly Sizing</strong> — conservative Kelly criterion (f=0.5) for position sizing</span>
              </div>
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)]">Correlation-Aware</strong> — avoids loading correlated positions</span>
              </div>
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)]">Regime-Adaptive</strong> — reduces exposure in bear/sideways markets</span>
              </div>
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)]">Multi-Layer Stops</strong> — per-position trailing + portfolio-level drawdown</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!limits && (
        <Card className="text-center py-12">
          <Shield className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading risk parameters...</p>
        </Card>
      )}
    </div>
  );
}

function LimitBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', red: 'bg-red-500',
    purple: 'bg-purple-500', amber: 'bg-amber-500', cyan: 'bg-cyan-500',
  };
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="w-full bg-[var(--bg-primary)] rounded-full h-2">
        <div className={`h-2 rounded-full ${colorMap[color]}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

// ── Broker ──
function BrokerTab({ status, portfolio }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Wallet className="w-5 h-5 text-cyan-400" /> Broker Connections
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Alpaca */}
        <Card glow={status?.primary?.configured ? 'glow-green' : ''}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${status?.primary?.configured ? 'bg-emerald-400 pulse-live' : 'bg-red-400'}`} />
            <h3 className="text-sm font-semibold">Alpaca (Primary)</h3>
          </div>
          {status?.primary?.configured ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Equity</span><span className="font-mono">${Number(status.primary.equity).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Cash</span><span className="font-mono">${Number(status.primary.cash).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Buying Power</span><span className="font-mono">${Number(status.primary.buying_power).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Day Trades</span><span className="font-mono text-amber-400">{status.primary.daytrade_count}/3</span></div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              <p>Not configured. Set <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">ALPACA_API_KEY</code> and <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">ALPACA_SECRET_KEY</code> environment variables.</p>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" className="text-blue-400 hover:underline block mt-2">Get free paper trading keys →</a>
            </div>
          )}
        </Card>

        {/* Robinhood */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${status?.secondary?.configured ? 'bg-emerald-400 pulse-live' : 'bg-gray-600'}`} />
            <h3 className="text-sm font-semibold">Robinhood (Secondary)</h3>
          </div>
          {status?.secondary?.configured ? (
            <p className="text-sm text-emerald-400">Connected via MCP</p>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              <p>Not configured. Set <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">ROBINHOOD_ACCESS_TOKEN</code> environment variable.</p>
              <p className="mt-2">Requires Robinhood Agentic Trading account setup in the Robinhood app.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Target Portfolio */}
      {portfolio && portfolio.allocations && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" /> Target Portfolio Allocation
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xl font-bold font-mono">{portfolio.num_positions}</p>
              <p className="text-xs text-[var(--text-muted)]">Positions</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold font-mono text-emerald-400">{((1 - portfolio.cash_pct) * 100).toFixed(0)}%</p>
              <p className="text-xs text-[var(--text-muted)]">Invested</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold font-mono text-cyan-400">{(portfolio.cash_pct * 100).toFixed(0)}%</p>
              <p className="text-xs text-[var(--text-muted)]">Cash</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold font-mono text-purple-400">{portfolio.regime?.toUpperCase()}</p>
              <p className="text-xs text-[var(--text-muted)]">Regime</p>
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(portfolio.allocations).sort(([, a], [, b]) => (b as number) - (a as number)).map(([sym, weight]) => (
              <div key={sym} className="flex items-center gap-3">
                <span className="font-mono text-sm text-blue-400 w-14">{sym}</span>
                <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-3">
                  <div className="h-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600" style={{ width: `${(weight as number) * 100 * 4}%` }} />
                </div>
                <span className="font-mono text-sm text-[var(--text-secondary)] w-14 text-right">{((weight as number) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {portfolio.orders?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2">REBALANCE ORDERS</h4>
              <div className="space-y-1">
                {portfolio.orders.map((o: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={`font-mono ${o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <LogIn className="w-5 h-5 text-blue-400" />
          {isRegister ? 'Create Account' : 'Sign In'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {submitting ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-[var(--text-muted)] mt-4">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-blue-400 hover:underline">
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Paper Trading Tab ──
function PaperTradingTab({ status, trades, loading, onRunCycle, onReset }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <PlayCircle className="w-5 h-5 text-emerald-400" /> Paper Trading
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onRunCycle}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run Cycle'}
          </button>
          <button
            onClick={onReset}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:bg-[var(--bg-primary)] text-sm transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-[var(--text-muted)] mb-1">Portfolio Value</p>
            <p className="text-xl font-bold font-mono">${status.portfolio_value?.toLocaleString()}</p>
          </Card>
          <Card>
            <p className="text-xs text-[var(--text-muted)] mb-1">Total Return</p>
            <p className={`text-xl font-bold font-mono ${status.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.total_return_pct >= 0 ? '+' : ''}{status.total_return_pct?.toFixed(2)}%
            </p>
          </Card>
          <Card>
            <p className="text-xs text-[var(--text-muted)] mb-1">Cash</p>
            <p className="text-xl font-bold font-mono text-cyan-400">${status.cash?.toLocaleString()}</p>
          </Card>
          <Card>
            <p className="text-xs text-[var(--text-muted)] mb-1">Positions</p>
            <p className="text-xl font-bold font-mono">{status.num_positions || 0}</p>
          </Card>
        </div>
      )}

      {status?.positions?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Open Positions</h3>
          <div className="space-y-2">
            {status.positions.map((p: any) => (
              <div key={p.symbol} className="flex items-center justify-between text-sm">
                <span className="font-mono text-blue-400 w-14">{p.symbol}</span>
                <span className="text-[var(--text-muted)]">{p.quantity} shares @ ${p.entry_price}</span>
                <span className={`font-mono ${p.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.unrealized_pnl >= 0 ? '+' : ''}${p.unrealized_pnl?.toFixed(2)} ({p.unrealized_pnl_pct?.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Trade History</h3>
        {trades?.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {trades.slice(0, 50).map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[var(--border)]/50">
                <span className="text-[var(--text-muted)] w-28">{new Date(t.timestamp).toLocaleDateString()}</span>
                <span className={`font-mono w-10 ${t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{t.side?.toUpperCase()}</span>
                <span className="font-mono text-blue-400 w-14">{t.symbol}</span>
                <span className="text-[var(--text-muted)] w-16 text-right">{t.quantity} @ ${t.price}</span>
                {t.pnl != null && (
                  <span className={`font-mono w-16 text-right ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No trades yet. Click "Run Cycle" to execute a trading cycle.</p>
        )}
      </Card>
    </div>
  );
}

export default App;
