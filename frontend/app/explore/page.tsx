'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth, API_BASE } from '../contexts/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubProblem = { id: string; text: string };
type Concept = { subproblemId: string; academic_query: string; keywords: string[]; research_fields: string[] };
type Paper = { paperId: string; title: string; abstract: string | null; year: number | null; citationCount: number | null; authors: string[]; url: string | null; doi: string | null; rank?: number };
type Recommendation = { paperId: string; title: string; year: number | null; citationCount: number | null; authors: string; url: string | null; scores: { final: number; semantic: number; ppr: number; recency: number } };
type Phase = 'idle' | 'decomposing' | 'done' | 'ingesting' | 'recommending' | 'error';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  problem?: string;
  phase?: Phase;
  subproblems?: SubProblem[];
  concepts?: Concept[];
  paperGroups?: Record<string, Paper[]>;
  recommendations?: Recommendation[];
  error?: string;
};

type Session = { id: string; title: string; problem: string; academic_query: string | null; keywords: unknown; research_fields: unknown; papers: unknown; created_at: string };

function parseField<T>(v: unknown, fb: T): T {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v as T;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fb; } }
  return fb;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
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
    e.preventDefault(); setError(null); setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, displayName || undefined);
      onClose();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900">Sign in to continue</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
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
          {mode === 'signup' && <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name (optional)"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />}
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

// ── MetricPills ───────────────────────────────────────────────────────────────

function MetricPills({ paper, paperGroups, recommendations }: {
  paper: Paper;
  paperGroups: Record<string, Paper[]>;
  recommendations: Recommendation[];
}) {
  const rec = recommendations.find(r => r.paperId === paper.paperId);
  const matchPct = rec ? Math.round(rec.scores.semantic * 100) : Math.round(90 - (paper.rank ?? 0) * 8);
  const totalGroups = Object.keys(paperGroups).length;
  const segments = Object.values(paperGroups).filter(ps => ps.some(p => p.paperId === paper.paperId)).length;

  let credibility: string | null = null;
  if (rec && recommendations.length > 1) {
    const sorted = [...recommendations].sort((a, b) => b.scores.ppr - a.scores.ppr);
    const idx = sorted.findIndex(r => r.paperId === paper.paperId);
    if (idx >= 0) credibility = `Top ${Math.max(1, Math.round(((idx + 1) / recommendations.length) * 100))}%`;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-semibold">Match {matchPct}%</span>
      {totalGroups > 0 && <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-semibold">Segments {segments}/{totalGroups}</span>}
      {credibility && <span className="rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 text-xs">Credibility {credibility}</span>}
      {paper.citationCount != null && <span className="rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 text-xs">Cited {paper.citationCount.toLocaleString()}</span>}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ selectedId, subproblems, concepts, paperGroups, recommendations, onClose }: {
  selectedId: string | null; subproblems: SubProblem[]; concepts: Concept[];
  paperGroups: Record<string, Paper[]>; recommendations: Recommendation[]; onClose: () => void;
}) {
  if (!selectedId) return null;

  const allPapers = Object.values(paperGroups).flat();
  const paper = allPapers.find(p => p.paperId === selectedId) ?? null;
  const rec = recommendations.find(r => r.paperId === selectedId) ?? null;
  const sp = subproblems.find(s => s.id === selectedId) ?? null;
  const concept = concepts.find(c => ('c-' + c.subproblemId) === selectedId) ?? null;
  const spForConcept = concept ? subproblems.find(s => s.id === concept.subproblemId) ?? null : null;

  const displayPaper: Paper | null = paper ?? (rec ? {
    paperId: rec.paperId, title: rec.title, abstract: null, year: rec.year,
    citationCount: rec.citationCount,
    authors: typeof rec.authors === 'string' ? rec.authors.split(',').map(a => a.trim()) : [],
    url: rec.url, doi: null,
  } : null);

  const typeLabel = displayPaper ? 'Paper' : sp ? 'Sub-problem' : concept ? 'Concept' : null;
  if (!typeLabel) return null;

  return (
    <div className="w-72 shrink-0 border-r border-zinc-200 bg-white h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{typeLabel}</p>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {displayPaper && (
          <div className="space-y-3">
            {rec && <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">PPR {rec.scores.final.toFixed(3)}</span>}
            <div>
              {displayPaper.url
                ? <a href={displayPaper.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 transition-colors leading-snug block">{displayPaper.title}</a>
                : <p className="text-sm font-semibold text-zinc-900 leading-snug">{displayPaper.title}</p>
              }
              <p className="text-xs text-zinc-500 mt-1">
                {displayPaper.authors.slice(0, 3).join(', ')}{displayPaper.year ? ` · ${displayPaper.year}` : ''}
              </p>
            </div>
            <MetricPills paper={displayPaper} paperGroups={paperGroups} recommendations={recommendations} />
            {displayPaper.abstract && (
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Abstract</p>
                <p className="text-xs text-zinc-600 leading-relaxed">{displayPaper.abstract}</p>
              </div>
            )}
            {displayPaper.url && (
              <a href={displayPaper.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                View paper <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </a>
            )}
          </div>
        )}
        {sp && !displayPaper && (() => {
          const spConcept = concepts.find(c => c.subproblemId === sp.id);
          return (
            <div className="space-y-3">
              <p className="text-sm text-zinc-900 leading-relaxed">{sp.text}</p>
              {spConcept && <>
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Keywords</p>
                  <div className="flex flex-wrap gap-1">{spConcept.keywords.map(k => <span key={k} className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">{k}</span>)}</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Research fields</p>
                  <div className="flex flex-wrap gap-1">{spConcept.research_fields.map(f => <span key={f} className="rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-xs">{f}</span>)}</div>
                </div>
              </>}
            </div>
          );
        })()}
        {concept && !displayPaper && (
          <div className="space-y-3">
            {spForConcept && <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-200 pl-2">"{spForConcept.text.slice(0, 80)}{spForConcept.text.length > 80 ? '…' : ''}"</p>}
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Academic query</p>
              <p className="text-xs text-zinc-700 leading-relaxed">{concept.academic_query}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Keywords</p>
              <div className="flex flex-wrap gap-1">{concept.keywords.map(k => <span key={k} className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">{k}</span>)}</div>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Research fields</p>
              <div className="flex flex-wrap gap-1">{concept.research_fields.map(f => <span key={f} className="rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-xs">{f}</span>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Graph Panel ───────────────────────────────────────────────────────────────

const NODE_COLORS = {
  business:   { bg: '#1e1b4b', text: '#fff', border: '#312e81' },
  subproblem: { bg: '#4f46e5', text: '#fff', border: '#4338ca' },
  concept:    { bg: '#7c3aed', text: '#fff', border: '#6d28d9' },
  paper:      { bg: '#fff',    text: '#1f2937', border: '#c7d2fe' },
  recommend:  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};
const NODE_W = { business: 180, subproblem: 160, concept: 144, paper: 148, recommend: 148 };

type NodePos = { x: number; y: number; type: keyof typeof NODE_COLORS; label: string; id: string; subtitle?: string };
type EdgeDef = { x1: number; y1: number; x2: number; y2: number; highlighted: boolean; dashed?: boolean; weight?: number };

function buildLayout(
  problem: string, sps: SubProblem[], concepts: Concept[],
  paperGroups: Record<string, Paper[]>, recs: Recommendation[],
  w: number, h: number, selectedId: string | null
) {
  const nodes: NodePos[] = [];
  const edges: EdgeDef[] = [];
  const n = sps.length;
  if (n === 0) return { nodes, edges };

  const hasRecs = recs.length > 0;
  const yB = h * 0.06;
  const yS = hasRecs ? h * 0.22 : h * 0.26;
  const yC = hasRecs ? h * 0.42 : h * 0.50;
  const yP = hasRecs ? h * 0.62 : h * 0.76;
  const yR = h * 0.85;
  const cx = w / 2;
  const pad = w * 0.12;
  const avail = w - 2 * pad;
  const spXs = n === 1 ? [cx] : sps.map((_, i) => pad + (avail * i) / (n - 1));

  nodes.push({ x: cx, y: yB, type: 'business', label: problem.slice(0, 50) + (problem.length > 50 ? '…' : ''), id: 'business' });

  sps.forEach((sp, i) => {
    const sx = spXs[i];
    const isSel = sp.id === selectedId;
    nodes.push({ x: sx, y: yS, type: 'subproblem', label: sp.text.slice(0, 50) + (sp.text.length > 50 ? '…' : ''), id: sp.id });
    edges.push({ x1: cx, y1: yB, x2: sx, y2: yS, highlighted: isSel, weight: 1 });

    const c = concepts.find(c => c.subproblemId === sp.id);
    if (c) {
      nodes.push({ x: sx, y: yC, type: 'concept', label: c.keywords.slice(0, 2).join(' · '), id: 'c-' + sp.id, subtitle: c.research_fields[0] });
      edges.push({ x1: sx, y1: yS, x2: sx, y2: yC, highlighted: isSel, weight: 1 });

      const papers = (paperGroups[sp.id] ?? []).slice(0, 3);
      const spread = Math.min(w * 0.08, 68);
      const offsets = papers.length === 1 ? [0] : papers.length === 2 ? [-spread / 2, spread / 2] : [-spread, 0, spread];
      papers.forEach((p, pi) => {
        const px = sx + offsets[pi];
        const isPSel = p.paperId === selectedId;
        nodes.push({ x: px, y: yP, type: 'paper', label: p.title.slice(0, 36) + (p.title.length > 36 ? '…' : ''), id: p.paperId, subtitle: p.year ? `${p.year} · ${p.citationCount?.toLocaleString()}` : '' });
        edges.push({ x1: sx, y1: yC, x2: px, y2: yP, highlighted: isSel || isPSel, weight: 1 - pi * 0.25 });
      });
    }
  });

  if (hasRecs) {
    const recSpread = Math.min(w * 0.12, 100);
    const mid = (recs.length - 1) / 2;
    recs.slice(0, 5).forEach((r, i) => {
      const rx = cx + (i - mid) * recSpread;
      const isRSel = r.paperId === selectedId;
      nodes.push({ x: rx, y: yR, type: 'recommend', label: r.title.slice(0, 36) + (r.title.length > 36 ? '…' : ''), id: r.paperId, subtitle: `PPR ${r.scores.final.toFixed(2)}` });
      edges.push({ x1: cx, y1: yP, x2: rx, y2: yR, highlighted: isRSel, dashed: true, weight: r.scores.final });
    });
  }

  return { nodes, edges };
}

function GraphPanel({
  problem, subproblems, concepts, paperGroups, recommendations,
  selectedId, onSelect, phase, activeMsgId, onTransformSp,
}: {
  problem: string; subproblems: SubProblem[]; concepts: Concept[];
  paperGroups: Record<string, Paper[]>; recommendations: Recommendation[];
  selectedId: string | null; onSelect: (id: string | null) => void; phase: Phase;
  activeMsgId?: string; onTransformSp?: (msgId: string, sp: SubProblem) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [vp, setVp] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, vpX: 0, vpY: 0 });
  const [graphTransformingId, setGraphTransformingId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => { setVp({ x: 0, y: 0, scale: 1 }); }, [problem]);

  const { w, h } = size;
  const { nodes, edges } = buildLayout(problem, subproblems, concepts, paperGroups, recommendations, w, h, selectedId);
  const hasRecs = recommendations.length > 0;
  const conceptIds = new Set(concepts.map(c => c.subproblemId));

  const LEVELS = [
    { y: h * 0.06, label: 'Business', color: '#1e1b4b' },
    { y: hasRecs ? h * 0.22 : h * 0.26, label: 'Sub-problem', color: '#4f46e5' },
    { y: hasRecs ? h * 0.42 : h * 0.50, label: 'Concept', color: '#7c3aed' },
    { y: hasRecs ? h * 0.62 : h * 0.76, label: 'Paper', color: '#6b7280' },
    ...(hasRecs ? [{ y: h * 0.85, label: 'Recommended', color: '#16a34a' }] : []),
  ];

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setVp(prev => {
      const newScale = Math.max(0.25, Math.min(4, prev.scale * factor));
      const sf = newScale / prev.scale;
      return { x: cx - (cx - prev.x) * sf, y: cy - (cy - prev.y) * sf, scale: newScale };
    });
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]') || target.closest('button')) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, vpX: vp.x, vpY: vp.y };
    e.preventDefault();
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return;
    setVp(prev => ({ ...prev, x: dragStart.current.vpX + e.clientX - dragStart.current.x, y: dragStart.current.vpY + e.clientY - dragStart.current.y }));
  }

  function handleMouseUp() { isDragging.current = false; }

  async function handleTransformFromGraph(sp: SubProblem) {
    if (!activeMsgId || !onTransformSp || graphTransformingId === sp.id) return;
    setGraphTransformingId(sp.id);
    try { await onTransformSp(activeMsgId, sp); }
    finally { setGraphTransformingId(null); }
  }

  if (phase === 'idle') return (
    <div ref={containerRef} className="flex-1 flex items-center justify-center bg-white">
      <p className="text-sm text-zinc-400">Graph appears here after search</p>
    </div>
  );

  if (subproblems.length === 0) return (
    <div ref={containerRef} className="flex-1 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 text-zinc-400">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lemon.png" alt="" style={{ width: 40, height: 40, objectFit: 'contain', animation: 'spin 2s linear infinite' }} />
        <p className="text-xs">Decomposing problem…</p>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-white select-none"
      style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
      onWheel={handleWheel} onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

      {LEVELS.map(({ y, label, color }) => (
        <div key={label} className="absolute text-xs font-medium pointer-events-none"
          style={{ left: 10, top: y, transform: 'translateY(-50%)', color, opacity: 0.65, zIndex: 5 }}>{label}</div>
      ))}

      <div style={{ position: 'absolute', inset: 0, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`, transformOrigin: '0 0' }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {[0.14, 0.32, 0.52, 0.72, ...(hasRecs ? [0.78] : [])].map(f => (
            <line key={f} x1={56} y1={h * f} x2={w} y2={h * f} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" />
          ))}
          {edges.map((e, i) => {
            const wt = e.weight ?? 1;
            return (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={e.highlighted ? '#6366f1' : e.dashed ? '#86efac' : '#c7d2fe'}
                strokeWidth={e.highlighted ? 2.5 : 1 + wt}
                strokeOpacity={e.highlighted ? 1 : 0.35 + wt * 0.55}
                strokeDasharray={e.highlighted ? undefined : e.dashed ? '5 3' : undefined}
                style={{ transition: 'stroke 0.2s' }} />
            );
          })}
        </svg>

        {nodes.map(node => {
          const c = NODE_COLORS[node.type];
          const isSel = node.id === selectedId;
          return (
            <div key={node.id} data-node="1" className="absolute cursor-pointer"
              style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)', width: NODE_W[node.type], zIndex: 10 }}
              onClick={ev => { ev.stopPropagation(); onSelect(isSel ? null : node.id); }}>
              <div style={{ background: c.bg, color: c.text, border: `2px solid ${isSel ? '#f59e0b' : c.border}`, borderRadius: 10, padding: '7px 11px', boxShadow: isSel ? '0 0 0 3px rgba(245,158,11,0.25), 0 2px 8px rgba(0,0,0,0.15)' : '0 1px 4px rgba(0,0,0,0.1)', transition: 'all 0.15s' }}>
                <p className="text-xs font-medium leading-snug">{node.label}</p>
                {node.subtitle && <p className="text-xs mt-0.5 opacity-60 truncate">{node.subtitle}</p>}
              </div>
            </div>
          );
        })}

        {nodes.filter(n => n.type === 'subproblem' && n.id === selectedId && !conceptIds.has(n.id)).map(node => {
          const fullSp = subproblems.find(s => s.id === node.id);
          if (!fullSp || !activeMsgId || !onTransformSp) return null;
          const isTransforming = graphTransformingId === node.id;
          return (
            <div key={`btn-${node.id}`} className="absolute" style={{ left: node.x, top: node.y + 32, transform: 'translateX(-50%)', zIndex: 20 }}>
              <button onClick={e => { e.stopPropagation(); handleTransformFromGraph(fullSp); }} disabled={isTransforming}
                className="rounded-full border border-indigo-300 bg-white text-indigo-700 px-3 py-1 text-xs font-medium shadow-sm hover:bg-indigo-50 disabled:opacity-50 transition-colors whitespace-nowrap flex items-center gap-1.5">
                {isTransforming ? <><span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />Mapping…</> : 'Map to concept →'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-20">
        <button onClick={() => setVp(v => { const s = Math.min(4, v.scale * 1.25); const cx = w/2; const cy = h/2; const sf = s/v.scale; return { x: cx-(cx-v.x)*sf, y: cy-(cy-v.y)*sf, scale: s }; })}
          className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 shadow-sm flex items-center justify-center text-base font-medium">+</button>
        <button onClick={() => setVp(v => { const s = Math.max(0.25, v.scale/1.25); const cx = w/2; const cy = h/2; const sf = s/v.scale; return { x: cx-(cx-v.x)*sf, y: cy-(cy-v.y)*sf, scale: s }; })}
          className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 shadow-sm flex items-center justify-center text-base font-medium">−</button>
        <button onClick={() => setVp({ x: 0, y: 0, scale: 1 })} title="Reset"
          className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:bg-zinc-50 shadow-sm flex items-center justify-center text-xs">↺</button>
        {vp.scale !== 1 && <div className="text-center text-xs text-zinc-400 font-medium">{Math.round(vp.scale * 100)}%</div>}
      </div>
    </div>
  );
}

// ── Assistant Message ─────────────────────────────────────────────────────────

function AssistantMessage({ msg, selectedPaperId, onSelectPaper, onTransformOne, onSearchOne }: {
  msg: Message; selectedPaperId: string | null; onSelectPaper: (id: string | null) => void;
  onTransformOne: (msgId: string, sp: SubProblem) => Promise<void>;
  onSearchOne: (msgId: string, concept: Concept) => Promise<void>;
}) {
  const [transformingIds, setTransformingIds] = useState<Set<string>>(new Set());
  const [searchingIds, setSearchingIds] = useState<Set<string>>(new Set());

  async function handleTransformClick(sp: SubProblem) {
    if (transformingIds.has(sp.id)) return;
    setTransformingIds(prev => { const n = new Set(prev); n.add(sp.id); return n; });
    try { await onTransformOne(msg.id, sp); }
    catch { /* noop */ }
    finally { setTransformingIds(prev => { const n = new Set(prev); n.delete(sp.id); return n; }); }
  }

  async function handleSearchClick(concept: Concept) {
    if (searchingIds.has(concept.subproblemId)) return;
    setSearchingIds(prev => { const n = new Set(prev); n.add(concept.subproblemId); return n; });
    try { await onSearchOne(msg.id, concept); }
    catch { /* noop */ }
    finally { setSearchingIds(prev => { const n = new Set(prev); n.delete(concept.subproblemId); return n; }); }
  }

  const PhaseTag = ({ label, active, done }: { label: string; active?: boolean; done?: boolean }) => (
    <span className={`inline-flex items-center gap-1 text-xs ${done ? 'text-green-600' : active ? 'text-indigo-600 font-semibold' : 'text-zinc-400'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-green-500' : active ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-200'}`} />
      {label}
    </span>
  );

  if (msg.phase === 'decomposing') {
    return <div className="flex items-center gap-2 py-2 text-xs text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />Decomposing problem…</div>;
  }
  if (msg.phase === 'error') {
    return <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{msg.error ?? 'Error occurred'}</p>;
  }
  if (!msg.subproblems || msg.subproblems.length === 0) return null;

  const sps = msg.subproblems;
  const conceptsMap = new Map((msg.concepts ?? []).map(c => [c.subproblemId, c]));
  const allHaveConcepts = sps.every(sp => conceptsMap.has(sp.id));
  const allHavePapers = sps.every(sp => (msg.paperGroups?.[sp.id] ?? []).length > 0);
  const msgRecs = msg.recommendations ?? [];
  const isIngesting = msg.phase === 'ingesting' || msg.phase === 'recommending';

  return (
    <div className="space-y-2">
      <div className="flex gap-3 flex-wrap">
        <PhaseTag label="Decomposed" done />
        <PhaseTag label="Concepts" done={allHaveConcepts} active={transformingIds.size > 0} />
        <PhaseTag label="Papers" done={allHavePapers} active={searchingIds.size > 0} />
        {isIngesting && <PhaseTag label={msg.phase === 'ingesting' ? 'Saving to Neo4j…' : 'Computing PPR…'} active />}
        {msgRecs.length > 0 && <PhaseTag label="PPR" done />}
      </div>

      {sps.map((sp, i) => {
        const concept = conceptsMap.get(sp.id);
        const papers = msg.paperGroups?.[sp.id] ?? [];
        const isTransforming = transformingIds.has(sp.id);
        const isSearching = searchingIds.has(sp.id);

        return (
          <div key={sp.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 space-y-1.5">
            <div className="flex items-start gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <p className="text-xs font-medium text-zinc-800 leading-snug">{sp.text}</p>
            </div>
            {concept && (
              <div className="pl-5 flex flex-wrap gap-1">
                {concept.keywords.slice(0, 4).map(k => <span key={k} className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{k}</span>)}
              </div>
            )}
            {concept && papers.length > 0 && (
              <div className="pl-5 space-y-1">
                {papers.map(p => (
                  <div key={p.paperId}
                    onClick={() => onSelectPaper(p.paperId === selectedPaperId ? null : p.paperId)}
                    className={`rounded-lg border p-2 cursor-pointer transition-all ${p.paperId === selectedPaperId ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white hover:border-indigo-300'}`}>
                    <p className="text-xs font-medium text-zinc-900 line-clamp-1">{p.title}</p>
                    <MetricPills paper={p} paperGroups={msg.paperGroups ?? {}} recommendations={msgRecs} />
                  </div>
                ))}
              </div>
            )}
            {!concept ? (
              <button onClick={() => handleTransformClick(sp)} disabled={isTransforming}
                className="w-full rounded-md border border-indigo-200 bg-indigo-50 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                {isTransforming ? <><span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />Mapping to concept…</> : 'Map to concept →'}
              </button>
            ) : papers.length === 0 ? (
              <button onClick={() => handleSearchClick(concept)} disabled={isSearching}
                className="w-full rounded-md border border-purple-200 bg-purple-50 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                {isSearching ? <><span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-ping" />Searching papers…</> : 'Search papers →'}
              </button>
            ) : null}
          </div>
        );
      })}

      {isIngesting && (
        <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lemon.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', animation: 'spin 1.5s linear infinite' }} />
          {msg.phase === 'ingesting' ? 'Saving to Neo4j graph…' : 'Computing PPR recommendations…'}
        </div>
      )}

      {msgRecs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            PPR Recommendations ({msgRecs.length})
          </p>
          {msgRecs.slice(0, 5).map(r => {
            const recPaper: Paper = { paperId: r.paperId, title: r.title, abstract: null, year: r.year, citationCount: r.citationCount, authors: typeof r.authors === 'string' ? r.authors.split(',').map(a => a.trim()) : [], url: r.url, doi: null };
            return (
              <div key={r.paperId}
                onClick={() => onSelectPaper(r.paperId === selectedPaperId ? null : r.paperId)}
                className={`rounded-lg border p-2 cursor-pointer transition-all ${r.paperId === selectedPaperId ? 'border-green-400 bg-green-50' : 'border-zinc-200 bg-white hover:border-green-300'}`}>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium text-zinc-900 line-clamp-1">{r.title}</p>
                  <span className="text-xs text-green-600 font-semibold shrink-0">{r.scores.final.toFixed(2)}</span>
                </div>
                <MetricPills paper={recPaper} paperGroups={msg.paperGroups ?? {}} recommendations={msgRecs} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────

function RightPanel({ messages, sessions, activeSessionId, user, selectedId, paperGroups, recommendations, onSelectSession, onNewSession, onDeleteSession, onLogout, onSelectNode, onSubmit, onRequireAuth, onTransformOne, onSearchOne }: {
  messages: Message[]; sessions: Session[]; activeSessionId: string | null;
  user: { email: string; display_name?: string | null } | null;
  selectedId: string | null; paperGroups: Record<string, Paper[]>; recommendations: Recommendation[];
  onSelectSession: (s: Session) => void; onNewSession: () => void; onDeleteSession: (id: string) => void; onLogout: () => void;
  onSelectNode: (id: string | null) => void; onSubmit: (problem: string) => void; onRequireAuth: () => boolean;
  onTransformOne: (msgId: string, sp: SubProblem) => Promise<void>;
  onSearchOne: (msgId: string, concept: Concept) => Promise<void>;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [input, setInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDecomposing = messages.some(m => m.phase === 'decomposing' || m.phase === 'ingesting' || m.phase === 'recommending');
  const currentTitle = sessions.find(s => s.id === activeSessionId)?.title ?? messages.find(m => m.role === 'user')?.problem?.slice(0, 40) ?? 'New Research';

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    function outside(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false); }
    if (dropdownOpen) document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [dropdownOpen]);

  void paperGroups; void recommendations; void selectedId;

  function handleSend() {
    if (!input.trim() || isDecomposing || !onRequireAuth()) return;
    onSubmit(input.trim()); setInput('');
  }

  return (
    <div className="relative flex flex-col w-80 shrink-0 border-l border-zinc-200 bg-white h-full">
      <div ref={dropdownRef} className="relative border-b border-zinc-100 z-30">
        <button onClick={() => setDropdownOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors">
          <p className="flex-1 text-sm font-semibold text-zinc-900 truncate">{currentTitle}</p>
          <svg className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-full bg-white border border-zinc-200 border-t-0 shadow-xl rounded-b-xl overflow-hidden">
            <button onClick={() => { onNewSession(); setDropdownOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-indigo-600 font-medium hover:bg-indigo-50 border-b border-zinc-100 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Session
            </button>
            <div className="max-h-56 overflow-y-auto">
              {sessions.length === 0 && <p className="px-4 py-4 text-xs text-zinc-400 text-center">No sessions yet</p>}
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                return (
                  <div key={s.id} onClick={() => { onSelectSession(s); setDropdownOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-zinc-50 transition-colors ${isActive ? 'bg-indigo-50' : 'hover:bg-zinc-50'}`}>
                    <div className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-indigo-600' : 'bg-zinc-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'text-indigo-900 font-medium' : 'text-zinc-800'}`}>{s.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{relativeTime(s.created_at)}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }} className="shrink-0 text-zinc-300 hover:text-red-400 transition-colors">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {user && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-100 bg-zinc-50">
                <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                  {(user.display_name ?? user.email)[0].toUpperCase()}
                </div>
                <p className="text-xs text-zinc-600 truncate flex-1">{user.display_name ?? user.email}</p>
                <button onClick={() => { onLogout(); setDropdownOpen(false); }} className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">Log out</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white">{msg.problem}</div>
              </div>
            )}
            {msg.role === 'assistant' && (
              <AssistantMessage msg={msg} selectedPaperId={selectedId} onSelectPaper={onSelectNode}
                onTransformOne={onTransformOne} onSearchOne={onSearchOne} />
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea rows={1} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Describe another problem…"
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" style={{ maxHeight: 80 }} />
          <button onClick={handleSend} disabled={!input.trim() || isDecomposing}
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

// ── Explore Page ──────────────────────────────────────────────────────────────

const EXAMPLES = [
  "Our recommendation platform can't explain why content was suggested, which is hurting user trust. How can we make our black-box system more transparent?",
  'Our factory equipment breaks down without warning, forcing our production line to stop frequently. We have sensor data piling up — could we use it to predict failures in advance?',
  'Our support team receives hundreds of tickets a day, and manually prioritizing each one causes urgent issues to get delayed.',
];

export default function Explore() {
  const { user, accessToken, logout, loading, authFetch } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentProblem, setCurrentProblem] = useState('');
  const [subproblems, setSubproblems] = useState<SubProblem[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [paperGroups, setPaperGroups] = useState<Record<string, Paper[]>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [graphPhase, setGraphPhase] = useState<Phase>('idle');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const businessIdRef = useRef<string>('');
  const sessionSavedRef = useRef(false);

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
    setStarted(false); setInput(''); setMessages([]); setCurrentProblem('');
    setSubproblems([]); setConcepts([]); setPaperGroups({}); setRecommendations([]);
    setGraphPhase('idle'); setSelectedId(null); setActiveSessionId(null); setActiveMsgId(null);
    sessionSavedRef.current = false;
  }

  function loadSession(s: Session) {
    const aiId = 'a-' + s.id;
    setActiveSessionId(s.id); setCurrentProblem(s.problem);
    setSubproblems([]); setConcepts([]); setPaperGroups({}); setRecommendations([]);
    setGraphPhase('done'); setSelectedId(null);
    setMessages([
      { id: 'u-' + s.id, role: 'user', problem: s.problem },
      { id: aiId, role: 'assistant', phase: 'done', subproblems: [], concepts: [], paperGroups: {}, recommendations: [] },
    ]);
    setActiveMsgId(aiId);
    setStarted(true);
    sessionSavedRef.current = true;
    void parseField(s.papers, []);
  }

  const updateAiMsg = (msgId: string, updates: Partial<Message>) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, ...updates } : m));

  // Step 1: Decompose
  async function handleSearch(problem: string) {
    if (!requireAuth()) return;
    setStarted(true); setCurrentProblem(problem); setSelectedId(null);
    setSubproblems([]); setConcepts([]); setPaperGroups({}); setRecommendations([]);
    setGraphPhase('decomposing');
    sessionSavedRef.current = false;
    businessIdRef.current = crypto.randomUUID();

    const userId = Date.now().toString();
    const aiId = userId + '-ai';
    setActiveMsgId(aiId);
    setMessages(prev => [...prev,
      { id: userId, role: 'user', problem },
      { id: aiId, role: 'assistant', phase: 'decomposing', subproblems: [], concepts: [], paperGroups: {} },
    ]);

    try {
      const res = await authFetch(`${API_BASE}/fn/decompose-problem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problem }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Decompose failed');
      const sps: SubProblem[] = data.subproblems ?? [];
      setSubproblems(sps);
      setGraphPhase('done');
      updateAiMsg(aiId, { phase: 'done', subproblems: sps, concepts: [], paperGroups: {} });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
      setGraphPhase('error');
      updateAiMsg(aiId, { phase: 'error', error: msg });
    }
  }

  // Step 2: Transform a single sub-problem → concept
  async function handleTransformOne(msgId: string, sp: SubProblem) {
    const res = await authFetch(`${API_BASE}/fn/transform-query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problem: sp.text }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Transform failed');
    const concept: Concept = { subproblemId: sp.id, ...data };
    setConcepts(prev => [...prev, concept]);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, concepts: [...(m.concepts ?? []), concept] } : m));
  }

  // Step 3: Search papers + auto-ingest to Neo4j
  async function handleSearchOne(msgId: string, concept: Concept) {
    const res = await authFetch(`${API_BASE}/fn/search-papers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: concept.academic_query, keywords: concept.keywords }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Search failed');
    const papers: Paper[] = (data.papers ?? []).map((p: Paper, i: number) => ({ ...p, rank: i }));

    const newGroups = { ...paperGroups, [concept.subproblemId]: papers };
    setPaperGroups(newGroups);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, paperGroups: { ...(m.paperGroups ?? {}), [concept.subproblemId]: papers } } : m));

    const allConcepts = [...concepts, concept];

    // Auto-save to Butterbase when all concepts have papers
    if (user && accessToken && !sessionSavedRef.current) {
      const allDone = allConcepts.every(c => newGroups[c.subproblemId]?.length > 0);
      if (allDone) {
        sessionSavedRef.current = true;
        const allPapers = Object.values(newGroups).flat();
        authFetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            title: currentProblem.slice(0, 60) + (currentProblem.length > 60 ? '…' : ''),
            problem: currentProblem,
            academic_query: allConcepts[0]?.academic_query ?? null,
            keywords: JSON.stringify(allConcepts.flatMap(c => c.keywords)),
            research_fields: JSON.stringify(allConcepts.flatMap(c => c.research_fields)),
            papers: JSON.stringify(allPapers),
          }),
        }).then(() => fetchSessions()).catch(console.error);
      }
    }

    // ── Auto-ingest to Neo4j after each paper search ──────────────────────────
    // Fire immediately per concept; Neo4j uses MERGE so re-runs are safe.
    autoIngestAndRecommend(msgId, allConcepts, newGroups);
  }

  async function autoIngestAndRecommend(msgId: string, allConcepts: Concept[], groups: Record<string, Paper[]>) {
    const sps = subproblems.filter(sp => allConcepts.some(c => c.subproblemId === sp.id));

    // Update UI phase
    updateAiMsg(msgId, { phase: 'ingesting' });
    setGraphPhase('ingesting');

    try {
      await authFetch(`${API_BASE}/fn/ingest-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessIdRef.current,
          business_text: currentProblem,
          subproblems: sps,
          concepts: allConcepts,
          papers_by_subproblem: groups,
        }),
      });

      updateAiMsg(msgId, { phase: 'recommending' });
      setGraphPhase('recommending');

      const allPaperIds = Object.values(groups).flat().map(p => p.paperId);
      const recRes = await authFetch(`${API_BASE}/fn/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperIds: allPaperIds, limit: 5 }),
      });
      const recData = await recRes.json();
      const recs: Recommendation[] = recData.recommendations ?? [];
      setRecommendations(recs);
      setGraphPhase('done');
      updateAiMsg(msgId, { phase: 'done', recommendations: recs });
    } catch {
      // Ingest failure is non-blocking — user still has papers
      setGraphPhase('done');
      updateAiMsg(msgId, { phase: 'done' });
    }
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    await authFetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) reset();
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return null;

  // ── Initial: problem input ────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid var(--line)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lemon.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.1em', color: 'var(--indigo)', textTransform: 'uppercase' }}>LemonGraph</span>
          </Link>
          {user
            ? <button onClick={logout} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--ink)', padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em' }}>Log out</button>
            : <button onClick={() => setShowAuthModal(true)} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--ink)', padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em' }}>Log in</button>
          }
        </div>

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div style={{ width: '100%', maxWidth: 600 }}>
            <div className="flex items-center gap-3 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lemon.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                Describe your problem.
              </h1>
            </div>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 28px', lineHeight: 1.6 }}>
              LemonGraph will decompose it into research concepts, find matching academic papers, and map the connections — automatically saved to a knowledge graph.
            </p>

            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
              <textarea
                rows={4}
                value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => { if (!user) setShowAuthModal(true); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) handleSearch(input.trim()); } }}
                placeholder="e.g. Our recommendation system can't explain why content was shown to users, hurting trust…"
                className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
                <div className="flex flex-wrap gap-1.5">
                  {['Recommendation Trust', 'Predictive Maintenance', 'Ticket Triage'].map((label, i) => (
                    <button key={label} onClick={() => { if (!requireAuth()) return; setInput(EXAMPLES[i]); }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { if (input.trim()) handleSearch(input.trim()); }}
                  disabled={!input.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0">
                  Analyze →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active: 3-panel workspace ─────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-white font-sans">
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <DetailPanel
        selectedId={selectedId} subproblems={subproblems} concepts={concepts}
        paperGroups={paperGroups} recommendations={recommendations}
        onClose={() => setSelectedId(null)}
      />

      <GraphPanel
        problem={currentProblem} subproblems={subproblems} concepts={concepts}
        paperGroups={paperGroups} recommendations={recommendations}
        selectedId={selectedId} onSelect={setSelectedId} phase={graphPhase}
        activeMsgId={activeMsgId ?? undefined} onTransformSp={handleTransformOne}
      />

      <RightPanel
        messages={messages} sessions={sessions} activeSessionId={activeSessionId}
        user={user} selectedId={selectedId} paperGroups={paperGroups} recommendations={recommendations}
        onSelectSession={loadSession} onNewSession={reset} onDeleteSession={deleteSession} onLogout={logout}
        onSelectNode={setSelectedId} onSubmit={handleSearch} onRequireAuth={requireAuth}
        onTransformOne={handleTransformOne} onSearchOne={handleSearchOne}
      />
    </div>
  );
}
