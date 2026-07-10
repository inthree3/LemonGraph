"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth, API_BASE } from "../contexts/auth";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
  type Node as RFNode,
  type Edge as RFEdge,
} from "@xyflow/react";
import MoatIcon from "../components/MoatIcon";
import type {
  Phase,
  Business,
  SubProblem,
  Concept,
  Paper,
  Recommendation,
  Message,
  Session,
} from '../schema';

function parseField<T>(v: unknown, fb: T): T {
  if (Array.isArray(v) || (v && typeof v === "object")) return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fb;
    }
  }
  return fb;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

// ── AuthModal ─────────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, displayName || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900">
            Sign in to continue
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex rounded-lg bg-zinc-100 p-1 mb-5">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── ProPaywallModal ───────────────────────────────────────────────────────────

function ProPaywallModal({
  onClose,
  onActivated,
}: {
  onClose: () => void;
  onActivated: () => Promise<void>;
}) {
  const { authFetch } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/fn/activate-pro`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Activation failed. Please try again.");
      await onActivated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900">Unlock Pro</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 overflow-hidden mb-6">
          <div className="grid grid-cols-2">
            <div className="px-4 py-3 border-r border-b border-zinc-200 bg-zinc-50">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Free
              </p>
            </div>
            <div className="px-4 py-3 border-b border-zinc-200 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                Pro · $9 / mo
              </p>
            </div>
            <div className="px-4 py-3 border-r border-zinc-100 text-sm text-zinc-500">
              1 session
            </div>
            <div className="px-4 py-3 text-sm text-indigo-700 font-medium">
              Unlimited sessions
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? "#"}
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
            {activating ? "Activating…" : "I've paid, activate my account"}
          </button>
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Node Modal ────────────────────────────────────────────────────────────

function AddNodeModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Add node directly
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Computer vision for quality control"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            autoFocus
          />
          <p className="text-xs text-zinc-400">
            Creates a new node in active state and immediately runs it through
            the analysis pipeline.
          </p>
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Add →
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Highlight helpers ─────────────────────────────────────────────────────────

function buildHighlightSegments(
  text: string,
  ranges: { start: number; end: number }[],
) {
  if (!ranges.length) return [{ text, highlighted: false }];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    if (merged.length && r.start <= merged[merged.length - 1].end)
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        r.end,
      );
    else merged.push({ ...r });
  }
  const segs: { text: string; highlighted: boolean }[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos)
      segs.push({ text: text.slice(pos, r.start), highlighted: false });
    if (r.start < r.end)
      segs.push({ text: text.slice(r.start, r.end), highlighted: true });
    pos = r.end;
  }
  if (pos < text.length)
    segs.push({ text: text.slice(pos), highlighted: false });
  return segs;
}

function getTextOffset(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return total + offset;
    total += (cur.textContent ?? "").length;
    cur = walker.nextNode();
  }
  return total;
}

function HighlightableText({
  nodeKey,
  text,
  highlights,
  onHighlight,
  className,
}: {
  nodeKey: string;
  text: string;
  highlights: { start: number; end: number }[];
  onHighlight: (key: string, start: number, end: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const pendingRef = useRef<{ start: number; end: number } | null>(null);

  const segments = buildHighlightSegments(text, highlights);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      setBtnPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setBtnPos(null);
      return;
    }
    const start = getTextOffset(
      containerRef.current,
      range.startContainer,
      range.startOffset,
    );
    const end = getTextOffset(
      containerRef.current,
      range.endContainer,
      range.endOffset,
    );
    if (end <= start) {
      setBtnPos(null);
      return;
    }
    pendingRef.current = { start, end };
    const rect = range.getBoundingClientRect();
    setBtnPos({ x: rect.left + rect.width / 2, y: rect.top - 32 });
  }

  function applyHighlight(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pendingRef.current) {
      onHighlight(nodeKey, pendingRef.current.start, pendingRef.current.end);
      pendingRef.current = null;
    }
    window.getSelection()?.removeAllRanges();
    setBtnPos(null);
  }

  useEffect(() => {
    function dismiss(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setBtnPos(null);
        pendingRef.current = null;
      }
    }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={className}
        style={{ userSelect: "text", cursor: "text" }}
      >
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <mark
              key={i}
              style={{
                background: "#fef08a",
                borderRadius: 2,
                padding: "0 1px",
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
      {btnPos && (
        <button
          onMouseDown={applyHighlight}
          style={{
            position: "fixed",
            left: btnPos.x,
            top: btnPos.y,
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          className="bg-yellow-300 text-yellow-900 text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-md border border-yellow-400 whitespace-nowrap"
        >
          ✦ Highlight
        </button>
      )}
    </>
  );
}

// ── MetricPills ───────────────────────────────────────────────────────────────

function MetricPills({
  paper,
  paperGroups,
  recommendations,
}: {
  paper: Paper;
  paperGroups: Record<string, Paper[]>;
  recommendations: Recommendation[];
}) {
  const rec = recommendations.find((r) => r.paperId === paper.paperId);
  const matchPct = rec
    ? Math.round(rec.scores.semantic * 100)
    : Math.round(90 - (paper.rank ?? 0) * 8);
  const totalGroups = Object.keys(paperGroups).length;
  const segments = Object.values(paperGroups).filter((ps) =>
    ps.some((p) => p.paperId === paper.paperId),
  ).length;
  let credibility: string | null = null;
  if (rec && recommendations.length > 1) {
    const sorted = [...recommendations].sort(
      (a, b) => b.scores.ppr - a.scores.ppr,
    );
    const idx = sorted.findIndex((r) => r.paperId === paper.paperId);
    if (idx >= 0)
      credibility = `Top ${Math.max(1, Math.round(((idx + 1) / recommendations.length) * 100))}%`;
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-semibold">
        Match {matchPct}%
      </span>
      {totalGroups > 0 && (
        <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-semibold">
          Segments {segments}/{totalGroups}
        </span>
      )}
      {credibility && (
        <span className="rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 text-xs">
          Credibility {credibility}
        </span>
      )}
      {paper.citationCount != null && (
        <span className="rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 text-xs">
          Cited {paper.citationCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  selectedId,
  businesses,
  subproblems,
  concepts,
  paperGroups,
  recommendations,
  onClose,
}: {
  selectedId: string | null;
  businesses: Business[];
  subproblems: SubProblem[];
  concepts: Concept[];
  paperGroups: Record<string, Paper[]>;
  recommendations: Recommendation[];
  onClose: () => void;
}) {
  const [highlights, setHighlights] = useState<
    Record<string, { start: number; end: number }[]>
  >({});
  function addHighlight(key: string, start: number, end: number) {
    setHighlights((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { start, end }],
    }));
  }

  if (!selectedId) return null;

  const selectedBusiness = businesses.find((b) => b.id === selectedId) ?? null;
  const isBusiness = !!selectedBusiness;
  const problem = selectedBusiness?.problem ?? "";
  const allPapers = Object.values(paperGroups).flat();
  const paper = allPapers.find((p) => p.paperId === selectedId) ?? null;
  const rec = recommendations.find((r) => r.paperId === selectedId) ?? null;
  const sp = subproblems.find((s) => s.id === selectedId) ?? null;
  const concept =
    concepts.find((c) => "c-" + c.subproblemId === selectedId) ?? null;
  const spForConcept = concept
    ? (subproblems.find((s) => s.id === concept.subproblemId) ?? null)
    : null;

  const displayPaper: Paper | null =
    paper ??
    (rec
      ? {
          paperId: rec.paperId,
          title: rec.title,
          abstract: null,
          year: rec.year,
          citationCount: rec.citationCount,
          authors:
            typeof rec.authors === "string"
              ? rec.authors.split(",").map((a) => a.trim())
              : [],
          url: rec.url,
          doi: null,
        }
      : null);

  const typeLabel = isBusiness
    ? "Business Problem"
    : displayPaper
      ? "Paper"
      : sp
        ? sp.userCreated
          ? "Added Node"
          : "Sub-problem"
        : concept
          ? "Concept"
          : null;
  if (!typeLabel) return null;

  return (
    <div className="w-64 shrink-0 border-r border-zinc-200 bg-white h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          {typeLabel}
        </p>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isBusiness && (
          <HighlightableText
            nodeKey="business-problem"
            text={problem}
            highlights={highlights["business-problem"] ?? []}
            onHighlight={addHighlight}
            className="text-sm text-zinc-900 leading-relaxed"
          />
        )}
        {displayPaper && (
          <div className="space-y-3">
            {rec && (
              <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                PPR {rec.scores.final.toFixed(3)}
              </span>
            )}
            <div>
              <HighlightableText
                nodeKey={`${selectedId}-title`}
                text={displayPaper.title}
                highlights={highlights[`${selectedId}-title`] ?? []}
                onHighlight={addHighlight}
                className="text-sm font-semibold text-zinc-900 leading-snug"
              />
              <p className="text-xs text-zinc-500 mt-1">
                {displayPaper.authors.slice(0, 3).join(", ")}
                {displayPaper.year ? ` · ${displayPaper.year}` : ""}
              </p>
            </div>
            <MetricPills
              paper={displayPaper}
              paperGroups={paperGroups}
              recommendations={recommendations}
            />
            {displayPaper.abstract && (
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Abstract
                </p>
                <HighlightableText
                  nodeKey={`${selectedId}-abstract`}
                  text={displayPaper.abstract}
                  highlights={highlights[`${selectedId}-abstract`] ?? []}
                  onHighlight={addHighlight}
                  className="text-xs text-zinc-600 leading-relaxed"
                />
              </div>
            )}
            {displayPaper.url && (
              <a
                href={displayPaper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                View paper{" "}
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
              </a>
            )}
          </div>
        )}
        {sp &&
          !displayPaper &&
          (() => {
            const spConcept = concepts.find((c) => c.subproblemId === sp.id);
            return (
              <div className="space-y-3">
                <HighlightableText
                  nodeKey={`${selectedId}-text`}
                  text={sp.text}
                  highlights={highlights[`${selectedId}-text`] ?? []}
                  onHighlight={addHighlight}
                  className="text-sm text-zinc-900 leading-relaxed"
                />
                {spConcept && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                        Keywords
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {spConcept.keywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                        Research fields
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {spConcept.research_fields.map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-xs"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        {concept && !displayPaper && (
          <div className="space-y-3">
            {spForConcept && (
              <HighlightableText
                nodeKey={`${selectedId}-sptext`}
                text={`"${spForConcept.text}"`}
                highlights={highlights[`${selectedId}-sptext`] ?? []}
                onHighlight={addHighlight}
                className="text-xs text-zinc-500 italic border-l-2 border-zinc-200 pl-2"
              />
            )}
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Academic query
              </p>
              <HighlightableText
                nodeKey={`${selectedId}-query`}
                text={concept.academic_query}
                highlights={highlights[`${selectedId}-query`] ?? []}
                onHighlight={addHighlight}
                className="text-xs text-zinc-700 leading-relaxed"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {concept.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Research fields
              </p>
              <div className="flex flex-wrap gap-1">
                {concept.research_fields.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-xs"
                  >
                    {f}
                  </span>
                ))}
              </div>
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
  phase?: Phase;
  canTransform?: boolean;
  isTransforming?: boolean;
  onTransform?: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
};

// --- Shared delete button for nodes ---

function NodeDeleteBtn({
  onDelete,
  dark = false,
}: {
  onDelete: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      title="Remove"
      style={{
        position: "absolute",
        top: 3,
        right: 3,
        width: 15,
        height: 15,
        padding: 0,
        background: dark ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.22)",
        border: "none",
        borderRadius: "50%",
        color: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.75)",
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      ×
    </button>
  );
}

// --- Custom node components (defined outside to avoid re-registration) ---

function BusinessNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <div
        style={{
          position: "relative",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          color: "#fff",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#4338ca"}`,
          borderRadius: 14,
          padding: "12px 18px",
          minWidth: 188,
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(30,27,75,0.4)"
            : "0 4px 16px rgba(30,27,75,0.3)",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} />}
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.6,
            marginBottom: 4,
            fontFamily: "var(--mono)",
          }}
        >
          Business
        </div>
        <p
          style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, margin: 0 }}
        >
          {d.label}
        </p>
        {d.phase === "decomposing" && (
          <p style={{ fontSize: 9, opacity: 0.55, marginTop: 4, margin: 0 }}>
            Decomposing…
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#6366f1",
          border: "2px solid #fff",
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </>
  );
}

function SubProblemNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#818cf8",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
        }}
      />
      <div
        style={{
          position: "relative",
          background: d.isSelected ? "#4338ca" : "#4f46e5",
          color: "#fff",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#6366f1"}`,
          borderRadius: 10,
          padding: "8px 14px",
          minWidth: 162,
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.3), 0 2px 8px rgba(79,70,229,0.4)"
            : "0 2px 8px rgba(79,70,229,0.3)",
          transition: "all 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} />}
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.55,
            marginBottom: 3,
            fontFamily: "var(--mono)",
          }}
        >
          Sub-problem
        </div>
        <p
          style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0 }}
        >
          {d.label}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#818cf8",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          bottom: -4,
        }}
      />
    </>
  );
}

function ConceptNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#a78bfa",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
        }}
      />
      <div
        style={{
          position: "relative",
          background: d.isSelected ? "#6d28d9" : "#7c3aed",
          color: "#fff",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#8b5cf6"}`,
          borderRadius: 999,
          padding: "8px 18px",
          minWidth: 152,
          textAlign: "center",
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.3), 0 2px 10px rgba(124,58,237,0.4)"
            : "0 2px 10px rgba(124,58,237,0.3)",
          transition: "all 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} />}
        <p
          style={{ fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.3 }}
        >
          {d.label}
        </p>
        {d.subtitle && (
          <p
            style={{
              fontSize: 9,
              opacity: 0.7,
              margin: "2px 0 0",
              lineHeight: 1.2,
              letterSpacing: "0.04em",
            }}
          >
            {d.subtitle}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#a78bfa",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          bottom: -4,
        }}
      />
    </>
  );
}

function PaperNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#c7d2fe",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
        }}
      />
      <div
        style={{
          position: "relative",
          background: "#fff",
          color: "#1f2937",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#c7d2fe"}`,
          borderRadius: 8,
          padding: "8px 12px",
          minWidth: 158,
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.25), 0 2px 8px rgba(0,0,0,0.12)"
            : "0 2px 6px rgba(0,0,0,0.08)",
          transition: "all 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} dark />}
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6366f1",
            marginBottom: 3,
            fontFamily: "var(--mono)",
            opacity: 0.8,
          }}
        >
          Paper
        </div>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.35,
            margin: 0,
            color: "#111827",
          }}
        >
          {d.label}
        </p>
        {d.subtitle && (
          <p
            style={{
              fontSize: 10,
              color: "#6b7280",
              margin: "3px 0 0",
              lineHeight: 1.2,
            }}
          >
            {d.subtitle}
          </p>
        )}
      </div>
    </>
  );
}

function RecommendNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#86efac",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
        }}
      />
      <div
        style={{
          position: "relative",
          background: d.isSelected ? "#dcfce7" : "#f0fdf4",
          color: "#166534",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#86efac"}`,
          borderRadius: 8,
          padding: "8px 12px",
          minWidth: 158,
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.25), 0 2px 8px rgba(22,163,74,0.2)"
            : "0 2px 6px rgba(22,163,74,0.15)",
          transition: "all 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} dark />}
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#16a34a",
            marginBottom: 3,
            fontFamily: "var(--mono)",
            opacity: 0.8,
          }}
        >
          Recommended
        </div>
        <p
          style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0 }}
        >
          {d.label}
        </p>
        {d.subtitle && (
          <p
            style={{
              fontSize: 10,
              color: "#16a34a",
              margin: "3px 0 0",
              lineHeight: 1.2,
              fontWeight: 600,
            }}
          >
            {d.subtitle}
          </p>
        )}
      </div>
    </>
  );
}

function DomainCandidateNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#5eead4",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
        }}
      />
      <div
        style={{
          position: "relative",
          background: d.isSelected ? "#0d9488" : "#0f766e",
          color: "#fff",
          border: `2px solid ${d.isSelected ? "#f59e0b" : "#14b8a6"}`,
          borderRadius: 10,
          padding: "8px 14px",
          minWidth: 162,
          boxShadow: d.isSelected
            ? "0 0 0 3px rgba(245,158,11,0.3), 0 2px 8px rgba(15,118,110,0.4)"
            : "0 2px 8px rgba(15,118,110,0.3)",
          transition: "all 0.15s",
        }}
      >
        {d.onDelete && <NodeDeleteBtn onDelete={d.onDelete} />}
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.55,
            marginBottom: 3,
            fontFamily: "var(--mono)",
          }}
        >
          Added
        </div>
        <p
          style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.35, margin: 0 }}
        >
          {d.label}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#5eead4",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          bottom: -4,
        }}
      />
    </>
  );
}

function AddNode({ data }: NodeProps<RFNode<GNodeData>>) {
  const d = data as GNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#c7d2fe",
          border: "2px solid #fff",
          width: 8,
          height: 8,
          top: -4,
          opacity: 0,
        }}
      />
      <div
        onClick={(e) => {
          e.stopPropagation();
          d.onAdd?.();
        }}
        style={{
          border: "1.5px dashed #c7d2fe",
          borderRadius: 10,
          padding: "8px 14px",
          minWidth: 140,
          background: "rgba(248,249,255,0.9)",
          color: "#818cf8",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          userSelect: "none",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
          (e.currentTarget as HTMLElement).style.color = "#6366f1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#c7d2fe";
          (e.currentTarget as HTMLElement).style.color = "#818cf8";
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</span>
        <span style={{ fontSize: 11, fontWeight: 500 }}>Add directly</span>
      </div>
    </>
  );
}

const NODE_TYPES = {
  business: BusinessNode,
  subproblem: SubProblemNode,
  domaincandidate: DomainCandidateNode,
  concept: ConceptNode,
  paper: PaperNode,
  recommend: RecommendNode,
  "add-node": AddNode,
};

const NODE_DIMS: Record<string, { w: number; h: number }> = {
  business: { w: 200, h: 64 },
  subproblem: { w: 174, h: 56 },
  domaincandidate: { w: 174, h: 56 },
  concept: { w: 172, h: 50 },
  paper: { w: 170, h: 64 },
  recommend: { w: 170, h: 64 },
  "add-node": { w: 152, h: 40 },
};

function computeDagreLayout(
  rawNodes: { id: string; type: string }[],
  rawEdges: { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 96, nodesep: 36, edgesep: 10 });
  rawNodes.forEach((n) => {
    const d = NODE_DIMS[n.type] ?? { w: 170, h: 56 };
    g.setNode(n.id, { width: d.w, height: d.h });
  });
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  Dagre.layout(g);
  const posMap = new Map<string, { x: number; y: number }>();
  rawNodes.forEach((n) => {
    const pos = g.node(n.id);
    const d = NODE_DIMS[n.type] ?? { w: 170, h: 56 };
    posMap.set(n.id, { x: pos.x - d.w / 2, y: pos.y - d.h / 2 });
  });
  return posMap;
}

function FitOnStructureChange({
  nodeCount,
  businessCount,
  latestBusinessNodeId,
  nodes,
}: {
  nodeCount: number;
  businessCount: number;
  latestBusinessNodeId: string | null;
  nodes: RFNode<GNodeData>[];
}) {
  const { fitView, setCenter } = useReactFlow();
  const prevBusinessCount = useRef(businessCount);
  useEffect(() => {
    const newBizAdded = businessCount > prevBusinessCount.current;
    prevBusinessCount.current = businessCount;
    if (newBizAdded && latestBusinessNodeId) {
      // New business added — pan to it rather than zooming out to fit everything
      const t = setTimeout(() => {
        const node = nodes.find((n) => n.id === latestBusinessNodeId);
        if (node) {
          const dim = NODE_DIMS[node.type ?? ""] ?? { w: 200, h: 64 };
          setCenter(node.position.x + dim.w / 2, node.position.y + dim.h / 2, {
            zoom: 1.2,
            duration: 450,
          });
        } else {
          fitView({ padding: 0.22, duration: 380 });
        }
      }, 80);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => fitView({ padding: 0.22, duration: 380 }), 80);
    return () => clearTimeout(t);
  }, [nodeCount]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function NodeClickPanner({
  nodeId,
  nodes,
}: {
  nodeId: string | null;
  nodes: RFNode<GNodeData>[];
}) {
  const { setCenter } = useReactFlow();
  useEffect(() => {
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const dim = NODE_DIMS[node.type ?? ""] ?? { w: 170, h: 56 };
    setCenter(node.position.x + dim.w / 2, node.position.y + dim.h / 2, {
      zoom: 1.3,
      duration: 350,
    });
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function GraphPanel({
  businesses,
  subproblems,
  concepts,
  paperGroups,
  recommendations,
  selectedId,
  onSelect,
  activeMsgId,
  onTransformSp,
  onDeleteNode,
  onAddNodeForBusiness,
}: {
  businesses: Business[];
  subproblems: SubProblem[];
  concepts: Concept[];
  paperGroups: Record<string, Paper[]>;
  recommendations: Recommendation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeMsgId?: string;
  onTransformSp?: (msgId: string, sp: SubProblem) => Promise<Concept>;
  onDeleteNode?: (nodeId: string, nodeType: string) => void;
  onAddNodeForBusiness?: (businessId: string) => void;
}) {
  const [graphTransformingId, setGraphTransformingId] = useState<string | null>(
    null,
  );
  const [rfNodes, setRfNodes] = useState<RFNode<GNodeData>[]>([]);
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([]);

  const handleTransformFromGraph = useCallback(
    async (msgId: string, sp: SubProblem) => {
      if (!onTransformSp || graphTransformingId === sp.id) return;
      setGraphTransformingId(sp.id);
      try {
        await onTransformSp(msgId, sp);
      } finally {
        setGraphTransformingId(null);
      }
    },
    [onTransformSp, graphTransformingId],
  );

  useEffect(() => {
    if (businesses.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    const allFinalNodes: RFNode<GNodeData>[] = [];
    const allFinalEdges: RFEdge[] = [];
    let xOffset = 0;

    for (const biz of businesses) {
      const bizSubproblems = subproblems.filter(
        (sp) => sp.businessId === biz.id,
      );
      const bizConcepts = concepts.filter((c) =>
        bizSubproblems.some((sp) => sp.id === c.subproblemId),
      );
      const bizPaperGroups = Object.fromEntries(
        Object.entries(paperGroups).filter(([spId]) =>
          bizSubproblems.some((sp) => sp.id === spId),
        ),
      );
      const addNodeId = `add-node-${biz.id}`;
      const conceptIds = new Set(bizConcepts.map((c) => c.subproblemId));
      const existingPaperIds = new Set(
        Object.values(bizPaperGroups)
          .flat()
          .map((p) => p.paperId),
      );

      if (bizSubproblems.length === 0) {
        // Still loading: show just the business node
        allFinalNodes.push({
          id: biz.id,
          type: "business",
          position: { x: xOffset, y: 0 },
          data: {
            label:
              biz.problem.slice(0, 50) + (biz.problem.length > 50 ? "…" : ""),
            isSelected: selectedId === biz.id,
            phase: biz.phase,
            onDelete: onDeleteNode
              ? () => onDeleteNode(biz.id, "business")
              : undefined,
          },
        });
        xOffset += 260;
        continue;
      }

      // Structural nodes/edges for dagre
      const structNodes: { id: string; type: string }[] = [
        { id: biz.id, type: "business" },
      ];
      const structEdges: {
        id: string;
        source: string;
        target: string;
        animated?: boolean;
        dashed?: boolean;
      }[] = [];

      bizSubproblems.forEach((sp) => {
        structNodes.push({
          id: sp.id,
          type: sp.userCreated ? "domaincandidate" : "subproblem",
        });
        structEdges.push({ id: `b-${sp.id}`, source: biz.id, target: sp.id });
      });
      structNodes.push({ id: addNodeId, type: "add-node" });
      structEdges.push({
        id: `b-${addNodeId}`,
        source: biz.id,
        target: addNodeId,
        dashed: true,
      });
      bizConcepts.forEach((c) => {
        structNodes.push({ id: "c-" + c.subproblemId, type: "concept" });
        structEdges.push({
          id: `sp-c-${c.subproblemId}`,
          source: c.subproblemId,
          target: "c-" + c.subproblemId,
          animated: true,
        });
      });
      Object.entries(bizPaperGroups).forEach(([spId, papers]) => {
        papers.slice(0, 3).forEach((p) => {
          structNodes.push({ id: p.paperId, type: "paper" });
          structEdges.push({
            id: `c-${spId}-${p.paperId}`,
            source: "c-" + spId,
            target: p.paperId,
            animated: true,
          });
        });
      });
      const allPaperNodeIds = Object.values(bizPaperGroups)
        .flat()
        .map((p) => p.paperId);
      recommendations.slice(0, 5).forEach((r) => {
        if (!existingPaperIds.has(r.paperId)) {
          structNodes.push({ id: r.paperId, type: "recommend" });
          if (allPaperNodeIds.length > 0) {
            structEdges.push({
              id: `rec-${biz.id}-${r.paperId}`,
              source: allPaperNodeIds[0],
              target: r.paperId,
              animated: true,
            });
          }
        }
      });

      const posMap = computeDagreLayout(structNodes, structEdges);

      // Compute max x extent for this world
      let maxX = 0;
      structNodes.forEach((n) => {
        const pos = posMap.get(n.id);
        if (pos) {
          const d = NODE_DIMS[n.type] ?? { w: 170, h: 56 };
          maxX = Math.max(maxX, pos.x + d.w);
        }
      });

      // Business node
      const bizPos = posMap.get(biz.id) ?? { x: 0, y: 0 };
      allFinalNodes.push({
        id: biz.id,
        type: "business",
        position: { x: bizPos.x + xOffset, y: bizPos.y },
        data: {
          label:
            biz.problem.slice(0, 50) + (biz.problem.length > 50 ? "…" : ""),
          isSelected: selectedId === biz.id,
          onDelete: onDeleteNode
            ? () => onDeleteNode(biz.id, "business")
            : undefined,
        },
      });

      // Sub-problem nodes
      bizSubproblems.forEach((sp) => {
        const pos = posMap.get(sp.id) ?? { x: 0, y: 0 };
        allFinalNodes.push({
          id: sp.id,
          type: sp.userCreated ? "domaincandidate" : "subproblem",
          position: { x: pos.x + xOffset, y: pos.y },
          data: {
            label: sp.text.slice(0, 50) + (sp.text.length > 50 ? "…" : ""),
            isSelected: selectedId === sp.id,
            canTransform: !conceptIds.has(sp.id) && !!onTransformSp,
            isTransforming: graphTransformingId === sp.id,
            onTransform: () => handleTransformFromGraph(biz.msgId, sp),
            onDelete: onDeleteNode
              ? () => onDeleteNode(sp.id, "subproblem")
              : undefined,
          },
        });
      });

      // Concept nodes
      bizConcepts.forEach((c) => {
        const pos = posMap.get("c-" + c.subproblemId) ?? { x: 0, y: 0 };
        allFinalNodes.push({
          id: "c-" + c.subproblemId,
          type: "concept",
          position: { x: pos.x + xOffset, y: pos.y },
          data: {
            label: c.keywords.slice(0, 2).join(" · "),
            subtitle: c.research_fields[0] ?? undefined,
            isSelected: selectedId === "c-" + c.subproblemId,
            onDelete: onDeleteNode
              ? () => onDeleteNode("c-" + c.subproblemId, "concept")
              : undefined,
          },
        });
      });

      // Paper nodes
      Object.entries(bizPaperGroups).forEach(([, papers]) => {
        papers.slice(0, 3).forEach((p) => {
          const pos = posMap.get(p.paperId) ?? { x: 0, y: 0 };
          allFinalNodes.push({
            id: p.paperId,
            type: "paper",
            position: { x: pos.x + xOffset, y: pos.y },
            data: {
              label: p.title.slice(0, 38) + (p.title.length > 38 ? "…" : ""),
              subtitle: p.year
                ? `${p.year} · ${p.citationCount?.toLocaleString() ?? "?"}`
                : undefined,
              isSelected: selectedId === p.paperId,
              onDelete: onDeleteNode
                ? () => onDeleteNode(p.paperId, "paper")
                : undefined,
            },
          });
        });
      });

      // Recommend nodes
      recommendations.slice(0, 5).forEach((r) => {
        if (!existingPaperIds.has(r.paperId)) {
          const pos = posMap.get(r.paperId) ?? { x: 0, y: 0 };
          allFinalNodes.push({
            id: r.paperId,
            type: "recommend",
            position: { x: pos.x + xOffset, y: pos.y },
            data: {
              label: r.title.slice(0, 38) + (r.title.length > 38 ? "…" : ""),
              subtitle: `PPR ${r.scores.final.toFixed(2)}`,
              isSelected: selectedId === r.paperId,
              onDelete: onDeleteNode
                ? () => onDeleteNode(r.paperId, "recommend")
                : undefined,
            },
          });
        }
      });

      // Add-node phantom
      const addPos = posMap.get(addNodeId) ?? { x: 0, y: 0 };
      allFinalNodes.push({
        id: addNodeId,
        type: "add-node",
        position: { x: addPos.x + xOffset, y: addPos.y },
        data: {
          label: "+ Add directly",
          isSelected: false,
          onAdd: onAddNodeForBusiness
            ? () => onAddNodeForBusiness(biz.id)
            : undefined,
        },
      });

      // Edges for this world
      structEdges.forEach((e) => {
        const highlight = e.source === selectedId || e.target === selectedId;
        const isRecEdge = e.id.startsWith("rec-");
        const isConceptEdge = e.id.startsWith("sp-c-");
        const isAddEdge = e.target === addNodeId;
        allFinalEdges.push({
          id: e.id,
          source: e.source,
          target: e.target,
          type: "smoothstep",
          animated: e.animated ?? false,
          style: {
            stroke: highlight
              ? "#f59e0b"
              : isAddEdge
                ? "#c7d2fe"
                : isRecEdge
                  ? "#86efac"
                  : isConceptEdge
                    ? "#a78bfa"
                    : e.animated
                      ? "#c7d2fe"
                      : "#ddd6fe",
            strokeWidth: highlight ? 3 : isConceptEdge ? 2 : 1.5,
            opacity: isAddEdge ? 0.4 : highlight ? 1 : 0.65,
            strokeDasharray: e.dashed ? "4 4" : undefined,
          },
        });
      });

      xOffset += maxX + 120;
    }

    setRfNodes(allFinalNodes);
    setRfEdges(allFinalEdges);
  }, [
    businesses,
    subproblems,
    concepts,
    paperGroups,
    recommendations,
    selectedId,
    graphTransformingId,
    onTransformSp,
    onDeleteNode,
    onAddNodeForBusiness,
    handleTransformFromGraph,
  ]);

  if (businesses.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <p className="text-sm text-zinc-400">Graph appears here after search</p>
      </div>
    );

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => {
          if (node.id.startsWith("add-node-")) return;
          onSelect(node.id === selectedId ? null : node.id);
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#f8f9ff" }}
        minZoom={0.15}
        maxZoom={3}
      >
        <Background gap={28} color="#e8eaf0" size={1} />
        <Controls
          showInteractive={false}
          style={{ bottom: 16, right: 16, left: "unset", top: "unset" }}
        />
        <FitOnStructureChange
          nodeCount={rfNodes.length}
          businessCount={businesses.length}
          latestBusinessNodeId={
            businesses.length > 0 ? businesses[businesses.length - 1].id : null
          }
          nodes={rfNodes}
        />
        <NodeClickPanner nodeId={selectedId} nodes={rfNodes} />
      </ReactFlow>
    </div>
  );
}

// ── Assistant Message ─────────────────────────────────────────────────────────

function AssistantMessage({
  msg,
  selectedPaperId,
  onSelectPaper,
  onTransformOne,
  onSearchOne,
}: {
  msg: Message;
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
  onTransformOne: (msgId: string, sp: SubProblem) => Promise<Concept>;
  onSearchOne: (msgId: string, concept: Concept) => Promise<void>;
}) {
  void selectedPaperId;
  void onSelectPaper;
  const [transformingIds, setTransformingIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchingIds, setSearchingIds] = useState<Set<string>>(new Set());

  async function handleTransformClick(sp: SubProblem) {
    if (transformingIds.has(sp.id)) return;
    setTransformingIds((prev) => {
      const n = new Set(prev);
      n.add(sp.id);
      return n;
    });
    try {
      await onTransformOne(msg.id, sp);
    } catch {
      /* noop */
    } finally {
      setTransformingIds((prev) => {
        const n = new Set(prev);
        n.delete(sp.id);
        return n;
      });
    }
  }

  async function handleSearchClick(concept: Concept) {
    if (searchingIds.has(concept.subproblemId)) return;
    setSearchingIds((prev) => {
      const n = new Set(prev);
      n.add(concept.subproblemId);
      return n;
    });
    try {
      await onSearchOne(msg.id, concept);
    } catch {
      /* noop */
    } finally {
      setSearchingIds((prev) => {
        const n = new Set(prev);
        n.delete(concept.subproblemId);
        return n;
      });
    }
  }

  const PhaseTag = ({
    label,
    active,
    done,
  }: {
    label: string;
    active?: boolean;
    done?: boolean;
  }) => (
    <span
      className={`inline-flex items-center gap-1 text-xs ${done ? "text-green-600" : active ? "text-indigo-600 font-semibold" : "text-zinc-400"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${done ? "bg-green-500" : active ? "bg-indigo-500 animate-pulse" : "bg-zinc-200"}`}
      />
      {label}
    </span>
  );

  if (msg.phase === "decomposing") {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
        Decomposing problem…
      </div>
    );
  }
  if (msg.phase === "error") {
    return (
      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
        {msg.error ?? "Error occurred"}
      </p>
    );
  }
  if (!msg.subproblems || msg.subproblems.length === 0) return null;

  const sps = msg.subproblems;
  const conceptsMap = new Map(
    (msg.concepts ?? []).map((c) => [c.subproblemId, c]),
  );
  const allHaveConcepts = sps.every((sp) => conceptsMap.has(sp.id));
  const allHavePapers = sps.every(
    (sp) => (msg.paperGroups?.[sp.id] ?? []).length > 0,
  );
  const msgRecs = msg.recommendations ?? [];
  const isIngesting = msg.phase === "ingesting" || msg.phase === "recommending";

  return (
    <div className="space-y-2">
      <div className="flex gap-3 flex-wrap">
        <PhaseTag label="Decomposed" done />
        <PhaseTag
          label="Concepts"
          done={allHaveConcepts}
          active={transformingIds.size > 0}
        />
        <PhaseTag
          label="Papers"
          done={allHavePapers}
          active={searchingIds.size > 0}
        />
        {isIngesting && (
          <PhaseTag
            label={msg.phase === "ingesting" ? "Saving…" : "Computing PPR…"}
            active
          />
        )}
        {msgRecs.length > 0 && <PhaseTag label="PPR" done />}
      </div>

      <p className="text-xs text-zinc-500">
        {sps.length} sub-problem{sps.length !== 1 ? "s" : ""} identified
      </p>

      <div className="space-y-1.5">
        {sps.map((sp, i) => {
          const concept = conceptsMap.get(sp.id);
          const papers = msg.paperGroups?.[sp.id] ?? [];
          const isTransforming = transformingIds.has(sp.id);
          const isSearching = searchingIds.has(sp.id);

          return (
            <div key={sp.id} className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-700 leading-snug">{sp.text}</p>
                {!concept ? (
                  <button
                    onClick={() => handleTransformClick(sp)}
                    disabled={isTransforming}
                    className="mt-0.5 text-[11px] text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                  >
                    {isTransforming ? "Mapping…" : "Map to concept →"}
                  </button>
                ) : papers.length === 0 ? (
                  <button
                    onClick={() => handleSearchClick(concept)}
                    disabled={isSearching}
                    className="mt-0.5 text-[11px] text-purple-600 hover:text-purple-800 disabled:opacity-50 transition-colors"
                  >
                    {isSearching ? "Searching…" : "Search papers →"}
                  </button>
                ) : (
                  <p className="mt-0.5 text-[11px] text-green-600">
                    {papers.length} paper{papers.length !== 1 ? "s" : ""} found
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isIngesting && (
        <div className="flex items-center gap-2 py-1 text-xs text-zinc-400">
          <span style={{ display: "inline-flex", animation: "spin 1.5s linear infinite" }}>
            <MoatIcon size={12} />
          </span>
          {msg.phase === "ingesting"
            ? "Saving to Neo4j graph…"
            : "Computing PPR recommendations…"}
        </div>
      )}

      {msgRecs.length > 0 && (
        <p className="text-xs text-green-700 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          PPR complete — {msgRecs.length} recommendation
          {msgRecs.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────

function RightPanel({
  messages,
  sessions,
  activeSessionId,
  user,
  selectedId,
  paperGroups,
  recommendations,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onLogout,
  isPro,
  onCancelPro,
  onSelectNode,
  onSubmit,
  onRequireAuth,
  onTransformOne,
  onSearchOne,
}: {
  messages: Message[];
  sessions: Session[];
  activeSessionId: string | null;
  user: { email: string; display_name?: string | null } | null;
  selectedId: string | null;
  paperGroups: Record<string, Paper[]>;
  recommendations: Recommendation[];
  onSelectSession: (s: Session) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onLogout: () => void;
  isPro: boolean;
  onCancelPro: () => Promise<void>;
  onSelectNode: (id: string | null) => void;
  onSubmit: (problem: string) => void;
  onRequireAuth: () => boolean;
  onTransformOne: (msgId: string, sp: SubProblem) => Promise<Concept>;
  onSearchOne: (msgId: string, concept: Concept) => Promise<void>;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [input, setInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDecomposing = messages.some(
    (m) =>
      m.phase === "decomposing" ||
      m.phase === "ingesting" ||
      m.phase === "recommending",
  );
  const currentTitle =
    sessions.find((s) => s.id === activeSessionId)?.title ??
    messages.find((m) => m.role === "user")?.problem?.slice(0, 40) ??
    "New Research";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (lastMsg?.role === "user" || isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setDropdownOpen(false);
    }
    if (dropdownOpen) document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [dropdownOpen]);

  void paperGroups;
  void recommendations;
  void selectedId;

  function handleSend() {
    if (!input.trim() || isDecomposing || !onRequireAuth()) return;
    onSubmit(input.trim());
    setInput("");
  }

  return (
    <div className="relative flex flex-col w-80 shrink-0 border-l border-zinc-200 bg-white h-full">
      <div ref={dropdownRef} className="relative border-b border-zinc-100 z-30">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
        >
          <p className="flex-1 text-sm font-semibold text-zinc-900 truncate">
            {currentTitle}
          </p>
          <svg
            className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-full bg-white border border-zinc-200 border-t-0 shadow-xl rounded-b-xl overflow-hidden">
            <button
              onClick={() => {
                onNewSession();
                setDropdownOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-indigo-600 font-medium hover:bg-indigo-50 border-b border-zinc-100 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New Session
            </button>
            <div className="max-h-56 overflow-y-auto">
              {sessions.length === 0 && (
                <p className="px-4 py-4 text-xs text-zinc-400 text-center">
                  No sessions yet
                </p>
              )}
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onSelectSession(s);
                      setDropdownOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-zinc-50 transition-colors ${isActive ? "bg-indigo-50" : "hover:bg-zinc-50"}`}
                  >
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-indigo-600" : "bg-zinc-300"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${isActive ? "text-indigo-900 font-medium" : "text-zinc-800"}`}
                      >
                        {s.title}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {relativeTime(s.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      className="shrink-0 text-zinc-300 hover:text-red-400 transition-colors"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {user && (
              <div className="border-t border-zinc-100 bg-zinc-50">
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                    {(user.display_name ?? user.email)[0].toUpperCase()}
                  </div>
                  <p className="text-xs text-zinc-600 truncate flex-1">
                    {user.display_name ?? user.email}
                  </p>
                  <button
                    onClick={() => {
                      onLogout();
                      setDropdownOpen(false);
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    Log out
                  </button>
                </div>
                {isPro && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={async () => {
                        await onCancelPro();
                        setDropdownOpen(false);
                      }}
                      className="w-full text-xs text-red-400 hover:text-red-600 transition-colors text-left"
                    >
                      Cancel Pro subscription
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {(() => {
          // Group into (user, assistant) turn pairs for tighter intra-turn spacing
          const pairs: { user?: Message; assistant?: Message; key: string }[] =
            [];
          let cur: { user?: Message; assistant?: Message; key: string } = {
            key: "",
          };
          for (const msg of messages) {
            if (msg.role === "user") {
              if (cur.key) pairs.push(cur);
              cur = { user: msg, key: msg.id };
            } else {
              cur = { ...cur, assistant: msg };
            }
          }
          if (cur.key) pairs.push(cur);
          return pairs.map((pair) => (
            <div key={pair.key} className="space-y-2">
              {pair.user && (
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white leading-snug">
                    {pair.user.problem}
                  </div>
                </div>
              )}
              {pair.assistant && (
                <AssistantMessage
                  msg={pair.assistant}
                  selectedPaperId={selectedId}
                  onSelectPaper={onSelectNode}
                  onTransformOne={onTransformOne}
                  onSearchOne={onSearchOne}
                />
              )}
            </div>
          ));
        })()}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe another problem…"
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            style={{ maxHeight: 80 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDecomposing}
            className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

// ── Explore Page ──────────────────────────────────────────────────────────────

const EXAMPLES = [
  "Our recommendation platform can't explain why content was suggested, which is hurting user trust. How can we make our black-box system more transparent?",
  "Our factory equipment breaks down without warning, forcing our production line to stop frequently. We have sensor data piling up — could we use it to predict failures in advance?",
  "Our support team receives hundreds of tickets a day, and manually prioritizing each one causes urgent issues to get delayed.",
];

export default function Explore() {
  const { user, accessToken, logout, loading, authFetch, isPro, checkPlan } =
    useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [subproblems, setSubproblems] = useState<SubProblem[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [paperGroups, setPaperGroups] = useState<Record<string, Paper[]>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingProblem, setPendingProblem] = useState<string | null>(null);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const sessionSavedRef = useRef(false);
  const ingestDoneRef = useRef(false);
  const businessesRef = useRef<Business[]>([]);
  businessesRef.current = businesses;
  const conceptsRef = useRef<Concept[]>([]);
  conceptsRef.current = concepts;
  const subproblemsRef2 = useRef<SubProblem[]>([]);
  subproblemsRef2.current = subproblems;
  const paperGroupsRef = useRef<Record<string, Paper[]>>({});
  paperGroupsRef.current = paperGroups;

  const started = businesses.length > 0;

  useEffect(() => {
    if (user) setShowAuthModal(false);
  }, [user]);

  const fetchSessions = useCallback(async () => {
    if (!accessToken) return;
    const res = await authFetch(
      `${API_BASE}/sessions?order=created_at.desc&limit=50`,
    );
    if (res.ok) setSessions(await res.json());
  }, [accessToken, authFetch]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  function requireAuth(): boolean {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }
    return true;
  }

  function reset() {
    setInput("");
    setMessages([]);
    setBusinesses([]);
    setSubproblems([]);
    setConcepts([]);
    setPaperGroups({});
    setRecommendations([]);
    setSelectedId(null);
    setActiveSessionId(null);
    setActiveMsgId(null);
    sessionSavedRef.current = false;
    ingestDoneRef.current = false;
  }

  function loadSession(s: Session) {
    const worldId = s.id;
    const aiId = "a-" + s.id;
    setActiveSessionId(s.id);
    setBusinesses([
      { id: worldId, problem: s.problem, phase: "done", msgId: aiId },
    ]);
    setSubproblems([]);
    setConcepts([]);
    setPaperGroups({});
    setRecommendations([]);
    setSelectedId(null);
    setMessages([
      { id: "u-" + s.id, role: "user", problem: s.problem },
      {
        id: aiId,
        role: "assistant",
        phase: "done",
        subproblems: [],
        concepts: [],
        paperGroups: {},
        recommendations: [],
      },
    ]);
    setActiveMsgId(aiId);
    sessionSavedRef.current = true;
    void parseField(s.papers, []);
  }

  const updateAiMsg = (msgId: string, updates: Partial<Message>) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, ...updates } : m)),
    );

  async function handleCancelPro() {
    await authFetch(`${API_BASE}/fn/deactivate-pro`, { method: 'POST' });
    await checkPlan();
  }

  // Step 1: Decompose — appends a new business tree instead of resetting
  async function handleSearch(problem: string) {
    if (!requireAuth()) return;
    if (sessions.length >= 1 && !isPro) {
      setShowPaywall(true);
      setPendingProblem(problem);
      return;
    }

    const worldId = crypto.randomUUID();
    const userId = Date.now().toString();
    const aiId = userId + "-ai";

    setBusinesses((prev) => [
      ...prev,
      { id: worldId, problem, phase: "decomposing", msgId: aiId },
    ]);
    setActiveMsgId(aiId);
    setSelectedId(null);
    sessionSavedRef.current = false;
    ingestDoneRef.current = false;

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", problem },
      {
        id: aiId,
        role: "assistant",
        phase: "decomposing",
        subproblems: [],
        concepts: [],
        paperGroups: {},
      },
    ]);

    try {
      const res = await authFetch(`${API_BASE}/fn/decompose-problem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Decompose failed");
      // Always generate fresh UUIDs — never trust LLM-generated IDs which may collide across sessions
      const sps: SubProblem[] = (data.subproblems ?? []).map(
        (sp: Omit<SubProblem, "businessId">) => ({
          ...sp,
          id: crypto.randomUUID(),
          businessId: worldId,
        }),
      );
      setSubproblems((prev) => [...prev, ...sps]);
      setBusinesses((prev) =>
        prev.map((b) => (b.id === worldId ? { ...b, phase: "done" } : b)),
      );
      updateAiMsg(aiId, {
        phase: "done",
        subproblems: sps,
        concepts: [],
        paperGroups: {},
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setBusinesses((prev) =>
        prev.map((b) => (b.id === worldId ? { ...b, phase: "error" } : b)),
      );
      updateAiMsg(aiId, { phase: "error", error: msg });
    }
  }

  // Step 2: Transform a single sub-problem → concept
  async function handleTransformOne(
    msgId: string,
    sp: SubProblem,
  ): Promise<Concept> {
    const res = await authFetch(`${API_BASE}/fn/transform-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem: sp.text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Transform failed");
    const concept: Concept = { subproblemId: sp.id, ...data };
    setConcepts((prev) => [...prev, concept]);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, concepts: [...(m.concepts ?? []), concept] }
          : m,
      ),
    );
    return concept;
  }

  // Step 3: Search papers + auto-ingest to Neo4j
  async function handleSearchOne(msgId: string, concept: Concept) {
    const res = await authFetch(`${API_BASE}/fn/search-papers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: concept.academic_query,
        keywords: concept.keywords,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Search failed");
    const papers: Paper[] = (data.papers ?? []).map((p: Paper, i: number) => ({
      ...p,
      rank: i,
    }));

    const newGroups = {
      ...paperGroupsRef.current,
      [concept.subproblemId]: papers,
    };
    setPaperGroups(newGroups);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              paperGroups: {
                ...(m.paperGroups ?? {}),
                [concept.subproblemId]: papers,
              },
            }
          : m,
      ),
    );

    // Use refs to avoid stale closures in async callbacks
    const allConcepts = [...conceptsRef.current, concept];
    const biz = businessesRef.current.find((b) => b.msgId === msgId);

    // Auto-save to Butterbase when all concepts for this business have papers
    if (user && accessToken && !sessionSavedRef.current && biz) {
      const bizSps = subproblemsRef2.current.filter(
        (sp) => sp.businessId === biz.id,
      );
      const bizConcepts = allConcepts.filter((c) =>
        bizSps.some((sp) => sp.id === c.subproblemId),
      );
      const allDone =
        bizSps.length > 0 &&
        bizConcepts.length === bizSps.length &&
        bizConcepts.every((c) => newGroups[c.subproblemId]?.length > 0);
      if (allDone) {
        sessionSavedRef.current = true;
        const allPapers = Object.values(newGroups).flat();
        authFetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            title:
              biz.problem.slice(0, 60) + (biz.problem.length > 60 ? "…" : ""),
            problem: biz.problem,
            academic_query: bizConcepts[0]?.academic_query ?? null,
            keywords: JSON.stringify(bizConcepts.flatMap((c) => c.keywords)),
            research_fields: JSON.stringify(
              bizConcepts.flatMap((c) => c.research_fields),
            ),
            papers: JSON.stringify(allPapers),
          }),
        })
          .then(() => fetchSessions())
          .catch(console.error);
      }
    }

    const bizSpsAll = subproblemsRef2.current.filter(
      (sp) => biz && sp.businessId === biz.id,
    );
    const bizConceptsAll = allConcepts.filter((c) =>
      bizSpsAll.some((sp) => sp.id === c.subproblemId),
    );
    const allPapersIn =
      bizSpsAll.length > 0 &&
      bizConceptsAll.length === bizSpsAll.length &&
      bizConceptsAll.every((c) => newGroups[c.subproblemId]?.length > 0);

    if (allPapersIn && !ingestDoneRef.current) {
      ingestDoneRef.current = true;
      autoIngestAndRecommend(msgId, biz, allConcepts, newGroups);
    }
  }

  async function autoIngestAndRecommend(
    msgId: string,
    biz: Business | undefined,
    allConcepts: Concept[],
    groups: Record<string, Paper[]>,
  ) {
    updateAiMsg(msgId, { phase: "ingesting" });
    setBusinesses((prev) =>
      prev.map((b) => (b.msgId === msgId ? { ...b, phase: "ingesting" } : b)),
    );

    const latestSps = subproblemsRef2.current;
    const bizSps = biz
      ? latestSps.filter(
          (sp) =>
            sp.businessId === biz.id &&
            allConcepts.some((c) => c.subproblemId === sp.id),
        )
      : latestSps.filter((sp) =>
          allConcepts.some((c) => c.subproblemId === sp.id),
        );

    try {
      await authFetch(`${API_BASE}/fn/ingest-graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: biz?.id ?? msgId,
          business_text: biz?.problem ?? "",
          subproblems: bizSps,
          concepts: allConcepts,
          papers_by_subproblem: groups,
        }),
      });

      updateAiMsg(msgId, { phase: "recommending" });
      setBusinesses((prev) =>
        prev.map((b) =>
          b.msgId === msgId ? { ...b, phase: "recommending" } : b,
        ),
      );

      const allPaperIds = Object.values(groups)
        .flat()
        .map((p) => p.paperId);
      const recRes = await authFetch(`${API_BASE}/fn/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds: allPaperIds, limit: 5 }),
      });
      const recData = await recRes.json();
      const recs: Recommendation[] = recData.recommendations ?? [];
      setRecommendations(recs);
      setBusinesses((prev) =>
        prev.map((b) => (b.msgId === msgId ? { ...b, phase: "done" } : b)),
      );
      updateAiMsg(msgId, { phase: "done", recommendations: recs });
    } catch {
      setBusinesses((prev) =>
        prev.map((b) => (b.msgId === msgId ? { ...b, phase: "done" } : b)),
      );
      updateAiMsg(msgId, { phase: "done" });
    }
  }

  async function handleAddDomainCandidate(text: string) {
    if (!activeMsgId) return;
    const biz = businessesRef.current.find((b) => b.msgId === activeMsgId);
    if (!biz) return;
    const newSp: SubProblem = {
      id: `dc-${crypto.randomUUID()}`,
      text,
      userCreated: true,
      businessId: biz.id,
    };
    setSubproblems((prev) => [...prev, newSp]);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeMsgId
          ? { ...m, subproblems: [...(m.subproblems ?? []), newSp] }
          : m,
      ),
    );
    try {
      const concept = await handleTransformOne(activeMsgId, newSp);
      await handleSearchOne(activeMsgId, concept);
    } catch {
      /* noop */
    }
  }

  function handleDeleteNode(nodeId: string, nodeType: string) {
    if (nodeType === "business") {
      const bizSpIds = subproblems
        .filter((sp) => sp.businessId === nodeId)
        .map((sp) => sp.id);
      setSubproblems((prev) => prev.filter((sp) => sp.businessId !== nodeId));
      setConcepts((prev) =>
        prev.filter((c) => !bizSpIds.includes(c.subproblemId)),
      );
      setPaperGroups((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([spId]) => !bizSpIds.includes(spId)),
        ),
      );
      setRecommendations([]);
      setMessages((prev) => {
        const biz = businessesRef.current.find((b) => b.id === nodeId);
        if (!biz) return prev;
        return prev.filter(
          (m) => m.id !== biz.msgId && m.id !== biz.msgId.replace("-ai", ""),
        );
      });
      setBusinesses((prev) => {
        const next = prev.filter((b) => b.id !== nodeId);
        if (next.length === 0) {
          setActiveMsgId(null);
        } else if (
          activeMsgId ===
          businessesRef.current.find((b) => b.id === nodeId)?.msgId
        ) {
          setActiveMsgId(next[next.length - 1].msgId);
        }
        return next;
      });
      if (selectedId === nodeId || bizSpIds.includes(selectedId ?? ""))
        setSelectedId(null);
      return;
    }

    const patchMsg = (m: Message): Message => {
      if (m.role !== "assistant") return m;
      if (nodeType === "subproblem" || nodeType === "domaincandidate")
        return {
          ...m,
          subproblems: (m.subproblems ?? []).filter((s) => s.id !== nodeId),
          concepts: (m.concepts ?? []).filter((c) => c.subproblemId !== nodeId),
          paperGroups: Object.fromEntries(
            Object.entries(m.paperGroups ?? {}).filter(([k]) => k !== nodeId),
          ),
          recommendations: [],
        };
      if (nodeType === "concept") {
        const spId = nodeId.replace(/^c-/, "");
        return {
          ...m,
          concepts: (m.concepts ?? []).filter((c) => c.subproblemId !== spId),
          paperGroups: Object.fromEntries(
            Object.entries(m.paperGroups ?? {}).filter(([k]) => k !== spId),
          ),
          recommendations: [],
        };
      }
      if (nodeType === "paper")
        return {
          ...m,
          paperGroups: Object.fromEntries(
            Object.entries(m.paperGroups ?? {}).map(([k, ps]) => [
              k,
              ps.filter((p) => p.paperId !== nodeId),
            ]),
          ),
        };
      if (nodeType === "recommend")
        return {
          ...m,
          recommendations: (m.recommendations ?? []).filter(
            (r) => r.paperId !== nodeId,
          ),
        };
      return m;
    };

    if (nodeType === "subproblem" || nodeType === "domaincandidate") {
      setSubproblems((prev) => prev.filter((s) => s.id !== nodeId));
      setConcepts((prev) => prev.filter((c) => c.subproblemId !== nodeId));
      setPaperGroups((prev) => {
        const n = { ...prev };
        delete n[nodeId];
        return n;
      });
      setRecommendations([]);
    } else if (nodeType === "concept") {
      const spId = nodeId.replace(/^c-/, "");
      setConcepts((prev) => prev.filter((c) => c.subproblemId !== spId));
      setPaperGroups((prev) => {
        const n = { ...prev };
        delete n[spId];
        return n;
      });
      setRecommendations([]);
    } else if (nodeType === "paper") {
      setPaperGroups((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([k, ps]) => [
            k,
            ps.filter((p) => p.paperId !== nodeId),
          ]),
        ),
      );
    } else if (nodeType === "recommend") {
      setRecommendations((prev) => prev.filter((r) => r.paperId !== nodeId));
    }
    setMessages((prev) => prev.map(patchMsg));
    if (selectedId === nodeId) setSelectedId(null);
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    await authFetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" });
    if (activeSessionId === id) reset();
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) return null;

  // ── Initial: problem input ────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        {showPaywall && (
          <ProPaywallModal
            onClose={() => {
              setShowPaywall(false);
              setPendingProblem(null);
            }}
            onActivated={async () => {
              await checkPlan();
              setShowPaywall(false);
              if (pendingProblem) {
                void handleSearch(pendingProblem);
                setPendingProblem(null);
              }
            }}
          />
        )}

        {/* Nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 32px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <span style={{ color: "var(--indigo)" }}>
              <MoatIcon size={22} />
            </span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                letterSpacing: "0.1em",
                color: "var(--indigo)",
                textTransform: "uppercase",
              }}
            >
              MoatGraph
            </span>
          </Link>
          {user ? (
            <button
              onClick={logout}
              style={{
                background: "none",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                padding: "6px 14px",
                fontFamily: "var(--mono)",
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              Log out
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              style={{
                background: "none",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                padding: "6px 14px",
                fontFamily: "var(--mono)",
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              Log in
            </button>
          )}
        </div>

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div style={{ width: "100%", maxWidth: 600 }}>
            <div className="flex items-center gap-3 mb-6">
              <span style={{ color: "var(--indigo)" }}>
                <MoatIcon size={36} />
              </span>
              <h1
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 28,
                  fontWeight: 400,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                Describe your problem.
              </h1>
            </div>
            <p
              style={{
                fontFamily: "var(--serif)",
                fontSize: 15,
                color: "var(--ink-soft)",
                margin: "0 0 28px",
                lineHeight: 1.6,
              }}
            >
              MoatGraph will decompose it into research concepts, find matching
              academic papers, and map the connections — automatically saved to
              a knowledge graph.
            </p>

            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
              <textarea
                rows={4}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => {
                  if (!user) setShowAuthModal(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) handleSearch(input.trim());
                  }
                }}
                placeholder="e.g. Our recommendation system can't explain why content was shown to users, hurting trust…"
                className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Recommendation Trust",
                    "Predictive Maintenance",
                    "Ticket Triage",
                  ].map((label, i) => (
                    <button
                      key={label}
                      onClick={() => {
                        if (!requireAuth()) return;
                        setInput(EXAMPLES[i]);
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (input.trim()) handleSearch(input.trim());
                  }}
                  disabled={!input.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                >
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
          onClose={() => {
            setShowPaywall(false);
            setPendingProblem(null);
          }}
          onActivated={async () => {
            await checkPlan();
            setShowPaywall(false);
            if (pendingProblem) {
              void handleSearch(pendingProblem);
              setPendingProblem(null);
            }
          }}
        />
      )}

      {showAddNodeModal && (
        <AddNodeModal
          onClose={() => setShowAddNodeModal(false)}
          onAdd={(text) => {
            setShowAddNodeModal(false);
            void handleAddDomainCandidate(text);
          }}
        />
      )}

      <DetailPanel
        selectedId={selectedId}
        businesses={businesses}
        subproblems={subproblems}
        concepts={concepts}
        paperGroups={paperGroups}
        recommendations={recommendations}
        onClose={() => setSelectedId(null)}
      />

      <GraphPanel
        businesses={businesses}
        subproblems={subproblems}
        concepts={concepts}
        paperGroups={paperGroups}
        recommendations={recommendations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        activeMsgId={activeMsgId ?? undefined}
        onTransformSp={handleTransformOne}
        onDeleteNode={handleDeleteNode}
        onAddNodeForBusiness={(bizId) => {
          setActiveMsgId(
            businesses.find((b) => b.id === bizId)?.msgId ??
              activeMsgId ??
              null,
          );
          setShowAddNodeModal(true);
        }}
      />

      <RightPanel
        messages={messages}
        sessions={sessions}
        activeSessionId={activeSessionId}
        user={user}
        selectedId={selectedId}
        paperGroups={paperGroups}
        recommendations={recommendations}
        onSelectSession={loadSession}
        onNewSession={reset}
        onDeleteSession={deleteSession}
        onLogout={logout}
        isPro={isPro}
        onCancelPro={handleCancelPro}
        onSelectNode={setSelectedId}
        onSubmit={handleSearch}
        onRequireAuth={requireAuth}
        onTransformOne={handleTransformOne}
        onSearchOne={handleSearchOne}
      />
    </div>
  );
}
