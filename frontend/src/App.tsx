import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, TrendingDown, Shield, Zap, BarChart3,
  Target, AlertTriangle, DollarSign, Layers, RefreshCw,
  ChevronRight, ArrowUpRight, ArrowDownRight, Cpu,
  Eye, Crosshair, Gauge, Wallet, PieChart as PieIcon,
  LogIn, LogOut, User, PlayCircle, Clock, Flame,
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

  const [user, setUser] = useState<any>(api.getStoredUser());
  const [showAuth, setShowAuth] = useState(false);

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
  const [paperStatus, setPaperStatus] = useState<any>(null);
  const [paperTrades, setPaperTrades] = useState<any[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [regimeData, rankData, sectorData] = await Promise.all([
        api.getRegime().catch(() => null),
        api.getRankings(15).catch(() => ({ rankings: [] })),
        api.getSectorRotation().catch(() => ({ sectors: [] })),
      ]);
      if (regimeData) setRegime(regimeData);
      setRankings(rankData?.rankings || []);
      setSectors(sectorData?.sectors || []);
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

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] grid-bg">
      {/* Header */}
      <header className="border-b border-[var(--border)] glass sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#58a6ff] to-[#a371f7] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Quest Trading</h1>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">Quantitative Edge</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {regime && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium
                ${regime.regime === 'bull' ? 'border-[#00c805]/30 bg-[#00c805]/8' :
                  regime.regime === 'bear' ? 'border-[#ff5000]/30 bg-[#ff5000]/8' :
                    'border-[#d29922]/30 bg-[#d29922]/8'}`}>
                <span className={`w-2 h-2 rounded-full pulse-live ${regime.regime === 'bull' ? 'bg-[#00c805]' : regime.regime === 'bear' ? 'bg-[#ff5000]' : 'bg-[#d29922]'}`} />
                <span className={regime.regime === 'bull' ? 'text-[#00c805]' : regime.regime === 'bear' ? 'text-[#ff5000]' : 'text-[#d29922]'}>
                  {regime.regime.toUpperCase()}
                </span>
                <span className="text-[var(--text-faint)]">{(regime.confidence * 100).toFixed(0)}%</span>
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-[var(--border)]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#58a6ff] to-[#a371f7] flex items-center justify-center text-xs font-bold">
                  {(user.display_name || user.email)?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-[var(--text-secondary)] hidden md:block">{user.display_name || user.email}</span>
                <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Log out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="btn-primary flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Sign In
              </button>
            )}

            <button onClick={loadDashboard} className="p-2.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-[1440px] mx-auto px-8 flex gap-1 -mb-px">
          {([
            ['dashboard', Activity, 'Dashboard'],
            ['signals', Crosshair, 'Signals'],
            ['backtest', BarChart3, 'Backtest'],
            ['risk', Shield, 'Risk'],
            ['broker', Wallet, 'Broker'],
            ['paper', PlayCircle, 'Paper'],
          ] as [Tab, any, string][]).map(([t, Icon, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium relative transition-all
                ${tab === t ? 'text-[var(--text-primary)] tab-active' :
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="max-w-[1440px] mx-auto px-8 pt-4 fade-in">
          <div className="bg-[#ff5000]/8 border border-[#ff5000]/20 rounded-xl px-5 py-3 text-[#ff5000] text-sm flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-[#ff5000]/70 hover:text-[#ff5000] font-medium">Dismiss</button>
          </div>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto px-8 py-8 fade-in">
        {tab === 'dashboard' && <DashboardTab regime={regime} rankings={rankings} sectors={sectors} onSelectSymbol={loadTechnicals} technicals={technicals} selectedSymbol={selectedSymbol} />}
        {tab === 'signals' && <SignalsTab signals={signals} loading={loading} onRefresh={loadSignals} onSelectSymbol={loadTechnicals} />}
        {tab === 'backtest' && <BacktestTab result={backtestResult} loading={loading} onRun={loadBacktest} />}
        {tab === 'risk' && <RiskTab limits={riskLimits} />}
        {tab === 'broker' && <BrokerTab status={brokerStatus} portfolio={targetPortfolio} />}
        {tab === 'paper' && <PaperTradingTab status={paperStatus} trades={paperTrades} loading={loading} onRunCycle={async () => { setLoading(true); try { await api.runPaperCycle(); await loadPaper(); } catch (e: any) { setError(e.message); } setLoading(false); }} onReset={async () => { setLoading(true); try { await api.resetPaper(); await loadPaper(); } catch (e: any) { setError(e.message); } setLoading(false); }} />}
      </main>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSubmit={handleLogin} />}
    </div>
  );
}

// ── Shared Components ──

function Card({ children, className = '', glow = '' }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)] hover:border-[var(--border-emphasis)] transition-all ${glow} ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: { label: string; value: string; sub?: string; icon: any; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-[#58a6ff] bg-[#58a6ff]/10',
    green: 'text-[#00c805] bg-[#00c805]/10',
    red: 'text-[#ff5000] bg-[#ff5000]/10',
    purple: 'text-[#a371f7] bg-[#a371f7]/10',
    amber: 'text-[#d29922] bg-[#d29922]/10',
    cyan: 'text-[#39d353] bg-[#39d353]/10',
  };
  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight count-up">{value}</p>
      {sub && <p className="text-xs text-[var(--text-faint)] mt-2">{sub}</p>}
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
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Market Regime" value={regime?.regime?.toUpperCase() || '—'} sub={`Confidence: ${regime ? (regime.confidence * 100).toFixed(0) : '—'}%`} icon={Gauge} color={regime?.regime === 'bull' ? 'green' : regime?.regime === 'bear' ? 'red' : 'amber'} />
        <StatCard label="Universe" value={rankings.length.toString()} sub="Stocks scored & ranked" icon={Target} color="blue" />
        <StatCard label="Top Signal" value={topBuys[0]?.symbol || '—'} sub={topBuys[0] ? `Composite: ${topBuys[0].composite.toFixed(3)}` : ''} icon={Flame} color="green" />
        <StatCard label="Sectors" value={sectors.length.toString()} sub="GICS sectors tracked" icon={PieIcon} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#58a6ff]" /> Regime Signals
          </h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <div className="h-60 shimmer rounded-xl" />}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#00c805]" /> Multi-Factor Rankings
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-faint)] text-[11px] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-3 pr-3">#</th>
                  <th className="text-left py-3 pr-3">Symbol</th>
                  <th className="text-right py-3 pr-3">Score</th>
                  <th className="text-right py-3 pr-3">Mom</th>
                  <th className="text-right py-3 pr-3">MR</th>
                  <th className="text-right py-3 pr-3">Qual</th>
                  <th className="text-right py-3">Vol</th>
                </tr>
              </thead>
              <tbody>
                {topBuys.map((r: RankingEntry, idx: number) => (
                  <tr key={r.symbol}
                    className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors"
                    onClick={() => onSelectSymbol(r.symbol)}
                    style={{ animationDelay: `${idx * 50}ms` }}>
                    <td className="py-3 pr-3 text-[var(--text-faint)] text-xs">{r.rank}</td>
                    <td className="py-3 pr-3">
                      <span className="font-mono font-bold text-[#58a6ff]">{r.symbol}</span>
                    </td>
                    <td className={`py-3 pr-3 text-right font-mono font-semibold ${r.composite > 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
                      {r.composite.toFixed(3)}
                    </td>
                    <td className={`py-3 pr-3 text-right font-mono text-xs ${r.momentum > 0 ? 'text-[#00c805]/80' : 'text-[#ff5000]/80'}`}>
                      {(r.momentum * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-xs text-[#39d353]/80">{r.mean_reversion.toFixed(3)}</td>
                    <td className="py-3 pr-3 text-right font-mono text-xs text-[#a371f7]/80">{r.quality.toFixed(3)}</td>
                    <td className="py-3 text-right font-mono text-xs text-[#d29922]/80">{r.volatility.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Sector Rotation */}
      <Card>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#a371f7]" /> Sector Relative Strength
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sectors.map((s: any, idx: number) => (
            <div key={s.etf}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:scale-[1.01]
                ${s.above_50sma ? 'border-[#00c805]/15 bg-[#00c805]/4 hover:border-[#00c805]/30' : 'border-[#ff5000]/15 bg-[#ff5000]/4 hover:border-[#ff5000]/30'}`}
              style={{ animationDelay: `${idx * 30}ms` }}>
              <div>
                <p className="font-semibold text-sm">{s.sector}</p>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">{s.etf} · #{s.rank}</p>
              </div>
              <div className="text-right">
                <p className={`font-mono font-bold text-sm ${s.return_1m > 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
                  {s.return_1m > 0 ? '+' : ''}{(s.return_1m * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-[var(--text-faint)] uppercase">1 Month</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Technical Detail */}
      {technicals && selectedSymbol && (
        <Card glow="glow-blue">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5 flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#58a6ff]" /> {selectedSymbol} — Technical Detail
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-6">
            <div className="text-center">
              <p className="text-3xl font-bold font-mono">${technicals.price?.toFixed(2)}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Price</p>
            </div>
            <div className="text-center">
              <p className={`text-3xl font-bold font-mono ${technicals.rsi < 30 ? 'text-[#00c805]' : technicals.rsi > 70 ? 'text-[#ff5000]' : ''}`}>{technicals.rsi?.toFixed(1)}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">RSI</p>
            </div>
            <div className="text-center">
              <p className={`text-3xl font-bold font-mono ${technicals.macd?.histogram > 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>{technicals.macd?.histogram?.toFixed(3)}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">MACD</p>
            </div>
            <div className="text-center">
              <p className={`text-3xl font-bold font-mono ${(technicals.factors?.momentum || 0) > 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>{((technicals.factors?.momentum || 0) * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Momentum</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-[#39d353]">{technicals.factors?.mean_reversion?.toFixed(3)}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Mean Rev</p>
            </div>
          </div>
          {technicals.price_history && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={technicals.price_history}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 11 }} width={60} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} labelStyle={{ color: 'var(--text-muted)' }} />
                <Area type="monotone" dataKey="close" stroke="#58a6ff" fill="url(#priceGrad)" strokeWidth={2.5} dot={false} />
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-[#58a6ff]" /> Signal Scanner
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Real-time multi-factor signal detection</p>
        </div>
        <button onClick={onRefresh} className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan Universe
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <StatCard label="Total" value={signals.length.toString()} icon={Activity} color="blue" />
        <StatCard label="Buy" value={buySignals.length.toString()} icon={ArrowUpRight} color="green" />
        <StatCard label="Sell" value={sellSignals.length.toString()} icon={ArrowDownRight} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card glow="glow-green">
          <h3 className="text-sm font-bold text-[#00c805] mb-4 flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4" /> Buy Signals
            <span className="text-[var(--text-faint)] font-normal ml-auto">{buySignals.length}</span>
          </h3>
          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {buySignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#00c805]/4 border border-[#00c805]/10 hover:border-[#00c805]/30 cursor-pointer transition-all hover:scale-[1.01]"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div>
                  <span className="font-mono font-bold text-[#58a6ff]">{s.symbol}</span>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5 max-w-[180px] truncate">{s.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-sm text-[#00c805]">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-[var(--text-faint)] uppercase">{s.strategy}</p>
                </div>
              </div>
            ))}
            {buySignals.length === 0 && <p className="text-[var(--text-faint)] text-sm py-8 text-center">No buy signals</p>}
          </div>
        </Card>

        <Card glow="glow-red">
          <h3 className="text-sm font-bold text-[#ff5000] mb-4 flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4" /> Sell Signals
            <span className="text-[var(--text-faint)] font-normal ml-auto">{sellSignals.length}</span>
          </h3>
          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {sellSignals.map((s: any, i: number) => (
              <div key={i}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#ff5000]/4 border border-[#ff5000]/10 hover:border-[#ff5000]/30 cursor-pointer transition-all hover:scale-[1.01]"
                onClick={() => onSelectSymbol(s.symbol)}>
                <div>
                  <span className="font-mono font-bold text-[#58a6ff]">{s.symbol}</span>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5 max-w-[180px] truncate">{s.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-sm text-[#ff5000]">{(s.strength * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-[var(--text-faint)] uppercase">{s.strategy}</p>
                </div>
              </div>
            ))}
            {sellSignals.length === 0 && <p className="text-[var(--text-faint)] text-sm py-8 text-center">No sell signals</p>}
          </div>
        </Card>
      </div>

      {signals.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5">Signal Strength Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signals.slice(0, 30)}>
              <XAxis dataKey="symbol" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} angle={-45} textAnchor="end" height={50} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} />
              <Bar dataKey="strength" radius={[6, 6, 0, 0]}>
                {signals.slice(0, 30).map((s: any, i: number) => (
                  <Cell key={i} fill={s.signal_type === 'buy' ? '#00c805' : s.signal_type === 'sell' ? '#ff5000' : '#d29922'} fillOpacity={0.8} />
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#a371f7]" /> Backtest Engine
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Walk-forward validation on historical data</p>
        </div>
        <button onClick={onRun} className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Run Backtest
        </button>
      </div>

      {result && !result.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard label="Total Return" value={`${isPositive ? '+' : ''}${(result.total_return * 100).toFixed(1)}%`} sub={`$${result.initial_capital?.toLocaleString()} → $${result.final_value?.toLocaleString()}`} icon={isPositive ? TrendingUp : TrendingDown} color={isPositive ? 'green' : 'red'} />
            <StatCard label="Annual Return" value={`${(result.annual_return * 100).toFixed(1)}%`} icon={DollarSign} color={result.annual_return > 0 ? 'green' : 'red'} />
            <StatCard label="Sharpe Ratio" value={result.sharpe_ratio?.toFixed(2) || '—'} sub={`Sortino: ${result.sortino_ratio?.toFixed(2) || '—'}`} icon={Target} color={result.sharpe_ratio > 1 ? 'green' : result.sharpe_ratio > 0 ? 'amber' : 'red'} />
            <StatCard label="Max Drawdown" value={`${(result.max_drawdown * 100).toFixed(1)}%`} sub={`${result.total_trades} trades executed`} icon={AlertTriangle} color={result.max_drawdown > -0.15 ? 'green' : 'red'} />
          </div>

          {result.equity_curve && (
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5">Equity Curve</h3>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={result.equity_curve}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isPositive ? '#00c805' : '#ff5000'} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={isPositive ? '#00c805' : '#ff5000'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={false} axisLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-faint)', fontSize: 11 }} width={70} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Portfolio']} />
                  <Area type="monotone" dataKey="value" stroke={isPositive ? '#00c805' : '#ff5000'} fill="url(#eqGrad)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {result.equity_curve && (
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-5">Drawdown</h3>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={result.equity_curve}>
                  <XAxis dataKey="date" tick={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, 'Drawdown']} />
                  <Area type="monotone" dataKey="drawdown" stroke="#ff5000" fill="#ff5000" fillOpacity={0.15} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {result?.error && (
        <Card><p className="text-[#ff5000]">{result.error}</p></Card>
      )}

      {!result && !loading && (
        <Card className="text-center py-16">
          <BarChart3 className="w-16 h-16 text-[var(--text-faint)] mx-auto mb-4 opacity-50" />
          <p className="text-[var(--text-muted)] text-lg font-medium">Run a Backtest</p>
          <p className="text-[var(--text-faint)] text-sm mt-2">Simulate the multi-factor strategy on 1 year of historical data</p>
        </Card>
      )}
    </div>
  );
}

// ── Risk ──
function RiskTab({ limits }: any) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#d29922]" /> Risk Management
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Position sizing, drawdown controls, and trade limits</p>
      </div>

      {limits && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-5">Position Limits</h3>
            <div className="space-y-5">
              <LimitBar label="Max Position" value={limits.max_position_pct} color="blue" />
              <LimitBar label="Max Sector" value={limits.max_sector_pct} color="purple" />
              <LimitBar label="Cash Reserve" value={limits.min_cash_reserve_pct} color="cyan" />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-5">Drawdown Controls</h3>
            <div className="space-y-5">
              <LimitBar label="Warning" value={Math.abs(limits.max_drawdown_warning)} color="amber" />
              <LimitBar label="Reduce" value={Math.abs(limits.max_drawdown_reduce)} color="red" />
              <LimitBar label="Liquidation" value={Math.abs(limits.max_drawdown_liquidate)} color="red" />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-5">Trade Controls</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-sm text-[var(--text-muted)]">Trailing Stop-Loss</span>
                <span className="font-mono font-bold text-[#ff5000]">{(limits.trailing_stop_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-sm text-[var(--text-muted)]">Take-Profit</span>
                <span className="font-mono font-bold text-[#00c805]">+{(limits.take_profit_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/50">
                <span className="text-sm text-[var(--text-muted)]">Partial Sell at TP</span>
                <span className="font-mono font-bold">{(limits.take_profit_sell_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[var(--text-muted)]">PDT Day Trades</span>
                <span className="font-mono font-bold text-[#d29922]">{limits.pdt_max_day_trades}/5 days</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-5">Architecture</h3>
            <div className="space-y-4">
              {[
                ['Half-Kelly Sizing', 'Conservative Kelly criterion (f=0.5) for optimal growth'],
                ['Correlation-Aware', 'Avoids loading correlated positions in same sector'],
                ['Regime-Adaptive', 'Reduces exposure in bear/sideways market conditions'],
                ['Multi-Layer Stops', 'Per-position trailing + portfolio-level drawdown'],
              ].map(([title, desc]) => (
                <div key={title} className="flex items-start gap-3">
                  <ChevronRight className="w-4 h-4 text-[#58a6ff] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-[var(--text-faint)] mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!limits && (
        <Card className="text-center py-16">
          <Shield className="w-16 h-16 text-[var(--text-faint)] mx-auto mb-4 opacity-50" />
          <p className="text-[var(--text-muted)]">Loading risk parameters...</p>
        </Card>
      )}
    </div>
  );
}

function LimitBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'from-[#58a6ff] to-[#58a6ff]/60',
    green: 'from-[#00c805] to-[#39d353]/60',
    red: 'from-[#ff5000] to-[#ff5000]/60',
    purple: 'from-[#a371f7] to-[#a371f7]/60',
    amber: 'from-[#d29922] to-[#d29922]/60',
    cyan: 'from-[#39d353] to-[#39d353]/60',
  };
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono font-bold">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="w-full bg-[var(--bg-primary)] rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${colorMap[color]} transition-all duration-700`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

// ── Broker ──
function BrokerTab({ status, portfolio }: any) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#39d353]" /> Broker Connections
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Manage execution endpoints</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card glow={status?.primary?.configured ? 'glow-green' : ''}>
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-3 h-3 rounded-full ${status?.primary?.configured ? 'bg-[#00c805] pulse-live' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Alpaca</h3>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">Primary</span>
          </div>
          {status?.primary?.configured ? (
            <div className="space-y-3">
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
              <p>Not configured. Set environment variables:</p>
              <code className="block text-xs bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#58a6ff] font-mono">ALPACA_API_KEY<br/>ALPACA_SECRET_KEY</code>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" className="text-[#58a6ff] hover:underline text-xs block mt-3">Get free paper trading keys →</a>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-3 h-3 rounded-full ${status?.secondary?.configured ? 'bg-[#00c805] pulse-live' : 'bg-[var(--text-faint)]'}`} />
            <h3 className="text-sm font-bold">Robinhood</h3>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">Secondary</span>
          </div>
          {status?.secondary?.configured ? (
            <p className="text-sm text-[#00c805] font-medium">Connected via MCP</p>
          ) : (
            <div className="text-sm text-[var(--text-muted)] space-y-2">
              <p>Not configured. Set environment variable:</p>
              <code className="block text-xs bg-[var(--bg-primary)] px-3 py-2 rounded-lg text-[#58a6ff] font-mono">ROBINHOOD_ACCESS_TOKEN</code>
              <p className="text-xs text-[var(--text-faint)] mt-2">Requires Robinhood Agentic Trading account.</p>
            </div>
          )}
        </Card>
      </div>

      {portfolio && portfolio.allocations && (
        <Card>
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-5 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#58a6ff]" /> Target Allocation
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 pb-6 border-b border-[var(--border)]">
            <div className="text-center">
              <p className="text-2xl font-bold font-mono">{portfolio.num_positions}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Positions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-[#00c805]">{((1 - portfolio.cash_pct) * 100).toFixed(0)}%</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Invested</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-[#58a6ff]">{(portfolio.cash_pct * 100).toFixed(0)}%</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Cash</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-[#a371f7]">{portfolio.regime?.toUpperCase()}</p>
              <p className="text-[10px] text-[var(--text-faint)] uppercase mt-1">Regime</p>
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(portfolio.allocations).sort(([, a], [, b]) => (b as number) - (a as number)).map(([sym, weight]) => (
              <div key={sym} className="flex items-center gap-4">
                <span className="font-mono font-bold text-sm text-[#58a6ff] w-14">{sym}</span>
                <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#58a6ff] to-[#a371f7] transition-all duration-500" style={{ width: `${(weight as number) * 100 * 4}%` }} />
                </div>
                <span className="font-mono text-sm text-[var(--text-secondary)] w-16 text-right">{((weight as number) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {portfolio.orders?.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <h4 className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-3">Rebalance Orders</h4>
              <div className="space-y-2">
                {portfolio.orders.map((o: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1">
                    <span className={`font-mono font-bold ${o.side === 'buy' ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 w-full max-w-sm scale-in shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#58a6ff] to-[#a371f7] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <User className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {isRegister ? 'Start tracking your trades' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none placeholder:text-[var(--text-faint)]"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none placeholder:text-[var(--text-faint)]"
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#58a6ff] to-[#a371f7] font-semibold text-sm transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5"
          >
            {submitting ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-[var(--text-faint)] mt-5">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-[#58a6ff] hover:underline font-medium">
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Paper Trading Tab ──
function PaperTradingTab({ status, trades, loading, onRunCycle, onReset }: any) {
  const portfolioValue = status?.portfolio_value || 1000;
  const totalReturn = status?.total_return_pct || 0;
  const isPositive = totalReturn >= 0;

  return (
    <div className="space-y-8">
      {/* Hero section like Robinhood's portfolio view */}
      <div className="text-center py-8">
        <p className="text-sm text-[var(--text-muted)] mb-2 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" /> Paper Portfolio
        </p>
        <p className="text-5xl font-bold font-mono tracking-tight count-up">
          ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className={`text-lg font-mono font-semibold mt-2 ${isPositive ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
          {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          <span className="text-sm text-[var(--text-faint)] ml-2">all time</span>
        </p>

        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={onRunCycle} disabled={loading} className="btn-green flex items-center gap-2 px-6 py-2.5">
            <PlayCircle className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running...' : 'Run Cycle'}
          </button>
          <button onClick={onReset} disabled={loading}
            className="px-5 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-elevated)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all disabled:opacity-50">
            Reset
          </button>
        </div>
      </div>

      {/* Stats row */}
      {status && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <Card>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-2">Cash Available</p>
            <p className="text-2xl font-bold font-mono text-[#58a6ff]">${status.cash?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </Card>
          <Card>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-2">Positions</p>
            <p className="text-2xl font-bold font-mono">{status.num_positions || 0}</p>
          </Card>
          <Card>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-2">Peak Value</p>
            <p className="text-2xl font-bold font-mono text-[#a371f7]">${(status.peak_value || 1000).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </Card>
          <Card>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-2">Market Regime</p>
            <p className={`text-2xl font-bold font-mono ${status.regime === 'bull' ? 'text-[#00c805]' : status.regime === 'bear' ? 'text-[#ff5000]' : 'text-[#d29922]'}`}>
              {(status.regime || 'BULL').toUpperCase()}
            </p>
          </Card>
        </div>
      )}

      {/* Open Positions */}
      {status?.positions?.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00c805]" /> Open Positions
          </h3>
          <div className="space-y-3">
            {status.positions.map((p: any) => (
              <div key={p.symbol} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 flex items-center justify-center">
                    <span className="font-mono font-bold text-sm text-[#58a6ff]">{p.symbol?.slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="font-mono font-bold text-sm">{p.symbol}</p>
                    <p className="text-xs text-[var(--text-faint)]">{p.quantity} shares @ ${p.entry_price}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-bold ${p.unrealized_pnl >= 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
                    {p.unrealized_pnl >= 0 ? '+' : ''}${p.unrealized_pnl?.toFixed(2)}
                  </p>
                  <p className={`text-xs font-mono ${p.unrealized_pnl_pct >= 0 ? 'text-[#00c805]/70' : 'text-[#ff5000]/70'}`}>
                    {p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct?.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trade History */}
      <Card>
        <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" /> Trade History
        </h3>
        {trades?.length > 0 ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {trades.slice(0, 50).map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--border)]/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.side === 'buy' ? 'bg-[#00c805]/10' : 'bg-[#ff5000]/10'}`}>
                    {t.side === 'buy' ? <ArrowUpRight className="w-4 h-4 text-[#00c805]" /> : <ArrowDownRight className="w-4 h-4 text-[#ff5000]" />}
                  </div>
                  <div>
                    <p className="font-mono font-bold text-sm">{t.symbol}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{new Date(t.timestamp).toLocaleDateString()} · {t.quantity} @ ${t.price}</p>
                  </div>
                </div>
                {t.pnl != null && (
                  <span className={`font-mono font-bold text-sm ${t.pnl >= 0 ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <PlayCircle className="w-12 h-12 text-[var(--text-faint)] mx-auto mb-3 opacity-50" />
            <p className="text-[var(--text-muted)]">No trades yet</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">Click "Run Cycle" to execute a trading cycle</p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default App;
