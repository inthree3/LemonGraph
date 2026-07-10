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
