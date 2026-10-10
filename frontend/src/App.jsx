import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Zap,
  Cpu,
  Radio,
  RefreshCw,
  Sliders,
  Database,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Bot,
  Sparkles,
  Link2,
  ChevronDown,
  ChevronUp,
  Key
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Area,
  ComposedChart
} from 'recharts';

const MAX_ROWS = 40;
const MAX_CHART_POINTS = 60;

const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:8000';
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
};

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173') return 'ws://localhost:8000/ws/feed';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/feed`;
  }
  return 'ws://localhost:8000/ws/feed';
};

const API_BASE = getApiBase();
const WS_URL = getWsUrl();
const STATS_URL = `${API_BASE}/stats`;
const HEALTH_URL = `${API_BASE}/health`;
const TRANSACTIONS_URL = `${API_BASE}/api/transactions`;
const DB_STATUS_URL = `${API_BASE}/api/database/status`;
const TINYFISH_STATUS_URL = `${API_BASE}/api/tinyfish/status`;
const TINYFISH_RUN_URL = `${API_BASE}/api/tinyfish/agent/run`;
const TINYFISH_CONFIG_URL = `${API_BASE}/api/tinyfish/config`;


export default function App() {
  const [feed, setFeed] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState({ total: 0, fraud: 0, legit: 0, fraud_rate: 0.0 });
  const [dbStatus, setDbStatus] = useState({ connected: false, total_persisted_transactions: 0 });
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [isPaused, setIsPaused] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'fraud_only'
  const [systemHealth, setSystemHealth] = useState({ model_loaded: false, model_type: 'checking...', feature_count: 30 });


  // TinyFish Agent State
  const [tinyFishOpen, setTinyFishOpen] = useState(true);
  const [tinyFishStatus, setTinyFishStatus] = useState({ installed: true, has_api_key: false, mode: 'local_autonomous_agent' });
  const [tinyFishGoal, setTinyFishGoal] = useState("Audit live transaction feed, verify risk probability alignment, and check for high-risk anomalies.");
  const [tinyFishResult, setTinyFishResult] = useState(null);
  const [tinyFishLoading, setTinyFishLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  const seqRef = useRef(0);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Fetch API health once on mount
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch {
      // API not up yet
    }
  }, []);

  // Fetch TinyFish status
  const fetchTinyFishStatus = useCallback(async () => {
    try {
      const res = await fetch(TINYFISH_STATUS_URL);
      if (res.ok) {
        const data = await res.json();
        setTinyFishStatus(data);
      }
    } catch {
      // Backend not yet ready
    }
  }, []);

  // Run TinyFish agent audit
  const runTinyFishAgent = async () => {
    setTinyFishLoading(true);
    try {
      const res = await fetch(TINYFISH_RUN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: tinyFishGoal,
          url: window.location.origin || 'http://localhost:5173',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTinyFishResult(data);
      }
    } catch (err) {
      console.error('TinyFish execution error:', err);
    } finally {
      setTinyFishLoading(false);
    }
  };

  // Save TinyFish API key
  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await fetch(TINYFISH_CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setTinyFishStatus(data.status);
        setShowKeyConfig(false);
        setApiKeyInput('');
      }
    } catch (err) {
      console.error('Failed to configure API key:', err);
    }
  };

  // Poll /stats to keep running counters in sync even if opened late
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(STATS_URL);
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({
          ...prev,
          total: data.total,
          fraud: data.fraud,
          legit: data.legit,
          fraud_rate: data.fraud_rate,
        }));
      }
    } catch {
      // Backend not yet available
    }
  }, []);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('reconnecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      checkHealth();
      fetchStats();
      fetchTinyFishStatus();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync' && data.stats) {
          setStats(data.stats);
          return;
        }

        seqRef.current += 1;
        const currentSeq = seqRef.current;
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const row = {
          seq: currentSeq,
          timeStr: timeString,
          rawTime: data.time ?? 0,
          amount: data.amount ?? 0,
          proba: data.fraud_probability ?? 0,
          verdict: data.verdict ?? 'Legitimate',
          groundTruth: data.ground_truth ?? null,
          timestamp: data.timestamp ?? Date.now(),
        };

        if (data.stats) {
          setStats(data.stats);
        }

        if (!isPausedRef.current) {
          setFeed(prev => [row, ...prev].slice(0, MAX_ROWS));
        }

        setChartData(prev => {
          const point = {
            seq: currentSeq,
            p: parseFloat((data.fraud_probability ?? 0).toFixed(4)),
            amount: data.amount ?? 0,
            verdict: data.verdict ?? 'Legitimate',
          };
          return [...prev, point].slice(-MAX_CHART_POINTS);
        });

      } catch (err) {
        console.error('Failed to parse WS payload:', err);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 2000);
    };
  }, [checkHealth, fetchStats, fetchTinyFishStatus]);

  const fetchInitialHistory = useCallback(async () => {

    try {
      const res = await fetch(TRANSACTIONS_URL);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const mappedRows = data.map(r => ({
            seq: r.id,
            timeStr: new Date(r.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            rawTime: r.time,
            amount: r.amount,
            proba: r.fraud_probability,
            verdict: r.verdict,
            groundTruth: r.ground_truth,
            timestamp: r.timestamp * 1000,
          }));
          setFeed(mappedRows);
          setChartData(mappedRows.slice().reverse().map(r => ({
            seq: r.seq,
            p: parseFloat(r.proba.toFixed(4)),
            amount: r.amount,
            verdict: r.verdict,
          })));
        }
      }
      const dbRes = await fetch(DB_STATUS_URL);
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        setDbStatus(dbData);
      }
    } catch {
      // API not yet ready
    }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchInitialHistory();
    connectWebSocket();
    fetchTinyFishStatus();

    const statsInterval = setInterval(() => {
      fetchStats();
      checkHealth();
      fetchInitialHistory();
    }, 3000);

    return () => {
      clearInterval(statsInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, checkHealth, fetchStats, fetchTinyFishStatus, fetchInitialHistory]);

  // Filtered rows
  const filteredFeed = useMemo(() => {
    if (filterMode === 'fraud_only') {
      return feed.filter(r => r.verdict === 'Fraud');
    }
    return feed;
  }, [feed, filterMode]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-rose-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-white/[0.08] bg-[#0b0f19]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 p-[1px] shadow-lg shadow-rose-500/20">
              <div className="w-full h-full bg-[#0b0f19] rounded-[11px] flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  FRAUDSHIELD AI
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 font-semibold">
                  v2.0 • XGBoost 3.2
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">Real-Time Ops Monitoring & Inference Engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Database Persistence Status Badge */}
            <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-xs font-mono text-emerald-300">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Database:</span>
              <span className="font-semibold text-emerald-300">SQLite WAL</span>
              <span className="text-slate-600">|</span>
              <span className="text-white font-bold">{dbStatus.total_persisted_transactions?.toLocaleString() || '0'} saved</span>
            </div>

            {/* TinyFish Agent Bridge Badge */}
            <button
              onClick={() => setTinyFishOpen(!tinyFishOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-950/60 to-cyan-950/60 border border-violet-500/30 text-xs font-mono hover:border-violet-400/60 transition-all shadow-sm shadow-violet-500/10"
            >
              <Bot className="w-4 h-4 text-violet-400" />
              <span className="text-slate-300 hidden sm:inline">TinyFish Bridge:</span>
              <span className="text-violet-300 font-semibold">Both Ends Connected</span>
              {tinyFishOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {/* Socket Status Indicator */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-white/10">
              <span className="relative flex h-2.5 w-2.5">
                {connectionStatus === 'connected' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </>
                ) : connectionStatus === 'reconnecting' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                )}
              </span>
              <span className="text-xs font-mono font-medium capitalize text-slate-300">
                {connectionStatus === 'connected' ? 'Live Socket Feed' : connectionStatus === 'reconnecting' ? 'Reconnecting (2s)...' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>


      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* TinyFish Agent Bridge Drawer / Card */}
        {tinyFishOpen && (
          <div className="glass-panel-elevated rounded-2xl p-5 border border-violet-500/20 bg-gradient-to-b from-[#121629]/90 to-[#0e1220]/90 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <Bot className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-white tracking-tight">TinyFish AI Agent Bridge</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-950/80 text-violet-300 border border-violet-500/30 font-semibold">
                      {tinyFishStatus.has_api_key ? 'Cloud Agent Mode' : 'Autonomous Bridge Mode'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Connecting <span className="text-cyan-400 font-semibold">Frontend (:5173)</span> & <span className="text-emerald-400 font-semibold">Backend API (:8000)</span> via TinyFish Agent Automation
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowKeyConfig(!showKeyConfig)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-xs font-mono text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>{tinyFishStatus.has_api_key ? 'Key Set' : 'Configure Key'}</span>
                </button>

                <button
                  onClick={runTinyFishAgent}
                  disabled={tinyFishLoading}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-mono text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span>{tinyFishLoading ? 'Agent Inspecting...' : 'Run Agent Audit'}</span>
                </button>
              </div>
            </div>

            {/* Optional API Key Configuration Input */}
            {showKeyConfig && (
              <div className="mb-4 p-3 rounded-xl bg-slate-900/90 border border-white/10 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="password"
                  placeholder="Paste TinyFish API Key (from agent.tinyfish.ai/api-keys)..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={saveApiKey}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-medium transition-all"
                >
                  Save Key
                </button>
              </div>
            )}

            {/* Goal Input & Architecture Bridge Indicator */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <label className="text-[11px] font-mono text-slate-400 font-semibold uppercase tracking-wider flex items-center space-x-1.5">
                  <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Agent Automation Goal</span>
                </label>
                <input
                  type="text"
                  value={tinyFishGoal}
                  onChange={(e) => setTinyFishGoal(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Both Ends Telemetry Connection Box */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 font-semibold uppercase tracking-wider block">
                  Bridge Topology
                </span>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Backend :8000</span>
                  </span>
                  <span className="text-violet-400">⟷ TinyFish ⟷</span>
                  <span className="text-cyan-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>Frontend :5173</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Scored {stats.total.toLocaleString()} txns • {stats.fraud} flagged
                </div>
              </div>
            </div>

            {/* Agent Result Display */}
            {tinyFishResult && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-violet-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-slate-400">Last Audit Result:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      tinyFishResult.agent_analysis?.risk_level === 'HIGH' ? 'bg-rose-950 text-rose-300 border border-rose-500/40' :
                      tinyFishResult.agent_analysis?.risk_level === 'ELEVATED' ? 'bg-amber-950 text-amber-300 border border-amber-500/40' :
                      'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      Risk Level: {tinyFishResult.agent_analysis?.risk_level || 'NORMAL'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Execution Time: {tinyFishResult.duration_seconds}s
                  </span>
                </div>

                <div className="text-xs font-mono text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-white/5 leading-relaxed">
                  <p className="font-semibold text-violet-300 mb-1">Recommendation:</p>
                  <p>{tinyFishResult.agent_analysis?.recommendation || tinyFishResult.agent_result}</p>
                </div>

                {tinyFishResult.agent_analysis?.findings && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono text-slate-400 font-semibold uppercase">Inspection Findings:</span>
                    <ul className="text-xs font-mono text-slate-300 space-y-1">
                      {tinyFishResult.agent_analysis.findings.map((f, i) => (
                        <li key={i} className="flex items-start space-x-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Scored */}
          <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700/60 transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-colors"></div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider">Total Scored</span>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                {stats.total.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 font-mono">txns</span>
            </div>
            <div className="mt-3 flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              <span>Replaying unseen holdout</span>
            </div>
          </div>

          {/* Card 2: Legitimate */}
          <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700/60 transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider">Approved Legit</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight">
                {stats.legit.toLocaleString()}
              </span>
              <span className="text-xs text-emerald-500/80 font-mono">
                ({stats.total > 0 ? ((stats.legit / stats.total) * 100).toFixed(1) : '100'}%)
              </span>
            </div>
            <div className="mt-3 flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Normal operational volume</span>
            </div>
          </div>

          {/* Card 3: Flagged Fraud */}
          <div className="glass-panel rounded-2xl p-5 relative overflow-hidden border-rose-500/30 bg-rose-950/20 group hover:border-rose-500/50 transition-all duration-300">
            <div className="absolute top-0 right-0 w-28 h-28 bg-rose-600/15 rounded-full blur-2xl group-hover:bg-rose-600/25 transition-colors"></div>
            <div className="flex items-center justify-between text-rose-300 mb-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider">Flagged Fraud</span>
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 animate-pulse">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-rose-400 tracking-tight">
                {stats.fraud.toLocaleString()}
              </span>
              <span className="text-xs text-rose-300/80 font-mono">alerts</span>
            </div>
            <div className="mt-3 flex items-center space-x-2 text-xs text-rose-400/90 font-mono">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span>Requires analyst verification</span>
            </div>
          </div>

          {/* Card 4: Fraud Flag Rate */}
          <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700/60 transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"></div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider">Fraud Flag Rate</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-amber-400 tracking-tight">
                {stats.fraud_rate.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-400 font-mono">vs 0.17% base</span>
            </div>
            <div className="mt-3 flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Threshold: P ≥ 0.50</span>
            </div>
          </div>
        </div>

        {/* Live Probability Risk Stream Chart */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-bold text-white tracking-tight">Live Probability Risk Stream</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Rolling 60 Points
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Real-time output of XGBoost model probability with P=0.50 decision boundary
              </p>
            </div>

            <div className="flex items-center space-x-3 text-xs font-mono">
              <div className="flex items-center space-x-1.5">
                <div className="w-3 h-0.5 bg-rose-500"></div>
                <span className="text-rose-400">Threshold (0.50)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div className="w-3 h-0.5 bg-cyan-400"></div>
                <span className="text-slate-300">P(Fraud)</span>
              </div>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
                <XAxis dataKey="seq" stroke="#475569" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1.0]} stroke="#475569" tick={{ fontSize: 10 }} tickLine={false} />
                <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
                <Area
                  type="monotone"
                  dataKey="p"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#probGradient)"
                  isAnimationActive={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="glass-panel-elevated p-2.5 rounded-lg text-xs font-mono space-y-1 shadow-xl">
                          <p className="text-slate-400">Txn #{data.seq}</p>
                          <p className="text-slate-200">Amount: <span className="font-bold text-white">${data.amount.toFixed(2)}</span></p>
                          <p className="text-cyan-400">Probability: <span className="font-bold">{(data.p * 100).toFixed(2)}%</span></p>
                          <p className={`font-semibold ${data.verdict === 'Fraud' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            Verdict: {data.verdict}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Transaction Feed Table */}
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.08]">
          {/* Table Header & Controls */}
          <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0e1424]/60">
            <div>
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
                <h3 className="font-bold text-base text-white tracking-tight">Real-Time Ingestion Feed</h3>
                <span className="text-xs font-mono text-slate-400">({filteredFeed.length} buffered)</span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Newest transactions streaming from payment processor simulator
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {/* Filter mode */}
              <div className="inline-flex rounded-lg bg-slate-900/90 p-0.5 border border-white/5 text-xs font-mono">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    filterMode === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Stream
                </button>
                <button
                  onClick={() => setFilterMode('fraud_only')}
                  className={`px-3 py-1 rounded-md flex items-center space-x-1.5 transition-all ${
                    filterMode === 'fraud_only'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-rose-400'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Fraud Only</span>
                </button>
              </div>

              {/* Pause / Resume button */}
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                  isPaused
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-amber-400" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Freeze</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0b0f19]/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-white/[0.06]">
                <tr>
                  <th scope="col" className="py-3 px-4">Seq #</th>
                  <th scope="col" className="py-3 px-4">Time</th>
                  <th scope="col" className="py-3 px-4">Amount ($)</th>
                  <th scope="col" className="py-3 px-4">Risk Probability</th>
                  <th scope="col" className="py-3 px-4">Model Verdict</th>
                  <th scope="col" className="py-3 px-4">Ground Truth</th>
                  <th scope="col" className="py-3 px-4">Analysis Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredFeed.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                          <Activity className="w-6 h-6 animate-pulse" />
                        </div>
                        <h4 className="text-slate-200 font-semibold font-sans">Awaiting Live Transactions</h4>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans">
                          The WebSocket connection is listening for incoming payments. Start the holdout streamer in your terminal to replay transactions:
                        </p>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400 select-all">
                          python backend/streamer.py --shuffle
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFeed.map((row) => {
                    const isFraud = row.verdict === 'Fraud';
                    const isActualFraud = row.groundTruth === 'Fraud';

                    let matchBadge = null;
                    if (isFraud && isActualFraud) {
                      matchBadge = (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40 font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-rose-400" />
                          <span>True Positive</span>
                        </span>
                      );
                    } else if (isFraud && !isActualFraud) {
                      matchBadge = (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>False Alarm</span>
                        </span>
                      );
                    } else if (!isFraud && isActualFraud) {
                      matchBadge = (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
                          <XCircle className="w-3 h-3 text-purple-400" />
                          <span>Missed (FN)</span>
                        </span>
                      );
                    } else {
                      matchBadge = (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40">
                          <span>Verified Clear</span>
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={row.seq}
                        className={`transition-colors duration-150 ${
                          isFraud
                            ? 'bg-rose-950/30 animate-flashRow border-l-4 border-l-rose-500'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Seq # */}
                        <td className="py-2.5 px-4 font-mono text-slate-400">
                          #{row.seq.toString().padStart(5, '0')}
                        </td>

                        {/* Time */}
                        <td className="py-2.5 px-4 text-slate-300">
                          {row.timeStr}
                        </td>

                        {/* Amount */}
                        <td className="py-2.5 px-4 font-semibold text-white">
                          ${row.amount.toFixed(2)}
                        </td>

                        {/* Risk Probability with mini bar */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isFraud ? 'bg-rose-500' : 'bg-cyan-400'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(5, row.proba * 100))}%` }}
                              ></div>
                            </div>
                            <span className={isFraud ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                              {(row.proba * 100).toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        {/* Model Verdict */}
                        <td className="py-2.5 px-4">
                          {isFraud ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold glow-badge-fraud">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                              <span>FRAUD</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Legitimate</span>
                            </span>
                          )}
                        </td>

                        {/* Ground Truth */}
                        <td className="py-2.5 px-4 text-slate-400">
                          {row.groundTruth ? (
                            <span className={row.groundTruth === 'Fraud' ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                              {row.groundTruth}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Analysis Status */}
                        <td className="py-2.5 px-4">
                          {matchBadge}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-white/[0.06] bg-[#0b0f19]/60 text-slate-500 py-4 px-4 sm:px-6 lg:px-8 text-xs font-mono flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span>Credit Card Fraud Detection Engine</span>
          <span>•</span>
          <span>80/20 Stratified Holdout</span>
          <span>•</span>
          <span>TinyFish Agent Bridge Active</span>
        </div>
        <div>
          <span>Local Endpoints: <span className="text-cyan-400">http://localhost:5173</span> ⟷ <span className="text-emerald-400">http://localhost:8000</span></span>
        </div>
      </footer>
    </div>
  );
}
