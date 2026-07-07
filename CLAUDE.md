# Hack with Bay 3.0 — CLAUDE.md

## Project Overview

**Goal**: Business problem → Academic research paper recommendations

A pipeline that takes a plain-language business problem, transforms it into a formal academic query, searches for relevant papers, builds a citation graph in Neo4j, and ranks recommendations using a hybrid scoring system.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend (serverless functions) | Butterbase (`app_agz6hkqam42m`) |
| LLM Gateway | tokenrouter (`https://api.tokenrouter.com/v1`) |
| Default model | `openai/gpt-5.4-nano` |
| Paper search | Semantic Scholar API (S2AG) |
| Graph DB | Neo4j Aura (`neo4j+s://3698fd41.databases.neo4j.io`) |
| API docs | Swagger UI at `https://hack-with-bay.butterbase.dev` |

---

## Deployed Endpoints

Base URL: `https://api.butterbase.ai/v1/app_agz6hkqam42m`

### `POST /fn/transform-query`
Converts a plain-language business problem into a formal academic query.

**Request:**
```json
{ "problem": "Our factory equipment breaks down without warning..." }
```
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
Searches Semantic Scholar and returns top-3 papers (by citation count) for a query string.

**Request:**
```json
{ "query": "predictive maintenance sensor time-series anomaly detection" }
```
**Response:**
```json
{
  "papers": [
    { "paperId": "...", "title": "...", "year": 2022, "citationCount": 310, ... }
  ]
}
```

---

### `POST /fn/ingest-graph`
Fetches top-3 papers + 1-hop references from Semantic Scholar, stores them as a CITES graph in Neo4j. Also stores `specter_v2` embeddings per paper when available.

**Request (option A — search automatically):**
```json
{ "query": "predictive maintenance sensor time-series..." }
```
**Request (option B — pre-fetched papers):**
```json
{ "papers": [ { "paperId": "...", "title": "...", "core": true, ... } ] }
```

**Implementation note:** Uses `/paper/batch` (POST) instead of per-paper reference calls.
Total Semantic Scholar API calls = 2 (search + batch), regardless of how many core papers.

**Response:**
```json
{
  "nodes_written": 47,
  "edges_written": 132,
  "api_calls": 2,
  "core_papers": [{ "paperId": "...", "title": "...", "hasEmbedding": true }]
}
```

---

### `POST /fn/recommend`
Runs hybrid scoring over the Neo4j graph and returns ranked recommendations.

**Scoring formula:**
```
final_score = 0.5 * semantic_score
            + 0.3 * ppr_score_normalized
            + 0.2 * citation_recency_score
```

- `semantic_score`: Cosine similarity between paper's `specter_v2` embedding and the centroid of seed paper embeddings
- `ppr_score`: Personalized PageRank (random walk from core/seed papers), computed in-function — no GDS required
- `citation_recency_score`: `0.7 * log_normalized(citationCount) + 0.3 * normalized(year, 2000–present)`

**Request:**
```json
{
  "limit": 10,
  "paperIds": ["abc123"],   // optional: override which papers are seeds
  "w_semantic": 0.5,        // optional: override weights
  "w_ppr": 0.3,
  "w_recency": 0.2
}
```
**Response:**
```json
{
  "seeds": [{ "paperId": "...", "title": "..." }],
  "weights": { "semantic": 0.5, "ppr": 0.3, "recency": 0.2 },
  "recommendations": [
    {
      "paperId": "...", "title": "...", "year": 2021, "citationCount": 890,
      "scores": { "final": 0.742, "semantic": 0.81, "ppr": 0.60, "recency": 0.55 }
    }
  ],
  "total_candidates": 44
}
```

---

### `POST /fn/chat`
Generic OpenAI-compatible proxy to tokenrouter. Defaults to `openai/gpt-5.4-nano`.

---

## Full Pipeline (in order)

```
User input (business problem)
       ↓
POST /fn/transform-query       → academic_query + keywords + fields
       ↓
POST /fn/ingest-graph          → builds Paper nodes + CITES edges in Neo4j
  (with query=academic_query)    stores specter_v2 embeddings
       ↓
POST /fn/recommend             → hybrid-scored top-10 paper recommendations
```

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
| `embedding` | Float[] \| null | specter_v2 768-dim from Semantic Scholar |

**Relationship: `(:Paper)-[:CITES]->(:Paper)`**
- Directed: source paper cites target paper
- 1-hop from core papers (expandable to 2-hop if needed)

---

## Neo4j Connection

- **HTTP API (Query API v2)**: `https://3698fd41.databases.neo4j.io/db/3698fd41/query/v2`
  - Auth: Basic (`3698fd41` / password in env)
  - Note: `/tx/commit` is blocked on Aura; must use `/query/v2`
- **Bolt**: `neo4j+s://3698fd41.databases.neo4j.io` (for Neo4j Browser / local tools)
- **GDS**: Not available via `gds.graph.project` on Aura Free (requires GDS Sessions, paid). PPR is implemented in JS instead.

---

## Key Design Decisions

- **GDS not used**: Personalized PageRank implemented as a JS iterative algorithm inside the Butterbase function. Avoids Aura plan dependency.
- **No separate embedding model**: Semantic Scholar's `specter_v2` embeddings are fetched alongside paper metadata — no external embedding API needed.
- **Weights are overridable per request**: Hybrid score weights (`w_semantic`, `w_ppr`, `w_recency`) can be tuned per business domain.
- **tokenrouter as LLM gateway**: OpenAI-compatible, routes to multiple providers. `gpt-5.4-nano` is the default for speed and cost.
- **Semantic similarity via seed centroid**: Average the specter_v2 vectors of all seed (core) papers → compute cosine similarity of candidates to this centroid.

---

## Known Limitations / TODOs

- Semantic Scholar free tier: ~1 req/s per IP. Add `SEMANTIC_SCHOLAR_API_KEY` env var for 10x higher limits (free key: https://www.semanticscholar.org/product/api#api-key-form)
- `specter_v2` not available for all papers — `semantic_score` falls back to 0 in those cases
- Currently 1-hop expansion only. Extend to 2-hop for denser graphs if time permits.
- No isolation between different business problem runs — each `ingest-graph` merges into the same DB. Reset with: `MATCH (p:Paper) DETACH DELETE p`
