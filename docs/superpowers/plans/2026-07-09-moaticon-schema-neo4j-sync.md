# MoatIcon + Schema + Neo4j Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace lemon.png with the MoatIcon SVG, centralise all TypeScript types into `schema.ts`, and ensure Neo4j graph ingest fires exactly once per business (not once per sub-problem).

**Architecture:** Extract the inline `MoatIcon` SVG from `page.tsx` into a shared component. Pull all inline types from `explore/page.tsx` into `app/schema.ts` which also documents the Neo4j ingest payload shape. Guard `autoIngestAndRecommend` with an `ingestDoneRef` so it only fires once — when all sub-problems have papers — matching the pattern already used for the Butterbase session save.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, `@xyflow/react`, Butterbase REST API, Neo4j Aura

## Global Constraints

- App ID: `app_agz6hkqam42m`; API base: `https://api.butterbase.ai/v1/app_agz6hkqam42m`
- Neo4j endpoint: `https://3698fd41.databases.neo4j.io/db/<NEO4J_DATABASE>/query/v2`
- No new dependencies — everything uses what's already installed
- All `@xyflow/react` node types stay as-is; only the type *definitions* move to `schema.ts`
- Do NOT delete or alter the Butterbase `ingest-graph` function — its code is already correct
- `explore/page.tsx` is a single large file; edits must be surgical (no wholesale rewrites)

---

### Task 1: Extract MoatIcon into a shared component

**Files:**
- Create: `frontend/app/components/MoatIcon.tsx`
- Modify: `frontend/app/page.tsx` (remove inline definition, add import)
- Modify: `frontend/app/explore/page.tsx` (add import, replace 3× lemon.png)

**Interfaces:**
- Produces: `export default function MoatIcon({ size, opacity, style }: MoatIconProps)` — same props as the current inline version

- [ ] **Step 1: Create `frontend/app/components/MoatIcon.tsx`**

```tsx
import React from 'react';

type MoatIconProps = {
  size?: number;
  opacity?: number;
  style?: React.CSSProperties;
};

export default function MoatIcon({ size = 24, opacity = 1, style = {} }: MoatIconProps) {
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
```

- [ ] **Step 2: Update `frontend/app/page.tsx` — remove inline definition, add import**

At the top of `page.tsx`, after the existing imports, add:
```tsx
import MoatIcon from './components/MoatIcon';
```

Then delete the inline `function MoatIcon(...)` block (lines 9–31 in the current file).

- [ ] **Step 3: Update `frontend/app/explore/page.tsx` — add import**

At the top of `explore/page.tsx`, after the existing imports (after the `@xyflow/react` import block), add:
```tsx
import MoatIcon from '../components/MoatIcon';
```

- [ ] **Step 4: Replace the 3 lemon.png usages in `explore/page.tsx`**

**Occurrence 1** — spinner inside `AssistantMessage` (currently 12×12 spinning loader during ingest):

Replace:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src="/lemon.png"
  alt=""
  style={{
    width: 12,
    height: 12,
    objectFit: "contain",
    animation: "spin 1.5s linear infinite",
  }}
/>
```
With:
```tsx
<span style={{ display: "inline-flex", animation: "spin 1.5s linear infinite" }}>
  <MoatIcon size={12} />
</span>
```

**Occurrence 2** — nav logo in the initial/empty screen header (currently 22×22):

Replace:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src="/lemon.png"
  alt=""
  style={{ width: 22, height: 22, objectFit: "contain" }}
/>
```
With:
```tsx
<span style={{ color: "var(--indigo)" }}>
  <MoatIcon size={22} />
</span>
```

**Occurrence 3** — hero logo in the centered search form (currently 36×36):

Replace:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src="/lemon.png"
  alt=""
  style={{ width: 36, height: 36, objectFit: "contain" }}
/>
```
With:
```tsx
<span style={{ color: "var(--indigo)" }}>
  <MoatIcon size={36} />
</span>
```

- [ ] **Step 5: Verify — start dev server and check both pages visually**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000` (landing) — confirm MoatIcon appears in nav and eyebrow.  
Open `http://localhost:3000/explore` — confirm MoatIcon appears in nav header and hero form (where lemon.png was). No broken images.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/components/MoatIcon.tsx frontend/app/page.tsx frontend/app/explore/page.tsx
git commit -m "feat: extract MoatIcon component and replace lemon.png in explore page"
```

---

### Task 2: Create `frontend/app/schema.ts` — client types + Neo4j payload types

**Files:**
- Create: `frontend/app/schema.ts`

**Interfaces:**
- Produces: all named exports listed below — consumed by Task 3

- [ ] **Step 1: Create `frontend/app/schema.ts`**

```typescript
// ── Client-side graph types ───────────────────────────────────────────────────

export type Phase =
  | "idle"
  | "decomposing"
  | "done"
  | "ingesting"
  | "recommending"
  | "error";

export type Business = {
  id: string;
  problem: string;
  phase: Phase;
  msgId: string;
};

export type SubProblem = {
  id: string;
  text: string;
  userCreated?: boolean;
  businessId: string;
};

export type Concept = {
  subproblemId: string;
  academic_query: string;
  keywords: string[];
  research_fields: string[];
};

export type Paper = {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  citationCount: number | null;
  authors: string[];
  url: string | null;
  doi: string | null;
  rank?: number;
};

export type Recommendation = {
  paperId: string;
  title: string;
  year: number | null;
  citationCount: number | null;
  authors: string;
  url: string | null;
  scores: { final: number; semantic: number; ppr: number; recency: number };
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  problem?: string;
  phase?: Phase;
  subproblems?: SubProblem[];
  concepts?: Concept[];
  paperGroups?: Record<string, Paper[]>;
  recommendations?: Recommendation[];
  error?: string;
};

export type Session = {
  id: string;
  title: string;
  problem: string;
  academic_query: string | null;
  keywords: unknown;
  research_fields: unknown;
  papers: unknown;
  created_at: string;
};

// ── Neo4j node shapes (written by ingest-graph Butterbase function) ───────────
//
// Node: (:Business {id, text, updatedAt})
// Node: (:SubProblem {id, text, business_id})
// Node: (:Concept {subproblem_id, academic_query, keywords, research_fields})
// Node: (:Paper {paperId, title, abstract, year, citationCount, authors, url, doi, core})
//
// Edge: (:Business)-[:DECOMPOSED_INTO]->(:SubProblem)
// Edge: (:SubProblem)-[:ADDRESSES]->(:Concept)
// Edge: (:Concept)-[:STUDIED_IN]->(:Paper)
// Edge: (:Paper)-[:CITES]->(:Paper)   ← 1-hop references from Semantic Scholar

export type NeoBusinessNode = {
  id: string;
  text: string;
  updatedAt: string; // datetime() in Neo4j
};

export type NeoSubProblemNode = {
  id: string;
  text: string;
  business_id: string;
};

export type NeoConceptNode = {
  subproblem_id: string;
  academic_query: string;
  keywords: string[];
  research_fields: string[];
};

export type NeoPaperNode = {
  paperId: string;
  title: string;
  abstract: string;
  year: number | null;
  citationCount: number;
  authors: string; // joined string, e.g. "Smith J, Lee K"
  url: string;
  doi: string | null;
  core: boolean; // true = directly searched, false = 1-hop reference
};

// ── Payload sent from frontend → POST /fn/ingest-graph ───────────────────────
//
// The Butterbase function accepts this exact shape and writes all 4 node types
// plus CITES edges fetched from Semantic Scholar batch API.

export type IngestGraphPayload = {
  business_id: string;
  business_text: string;
  subproblems: Array<{ id: string; text: string }>;
  concepts: Array<{
    subproblemId: string;
    academic_query: string;
    keywords: string[];
    research_fields: string[];
  }>;
  papers_by_subproblem: Record<string, Paper[]>;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors from `schema.ts` (the file has no imports so it should always pass on its own).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/schema.ts
git commit -m "feat: add schema.ts with shared client types and Neo4j payload shapes"
```

---

### Task 3: Import from schema.ts in explore/page.tsx + fix ingest guard

**Files:**
- Modify: `frontend/app/explore/page.tsx` (replace inline types with imports; add `ingestDoneRef`; move `autoIngestAndRecommend` call inside `allDone` guard)

**Interfaces:**
- Consumes: all named type exports from `frontend/app/schema.ts` (Task 2)

**Context — the bug being fixed:**

`autoIngestAndRecommend` is currently called unconditionally at the bottom of `handleSearchOne`:
```typescript
autoIngestAndRecommend(msgId, biz, allConcepts, newGroups);
```
With N sub-problems running in parallel, this means N concurrent Neo4j ingests per business — wasted round-trips and race conditions on `setBusinesses`. The fix: add an `ingestDoneRef` boolean (mirroring `sessionSavedRef`) and only call the function once, inside the `allDone` guard.

- [ ] **Step 1: Replace inline type block with imports in `explore/page.tsx`**

Remove the entire `// ── Types ──` block (lines 19–83, everything from `type SubProblem` through the closing `}` of `type Session`).

Add these imports at the top of `explore/page.tsx`, after the `@xyflow/react` import:
```typescript
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
```

- [ ] **Step 2: Add `ingestDoneRef` alongside `sessionSavedRef`**

Find the line:
```typescript
const sessionSavedRef = useRef(false);
```
(currently around line 2407 in the unmodified file)

Add the new ref immediately after it:
```typescript
const sessionSavedRef = useRef(false);
const ingestDoneRef = useRef(false);
```

- [ ] **Step 3: Reset `ingestDoneRef` in `handleSearch` alongside `sessionSavedRef`**

Find the line:
```typescript
sessionSavedRef.current = false;
```
(inside `handleSearch`, currently around line 2510)

Add the reset immediately after it:
```typescript
sessionSavedRef.current = false;
ingestDoneRef.current = false;
```

- [ ] **Step 4: Guard `autoIngestAndRecommend` — fire once when all sub-problems are done**

The Butterbase session save block (inside `if (user && accessToken && !sessionSavedRef.current && biz)`) stays **completely untouched**.

Find the unconditional call at the very end of `handleSearchOne`:
```typescript
    autoIngestAndRecommend(msgId, biz, allConcepts, newGroups);
  }
```

Replace it with a guarded version that computes its own `allDone` check:
```typescript
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
```

This fires Neo4j ingest exactly once — when every sub-problem's papers have arrived — regardless of auth state. The `ingestDoneRef` prevents concurrent calls when multiple sub-problems finish near-simultaneously.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero new errors. If you see "Cannot find name 'Phase'" etc., confirm the import at Step 1 is present and the type names match those exported from `schema.ts`.

- [ ] **Step 6: Verify behaviour in browser**

Start dev server:
```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/explore`, submit a business problem. Watch the browser's Network tab:
- `/fn/ingest-graph` should be called exactly **once** per analysis run, not 2–3 times.
- After the ingest call completes, `/fn/recommend` fires once and recommendations appear.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/explore/page.tsx
git commit -m "refactor: import types from schema.ts and fix ingest-graph to fire once per business"
```
