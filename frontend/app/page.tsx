'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, API_BASE } from './contexts/auth';

const EXAMPLES = [
  'Our factory equipment breaks down without warning, forcing our production line to stop frequently. We have sensor data piling up — could we use it to predict failures in advance?',
  "Our platform can't explain why a piece of content was recommended to a user, which is hurting user trust. How can we make our black-box recommendation system more explainable?",
  'Our support team receives hundreds of tickets a day, and manually reading and prioritizing each one causes urgent issues to get delayed.',
];

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

type Session = {
  id: string;
  title: string;
  problem: string;
  academic_query: string | null;
  keywords: string[];
  research_fields: string[];
  papers: Paper[];
  created_at: string;
};

type Stage = 'idle' | 'transforming' | 'searching' | 'done' | 'error';

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, variant = 'default' }: { label: string; variant?: 'default' | 'field' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
      variant === 'field'
        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
        : 'bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200'
    }`}>
      {label}
    </span>
  );
}

function PaperCard({ paper, rank }: { paper: Paper; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const abstract = paper.abstract ?? '';
  const short = abstract.slice(0, 200);
  const needsTruncation = abstract.length > 200;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
            {paper.url ? (
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
                {paper.title}
              </a>
            ) : paper.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {paper.year && <span>{paper.year}</span>}
            {paper.citationCount != null && (
              <span>{paper.citationCount.toLocaleString()} citations</span>
            )}
          </div>
          {paper.authors?.length > 0 && (
            <p className="mt-1 text-xs text-zinc-500 truncate">
              {paper.authors.slice(0, 4).join(', ')}{paper.authors.length > 4 ? ` +${paper.authors.length - 4} more` : ''}
            </p>
          )}
          {abstract && (
            <div className="mt-3">
              <p className="text-xs text-zinc-600 leading-relaxed">
                {expanded || !needsTruncation ? abstract : `${short}…`}
              </p>
              {needsTruncation && (
                <button onClick={() => setExpanded(v => !v)} className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ active, done }: { active: boolean; done: boolean }) {
  if (done) return <span className="h-2 w-2 rounded-full bg-green-500" />;
  if (active) return <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />;
  return <span className="h-2 w-2 rounded-full bg-zinc-200" />;
}

function Sidebar({
  sessions,
  activeId,
  user,
  onSelect,
  onNew,
  onDelete,
  onLogout,
}: {
  sessions: Session[];
  activeId: string | null;
  user: { email: string; display_name?: string | null };
  onSelect: (s: Session) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-zinc-200 bg-white h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-zinc-900">Research Finder</span>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            nano
          </span>
        </div>
        <button
          onClick={onNew}
          className="w-full rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Search
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-400 text-center">No searches yet</p>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              onClick={() => onSelect(s)}
              className={`group relative mx-2 mb-1 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                activeId === s.id
                  ? 'bg-indigo-50 text-indigo-900'
                  : 'hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <p className="text-xs font-medium leading-snug truncate pr-6">{s.title}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
              <button
                onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* User footer */}
      <div className="border-t border-zinc-100 p-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 shrink-0">
          {(user.display_name ?? user.email)[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-900 truncate">{user.display_name ?? user.email}</p>
          <p className="text-xs text-zinc-400 truncate">{user.email}</p>
        </div>
        <button onClick={onLogout} title="Log out" className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, accessToken, logout, loading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [problem, setProblem] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [queryResult, setQueryResult] = useState<TransformResult | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLoading = stage === 'transforming' || stage === 'searching';

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace('/auth');
  }, [loading, user, router]);

  // Load sessions
  const fetchSessions = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/sessions?order=created_at.desc&limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  function resetSearch() {
    setActiveSessionId(null);
    setProblem('');
    setStage('idle');
    setQueryResult(null);
    setPapers([]);
    setErrorMsg(null);
  }

  function loadSession(s: Session) {
    setActiveSessionId(s.id);
    setProblem(s.problem);
    setQueryResult(s.academic_query ? {
      academic_query: s.academic_query,
      keywords: s.keywords,
      research_fields: s.research_fields,
    } : null);
    setPapers(s.papers ?? []);
    setStage(s.papers?.length > 0 ? 'done' : 'idle');
    setErrorMsg(null);
  }

  async function saveSession(
    problemText: string,
    transform: TransformResult,
    foundPapers: Paper[]
  ) {
    if (!accessToken) return;
    const title = problemText.slice(0, 60) + (problemText.length > 60 ? '…' : '');
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        title,
        problem: problemText,
        academic_query: transform.academic_query,
        keywords: transform.keywords,
        research_fields: transform.research_fields,
        papers: foundPapers,
      }),
    });
    if (res.ok) {
      const [saved] = await res.json();
      setActiveSessionId(saved.id);
      fetchSessions();
    }
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    await fetch(`${API_BASE}/sessions?id=eq.${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (activeSessionId === id) resetSearch();
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function handleSubmit() {
    if (!problem.trim() || isLoading) return;

    setStage('transforming');
    setQueryResult(null);
    setPapers([]);
    setErrorMsg(null);
    setActiveSessionId(null);

    try {
      const transformRes = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem }),
      });
      const transformData = await transformRes.json();
      if (!transformRes.ok) throw new Error(transformData.error ?? 'Transform failed');
      setQueryResult(transformData);

      setStage('searching');
      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: transformData.academic_query }),
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error ?? 'Search failed');

      const foundPapers = searchData.papers ?? [];
      setPapers(foundPapers);
      setStage('done');

      // Auto-save session
      await saveSession(problem, transformData, foundPapers);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setStage('error');
    }
  }

  if (loading || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 font-sans">
      <Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        user={user}
        onSelect={loadSession}
        onNew={resetSearch}
        onDelete={deleteSession}
        onLogout={logout}
      />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">

          {/* Input card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-medium text-zinc-900 mb-2">
              Describe your business problem
            </label>
            <textarea
              rows={4}
              value={problem}
              onChange={e => setProblem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              placeholder="e.g. Our factory equipment breaks down without warning..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-zinc-400 self-center">Try:</span>
              {['Predictive Maintenance', 'Explainable AI', 'Ticket Triage'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => { setProblem(EXAMPLES[i]); setActiveSessionId(null); }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-400">⌘↵ to submit</span>
              <button
                onClick={handleSubmit}
                disabled={!problem.trim() || isLoading}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Searching…' : 'Find Papers'}
              </button>
            </div>
          </div>

          {/* Progress */}
          {stage !== 'idle' && (
            <div className="flex items-center gap-4 px-1">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <StatusDot active={stage === 'transforming'} done={['searching', 'done', 'error'].includes(stage)} />
                Query transform
              </div>
              <div className="h-px flex-1 bg-zinc-200" />
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <StatusDot active={stage === 'searching'} done={stage === 'done'} />
                Paper search
              </div>
            </div>
          )}

          {/* Error */}
          {stage === 'error' && errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Transform result */}
          {queryResult && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-zinc-900">Academic Query</h2>
              <p className="text-sm text-zinc-700 leading-relaxed bg-zinc-50 rounded-lg p-4 border border-zinc-100">
                {queryResult.academic_query}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {queryResult.keywords.map(k => <Chip key={k} label={k} />)}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Research Fields</p>
                <div className="flex flex-wrap gap-2">
                  {queryResult.research_fields.map(f => <Chip key={f} label={f} variant="field" />)}
                </div>
              </div>
            </div>
          )}

          {/* Paper skeletons */}
          {stage === 'searching' && papers.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 rounded-xl border border-zinc-200 bg-white animate-pulse" />
              ))}
            </div>
          )}

          {/* Papers */}
          {papers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Top {papers.length} Papers
                <span className="ml-2 text-xs font-normal text-zinc-400">via Semantic Scholar · sorted by citation count</span>
              </h2>
              {papers.map((paper, i) => (
                <PaperCard key={paper.paperId} paper={paper} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
