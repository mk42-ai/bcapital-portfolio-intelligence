export type Evidence = { url: string; quote: string; source?: string };
export type Sentiment = { score: number; label: string; evidence: Evidence[]; updated_at: string; basis?: string; delta?: number | null };
export type NewsItem = { id: string; title: string; url: string | null; source: string | null; kind: string; published_at: string | null; summary: string | null; image_url: string | null; sentiment_score?: number | null; ingest_run_id?: string | null; company_slug?: string; fetched_at?: string | null };
export type BrandTokens = { primary: string | null; secondary: string | null; secondary_all?: string[]; background: string | null; text: string | null; fonts: string[]; evidence_tier?: string; guideline_url?: string | null; completeness_pct?: number; accent?: string; tagline?: string; identity?: string; values?: string[] };
export type Company = {
  id: number; name: string; matrix_name: string | null; slug: string; sector: string; region: string; stage: string | null; status: string;
  website: string | null; linkedin_url: string | null; hq: string | null; employees: number | null; logo_url: string | null; brand_tokens: BrandTokens;
  b_capital_fund: string | null; b_capital_role: "lead" | "co-lead" | "participant" | "unknown" | "firm"; b_capital_round: string | null;
  estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; estimate_confidence: "high" | "medium" | "low"; estimate_rationale: string;
  latest_news: NewsItem[]; sentiment: Sentiment; sources: string[]; screenshot_ref: string | null; anon_resolution: string | null; is_focus: boolean; in_brand_matrix: boolean; last_checked: string | null; updated_at: string;
};
export type SentimentHistoryRow = { score: number; label: string; delta: number | null; model: string | null; recorded_at: string; workflow_id: string | null; execution_id: string | null; evidence: Evidence[] };
export type CompanySentiment = { company: string; name: string; current: Sentiment; delta: number | null; history: SentimentHistoryRow[] };
export type Rollup = { scope: string; key: string; company_count: number; avg_score: number; label: string; delta: number | null; top_movers: { slug: string; name: string; score: number; delta: number }[]; computed_at: string };
export type PortfolioSentiment = { portfolio: Rollup | null; sectors: Rollup[]; regions: Rollup[]; top_movers: { slug: string; name: string; sector: string; score: number; label: string; delta: number }[]; focus: { slug: string; name: string; score: number; label: string; delta: number | null; top_evidence: Evidence | null; updated_at: string }[]; computed_at: string | null };
export type IngestRun = { id: string; source: string; workflowId: string | null; workflowName: string | null; executionId: string | null; model: string | null; companiesTouched: number; newsUpserted: number; sentimentRows: number; status: string; receivedAt: string; finishedAt: string | null };
