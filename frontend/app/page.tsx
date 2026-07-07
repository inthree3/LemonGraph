'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, API_BASE } from './contexts/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type TransformResult = {
  academic_query: string;
  keywords: string[];
  research_fields: string[];
};

type Paper = {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  citationCount: number | null;
  authors: string[];
  url: string | null;
  doi: string | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  problem?: string;
  queryResult?: TransformResult;
  papers?: Paper[];
  loading?: boolean;
};

type Session = {
  id: string;
  title: string;
  problem: string;
  academic_query: string | null;
  keywords: string[] | string;
  research_fields: string[] | string;
  papers: Paper[] | string;
  created_at: string;
};

function parseField<T>(v: unknown, fb: T): T {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v as T;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fb; } }
  return fb;
}

// ── AuthModal ─────────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, displayName || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Sign in to continue</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Save and revisit your research sessions</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex rounded-lg bg-zinc-100 p-1 mb-5">
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
          {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Graph Panel ───────────────────────────────────────────────────────────────

function GraphPanel({ papers, queryResult, selectedId, onSelect }: {
  papers: Paper[];
  queryResult: TransformResult | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { w, h } = size;
  const center = { x: w * 0.5, y: h * 0.42 };
  const positions = [
    { x: w * 0.2, y: h * 0.2 },
    { x: w * 0.8, y: h * 0.2 },
    { x: w * 0.5, y: h * 0.76 },
  ];

  const selected = papers.find(p => p.paperId === selectedId);

  if (!queryResult || papers.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-50 border-l border-zinc-200">
        <p className="text-sm text-zinc-400">Graph appears here after search</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-zinc-50 border-l border-zinc-200">
      {/* SVG lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {papers.map((p, i) => {
          const isSelected = p.paperId === selectedId;
          return (
            <g key={p.paperId}>
              <line
                x1={center.x} y1={center.y}
                x2={positions[i].x} y2={positions[i].y}
                stroke={isSelected ? '#6366f1' : '#c7d2fe'}
                strokeWidth={isSelected ? 2 : 1.5}
                strokeDasharray={isSelected ? undefined : '5 3'}
                style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
              />
              {/* rank badge on line midpoint */}
              <circle
                cx={(center.x + positions[i].x) / 2}
                cy={(center.y + positions[i].y) / 2}
                r={10}
                fill={isSelected ? '#6366f1' : '#e0e7ff'}
              />
              <text
                x={(center.x + positions[i].x) / 2}
                y={(center.y + positions[i].y) / 2 + 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight="bold"
                fill={isSelected ? '#fff' : '#6366f1'}
              >{i + 1}</text>
            </g>
          );
        })}
      </svg>

      {/* Center node */}
      <div className="absolute z-10" style={{ left: center.x, top: center.y, transform: 'translate(-50%, -50%)' }}>
        <div className="bg-indigo-600 text-white rounded-2xl px-5 py-3 text-center shadow-lg" style={{ maxWidth: 180 }}>
          <div className="text-xs font-semibold leading-tight">
            {queryResult.research_fields.slice(0, 2).join(' · ')}
          </div>
          <div className="text-xs opacity-70 mt-1 truncate">{queryResult.keywords[0]}</div>
        </div>
      </div>

      {/* Paper nodes */}
      {papers.map((paper, i) => {
        const isSelected = paper.paperId === selectedId;
        return (
          <div key={paper.paperId} className="absolute z-10 cursor-pointer"
            style={{ left: positions[i].x, top: positions[i].y, transform: 'translate(-50%, -50%)', maxWidth: 196 }}
            onClick={() => onSelect(isSelected ? null : paper.paperId)}>
            <div className={`rounded-xl border-2 bg-white p-3 shadow-sm transition-all ${isSelected ? 'border-indigo-500 shadow-indigo-100 shadow-md' : 'border-zinc-200 hover:border-indigo-300 hover:shadow-md'}`}>
              <p className="text-xs font-semibold text-zinc-900 leading-snug line-clamp-2">{paper.title}</p>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-400">
                {paper.year && <span>{paper.year}</span>}
                {paper.citationCount != null && <span>{paper.citationCount.toLocaleString()} citations</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Selected paper detail */}
      {selected && (
        <div className="absolute bottom-4 left-4 right-4 z-20 rounded-xl border border-indigo-200 bg-white shadow-lg p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <a href={selected.url ?? '#'} target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 transition-colors line-clamp-1">
                {selected.title}
              </a>
              <p className="text-xs text-zinc-500 mt-0.5">
                {selected.authors?.slice(0, 3).join(', ')}{selected.authors?.length > 3 ? ' et al.' : ''}
                {selected.year ? ` · ${selected.year}` : ''} · {selected.citationCount?.toLocaleString()} citations
              </p>
              {selected.abstract && (
                <p className="text-xs text-zinc-600 mt-2 leading-relaxed line-clamp-3">{selected.abstract}</p>
              )}
            </div>
            <button onClick={() => onSelect(null)} className="text-zinc-400 hover:text-zinc-600 shrink-0 mt-0.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ messages, isSearching, selectedPaperId, onSelectPaper, onSubmit, onRequireAuth }: {
  messages: Message[];
  isSearching: boolean;
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
  onSubmit: (problem: string) => void;
  onRequireAuth: () => boolean;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSearching]);

  function handleSend() {
    if (!input.trim() || isSearching) return;
    if (!onRequireAuth()) return;
    onSubmit(input.trim());
    setInput('');
  }

  return (
    <div className="flex flex-col w-80 shrink-0 border-r border-zinc-200 bg-white h-full">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900">Research Chat</span>
        {isSearching && (
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white">
                  {msg.problem}
                </div>
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="space-y-2">
                {msg.loading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <>
                    {msg.queryResult && (
                      <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 space-y-2">
                        <p className="text-xs text-zinc-600 leading-relaxed">{msg.queryResult.academic_query}</p>
                        <div className="flex flex-wrap gap-1">
                          {msg.queryResult.keywords.map(k => (
                            <span key={k} className="rounded-full bg-white border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">{k}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.papers && msg.papers.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-zinc-500 px-0.5">Top {msg.papers.length} papers</p>
                        {msg.papers.map((p, i) => (
                          <div key={p.paperId}
                            onClick={() => onSelectPaper(p.paperId === selectedPaperId ? null : p.paperId)}
                            className={`rounded-lg border p-2.5 cursor-pointer transition-all ${p.paperId === selectedPaperId ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-indigo-300'}`}>
                            <div className="flex items-start gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white mt-0.5">{i + 1}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-zinc-900 line-clamp-2 leading-snug">{p.title}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">{p.year} · {p.citationCount?.toLocaleString()} citations</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Describe another problem…"
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            style={{ maxHeight: 96, overflowY: 'auto' }}
          />
          <button onClick={handleSend} disabled={!input.trim() || isSearching}
            className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Session Sidebar ───────────────────────────────────────────────────────────

function Sidebar({ sessions, activeId, user, onSelect, onNew, onDelete, onLogout }: {
  sessions: Session[];
  activeId: string | null;
  user: { email: string; display_name?: string | null };
  onSelect: (s: Session) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-zinc-200 bg-white h-full">
      <div className="p-3 border-b border-zinc-100">
        <button onClick={onNew}
          className="w-full rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Research
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0
          ? <p className="px-3 py-6 text-xs text-zinc-400 text-center">No sessions yet</p>
          : sessions.map(s => (
            <div key={s.id} onClick={() => onSelect(s)}
              className={`group relative mx-2 mb-1 rounded-lg px-3 py-2 cursor-pointer transition-colors ${activeId === s.id ? 'bg-indigo-50' : 'hover:bg-zinc-50'}`}>
              <p className={`text-xs font-medium leading-snug truncate pr-5 ${activeId === s.id ? 'text-indigo-900' : 'text-zinc-700'}`}>{s.title}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{new Date(s.created_at).toLocaleDateString()}</p>
              <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        }
      </div>

      <div className="border-t border-zinc-100 p-3 flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
          {(user.display_name ?? user.email)[0].toUpperCase()}
        </div>
        <p className="text-xs text-zinc-600 truncate flex-1">{user.display_name ?? user.email}</p>
        <button onClick={onLogout} title="Log out" className="text-zinc-400 hover:text-zinc-700 shrink-0">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EXAMPLES = [
  'Our factory equipment breaks down without warning, forcing our production line to stop. We have sensor data — could we use it to predict failures?',
  "Our platform can't explain why content was recommended, which is hurting user trust. How can we make our black-box system more explainable?",
  'Our support team receives hundreds of tickets a day. Manually prioritizing each one causes urgent issues to get delayed.',
];

export default function Home() {
  const { user, accessToken, logout, loading, authFetch } = useAuth();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [phase, setPhase] = useState<'initial' | 'active'>('initial');
  const [messages, setMessages] = useState<Message[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [queryResult, setQueryResult] = useState<TransformResult | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialInput, setInitialInput] = useState('');

  useEffect(() => { if (user) setShowAuthModal(false); }, [user]);

  const fetchSessions = useCallback(async () => {
    if (!accessToken) return;
    const res = await authFetch(`${API_BASE}/sessions?order=created_at.desc&limit=50`);
    if (res.ok) setSessions(await res.json());
  }, [accessToken, authFetch]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  function requireAuth(): boolean {
    if (!user) { setShowAuthModal(true); return false; }
    return true;
  }

  function resetSession() {
    setPhase('initial');
    setMessages([]);
    setPapers([]);
    setQueryResult(null);
    setSelectedPaperId(null);
    setActiveSessionId(null);
    setInitialInput('');
  }

  function loadSession(s: Session) {
    const papers = parseField<Paper[]>(s.papers, []);
    const keywords = parseField<string[]>(s.keywords, []);
    const researchFields = parseField<string[]>(s.research_fields, []);
    const qr: TransformResult | null = s.academic_query
      ? { academic_query: s.academic_query, keywords, research_fields: researchFields }
      : null;

    setActiveSessionId(s.id);
    setPapers(papers);
    setQueryResult(qr);
    setSelectedPaperId(null);
    setMessages([
      { id: 'u-' + s.id, role: 'user', problem: s.problem },
      { id: 'a-' + s.id, role: 'assistant', queryResult: qr ?? undefined, papers },
    ]);
    setPhase('active');
  }

  async function handleSearch(problem: string) {
    setIsSearching(true);
    setPhase('active');

    // Add user message + loading assistant placeholder
    const userId = Date.now().toString();
    const aiId = userId + '-ai';
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', problem },
      { id: aiId, role: 'assistant', loading: true },
    ]);

    try {
      // Step 1: transform
      const transformRes = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem }),
      });
      const transformData: TransformResult = await transformRes.json();
      if (!transformRes.ok) throw new Error((transformData as any).error ?? 'Transform failed');

      // Step 2: search
      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: transformData.academic_query, keywords: transformData.keywords }),
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error ?? 'Search failed');

      const foundPapers: Paper[] = searchData.papers ?? [];

      // Replace loading message with real content
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, loading: false, queryResult: transformData, papers: foundPapers } : m
      ));
      setPapers(foundPapers);
      setQueryResult(transformData);

      // Auto-save
      if (user && accessToken) {
        const title = problem.slice(0, 60) + (problem.length > 60 ? '…' : '');
        await authFetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            title,
            problem,
            academic_query: transformData.academic_query,
            keywords: JSON.stringify(transformData.keywords),
            research_fields: JSON.stringify(transformData.research_fields),
            papers: JSON.stringify(foundPapers),
          }),
        });
        fetchSessions();
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Something went wrong';
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { id: aiId, role: 'assistant', loading: false, queryResult: undefined,
          papers: undefined } : m
      ));
      setMessages(prev => [...prev, { id: aiId + '-err', role: 'assistant', problem: `Error: ${errMsg}` }]);
    } finally {
      setIsSearching(false);
    }
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    await authFetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) resetSession();
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return null;

  // ── Initial screen ─────────────────────────────────────────────────────────
  if (phase === 'initial') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 font-sans">
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        {/* Top-right login */}
        {!user && (
          <button onClick={() => setShowAuthModal(true)}
            className="absolute top-4 right-4 rounded-lg border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Log in
          </button>
        )}
        {user && (
          <button onClick={logout}
            className="absolute top-4 right-4 rounded-lg border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Log out
          </button>
        )}

        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold text-zinc-900">Research Finder</h1>
            <p className="text-zinc-500">Describe a business problem, get academic paper recommendations</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
            <textarea
              rows={4}
              value={initialInput}
              onChange={e => setInitialInput(e.target.value)}
              onFocus={() => { if (!user) setShowAuthModal(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (initialInput.trim() && requireAuth()) handleSearch(initialInput.trim());
                }
              }}
              placeholder="e.g. Our factory equipment breaks down without warning..."
              className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
              <div className="flex flex-wrap gap-1.5">
                {['Predictive Maintenance', 'Explainable AI', 'Ticket Triage'].map((label, i) => (
                  <button key={label}
                    onClick={() => {
                      if (!requireAuth()) return;
                      setInitialInput(EXAMPLES[i]);
                    }}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { if (initialInput.trim() && requireAuth()) handleSearch(initialInput.trim()); }}
                disabled={!initialInput.trim() || isSearching}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0">
                {isSearching ? 'Searching…' : 'Find Papers →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active screen ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 font-sans">
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* Sessions sidebar */}
      {user && (
        <Sidebar
          sessions={sessions}
          activeId={activeSessionId}
          user={user}
          onSelect={loadSession}
          onNew={resetSession}
          onDelete={deleteSession}
          onLogout={logout}
        />
      )}

      {/* Chat panel */}
      <ChatPanel
        messages={messages}
        isSearching={isSearching}
        selectedPaperId={selectedPaperId}
        onSelectPaper={setSelectedPaperId}
        onSubmit={handleSearch}
        onRequireAuth={requireAuth}
      />

      {/* Graph panel */}
      <GraphPanel
        papers={papers}
        queryResult={queryResult}
        selectedId={selectedPaperId}
        onSelect={setSelectedPaperId}
      />
    </div>
  );
}
