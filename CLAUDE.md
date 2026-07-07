# Hack with Bay 3.0 — CLAUDE.md

## Project Overview

**Goal**: Business problem → Academic research paper recommendations

A pipeline that takes a plain-language business problem, transforms it into a formal academic query, searches for relevant papers, builds a citation graph in Neo4j, and ranks recommendations using a hybrid scoring system. Users can sign in to save and revisit past research sessions.

---

## Project Structure

```
hack-with-bay-3.0/
├── CLAUDE.md
├── swagger.json                  ← API docs (OpenAPI 3.0)
├── dist/                         ← Swagger UI static build (deployed)
└── frontend/                     ← Next.js 16 app
    └── app/
        ├── layout.tsx            ← Root layout (wraps AuthProvider)
        ├── page.tsx              ← Main page: sidebar + search UI + auth modal
        ├── auth/page.tsx         ← Standalone auth page (fallback, not used in main flow)
        ├── contexts/auth.tsx     ← Auth context (login/signup/logout/token management)
        └── api/
            ├── transform/route.ts ← POST /api/transform → Butterbase transform-query
            └── search/route.ts    ← POST /api/search    → Butterbase search-papers
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Tailwind CSS v4) |
| Backend (serverless functions) | Butterbase (`app_agz6hkqam42m`) |
| Auth | Butterbase built-in email/password auth |
| Session storage | Butterbase `sessions` table (auto-generated REST API + RLS) |
| LLM Gateway | tokenrouter (`https://api.tokenrouter.com/v1`) |
| Default model | `openai/gpt-5.4-nano` |
| Paper search | Semantic Scholar API (S2AG) |
| Graph DB | Neo4j Aura (`neo4j+s://3698fd41.databases.neo4j.io`) |
| API docs | Swagger UI at `https://hack-with-bay.butterbase.dev` |

---

## Auth Flow

Butterbase built-in email/password auth — no OAuth setup required.

**Auth base URL:** `https://api.butterbase.ai/auth/app_agz6hkqam42m`

| Endpoint | Purpose |
|----------|---------|
| `POST /signup` | Create account (email, password, optional display_name) |
| `POST /login` | Returns `access_token` + `refresh_token` |
| `POST /refresh` | Rotate tokens (old refresh token invalidated) |
| `POST /logout` | Revoke all refresh tokens |
| `GET /me` | Return current user profile |

**Token storage:** `localStorage` (`bb_access`, `bb_refresh`)

**UX pattern:**
- Main page loads immediately (no redirect gate)
- Non-logged-in users see the full UI but cannot interact
- Clicking textarea or example buttons → modal overlay (black 40% backdrop + login/signup form)
- After login → modal closes, sidebar appears with session history
- Token restore on page load: tries stored access token → falls back to refresh → clears if both fail

---

## Session Management

Sessions are stored in Butterbase's `sessions` table, protected by RLS (users see only their own rows).

**Butterbase REST API** (called directly from browser, CORS enabled for `localhost:3000`):

```
GET    /v1/app_agz6hkqam42m/sessions?order=created_at.desc&limit=50
POST   /v1/app_agz6hkqam42m/sessions      (Prefer: return=representation)
DELETE /v1/app_agz6hkqam42m/sessions?id=eq.{uuid}
```

All requests require `Authorization: Bearer {access_token}`.

**Sessions table schema:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | auto `gen_random_uuid()` |
| `user_id` | text NOT NULL | auto-populated by RLS trigger |
| `title` | text NOT NULL | first 60 chars of problem |
| `problem` | text NOT NULL | original business problem |
| `academic_query` | text | LLM-transformed query |
| `keywords` | jsonb | `[]` default |
| `research_fields` | jsonb | `[]` default |
| `papers` | jsonb | top-3 paper objects |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()` |

**Auto-save:** After a successful search, the session is saved automatically. The sidebar refreshes and highlights the new session.

---

## Butterbase Deployed Functions

Base URL: `https://api.butterbase.ai/v1/app_agz6hkqam42m`

### `POST /fn/transform-query`
Converts a plain-language business problem into a formal academic query via LLM.

**Request:** `{ "problem": "Our factory equipment breaks down..." }`

**Response:**
```json
{
  "academic_query": "We propose...",
  "keywords": ["predictive maintenance", "..."],
  "research_fields": ["Machine Learning", "..."]
}
```

---

### `POST /fn/search-papers`
Searches Semantic Scholar, returns top-3 papers by citation count. Includes exponential backoff retry on 429 (2s → 4s → 8s, max 3 retries).

**Request:** `{ "query": "predictive maintenance sensor time-series..." }`

**Response:** `{ "papers": [{ "paperId", "title", "year", "citationCount", "authors", "url", "doi" }] }`

---

### `POST /fn/ingest-graph`
Fetches top-3 papers + 1-hop references via Semantic Scholar batch API, writes to Neo4j as CITES graph. Includes retry logic. Stores `specter_v2` embeddings when available.

**2 API calls total** (search + `/paper/batch`), regardless of number of core papers.

**Request:** `{ "query": "..." }` or `{ "papers": [...] }`

**Response:** `{ "nodes_written": 47, "edges_written": 132, "api_calls": 2, "core_papers": [...] }`

---

### `POST /fn/recommend`
Hybrid-scored paper recommendations from the Neo4j CITES graph.

**Scoring formula:**
```
final_score = 0.5 × semantic_score        (specter_v2 cosine sim to seed centroid)
            + 0.3 × ppr_score_normalized   (Personalized PageRank, JS implementation)
            + 0.2 × citation_recency_score (0.7×log_citations + 0.3×recency)
```

Weights are overridable per request: `{ "w_semantic": 0.5, "w_ppr": 0.3, "w_recency": 0.2 }`

Each recommendation includes a `scores` breakdown: `{ final, semantic, ppr, recency }`.

---

### `POST /fn/chat`
Generic OpenAI-compatible proxy to tokenrouter. Default model: `openai/gpt-5.4-nano`.

---

## Full Backend Pipeline

```
User input (business problem)
       ↓
POST /fn/transform-query       → academic_query + keywords + research_fields
       ↓
POST /fn/ingest-graph          → Paper nodes + CITES edges in Neo4j
  (with query=academic_query)    specter_v2 embeddings stored per paper
       ↓
POST /fn/recommend             → hybrid-scored top-10 recommendations
```

The frontend currently uses only `transform-query` + `search-papers` (direct search without graph). `ingest-graph` + `recommend` are available for the graph-based recommendation flow.

---

## Neo4j Graph Schema

**Node: `(:Paper)`**
| Property | Type | Notes |
|----------|------|-------|
| `paperId` | String | Semantic Scholar ID (unique key) |
| `title` | String | |
| `abstract` | String | Core papers only |
| `year` | Integer | |
| `citationCount` | Integer | |
| `authors` | String | Comma-separated |
| `url` | String | |
| `doi` | String \| null | |
| `core` | Boolean | `true` = returned from initial search |
| `searchRank` | Integer \| null | 1–3 for core papers |
| `embedding` | Float[] \| null | specter_v2 768-dim |

**Relationship:** `(:Paper)-[:CITES]->(:Paper)` — directed, 1-hop from core papers

**HTTP API:** `https://3698fd41.databases.neo4j.io/db/3698fd41/query/v2`
- Auth: Basic (`3698fd41` / password in env)
- Note: `/tx/commit` is blocked on Aura Free — must use `/query/v2`
- GDS not available on Aura Free — PPR implemented in JS inside the function

---

## Key Design Decisions

- **No redirect auth gate**: Main page is always visible; modal appears on interaction. Better for demos.
- **Butterbase email/password auth**: No Google OAuth credentials needed. Built-in, zero config.
- **Sessions via auto-generated REST API**: No custom function needed for CRUD — Butterbase REST + RLS handles it.
- **GDS not used**: PPR implemented as JS iterative algorithm. No Aura plan dependency.
- **Semantic Scholar batch API**: `/paper/batch` instead of per-paper calls → 2 total API calls, no sequential delays.
- **Retry with exponential backoff**: 429 responses retry at 2s / 4s / 8s before failing.
- **No separate embedding model**: `specter_v2` embeddings fetched from Semantic Scholar directly.
- **Weights overridable**: Hybrid score weights tunable per business domain at request time.

---

## Known Limitations / TODOs

- Semantic Scholar free tier: ~1 req/s per IP → add `SEMANTIC_SCHOLAR_API_KEY` env var for 10× higher limits (free: https://www.semanticscholar.org/product/api#api-key-form)
- `specter_v2` not available for all papers — `semantic_score` falls back to 0
- 1-hop expansion only — extend to 2-hop for denser graphs if time allows
- Each `ingest-graph` call merges into the same Neo4j DB (no per-session isolation). Reset: `MATCH (p:Paper) DETACH DELETE p`
- `sessions.updated_at` is not auto-updated on PATCH — would need a trigger or manual SET
