'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './contexts/auth';

// ── Auth Modal ────────────────────────────────────────────────────────────────

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

// ── Landing Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const s = {
    eyebrow: {
      fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.12em',
      textTransform: 'uppercase' as const, color: 'var(--indigo)', margin: '0 0 20px',
      display: 'flex', alignItems: 'center', gap: 6,
    },
    h2: {
      fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400,
      lineHeight: 1.3, color: 'var(--ink)', margin: '0 0 56px',
    },
    bodySoft: {
      fontFamily: 'var(--serif)', fontSize: 16, lineHeight: 1.7, color: 'var(--ink-soft)', margin: 0,
    },
    section: { borderTop: '1px solid var(--line)', padding: '80px 0' },
    inner: { maxWidth: 720, margin: '0 auto', padding: '0 32px' },
    navBtn: {
      background: 'none', border: '1px solid var(--line)', color: 'var(--ink)',
      padding: '6px 16px', fontFamily: 'var(--mono)', fontSize: 12,
      letterSpacing: '0.04em', cursor: 'pointer',
    },
    ctaLink: {
      background: 'var(--indigo)', color: '#fff', border: 'none',
      padding: '13px 26px', fontFamily: 'var(--mono)', fontSize: 13,
      letterSpacing: '0.04em', cursor: 'pointer', textDecoration: 'none',
      display: 'inline-block',
    },
  } as const;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: 'var(--ink)' }}>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* ── Nav ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lemon.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.1em', color: 'var(--indigo)', textTransform: 'uppercase' }}>
            LemonGraph
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user
            ? <button onClick={logout} style={s.navBtn}>Log out</button>
            : <button onClick={() => setShowAuthModal(true)} style={s.navBtn}>Log in</button>
          }
          <Link href="/explore" style={{ ...s.ctaLink, padding: '7px 18px', fontSize: 12 }}>
            Get Started →
          </Link>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '96px 32px 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Large decorative lemon — background watermark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lemon.png" alt="" aria-hidden="true" style={{
          position: 'absolute', right: -20, top: 32, width: 240, height: 240,
          objectFit: 'contain', opacity: 0.08, pointerEvents: 'none', userSelect: 'none',
        }} />

        <p style={s.eyebrow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lemon.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.8 }} />
          LemonGraph
        </p>
        <h1 style={{
          fontFamily: 'var(--serif)', fontSize: 'clamp(28px, 4.5vw, 44px)',
          fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 20px',
        }}>
          Develop your product with frontier technologies.
        </h1>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.65, color: 'var(--ink-soft)', margin: '0 0 44px', maxWidth: 520 }}>
          Find the exact research behind the problem you&apos;re solving — and see how it connects to your product, not just to citations.
        </p>
        <Link href="/explore" style={s.ctaLink}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}>
          Ground My Idea in Research
        </Link>
      </div>

      {/* ── Section 2: Why This Exists ── */}
      <div style={s.section}>
        <div style={s.inner}>
          <p style={s.eyebrow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lemon.png" alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
            Why This Exists
          </p>
          <h2 style={s.h2}>Research moves faster than anyone can read it.</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {([
              {
                n: '3.1M+',
                label: 'papers on arXiv alone',
                ctx: 'Total submissions passed 3 million in 2026, with monthly volume still accelerating — no team can read all of it manually.',
              },
              {
                n: '17 years',
                label: 'average research-to-practice lag',
                ctx: "A widely cited finding in evidence-based practice research: it can take over a decade for validated findings to reach the people who'd actually use them.",
              },
              {
                n: '0',
                label: 'hours most teams have',
                ctx: "Practitioners rarely have the time to read primary research — and researchers rarely write for practitioners.",
              },
            ] as const).map(({ n, label, ctx }) => (
              <div key={n}>
                <p style={{ fontFamily: 'var(--serif)', fontSize: 52, fontWeight: 400, color: 'var(--indigo)', margin: '0 0 4px', lineHeight: 1 }}>
                  {n}
                </p>
                <p style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink-soft)', textTransform: 'uppercase', margin: '0 0 12px' }}>
                  {label}
                </p>
                <p style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.65, color: 'var(--ink)', margin: 0 }}>
                  {ctx}
                </p>
              </div>
            ))}
          </div>

          <p style={{ ...s.bodySoft, marginTop: 56, paddingTop: 32, borderTop: '1px solid var(--line)' }}>
            LemonGraph exists to close that gap — starting from your problem, not from a paper you already know to look for.
          </p>
        </div>
      </div>

      {/* ── Section 3: How It Works ── */}
      <div style={s.section}>
        <div style={s.inner}>
          <p style={s.eyebrow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lemon.png" alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
            How It Works
          </p>
          <h2 style={s.h2}>From your problem to the evidence behind it.</h2>

          {([
            { n: '01', title: 'Match', desc: 'How semantically close a paper is to your problem, measured by embedding cosine similarity.' },
            { n: '02', title: 'Segments', desc: "How many of your problem's distinct sub-issues this paper addresses, not just one narrow angle." },
            { n: '03', title: 'Credibility', desc: 'How trusted this paper is within the specific cluster of research seeded by your problem — not a global popularity score, but relevance-weighted standing via personalized PageRank.' },
            { n: '04', title: 'Citations', desc: "The paper's raw citation count, included as a familiar reference point." },
          ] as const).map(({ n, title, desc }, i, arr) => (
            <div key={n} style={{ display: 'flex', gap: 28, padding: '24px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-soft)', minWidth: 28, flexShrink: 0, paddingTop: 3 }}>
                {n}
              </span>
              <div>
                <p style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
                  {title}
                </p>
                <p style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}

          <p style={{ ...s.bodySoft, marginTop: 40, marginBottom: 56 }}>
            LemonGraph doesn&apos;t just rank papers by fame. Each score reflects how a paper relates specifically to the problem you described — computed fresh, not looked up.
          </p>

          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, color: 'var(--ink)', margin: '0 0 16px' }}>
            The graph beneath the score
          </h3>
          <p style={{ ...s.bodySoft, marginBottom: 32 }}>
            Every match is backed by an explicit path in a knowledge graph: your business problem connects to research concepts, concepts connect to papers, and papers connect to each other through citations. The relationship — not just the ranking — is what LemonGraph shows you.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              'Business → Concept (semantic similarity)',
              'Concept → Paper (topical relevance)',
              'Paper → Paper (citation network)',
            ] as const).map(label => (
              <span key={label} style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.05em', background: 'var(--indigo-soft)', color: 'var(--indigo)', padding: '5px 10px' }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div style={{ borderTop: '1px solid var(--line)', padding: '72px 32px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lemon.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        <p style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, color: 'var(--ink)', margin: 0, textAlign: 'center' }}>
          Ready to ground your idea in research?
        </p>
        <Link href="/explore" style={s.ctaLink}>
          Get Started →
        </Link>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)', letterSpacing: '0.06em', margin: 0 }}>
          LEMONGRAPH · HACK WITH BAY 3.0
        </p>
      </div>
    </div>
  );
}
