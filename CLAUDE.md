# MoatGraph — CLAUDE.md

> Build your product's technical moat with frontier tech — which makes it hard to duplicate by vibe coders

## Project Overview

**Goal**: Business problem → per-sub-problem moat recommendations, backed by papers + patents

A pipeline that decomposes a business problem into distinct sub-problems, maps each to academic concepts, searches for relevant papers AND patents, scores them, and generates a concrete moat recommendation per sub-problem — visualized as an interactive graph. If the input is too broad, an extension step first proposes concrete domain candidates for the user to activate.

**Output per sub-problem:**
> "For [sub-problem], pursue [specific technical direction] — validated by [paper(s)], and [still whitespace / already claimed] per [patent(s)]."

Applies to any product needing a technical moat — software/AI products and physical products alike. Target user: individual builders / indie founders making fast decisions.

---

## Project Structure

```
hack-with-bay-3.0/
├── CLAUDE.md
├── swagger.json                    ← API docs (OpenAPI 3.0)
├── dist/                           ← Swagger UI (deployed to butterbase.dev)
└── frontend/                       ← Next.js 16 app
    └── app/
        ├── layout.tsx              ← Root layout (wraps AuthProvider)
        ├── page.tsx                ← Full app: initial screen + 3-panel active layout
        ├── auth/page.tsx           ← Standalone auth page (fallback)
        ├── contexts/auth.tsx       ← Auth context + authFetch (auto token refresh)
        └── api/
            ├── decompose/route.ts  ← POST /api/decompose → Butterbase decompose-problem
            ├── transform/route.ts  ← POST /api/transform → Butterbase transform-query
            └── search/route.ts     ← POST /api/search    → Butterbase search-papers
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Tailwind CSS v4) |
| Graph UI | `@xyflow/react` v12 + `@dagrejs/dagre` v3 |
| Backend (serverless functions) | Butterbase (`app_agz6hkqam42m`) |
| Auth | Butterbase built-in email/password auth |
| Session storage | Butterbase `sessions` table (REST API + RLS) |
| LLM Gateway | tokenrouter (`https://api.tokenrouter.com/v1`) |
| Default model | `openai/gpt-5.4-nano` |
| Paper search | Semantic Scholar API (S2AG, API key set) |
| Graph DB | Neo4j Aura (`neo4j+s://3698fd41.databases.neo4j.io`) |
| API docs | Swagger UI at `https://hack-with-bay.butterbase.dev` |

---

## Pipeline (5-Level + Extension)

```
[Business Problem]
        ↓  Step 0: Extension check (same LLM call — no extra round-trip)
        │
        ├── broad input → [DomainCandidate×N] (all dormant)
        │        → user clicks one+ to activate → each proceeds to Step 1
        │
        └── concrete input → skip to Step 1 directly
        ↓
[SubProblem 1]  [SubProblem 2]  [SubProblem 3]    ← business language (Step 1)
        ↓               ↓               ↓          (all parallel)
[Concept 1]     [Concept 2]     [Concept 3]        ← academic query + keywords (Step 2)
        ↓               ↓               ↓          (all parallel)
[Paper×3]       [Paper×3]       [Paper×3]          ← Semantic Scholar top-3 (Step 3)
[Patent×N]      [Patent×N]      [Patent×N]         ← PatentsView/USPTO (Step 3, parallel)
        ↓               ↓               ↓
[PPR scores]    [PPR scores]    [PPR scores]        ← per-sub-problem seeded graph (Step 4)
        ↓               ↓               ↓
[Moat rec.]     [Moat rec.]     [Moat rec.]        ← one sentence per SubProblem (Step 5)
```

**Data model — full node + edge set:**
```
(:Business)-[:EXTENDED_TO {state}]->(:DomainCandidate)
(:Business)-[:DECOMPOSED_INTO]->(:SubProblem)           -- if no extension needed
(:DomainCandidate)-[:DECOMPOSED_INTO]->(:SubProblem)    -- if extension was used
(:SubProblem)-[:ADDRESSES {similarity, urgency}]->(:Concept)
(:Concept)-[:STUDIED_IN {relevance, rank_within_concept}]->(:Paper)
(:Concept)-[:CLAIMED_IN {landscape_density}]->(:Patent)
(:Paper)-[:CITES {year_gap, co_citation_strength}]->(:Paper)
(:Patent)-[:CITES]->(:Patent)
(:Patent)-[:ASSIGNED_TO]->(:Assignee)
```

**DomainCandidate `state` values:**

| state | meaning | graph appearance |
|-------|---------|-----------------|
| `dormant` | proposed, not yet explored | outline-only / muted node, no children |
| `active` | user clicked it, pipeline has run | filled color, has subtree |
| `(deleted)` | user explicitly removed | DETACH DELETE — node + subtree gone |

**Frontend execution order:**
1. `POST /api/decompose` → extension check + sub-problems (1 LLM call); returns `domainCandidates` or `subproblems`
2. If candidates: render dormant nodes; wait for user click to activate → then proceed
3. `Promise.all` → `POST /api/transform` for each sub-problem (parallel LLM calls)
4. `Promise.all` → `POST /api/search` + `POST /api/search-patents` for each concept (parallel)
5. PPR scoring per sub-problem → moat recommendation sentence per sub-problem
6. Auto-save to Butterbase `sessions` table

---

## UI Layout

**Initial screen** — ChatGPT-style centered input:
- Pipeline preview: `Business → Sub-problems → Concepts → Papers`
- Textarea: click triggers auth modal if not logged in
- Example buttons: 3 preset problems

**Active screen** — 3-panel layout:
```
[Sessions w-56] │ [Graph Panel flex-1] │ [Chat Panel w-80]
```

**Graph Panel (center):**
- React Flow + dagre 기반 계층형 그래프 (`@xyflow/react` + `@dagrejs/dagre`)
- dagre TB 레이아웃으로 자동 위치 계산, 노드 추가 시 `fitView()` 자동 재조정
- Custom node types:
  - Business (gradient card)
  - DomainCandidate (outline/muted when `dormant`; filled when `active`; clicking dormant triggers Steps 1–5 for that branch)
  - SubProblem (indigo card) — bottom: moat recommendation sentence
  - Concept (pill)
  - Paper (white card)
  - Patent (amber card)
  - Assignee (optional small tag)
- `smoothstep` bezier edges; amber highlight on select; SubProblem→Concept, Concept→Paper/Patent edges: `animated: true`
- Click any node → highlights branch; dormant DomainCandidate → shows "Explore this" button in detail panel
- Each node has a delete affordance → triggers DETACH DELETE for that node + subtree
- Real-time build: nodes appear as each pipeline step completes

**Chat Panel (right):**
- GPT/Claude-style scrollable message history
- User messages: right-aligned indigo bubble
- Assistant messages: step progress badges + sub-problem cards + paper mini-cards + patent mini-cards + moat recommendation callout per sub-problem
- Bottom input for additional searches (each creates a new message thread)
- Chat ↔ Graph selection synchronized (clicking paper/patent in either panel cross-highlights)

**Right detail panel (node selected):**
- DomainCandidate (dormant): candidate name + one-line reason proposed + "Explore this" button
- SubProblem: moat recommendation sentence + supporting paper/patent cards
- Paper/Patent: full metadata + score breakdown (Match, Segment, Credibility, Citations, Landscape Density)

---

## Scoring & Moat Recommendation

**Per-paper/patent card signals:**

| Signal | Meaning | Source |
|--------|---------|--------|
| Match | Semantic closeness to the sub-problem | Embedding cosine similarity |
| Segment | How many sub-problems this result covers | Cross-segment count |
| Credibility | Standing within the seeded cluster (not global fame) | Personalized PageRank, seeded per sub-problem |
| Citations | Raw citation count | As-is |
| Landscape Density *(patents only)* | How crowded this concept's patent space is | Patent count under the concept |

**PPR scoring:**
```
final_score = 0.5 × semantic_score     (specter_v2 cosine sim to seed centroid)
            + 0.3 × ppr_score          (Personalized PageRank, JS implementation, seeded per sub-problem)
            + 0.2 × citation_recency   (log_citations × 0.7 + recency × 0.3)
```
Weights overridable: `{ "w_semantic", "w_ppr", "w_recency" }`

**Moat recommendation (one per SubProblem):**
Generated after Steps 3–4 complete for a sub-problem:
> "[SubProblem]: pursue [direction derived from top paper's concept] — validated by [paper], and [whitespace | already claimed by N patents] in this space."

Generated per sub-problem (not one aggregate verdict per Business node).

---

## Auth Flow

Butterbase built-in email/password — no OAuth setup needed.

**Auth base URL:** `https://api.butterbase.ai/auth/app_agz6hkqam42m`

| Endpoint | Purpose |
|----------|---------|
| `POST /signup` | Create account |
| `POST /login` | Returns `access_token` + `refresh_token` |
| `POST /refresh` | Token rotation |
| `POST /logout` | Revoke refresh tokens |
| `GET /me` | Current user profile |

**Token storage:** `localStorage` (`bb_access`, `bb_refresh`, `bb_user_id`)

**`authFetch` wrapper** (in `contexts/auth.tsx`):
- Attaches `Authorization: Bearer {token}` automatically
- On 401: attempts token refresh silently
- If refresh fails: clears tokens + sets `user = null` + sets `isPro = false` → next interaction triggers auth modal

**`isPro` + `checkPlan`** (in `contexts/auth.tsx`):
- `isPro: boolean` — whether the current user has a Pro plan (read from `user_plans` table)
- `checkPlan()` — fetches `GET /user_plans?user_id=eq.{id}&limit=1`, updates `isPro` state
- Called automatically after login, signup, and session restore; reset to `false` on logout
- `bb_user_id` stored in localStorage so `checkPlan` can run without depending on React state timing

**UX:** Main page always visible. Textarea focus / submit → auth modal if not logged in. Modal closes on login; sidebar appears.

---

## Pro Plan / Paywall

Free users get **1 session**. Attempting a second triggers `ProPaywallModal` in `explore/page.tsx`.

**Gate** (in `handleSearch`, before any API calls):
```typescript
if (sessions.length >= 1 && !isPro) { setShowPaywall(true); setPendingProblem(problem); return; }
```
After activation: `checkPlan()` refreshes `isPro`, modal closes, and the pending analysis resumes automatically.

**`user_plans` table** (Butterbase, RLS: users see only their own row):

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | text PK | Butterbase auth user id |
| `is_pro` | boolean | default `false` |
| `activated_at` | timestamptz | set when `is_pro` flips to `true` |
| `updated_at` | timestamptz | `now()` on upsert |

**`POST /fn/activate-pro`** — sets `is_pro = true` for the authenticated user (auth: required, trust-based, no Stripe webhook). CORS-enabled.

**Stripe link:** `NEXT_PUBLIC_STRIPE_PRO_LINK` env var in `.env.local` and Vercel. Falls back to `#` if missing — **must be set before demo**.

**Plan comparison shown in modal:** Free = 1 session · Pro = $9/mo, unlimited sessions.

---

## Session Management

Sessions stored in Butterbase `sessions` table with RLS (users see only their rows).

**REST API (called from browser, CORS allowed for localhost:3000):**
```
GET    /v1/app_agz6hkqam42m/sessions?order=created_at.desc&limit=50
POST   /v1/app_agz6hkqam42m/sessions
DELETE /v1/app_agz6hkqam42m/sessions/{id}   ← path-based, NOT query param
```

**Important:** Butterbase DELETE uses `/{id}` path, not `?id=eq.{id}`.

**Important:** jsonb columns (`keywords`, `research_fields`, `papers`) must be sent as `JSON.stringify(value)` — not raw arrays — due to Butterbase REST API validation.

**Sessions table schema:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | text NOT NULL | must be sent explicitly in POST body |
| `title` | text NOT NULL | first 60 chars of problem |
| `problem` | text NOT NULL | original business problem |
| `academic_query` | text | first concept's academic_query |
| `keywords` | jsonb | flattened keywords from all concepts |
| `research_fields` | jsonb | flattened research fields |
| `papers` | jsonb | all papers (flattened across sub-problems) |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()` |

---

## Butterbase Deployed Functions

Base URL: `https://api.butterbase.ai/v1/app_agz6hkqam42m`

### `POST /fn/decompose-problem` ← NEW
Decomposes a business problem into 2-4 distinct sub-problems using LLM.

**Request:** `{ "problem": "Our recommendation system can't explain..." }`

**Response:**
```json
{
  "subproblems": [
    { "id": "sp1", "text": "추천 이유 설명 안 됨" },
    { "id": "sp2", "text": "랭킹 편향" },
    { "id": "sp3", "text": "피드백 미반영" }
  ]
}
```

---

### `POST /fn/transform-query`
Transforms a single sub-problem (or business problem) into an academic concept with keywords.

**Request:** `{ "problem": "추천 이유 설명 안 됨" }`

**Response:**
```json
{
  "academic_query": "We present an explainable recommendation framework...",
  "keywords": ["explainable AI", "recommender systems", "user trust"],
  "research_fields": ["Human-Computer Interaction", "Machine Learning"]
}
```

---

### `POST /fn/search-papers`
Searches Semantic Scholar using keywords (preferred over full academic_query). Returns top-3 by citation count.

**Request:** `{ "query": "...", "keywords": ["explainable AI", "..."] }`
- Uses `keywords.join(' ')` as the actual search query (Semantic Scholar performs better with keywords than long sentences)
- Exponential backoff retry: 1s → 2s → 4s (max 3 retries)
- Function timeout: 60s
- API key: `SEMANTIC_SCHOLAR_API_KEY` set in env

**Response:** `{ "papers": [{ "paperId", "title", "abstract", "year", "citationCount", "authors", "url", "doi" }] }`

---

### `POST /fn/ingest-graph`
Fetches top-3 papers + 1-hop references via Semantic Scholar batch API → writes to Neo4j CITES graph.
Stores `specter_v2` embeddings. 2 API calls total (search + batch).

**Request:** `{ "query": "..." }` or `{ "papers": [...] }`

---

### `POST /fn/recommend`
Hybrid-scored paper recommendations from Neo4j CITES graph.

```
final_score = 0.5 × semantic_score     (specter_v2 cosine sim to seed centroid)
            + 0.3 × ppr_score          (Personalized PageRank, JS implementation)
            + 0.2 × citation_recency   (log_citations × 0.7 + recency × 0.3)
```

Weights overridable: `{ "w_semantic", "w_ppr", "w_recency" }`

---

### `POST /fn/activate-pro`
Sets `is_pro = true` for the authenticated user in `user_plans`. Auth: required (JWT validated at edge). Trust-based — no Stripe webhook verification.

**Request:** none (user ID read from JWT)
**Response:** `{ "success": true }`

---

### `POST /fn/chat`
Generic OpenAI-compatible proxy to tokenrouter. Default: `openai/gpt-5.4-nano`.

---

## Neo4j Graph

**HTTP API:** `https://3698fd41.databases.neo4j.io/db/3698fd41/query/v2`
- Auth: Basic (`3698fd41` / password)
- `/tx/commit` is blocked on Aura Free → must use `/query/v2`
- GDS not available on Aura Free → PPR implemented in JS

**Current schema (legacy CITES graph):**
```
(:Paper {paperId, title, abstract, year, citationCount, authors, url, doi, core, searchRank, embedding})
(:Paper)-[:CITES]->(:Paper)
```

**Target schema (full 5-level + patents, future):**
```
(:Business)-[:EXTENDED_TO {state}]->(:DomainCandidate)
(:Business)-[:DECOMPOSED_INTO]->(:SubProblem)
(:DomainCandidate)-[:DECOMPOSED_INTO]->(:SubProblem)
(:SubProblem)-[:ADDRESSES {similarity, urgency}]->(:Concept)
(:Concept)-[:STUDIED_IN {relevance, rank_within_concept}]->(:Paper)
(:Concept)-[:CLAIMED_IN {landscape_density}]->(:Patent)
(:Paper)-[:CITES {year_gap, co_citation_strength}]->(:Paper)
(:Patent)-[:CITES]->(:Patent)
(:Patent)-[:ASSIGNED_TO]->(:Assignee)
```
The ingest-graph function currently writes the legacy CITES schema. The full 5-level Neo4j ingest (including DomainCandidate, Patent, Assignee) is not yet implemented.

---

## Key Design Decisions

- **5-level decomposition + extension**: Business → (optional DomainCandidate) → SubProblem → Concept → Paper/Patent, each level distinct
- **Extension in same LLM call**: no extra API round-trip — the decompose call judges broad vs. concrete and either returns `domainCandidates` or `subproblems`
- **DomainCandidate state machine**: `dormant` → `active` on user click; `(deleted)` is a real DETACH DELETE, not a soft hide; multiple candidates can be active simultaneously
- **Per-sub-problem moat recommendation**: one recommendation sentence per SubProblem (not one aggregate per Business), combining the top paper direction with patent whitespace/claimed status
- **Patents run parallel to papers**: `search-patents` (PatentsView/USPTO) called alongside `search-papers` in the same `Promise.all` — no extra latency
- **Parallel LLM + search**: Steps 2 and 3 use `Promise.all` — all sub-problems processed simultaneously
- **Keywords over academic_query for search**: Semantic Scholar returns 0 results for long formal sentences; keyword join works reliably
- **PPR seeded per sub-problem**: each sub-problem gets its own PPR run over the CITES graph, seeded from that sub-problem's top-k matches — scores reflect local relevance, not global citation fame
- **No redirect auth gate**: Page always visible; modal on interaction
- **authFetch with silent refresh**: 401 → auto refresh → retry; user never sees a "session expired" error unless refresh also fails
- **Pro gate before API calls**: `handleSearch` checks `sessions.length >= 1 && !isPro` before any LLM/S2AG calls — no wasted compute for blocked users
- **Trust-based Pro activation**: `activate-pro` function uses auth token to identify user; no Stripe webhook needed for hackathon scope
- **pendingProblem pattern**: problem text stored in state when gate fires; resumed automatically after activation without re-typing
- **jsonb as stringified JSON**: Butterbase REST API requires `JSON.stringify()` for jsonb columns in POST bodies
- **DELETE by path**: `DELETE /sessions/{id}` not `?id=eq.{id}` (Butterbase convention)
- **GDS not used**: PPR implemented as JS iterative algorithm inside Butterbase function
- **No separate embedding model**: `specter_v2` fetched from Semantic Scholar directly

---

## Known Limitations / TODOs

- **Neo4j full ingest not yet wired**: Frontend builds the 5-level structure in memory but `ingest-graph` still writes the old CITES schema. Need to update `ingest-graph` to write Business/DomainCandidate/SubProblem/Concept/Paper/Patent nodes.
- **Patent search not yet implemented**: `search-patents` (PatentsView/USPTO) Butterbase function not yet deployed; frontend pipeline wired to stub.
- **DomainCandidate UI not yet built**: Extension step response shape defined, but dormant/active node rendering and "Explore this" interaction in React Flow not yet implemented.
- **Moat recommendation sentence not yet generated**: Step 5 LLM call combining top paper + patent whitespace per sub-problem not yet wired.
- **Session load doesn't restore sub-problems**: Loading a past session shows a flat view since sub-problems/candidates aren't stored separately in Butterbase yet.
- `specter_v2` not always available → `semantic_score` falls back to 0
- PPR + recommend flow is a separate API not yet wired into the main frontend pipeline
- Semantic Scholar API key: `s2k-JOvdETvrQLc2y4y4hfhTYrvD0zFbPF4b7dW618le` (set in function env)
- Reset Neo4j: `MATCH (n) DETACH DELETE n`
