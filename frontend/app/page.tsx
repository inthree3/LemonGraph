'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './contexts/auth';

// ── MoatGraph icon ────────────────────────────────────────────────────────────

function MoatIcon({ size = 24, opacity = 1, style = {} }: { size?: number; opacity?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, ...style }}>
      {/* root node */}
      <circle cx="12" cy="4" r="2.2" fill="currentColor" />
      {/* mid nodes */}
      <circle cx="5" cy="13" r="2.2" fill="currentColor" />
      <circle cx="19" cy="13" r="2.2" fill="currentColor" />
      {/* leaf nodes */}
      <circle cx="2" cy="21" r="1.6" fill="currentColor" />
      <circle cx="8" cy="21" r="1.6" fill="currentColor" />
      <circle cx="16" cy="21" r="1.6" fill="currentColor" />
      <circle cx="22" cy="21" r="1.6" fill="currentColor" />
      {/* edges root → mid */}
      <line x1="10.3" y1="5.6" x2="6.7" y2="11.4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="13.7" y1="5.6" x2="17.3" y2="11.4" stroke="currentColor" strokeWidth="1.3" />
      {/* edges mid → leaves */}
      <line x1="4.0" y1="15.2" x2="2.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="6.0" y1="15.2" x2="7.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="18.0" y1="15.2" x2="16.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="20.0" y1="15.2" x2="21.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

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
          <span style={{ color: 'var(--indigo)' }}><MoatIcon size={22} /></span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.1em', color: 'var(--indigo)', textTransform: 'uppercase' }}>
            MoatGraph
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
        {/* Large decorative graph icon — background watermark */}
        <span aria-hidden="true" style={{
          position: 'absolute', right: -24, top: 24, opacity: 0.06,
          pointerEvents: 'none', userSelect: 'none', color: 'var(--indigo)',
        }}>
          <MoatIcon size={260} />
        </span>

        <p style={s.eyebrow}>
          <span style={{ color: 'var(--indigo)' }}><MoatIcon size={14} /></span>
          MoatGraph
        </p>
        <h1 style={{
          fontFamily: 'var(--serif)', fontSize: 'clamp(28px, 4.5vw, 44px)',
          fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 20px',
        }}>
          Know exactly where to build your technical moat.
        </h1>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.65, color: 'var(--ink-soft)', margin: '0 0 44px', maxWidth: 520 }}>
          Decompose any business problem into sub-problems — then for each one, surface the academic papers that validate the direction and map the patent landscape to see where there&apos;s still room to differentiate.
        </p>
        <Link href="/explore" style={s.ctaLink}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}>
          Map My Technical Moat
        </Link>
      </div>

      {/* ── Section 2: Why This Exists ── */}
      <div style={s.section}>
        <div style={s.inner}>
          <p style={s.eyebrow}>
            <span style={{ color: 'var(--indigo)' }}><MoatIcon size={13} /></span>
            Why This Exists
          </p>
          <h2 style={s.h2}>Most builders copy what they can see. Moats live in what they can&apos;t.</h2>

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
                label: 'hours most builders have',
                ctx: "Indie founders rarely have time to read primary research or patent filings — and researchers rarely write for product builders.",
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
            MoatGraph exists to close that gap — starting from your problem, not from a paper you already know to look for.
          </p>
        </div>
      </div>

      {/* ── Section 3: How It Works ── */}
      <div style={s.section}>
        <div style={s.inner}>
          <p style={s.eyebrow}>
            <span style={{ color: 'var(--indigo)' }}><MoatIcon size={13} /></span>
            How It Works
          </p>
          <h2 style={s.h2}>From your problem to a concrete differentiation direction.</h2>

          {([
            { n: '01', title: 'Match', desc: 'How semantically close a paper or patent is to your sub-problem, measured by embedding cosine similarity.' },
            { n: '02', title: 'Segments', desc: "How many of your problem's distinct sub-issues this result addresses — not just one narrow angle." },
            { n: '03', title: 'Credibility', desc: 'How trusted this paper is within the specific cluster seeded by your problem — relevance-weighted standing via Personalized PageRank, not a global popularity score.' },
            { n: '04', title: 'Citations', desc: "Raw citation count, included as a familiar reference point alongside the other signals." },
            { n: '05', title: 'Landscape Density', desc: 'For patents: how crowded this concept\'s patent space is. Low density means there\'s still room to build; high density means the space is claimed and you\'ll need a different angle.' },
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
            MoatGraph doesn&apos;t just rank papers by fame. Each score reflects how a result relates specifically to the sub-problem you&apos;re solving — computed fresh, seeded from your exact context.
          </p>

          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, color: 'var(--ink)', margin: '0 0 16px' }}>
            The recommendation at the end
          </h3>
          <p style={{ ...s.bodySoft, marginBottom: 32 }}>
            After scoring, MoatGraph generates one moat recommendation per sub-problem — combining the strongest research-backed direction with the patent landscape reality:
          </p>
          <div style={{ background: 'var(--indigo-soft)', borderLeft: '3px solid var(--indigo)', padding: '16px 20px', marginBottom: 40 }}>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: 0, fontStyle: 'italic' }}>
              &ldquo;For [sub-problem], pursue [direction] — validated by [paper], and [still whitespace / already claimed by N patents] in this space.&rdquo;
            </p>
          </div>

          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, color: 'var(--ink)', margin: '0 0 16px' }}>
            The graph beneath it all
          </h3>
          <p style={{ ...s.bodySoft, marginBottom: 32 }}>
            Every recommendation is backed by an explicit path in a knowledge graph: your business problem decomposes into sub-problems, each maps to academic concepts, and concepts connect to both papers and patents. The relationship — not just the ranking — is what MoatGraph shows you.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              'Business → Sub-problem',
              'Sub-problem → Concept',
              'Concept → Paper (S2AG)',
              'Concept → Patent (USPTO)',
              'Paper → Paper (citations)',
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
        <span style={{ color: 'var(--indigo)' }}><MoatIcon size={52} /></span>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, color: 'var(--ink)', margin: 0, textAlign: 'center' }}>
          Ready to find your technical moat?
        </p>
        <Link href="/explore" style={s.ctaLink}>
          Get Started →
        </Link>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)', letterSpacing: '0.06em', margin: 0 }}>
          MOATGRAPH · HACK WITH BAY 3.0
        </p>
      </div>
    </div>
  );
}
