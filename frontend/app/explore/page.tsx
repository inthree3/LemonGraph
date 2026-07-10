'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth, API_BASE } from '../contexts/auth';
import Dagre from '@dagrejs/dagre';
import { ReactFlow, Background, Controls, Handle, Position, useReactFlow, type NodeProps, type Node as RFNode, type Edge as RFEdge } from '@xyflow/react';

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

// ── ProPaywallModal ───────────────────────────────────────────────────────────

function ProPaywallModal({ onClose, onActivated }: { onClose: () => void; onActivated: () => Promise<void> }) {
  const { authFetch } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/fn/activate-pro`, { method: 'POST' });
      if (!res.ok) throw new Error('Activation failed. Please try again.');
      await onActivated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900">Unlock Pro</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 overflow-hidden mb-6">
          <div className="grid grid-cols-2">
            <div className="px-4 py-3 border-r border-b border-zinc-200 bg-zinc-50">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Free</p>
            </div>
            <div className="px-4 py-3 border-b border-zinc-200 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Pro · $9 / mo</p>
            </div>
            <div className="px-4 py-3 border-r border-zinc-100 text-sm text-zinc-500">1 session</div>
            <div className="px-4 py-3 text-sm text-indigo-700 font-medium">Unlimited sessions</div>
          </div>
        </div>
        <div className="space-y-3">
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Upgrade to Pro →
          </a>
          <button
            onClick={handleActivate}
            disabled={activating}
            className="w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {activating ? 'Activating…' : "I've paid, activate my account"}
          </button>
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
        </div>
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

// ── React Flow Graph ──────────────────────────────────────────────────────────

type GNodeData = {
  label: string;
  subtitle?: string;
  isSelected: boolean;
  canTransform?: boolean;
  isTransforming?: boolean;
  onTransform?: () => void;
};

// --- Custom node components (defined outside to avoid re-registration) ---

function BusinessNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        color: '#fff',
        border: `2px solid ${d.isSelected ? '#f59e0b' : '#4338ca'}`,
        borderRadius: 14, padding: '12px 18px', minWidth: 188,
        boxShadow: d.isSelected
          ? '0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(30,27,75,0.4)'
          : '0 4px 16px rgba(30,27,75,0.3)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 4, fontFamily: 'var(--mono)' }}>Business</div>
        <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>{d.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: '#6366f1', border: '2px solid #fff', width: 10, height: 10, bottom: -5 }} />
    </>
  );
}

function SubProblemNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: '#818cf8', border: '2px solid #fff', width: 8, height: 8, top: -4 }} />
      <div style={{
        background: d.isSelected ? '#4338ca' : '#4f46e5',
        color: '#fff',
        border: `2px solid ${d.isSelected ? '#f59e0b' : '#6366f1'}`,
        borderRadius: 10, padding: '8px 14px', minWidth: 162,
        boxShadow: d.isSelected
          ? '0 0 0 3px rgba(245,158,11,0.3), 0 2px 8px rgba(79,70,229,0.4)'
          : '0 2px 8px rgba(79,70,229,0.3)',
        transition: 'all 0.15s',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 3, fontFamily: 'var(--mono)' }}>Sub-problem</div>
        <p style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0 }}>{d.label}</p>
        {d.canTransform && d.isSelected && (
          <button
            onClick={e => { e.stopPropagation(); d.onTransform?.(); }}
            disabled={d.isTransforming}
            style={{
              marginTop: 8, width: '100%', padding: '4px 0',
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff', borderRadius: 6, fontSize: 10, fontWeight: 500,
              cursor: d.isTransforming ? 'not-allowed' : 'pointer',
              opacity: d.isTransforming ? 0.5 : 1, whiteSpace: 'nowrap',
            }}>
            {d.isTransforming ? 'Mapping…' : 'Map to concept →'}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: '#818cf8', border: '2px solid #fff', width: 8, height: 8, bottom: -4 }} />
    </>
  );
}

function ConceptNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: '#a78bfa', border: '2px solid #fff', width: 8, height: 8, top: -4 }} />
      <div style={{
        background: d.isSelected ? '#6d28d9' : '#7c3aed',
        color: '#fff',
        border: `2px solid ${d.isSelected ? '#f59e0b' : '#8b5cf6'}`,
        borderRadius: 999, padding: '8px 18px', minWidth: 152, textAlign: 'center',
        boxShadow: d.isSelected
          ? '0 0 0 3px rgba(245,158,11,0.3), 0 2px 10px rgba(124,58,237,0.4)'
          : '0 2px 10px rgba(124,58,237,0.3)',
        transition: 'all 0.15s',
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{d.label}</p>
        {d.subtitle && <p style={{ fontSize: 9, opacity: 0.7, margin: '2px 0 0', lineHeight: 1.2, letterSpacing: '0.04em' }}>{d.subtitle}</p>}
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: '#a78bfa', border: '2px solid #fff', width: 8, height: 8, bottom: -4 }} />
    </>
  );
}

function PaperNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: '#c7d2fe', border: '2px solid #fff', width: 8, height: 8, top: -4 }} />
      <div style={{
        background: '#fff', color: '#1f2937',
        border: `2px solid ${d.isSelected ? '#f59e0b' : '#c7d2fe'}`,
        borderRadius: 8, padding: '8px 12px', minWidth: 158,
        boxShadow: d.isSelected
          ? '0 0 0 3px rgba(245,158,11,0.25), 0 2px 8px rgba(0,0,0,0.12)'
          : '0 2px 6px rgba(0,0,0,0.08)',
        transition: 'all 0.15s',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1', marginBottom: 3, fontFamily: 'var(--mono)', opacity: 0.8 }}>Paper</div>
        <p style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0, color: '#111827' }}>{d.label}</p>
        {d.subtitle && <p style={{ fontSize: 10, color: '#6b7280', margin: '3px 0 0', lineHeight: 1.2 }}>{d.subtitle}</p>}
      </div>
    </>
  );
}

function RecommendNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: '#86efac', border: '2px solid #fff', width: 8, height: 8, top: -4 }} />
      <div style={{
        background: d.isSelected ? '#dcfce7' : '#f0fdf4',
        color: '#166534',
        border: `2px solid ${d.isSelected ? '#f59e0b' : '#86efac'}`,
        borderRadius: 8, padding: '8px 12px', minWidth: 158,
        boxShadow: d.isSelected
          ? '0 0 0 3px rgba(245,158,11,0.25), 0 2px 8px rgba(22,163,74,0.2)'
          : '0 2px 6px rgba(22,163,74,0.15)',
        transition: 'all 0.15s',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 3, fontFamily: 'var(--mono)', opacity: 0.8 }}>Recommended</div>
        <p style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0 }}>{d.label}</p>
        {d.subtitle && <p style={{ fontSize: 10, color: '#16a34a', margin: '3px 0 0', lineHeight: 1.2, fontWeight: 600 }}>{d.subtitle}</p>}
      </div>
    </>
  );
}

const NODE_TYPES = {
  business: BusinessNode,
  subproblem: SubProblemNode,
  concept: ConceptNode,
  paper: PaperNode,
  recommend: RecommendNode,
};

const NODE_DIMS: Record<string, { w: number; h: number }> = {
  business:   { w: 200, h: 64 },
  subproblem: { w: 174, h: 56 },
  concept:    { w: 172, h: 50 },
  paper:      { w: 170, h: 64 },
  recommend:  { w: 170, h: 64 },
};

function computeDagreLayout(
  rawNodes: { id: string; type: string }[],
  rawEdges: { source: string; target: string }[]
): Map<string, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 96, nodesep: 36, edgesep: 10 });
  rawNodes.forEach(n => {
    const d = NODE_DIMS[n.type] ?? { w: 170, h: 56 };
    g.setNode(n.id, { width: d.w, height: d.h });
  });
  rawEdges.forEach(e => g.setEdge(e.source, e.target));
  Dagre.layout(g);
  const posMap = new Map<string, { x: number; y: number }>();
  rawNodes.forEach(n => {
    const pos = g.node(n.id);
    const d = NODE_DIMS[n.type] ?? { w: 170, h: 56 };
    posMap.set(n.id, { x: pos.x - d.w / 2, y: pos.y - d.h / 2 });
  });
  return posMap;
}

function FitOnStructureChange({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.22, duration: 380 }), 80);
    return () => clearTimeout(t);
  }, [nodeCount]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
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
  const [graphTransformingId, setGraphTransformingId] = useState<string | null>(null);
  const [rfNodes, setRfNodes] = useState<RFNode<GNodeData>[]>([]);
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([]);

  const handleTransformFromGraph = useCallback(async (sp: SubProblem) => {
    if (!activeMsgId || !onTransformSp || graphTransformingId === sp.id) return;
    setGraphTransformingId(sp.id);
    try { await onTransformSp(activeMsgId, sp); }
    finally { setGraphTransformingId(null); }
  }, [activeMsgId, onTransformSp, graphTransformingId]);

  useEffect(() => {
    if (subproblems.length === 0) { setRfNodes([]); setRfEdges([]); return; }

    const conceptIds = new Set(concepts.map(c => c.subproblemId));
    const existingPaperIds = new Set(Object.values(paperGroups).flat().map(p => p.paperId));

    // Structural nodes/edges for dagre (type only, no data)
    const structNodes: { id: string; type: string }[] = [{ id: 'business', type: 'business' }];
    const structEdges: { id: string; source: string; target: string; animated?: boolean }[] = [];

    subproblems.forEach(sp => {
      structNodes.push({ id: sp.id, type: 'subproblem' });
      structEdges.push({ id: `b-${sp.id}`, source: 'business', target: sp.id });
    });
    concepts.forEach(c => {
      structNodes.push({ id: 'c-' + c.subproblemId, type: 'concept' });
      structEdges.push({ id: `sp-c-${c.subproblemId}`, source: c.subproblemId, target: 'c-' + c.subproblemId, animated: true });
    });
    Object.entries(paperGroups).forEach(([spId, papers]) => {
      papers.slice(0, 3).forEach(p => {
        structNodes.push({ id: p.paperId, type: 'paper' });
        structEdges.push({ id: `c-${spId}-${p.paperId}`, source: 'c-' + spId, target: p.paperId, animated: true });
      });
    });
    const allPaperNodeIds = Object.values(paperGroups).flat().map(p => p.paperId);
    recommendations.slice(0, 5).forEach(r => {
      if (!existingPaperIds.has(r.paperId)) {
        structNodes.push({ id: r.paperId, type: 'recommend' });
        if (allPaperNodeIds.length > 0) {
          structEdges.push({ id: `rec-${r.paperId}`, source: allPaperNodeIds[0], target: r.paperId, animated: true });
        }
      }
    });

    const posMap = computeDagreLayout(structNodes, structEdges);

    // Build final React Flow nodes with full data
    const finalNodes: RFNode<GNodeData>[] = [];

    finalNodes.push({
      id: 'business', type: 'business',
      position: posMap.get('business') ?? { x: 0, y: 0 },
      data: {
        label: problem.slice(0, 50) + (problem.length > 50 ? '…' : ''),
        isSelected: selectedId === 'business',
      },
    });

    subproblems.forEach(sp => {
      finalNodes.push({
        id: sp.id, type: 'subproblem',
        position: posMap.get(sp.id) ?? { x: 0, y: 0 },
        data: {
          label: sp.text.slice(0, 50) + (sp.text.length > 50 ? '…' : ''),
          isSelected: selectedId === sp.id,
          canTransform: !conceptIds.has(sp.id) && !!activeMsgId && !!onTransformSp,
          isTransforming: graphTransformingId === sp.id,
          onTransform: () => handleTransformFromGraph(sp),
        },
      });
    });

    concepts.forEach(c => {
      finalNodes.push({
        id: 'c-' + c.subproblemId, type: 'concept',
        position: posMap.get('c-' + c.subproblemId) ?? { x: 0, y: 0 },
        data: {
          label: c.keywords.slice(0, 2).join(' · '),
          subtitle: c.research_fields[0] ?? undefined,
          isSelected: selectedId === 'c-' + c.subproblemId,
        },
      });
    });

    Object.entries(paperGroups).forEach(([, papers]) => {
      papers.slice(0, 3).forEach(p => {
        finalNodes.push({
          id: p.paperId, type: 'paper',
          position: posMap.get(p.paperId) ?? { x: 0, y: 0 },
          data: {
            label: p.title.slice(0, 38) + (p.title.length > 38 ? '…' : ''),
            subtitle: p.year ? `${p.year} · ${p.citationCount?.toLocaleString() ?? '?'}` : undefined,
            isSelected: selectedId === p.paperId,
          },
        });
      });
    });

    recommendations.slice(0, 5).forEach(r => {
      if (!existingPaperIds.has(r.paperId)) {
        finalNodes.push({
          id: r.paperId, type: 'recommend',
          position: posMap.get(r.paperId) ?? { x: 0, y: 0 },
          data: {
            label: r.title.slice(0, 38) + (r.title.length > 38 ? '…' : ''),
            subtitle: `PPR ${r.scores.final.toFixed(2)}`,
            isSelected: selectedId === r.paperId,
          },
        });
      }
    });

    // Build edges with highlight based on selection
    const finalEdges: RFEdge[] = structEdges.map(e => {
      const highlight = (e.source === selectedId || e.target === selectedId);
      const isRecEdge = e.id.startsWith('rec-');
      const isConceptEdge = e.id.startsWith('sp-c-');
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: e.animated ?? false,
        style: {
          stroke: highlight
            ? '#f59e0b'
            : isRecEdge ? '#86efac'
            : isConceptEdge ? '#a78bfa'
            : e.animated ? '#c7d2fe' : '#ddd6fe',
          strokeWidth: highlight ? 3 : isConceptEdge ? 2 : 1.5,
          opacity: highlight ? 1 : 0.65,
        },
      };
    });

    setRfNodes(finalNodes);
    setRfEdges(finalEdges);
  }, [problem, subproblems, concepts, paperGroups, recommendations, selectedId, graphTransformingId, activeMsgId, onTransformSp, handleTransformFromGraph]);

  if (phase === 'idle') return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <p className="text-sm text-zinc-400">Graph appears here after search</p>
    </div>
  );

  if (subproblems.length === 0) return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 text-zinc-400">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lemon.png" alt="" style={{ width: 40, height: 40, objectFit: 'contain', animation: 'spin 2s linear infinite' }} />
        <p className="text-xs">Decomposing problem…</p>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => onSelect(node.id === selectedId ? null : node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#f8f9ff' }}
        minZoom={0.15}
        maxZoom={3}
      >
        <Background gap={28} color="#e8eaf0" size={1} />
        <Controls showInteractive={false} style={{ bottom: 16, right: 16, left: 'unset', top: 'unset' }} />
        <FitOnStructureChange nodeCount={rfNodes.length} />
      </ReactFlow>
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
  const { user, accessToken, logout, loading, authFetch, isPro, checkPlan } = useAuth();
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
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingProblem, setPendingProblem] = useState<string | null>(null);
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
    if (sessions.length >= 1 && !isPro) {
      setShowPaywall(true);
      setPendingProblem(problem);
      return;
    }
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
        {showPaywall && (
          <ProPaywallModal
            onClose={() => { setShowPaywall(false); setPendingProblem(null); }}
            onActivated={async () => {
              await checkPlan();
              setShowPaywall(false);
              if (pendingProblem) { void handleSearch(pendingProblem); setPendingProblem(null); }
            }}
          />
        )}

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
      {showPaywall && (
        <ProPaywallModal
          onClose={() => { setShowPaywall(false); setPendingProblem(null); }}
          onActivated={async () => {
            await checkPlan();
            setShowPaywall(false);
            if (pendingProblem) { void handleSearch(pendingProblem); setPendingProblem(null); }
          }}
        />
      )}

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
