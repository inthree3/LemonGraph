# Session Graph State Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user returns to a saved session, the full graph (sub-problems, concepts, papers) is restored — not just the business problem node.

**Architecture:** Add a `graph_state` jsonb column to the Butterbase `sessions` table. At save time, serialize `{ subproblems, concepts, paperGroups }` into this column. At load time, `loadSession` reads and restores these arrays back into React state, so the graph panel has the data it needs to render the full tree.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Butterbase REST API (jsonb columns must be sent as `JSON.stringify(value)`)

## Global Constraints

- Butterbase `sessions` REST API base: `https://api.butterbase.ai/v1/app_agz6hkqam42m`
- jsonb columns in POST body **must** be `JSON.stringify(value)` strings — not raw objects
- `Session` type lives in `frontend/app/schema.ts`
- All save/load logic lives in `frontend/app/explore/page.tsx`
- Do NOT store `recommendations` in graph_state — PPR is cheap to re-run and not persisted
- Do NOT add UI changes — this is a pure data plumbing fix

---

## File Map

| File | Change |
|------|--------|
| `frontend/app/schema.ts` | Add `graph_state` field to `Session` type |
| `frontend/app/explore/page.tsx` | Update save (line ~2603) + `loadSession` (line ~2416) |
| Butterbase schema | Add `graph_state jsonb` column via MCP tool |

---

### Task 1: Add `graph_state` column to Butterbase sessions table

**Files:**
- No code files changed — Butterbase schema migration only

**Interfaces:**
- Produces: `sessions.graph_state` jsonb column, nullable, default null

- [ ] **Step 1: Add the column via Butterbase MCP**

Use `mcp__butterbase__manage_schema` (or `manage_migrations`) to run:
```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS graph_state jsonb DEFAULT NULL;
```

- [ ] **Step 2: Verify the column exists**

Use `mcp__butterbase__select_rows` to fetch one row from sessions and confirm `graph_state` appears in the response (value will be null for existing rows — that's expected).

---

### Task 2: Add `graph_state` to the `Session` TypeScript type

**Files:**
- Modify: `frontend/app/schema.ts` — `Session` type (lines 66–75)

**Interfaces:**
- Consumes: `SubProblem`, `Concept`, `Paper` (already defined in same file)
- Produces: `Session.graph_state` typed as `{ subproblems: SubProblem[]; concepts: Concept[]; paperGroups: Record<string, Paper[]> } | null`

- [ ] **Step 1: Update the Session type**

In `frontend/app/schema.ts`, replace:
```typescript
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
```

With:
```typescript
export type GraphState = {
  subproblems: SubProblem[];
  concepts: Concept[];
  paperGroups: Record<string, Paper[]>;
};

export type Session = {
  id: string;
  title: string;
  problem: string;
  academic_query: string | null;
  keywords: unknown;
  research_fields: unknown;
  papers: unknown;
  graph_state: GraphState | null;
  created_at: string;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors related to `Session` or `GraphState`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/schema.ts
git commit -m "feat: add GraphState type and graph_state field to Session"
```

---

### Task 3: Persist graph_state when saving a session

**Files:**
- Modify: `frontend/app/explore/page.tsx` — `handleSearchOne` function, specifically the `authFetch` POST to `/sessions` (around line 2603)

**Interfaces:**
- Consumes: `bizSps: SubProblem[]`, `bizConcepts: Concept[]`, `newGroups: Record<string, Paper[]>` — all available in scope at the save site
- Produces: `sessions.graph_state` populated on newly-saved rows

- [ ] **Step 1: Add graph_state to the session POST body**

In `frontend/app/explore/page.tsx`, find the `authFetch` call that POSTs to `${API_BASE}/sessions` inside `handleSearchOne` (around line 2604). The current body is:

```typescript
body: JSON.stringify({
  user_id: user.id,
  title: biz.problem.slice(0, 60) + (biz.problem.length > 60 ? "…" : ""),
  problem: biz.problem,
  academic_query: bizConcepts[0]?.academic_query ?? null,
  keywords: JSON.stringify(bizConcepts.flatMap((c) => c.keywords)),
  research_fields: JSON.stringify(bizConcepts.flatMap((c) => c.research_fields)),
  papers: JSON.stringify(allPapers),
}),
```

Replace with:

```typescript
body: JSON.stringify({
  user_id: user.id,
  title: biz.problem.slice(0, 60) + (biz.problem.length > 60 ? "…" : ""),
  problem: biz.problem,
  academic_query: bizConcepts[0]?.academic_query ?? null,
  keywords: JSON.stringify(bizConcepts.flatMap((c) => c.keywords)),
  research_fields: JSON.stringify(bizConcepts.flatMap((c) => c.research_fields)),
  papers: JSON.stringify(allPapers),
  graph_state: JSON.stringify({
    subproblems: bizSps,
    concepts: bizConcepts,
    paperGroups: newGroups,
  }),
}),
```

Note: `bizSps` is the `bizSps` const computed just above (line ~2591: `const bizSps = subproblemsRef2.current.filter(...)`). `bizConcepts` and `newGroups` are also in scope.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/explore/page.tsx
git commit -m "feat: persist graph_state (subproblems, concepts, paperGroups) on session save"
```

---

### Task 4: Restore graph_state when loading a session

**Files:**
- Modify: `frontend/app/explore/page.tsx` — `loadSession` function (lines 2416–2443)

**Interfaces:**
- Consumes: `Session.graph_state: GraphState | null` (from Task 2)
- Produces: `subproblems`, `concepts`, `paperGroups` React state populated from saved data; `subproblems` on the assistant message populated to match

- [ ] **Step 1: Import GraphState type**

At the top of `frontend/app/explore/page.tsx`, the import from `'../schema'` currently reads:
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

Add `GraphState` to the import:
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
  GraphState,
} from '../schema';
```

- [ ] **Step 2: Update `loadSession` to restore graph state**

Replace the current `loadSession` function:

```typescript
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
```

With:

```typescript
function loadSession(s: Session) {
    const worldId = s.id;
    const aiId = "a-" + s.id;

    const gs: GraphState = parseField<GraphState>(s.graph_state, {
      subproblems: [],
      concepts: [],
      paperGroups: {},
    });

    // Remap subproblem businessId to this session's worldId so the graph links correctly.
    // Saved businessId may differ if the session was created before this field was stabilised.
    const restoredSps = gs.subproblems.map((sp) => ({ ...sp, businessId: worldId }));

    setActiveSessionId(s.id);
    setBusinesses([
      { id: worldId, problem: s.problem, phase: "done", msgId: aiId },
    ]);
    setSubproblems(restoredSps);
    setConcepts(gs.concepts);
    setPaperGroups(gs.paperGroups);
    setRecommendations([]);
    setSelectedId(null);
    setMessages([
      { id: "u-" + s.id, role: "user", problem: s.problem },
      {
        id: aiId,
        role: "assistant",
        phase: "done",
        subproblems: restoredSps,
        concepts: gs.concepts,
        paperGroups: gs.paperGroups,
        recommendations: [],
      },
    ]);
    setActiveMsgId(aiId);
    sessionSavedRef.current = true;
  }
```

Key changes:
- `parseField<GraphState>(s.graph_state, {...})` safely handles null (old sessions without this column) by falling back to empty arrays — the old flat-view behaviour
- `restoredSps` remaps `businessId` to the current `worldId` so graph edges connect correctly
- `void parseField(s.papers, [])` removed (was a no-op)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

1. Start dev server: `cd frontend && npm run dev`
2. Log in, run a fresh analysis (new session is auto-saved when all papers load)
3. Navigate away (click "New Session" or reload the page)
4. Select the saved session from the dropdown
5. **Expected:** graph shows Business node → Sub-problem nodes → Concept nodes → Paper nodes (same tree as when it was created)
6. **Check old sessions:** selecting a session saved before this change should still work — it will show only the business node (graceful degradation via the fallback in `parseField`)

- [ ] **Step 5: Commit**

```bash
git add frontend/app/explore/page.tsx
git commit -m "fix: restore full graph state (subproblems, concepts, papers) when loading a session"
```
