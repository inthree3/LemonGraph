# Hack with Bay 3.0 — CLAUDE.md

## Project Overview

**Goal**: Business problem → 4-level decomposition → Academic paper recommendations

A pipeline that decomposes a business problem into sub-problems, maps each to academic concepts, searches for relevant papers, and visualizes the full graph. Users sign in to save and revisit sessions.

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
| Backend (serverless functions) | Butterbase (`app_agz6hkqam42m`) |
| Auth | Butterbase built-in email/password auth |
| Session storage | Butterbase `sessions` table (REST API + RLS) |
| LLM Gateway | tokenrouter (`https://api.tokenrouter.com/v1`) |
| Default model | `openai/gpt-5.4-nano` |
| Paper search | Semantic Scholar API (S2AG, API key set) |
| Graph DB | Neo4j Aura (`neo4j+s://3698fd41.databases.neo4j.io`) |
| API docs | Swagger UI at `https://hack-with-bay.butterbase.dev` |

---

## 4-Level Pipeline

```
[Business Problem]
        ↓  decompose-problem (LLM)
[SubProblem 1]  [SubProblem 2]  [SubProblem 3]    ← business language
        ↓               ↓               ↓          (all parallel)
[Concept 1]     [Concept 2]     [Concept 3]        ← academic query + keywords
        ↓               ↓               ↓          (all parallel)
[Paper×3]       [Paper×3]       [Paper×3]          ← Semantic Scholar top-3
```

**Graph node types:**
```
(:Business)-[:DECOMPOSED_INTO]->(:SubProblem)-[:ADDRESSES]->(:Concept)-[:STUDIED_IN]->(:Paper)
```

**Frontend execution order:**
1. `POST /api/decompose` → sub-problems (1 LLM call)
2. `Promise.all` → `POST /api/transform` for each sub-problem (parallel LLM calls)
3. `Promise.all` → `POST /api/search` for each concept (parallel Semantic Scholar calls)
4. Auto-save to Butterbase `sessions` table

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
- 4-level hierarchical SVG node graph
- Business node (dark) → SubProblem nodes (indigo) → Concept nodes (purple) → Paper nodes (white)
- Dashed lines between levels, solid when highlighted
- Click any node → highlights its branch + shows paper detail panel at bottom
- Real-time build: nodes appear as each pipeline step completes

**Chat Panel (right):**
- GPT/Claude-style scrollable message history
- User messages: right-aligned indigo bubble
- Assistant messages: step progress badges + sub-problem cards + paper mini-cards
- Bottom input for additional searches (each creates a new message thread)
- Chat ↔ Graph selection is synchronized (clicking paper in either panel cross-highlights)

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

**Token storage:** `localStorage` (`bb_access`, `bb_refresh`)

**`authFetch` wrapper** (in `contexts/auth.tsx`):
- Attaches `Authorization: Bearer {token}` automatically
- On 401: attempts token refresh silently
- If refresh fails: clears tokens + sets `user = null` → next interaction triggers auth modal

**UX:** Main page always visible. Textarea focus / submit → auth modal if not logged in. Modal closes on login; sidebar appears.

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

**Target schema (4-level, future):**
```
(:Business)-[:DECOMPOSED_INTO]->(:SubProblem)-[:ADDRESSES]->(:Concept)-[:STUDIED_IN]->(:Paper)
```
The ingest-graph function currently writes the legacy CITES schema. The 4-level Neo4j ingest is not yet implemented in the backend function.

---

## Key Design Decisions

- **4-level decomposition**: Business → SubProblem → Concept → Paper, each level distinct
- **Parallel LLM + search**: Step 2 (transform) and Step 3 (search) use `Promise.all` — all sub-problems processed simultaneously
- **Keywords over academic_query for search**: Semantic Scholar returns 0 results for long formal sentences; keyword join works reliably
- **No redirect auth gate**: Page always visible; modal on interaction
- **authFetch with silent refresh**: 401 → auto refresh → retry; user never sees a "session expired" error unless refresh also fails
- **jsonb as stringified JSON**: Butterbase REST API requires `JSON.stringify()` for jsonb columns in POST bodies
- **DELETE by path**: `DELETE /sessions/{id}` not `?id=eq.{id}` (Butterbase convention)
- **GDS not used**: PPR implemented as JS iterative algorithm inside Butterbase function
- **No separate embedding model**: `specter_v2` fetched from Semantic Scholar directly

---

## Known Limitations / TODOs

- **Neo4j 4-level ingest not yet wired**: Frontend builds the 4-level structure in memory but `ingest-graph` still writes the old CITES schema. Need to update `ingest-graph` to write Business/SubProblem/Concept/Paper nodes.
- **Session load doesn't restore sub-problems**: Loading a past session shows a flat view (not the 4-level graph) since sub-problems aren't stored separately in Butterbase yet.
- `specter_v2` not always available → `semantic_score` falls back to 0
- PPR + recommend flow is a separate API not yet wired into the main frontend pipeline
- Semantic Scholar API key: `s2k-JOvdETvrQLc2y4y4hfhTYrvD0zFbPF4b7dW618le` (set in function env)
- Reset Neo4j: `MATCH (n) DETACH DELETE n`
