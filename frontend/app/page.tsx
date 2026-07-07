'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, API_BASE } from './contexts/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubProblem = { id: string; text: string };

type Concept = {
  subproblemId: string;
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

type PipelineStep = 'idle' | 'decomposing' | 'transforming' | 'searching' | 'done' | 'error';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  problem?: string;
  subproblems?: SubProblem[];
  concepts?: Concept[];
  paperGroups?: Record<string, Paper[]>;
  step?: PipelineStep;
  error?: string;
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
          <h2 className="text-base font-semibold text-zinc-900">Sign in to continue</h2>
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

const NODE_COLORS = {
  business: { bg: '#1e1b4b', text: '#fff', border: '#312e81' },
  subproblem: { bg: '#4f46e5', text: '#fff', border: '#4338ca' },
  concept: { bg: '#7c3aed', text: '#fff', border: '#6d28d9' },
  paper: { bg: '#fff', text: '#1f2937', border: '#c7d2fe' },
};

type NodePos = { x: number; y: number; type: 'business' | 'subproblem' | 'concept' | 'paper'; label: string; id: string; subtitle?: string };
type EdgePos = { x1: number; y1: number; x2: number; y2: number; highlighted: boolean };

function buildLayout(
  problem: string,
  subproblems: SubProblem[],
  concepts: Concept[],
  paperGroups: Record<string, Paper[]>,
  w: number, h: number,
  selectedId: string | null
): { nodes: NodePos[]; edges: EdgePos[] } {
  const nodes: NodePos[] = [];
  const edges: EdgePos[] = [];
  const n = subproblems.length;
  if (n === 0) return { nodes, edges };

  const yBusiness = h * 0.08;
  const ySub = h * 0.28;
  const yConcept = h * 0.52;
  const yPaper = h * 0.76;
  const cx = w / 2;

  const xPositions = (count: number) => {
    if (count === 1) return [cx];
    const pad = w * 0.12;
    const avail = w - 2 * pad;
    return Array.from({ length: count }, (_, i) => pad + (avail * i) / (count - 1));
  };

  const spXs = xPositions(n);

  // Business node
  const busId = 'business';
  nodes.push({ x: cx, y: yBusiness, type: 'business', label: problem.slice(0, 50) + (problem.length > 50 ? '…' : ''), id: busId });

  subproblems.forEach((sp, i) => {
    const spX = spXs[i];
    nodes.push({ x: spX, y: ySub, type: 'subproblem', label: sp.text.slice(0, 55) + (sp.text.length > 55 ? '…' : ''), id: sp.id });
    const highlighted = sp.id === selectedId;
    edges.push({ x1: cx, y1: yBusiness, x2: spX, y2: ySub, highlighted });

    const concept = concepts.find(c => c.subproblemId === sp.id);
    if (concept) {
      const cId = 'concept-' + sp.id;
      nodes.push({
        x: spX, y: yConcept, type: 'concept',
        label: concept.keywords.slice(0, 2).join(' · '),
        id: cId,
        subtitle: concept.research_fields[0],
      });
      edges.push({ x1: spX, y1: ySub, x2: spX, y2: yConcept, highlighted });

      const papers = paperGroups[sp.id] ?? [];
      const paperSpread = Math.min(w * 0.1, 80);
      const offsets = papers.length === 1 ? [0] : papers.length === 2 ? [-paperSpread / 2, paperSpread / 2] : [-paperSpread, 0, paperSpread];

      papers.slice(0, 3).forEach((paper, pi) => {
        const pX = spX + offsets[pi];
        const pId = paper.paperId;
        nodes.push({
          x: pX, y: yPaper, type: 'paper',
          label: paper.title.slice(0, 40) + (paper.title.length > 40 ? '…' : ''),
          id: pId,
          subtitle: paper.year ? `${paper.year} · ${paper.citationCount?.toLocaleString()} citations` : '',
        });
        const isSelectedPaper = pId === selectedId;
        edges.push({ x1: spX, y1: yConcept, x2: pX, y2: yPaper, highlighted: highlighted || isSelectedPaper });
      });
    }
  });

  return { nodes, edges };
}

function GraphPanel({ problem, subproblems, concepts, paperGroups, selectedId, onSelect, step }: {
  problem: string;
  subproblems: SubProblem[];
  concepts: Concept[];
  paperGroups: Record<string, Paper[]>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  step: PipelineStep;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });

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
  const { nodes, edges } = buildLayout(problem, subproblems, concepts, paperGroups, w, h, selectedId);

  const selectedNode = nodes.find(n => n.id === selectedId);

  const NODE_W = { business: 180, subproblem: 160, concept: 140, paper: 148 };
  const NODE_H = { business: 44, subproblem: 52, concept: 44, paper: 52 };

  if (step === 'idle') {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-50 border-r border-zinc-200">
        <p className="text-sm text-zinc-400">Graph appears here after search</p>
      </div>
    );
  }

  if (subproblems.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-50 border-r border-zinc-200">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
          <p className="text-xs">
            {step === 'decomposing' ? 'Decomposing problem…' : 'Processing…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-zinc-50 border-r border-zinc-200">
      {/* Level labels */}
      <div className="absolute left-3 top-0 h-full flex flex-col pointer-events-none" style={{ zIndex: 0 }}>
        {[
          { y: h * 0.08, label: 'Business', color: '#1e1b4b' },
          { y: h * 0.28, label: 'Sub-problem', color: '#4f46e5' },
          { y: h * 0.52, label: 'Concept', color: '#7c3aed' },
          { y: h * 0.76, label: 'Paper', color: '#6b7280' },
        ].map(({ y, label, color }) => (
          <div key={label} className="absolute text-xs font-medium" style={{ top: y, transform: 'translateY(-50%)', color, opacity: 0.6 }}>
            {label}
          </div>
        ))}
      </div>

      {/* Level separator lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        {[0.18, 0.40, 0.64].map(yFrac => (
          <line key={yFrac} x1={60} y1={h * yFrac} x2={w} y2={h * yFrac}
            stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Edges */}
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={e.highlighted ? '#6366f1' : '#c7d2fe'}
            strokeWidth={e.highlighted ? 2 : 1}
            strokeDasharray={e.highlighted ? undefined : '4 3'}
            style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
          />
        ))}
      </svg>

      {/* Nodes */}
      {nodes.map(node => {
        const nw = NODE_W[node.type];
        const nh = NODE_H[node.type];
        const colors = NODE_COLORS[node.type];
        const isSelected = node.id === selectedId;
        const isPaper = node.type === 'paper';

        return (
          <div key={node.id}
            className="absolute cursor-pointer"
            style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)', width: nw, zIndex: 10 }}
            onClick={() => onSelect(isSelected ? null : node.id)}>
            <div style={{
              background: colors.bg,
              color: colors.text,
              border: `2px solid ${isSelected ? '#f59e0b' : colors.border}`,
              borderRadius: 12,
              padding: isPaper ? '8px 10px' : '8px 12px',
              boxShadow: isSelected ? '0 0 0 3px rgba(245,158,11,0.3)' : '0 1px 4px rgba(0,0,0,0.12)',
              transition: 'all 0.15s',
              minHeight: nh,
            }}>
              <p className="text-xs font-medium leading-snug" style={{ color: colors.text }}>{node.label}</p>
              {node.subtitle && (
                <p className="text-xs mt-0.5 opacity-60 truncate">{node.subtitle}</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Selected paper detail */}
      {selectedNode?.type === 'paper' && (() => {
        const allPapers = Object.values(paperGroups).flat();
        const paper = allPapers.find(p => p.paperId === selectedNode.id);
        if (!paper) return null;
        return (
          <div className="absolute bottom-4 left-16 right-4 z-20 rounded-xl border border-amber-200 bg-white shadow-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <a href={paper.url ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 transition-colors">
                  {paper.title}
                </a>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {paper.authors?.slice(0, 3).join(', ')}{(paper.authors?.length ?? 0) > 3 ? ' et al.' : ''}
                  {paper.year ? ` · ${paper.year}` : ''} · {paper.citationCount?.toLocaleString()} citations
                </p>
                {paper.abstract && <p className="text-xs text-zinc-600 mt-2 leading-relaxed line-clamp-2">{paper.abstract}</p>}
              </div>
              <button onClick={() => onSelect(null)} className="text-zinc-400 hover:text-zinc-600 shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function StepBadge({ step }: { step: PipelineStep }) {
  const steps: Array<{ key: PipelineStep; label: string }> = [
    { key: 'decomposing', label: 'Decomposing' },
    { key: 'transforming', label: 'Concepts' },
    { key: 'searching', label: 'Papers' },
    { key: 'done', label: 'Done' },
  ];
  const current = steps.findIndex(s => s.key === step);
  return (
    <div className="flex items-center gap-1.5 py-2">
      {steps.map((s, i) => {
        const isDone = current > i || step === 'done';
        const isActive = s.key === step;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${isDone ? 'bg-green-500' : isActive ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-200'}`} />
            <span className={`text-xs ${isDone ? 'text-green-600' : isActive ? 'text-indigo-600 font-medium' : 'text-zinc-400'}`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-3 h-px bg-zinc-200 mx-0.5" />}
          </div>
        );
      })}
    </div>
  );
}

function AssistantMessage({ msg, selectedPaperId, onSelectPaper }: {
  msg: Message;
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
}) {
  if (msg.step && msg.step !== 'done' && msg.step !== 'error') {
    return (
      <div className="space-y-2">
        <StepBadge step={msg.step} />
        {msg.subproblems && msg.subproblems.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-500">Sub-problems identified:</p>
            {msg.subproblems.map((sp, i) => (
              <div key={sp.id} className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                <span className="text-xs font-semibold text-indigo-700 mr-1.5">#{i + 1}</span>
                <span className="text-xs text-zinc-700">{sp.text}</span>
              </div>
            ))}
          </div>
        )}
        {msg.concepts && msg.concepts.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-500">Concepts mapped:</p>
            {msg.concepts.map(c => (
              <div key={c.subproblemId} className="rounded-lg bg-purple-50 border border-purple-100 px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {c.keywords.slice(0, 3).map(k => (
                    <span key={k} className="rounded-full bg-white border border-purple-200 px-2 py-0.5 text-xs text-purple-700">{k}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (msg.step === 'error') {
    return <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{msg.error ?? 'An error occurred'}</p>;
  }

  // Done — show full results
  return (
    <div className="space-y-3">
      <StepBadge step="done" />
      {msg.subproblems?.map((sp, i) => {
        const concept = msg.concepts?.find(c => c.subproblemId === sp.id);
        const papers = msg.paperGroups?.[sp.id] ?? [];
        return (
          <div key={sp.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <p className="text-xs font-medium text-zinc-900 leading-snug">{sp.text}</p>
            </div>
            {concept && (
              <div className="flex flex-wrap gap-1 pl-7">
                {concept.keywords.slice(0, 3).map(k => (
                  <span key={k} className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{k}</span>
                ))}
              </div>
            )}
            {papers.map(p => (
              <div key={p.paperId}
                onClick={() => onSelectPaper(p.paperId === selectedPaperId ? null : p.paperId)}
                className={`ml-7 rounded-lg border p-2 cursor-pointer transition-all ${p.paperId === selectedPaperId ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white hover:border-indigo-300'}`}>
                <p className="text-xs font-medium text-zinc-900 line-clamp-1 leading-snug">{p.title}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{p.year} · {p.citationCount?.toLocaleString()} citations</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ChatPanel({ messages, selectedPaperId, onSelectPaper, onSubmit, onRequireAuth }: {
  messages: Message[];
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
  onSubmit: (problem: string) => void;
  onRequireAuth: () => boolean;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSearching = messages.some(m => m.step && m.step !== 'done' && m.step !== 'error');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function handleSend() {
    if (!input.trim() || isSearching || !onRequireAuth()) return;
    onSubmit(input.trim());
    setInput('');
  }

  return (
    <div className="flex flex-col w-80 shrink-0 border-l border-zinc-200 bg-white h-full">
      <div className="px-4 py-3 border-b border-zinc-100">
        <span className="text-sm font-semibold text-zinc-900">Research Chat</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white">
                  {msg.problem}
                </div>
              </div>
            )}
            {msg.role === 'assistant' && (
              <AssistantMessage msg={msg} selectedPaperId={selectedPaperId} onSelectPaper={onSelectPaper} />
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea rows={1} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Describe another problem…"
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            style={{ maxHeight: 80 }} />
          <button onClick={handleSend} disabled={!input.trim() || isSearching}
            className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-1.5 text-center">Enter · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Sessions Sidebar ──────────────────────────────────────────────────────────

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
              <p className={`text-xs font-medium truncate pr-5 ${activeId === s.id ? 'text-indigo-900' : 'text-zinc-700'}`}>{s.title}</p>
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
        <button onClick={onLogout} className="text-zinc-400 hover:text-zinc-700 shrink-0">
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
  "Our recommendation platform can't explain why content was recommended, which is hurting user trust. How can we make our black-box system more explainable?",
  'Our support team receives hundreds of tickets a day. Manually prioritizing causes urgent issues to get delayed.',
];

export default function Home() {
  const { user, accessToken, logout, loading, authFetch } = useAuth();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [phase, setPhase] = useState<'initial' | 'active'>('initial');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentProblem, setCurrentProblem] = useState('');
  const [subproblems, setSubproblems] = useState<SubProblem[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [paperGroups, setPaperGroups] = useState<Record<string, Paper[]>>({});
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  function reset() {
    setPhase('initial');
    setMessages([]);
    setCurrentProblem('');
    setSubproblems([]);
    setConcepts([]);
    setPaperGroups({});
    setPipelineStep('idle');
    setSelectedId(null);
    setActiveSessionId(null);
    setInitialInput('');
  }

  function loadSession(s: Session) {
    const papers = parseField<Paper[]>(s.papers, []);
    setActiveSessionId(s.id);
    setCurrentProblem(s.problem);
    setSubproblems([]);
    setConcepts([]);
    setPaperGroups({});
    setPipelineStep('done');
    setSelectedId(null);
    setMessages([
      { id: 'u-' + s.id, role: 'user', problem: s.problem },
      {
        id: 'a-' + s.id, role: 'assistant', step: 'done',
        subproblems: [],
        concepts: [],
        paperGroups: {},
      },
    ]);
    setPhase('active');
  }

  async function handleSearch(problem: string) {
    setPhase('active');
    setCurrentProblem(problem);
    setSelectedId(null);

    const userId = Date.now().toString();
    const aiId = userId + '-ai';

    // Reset graph state
    setSubproblems([]);
    setConcepts([]);
    setPaperGroups({});
    setPipelineStep('decomposing');

    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', problem },
      { id: aiId, role: 'assistant', step: 'decomposing', subproblems: [], concepts: [], paperGroups: {} },
    ]);

    const updateAi = (updates: Partial<Message>) => {
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, ...updates } : m));
    };

    try {
      // ── Step 1: Decompose ───────────────────────────────────────────────
      const decompRes = await fetch('/api/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem }),
      });
      const decompData = await decompRes.json();
      if (!decompRes.ok) throw new Error(decompData.error ?? 'Decompose failed');

      const sps: SubProblem[] = decompData.subproblems ?? [];
      setSubproblems(sps);
      setPipelineStep('transforming');
      updateAi({ step: 'transforming', subproblems: sps });

      // ── Step 2: Transform each sub-problem in parallel ─────────────────
      const conceptResults = await Promise.all(
        sps.map(async sp => {
          const res = await fetch('/api/transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ problem: sp.text }),
          });
          const data = await res.json();
          return { subproblemId: sp.id, ...data } as Concept;
        })
      );
      setConcepts(conceptResults);
      setPipelineStep('searching');
      updateAi({ step: 'searching', concepts: conceptResults });

      // ── Step 3: Search papers for each concept in parallel ──────────────
      const paperResults = await Promise.all(
        conceptResults.map(async concept => {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: concept.academic_query, keywords: concept.keywords }),
          });
          const data = await res.json();
          return { subproblemId: concept.subproblemId, papers: data.papers ?? [] };
        })
      );

      const groups: Record<string, Paper[]> = {};
      paperResults.forEach(({ subproblemId, papers }) => { groups[subproblemId] = papers; });
      setPaperGroups(groups);
      setPipelineStep('done');
      updateAi({ step: 'done', paperGroups: groups });

      // ── Auto-save session ───────────────────────────────────────────────
      if (user && accessToken) {
        const allPapers = Object.values(groups).flat();
        const title = problem.slice(0, 60) + (problem.length > 60 ? '…' : '');
        authFetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            title,
            problem,
            academic_query: conceptResults[0]?.academic_query ?? null,
            keywords: JSON.stringify(conceptResults.flatMap(c => c.keywords)),
            research_fields: JSON.stringify(conceptResults.flatMap(c => c.research_fields)),
            papers: JSON.stringify(allPapers),
          }),
        }).then(() => fetchSessions()).catch(console.error);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Something went wrong';
      setPipelineStep('error');
      updateAi({ step: 'error', error: errMsg });
    }
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    await authFetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) reset();
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return null;

  // ── Initial screen ─────────────────────────────────────────────────────────
  if (phase === 'initial') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 font-sans">
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        {!user
          ? <button onClick={() => setShowAuthModal(true)} className="absolute top-4 right-4 rounded-lg border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">Log in</button>
          : <button onClick={logout} className="absolute top-4 right-4 rounded-lg border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">Log out</button>
        }

        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold text-zinc-900">Research Finder</h1>
            <p className="text-zinc-500 text-sm">Describe a business problem → decompose → map to academic papers</p>
          </div>

          {/* 4-step pipeline preview */}
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
            {['Business', 'Sub-problems', 'Concepts', 'Papers'].map((label, i, arr) => (
              <span key={label} className="flex items-center gap-2">
                <span className="rounded-full border border-zinc-200 px-2 py-0.5">{label}</span>
                {i < arr.length - 1 && <span>→</span>}
              </span>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
            <textarea rows={4} value={initialInput}
              onChange={e => setInitialInput(e.target.value)}
              onFocus={() => { if (!user) setShowAuthModal(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (initialInput.trim() && requireAuth()) handleSearch(initialInput.trim());
                }
              }}
              placeholder="e.g. Our recommendation system can't explain why content was shown to users, hurting trust…"
              className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
              <div className="flex flex-wrap gap-1.5">
                {['Predictive Maintenance', 'Explainable AI', 'Ticket Triage'].map((label, i) => (
                  <button key={label}
                    onClick={() => { if (!requireAuth()) return; setInitialInput(EXAMPLES[i]); }}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { if (initialInput.trim() && requireAuth()) handleSearch(initialInput.trim()); }}
                disabled={!initialInput.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0">
                Analyze →
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

      {user && (
        <Sidebar sessions={sessions} activeId={activeSessionId} user={user}
          onSelect={loadSession} onNew={reset} onDelete={deleteSession} onLogout={logout} />
      )}

      <GraphPanel
        problem={currentProblem}
        subproblems={subproblems}
        concepts={concepts}
        paperGroups={paperGroups}
        selectedId={selectedId}
        onSelect={setSelectedId}
        step={pipelineStep}
      />

      <ChatPanel
        messages={messages}
        selectedPaperId={selectedId}
        onSelectPaper={setSelectedId}
        onSubmit={handleSearch}
        onRequireAuth={requireAuth}
      />
    </div>
  );
}
