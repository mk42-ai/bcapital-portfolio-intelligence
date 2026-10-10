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
/** Evidence-weighted Signal Score (backend src/scoring.ts): 0–100 composite, z within portfolio+sector, score = 50 + 15z. */
export type SignalLabel = "strong" | "constructive" | "balanced" | "soft" | "weak";
export type SignalFactorKey = "level" | "momentum" | "volume" | "confidence";
export type SignalSource = { title: string; url: string | null; source: string | null; published_at: string | null; weight: number; sentiment: number; tier: string };
export type SignalScore = {
  slug: string; sector: string; score: number; confidence: number; percentile: number; label: SignalLabel;
  factors: Record<SignalFactorKey, number>;
  /** weight × z per factor; sums to the composite z. */
  contributions: Record<SignalFactorKey, number>;
  momentum: { d7: number; d30: number; delta: number };
  evidence: { items: number; decayed_mass: number; dated_items: number; window_days: number; positive_share: number; wilson_lower: number };
  sparkline: { date: string; score: number }[];
  /** Present on GET /companies/{slug}/signal only. */
  top_sources?: SignalSource[]; z?: Record<SignalFactorKey | "composite", number>; method?: string; computed_at?: string;
};
export type SignalBand = { p25: number; median: number; p75: number };
export type SignalBands = { portfolio: SignalBand; sector: SignalBand };
export type SignalsResponse = {
  data: SignalScore[];
  portfolio: { n: number; mean: number; p25: number; p75: number; computed_at: string | null; method: string };
  sectors: Record<string, { n: number; mean: number; p25: number; p75: number }>;
};
/** PitchBook panel — GET {backend}/pitchbook/{slug}. The only PitchBook plugin on the account is plugin-1777018662 "Pitchbook Investor Finder"
 *  (investor search only); every section but `investors` is expected to carry availability NOT_AVAILABLE_FROM_PLUGIN. Fields are tolerated missing. */
export type PbSourced<T = unknown> = { value: T; source_url: string | null; published_date: string | null; fetched_at: string | null; plugin_id: string | null };
export type PbInvestor = {
  name: string; website?: string | null; location?: string | null; year_founded?: number | null; status?: string | null; type?: string | null;
  aum_musd?: number | null; dry_powder_musd?: number | null; team_size?: number | null; investment_range?: string | null;
  deal_types?: string[]; industries?: string[]; verticals?: string[]; geographies?: string[]; preferences?: string[];
};
export type PbAvailability = "AVAILABLE" | "NOT_AVAILABLE_FROM_PLUGIN" | "PENDING" | (string & {});
export type PbSectionKey = "overview" | "last_round" | "valuation_history" | "investors" | "financials" | "comparables";
export type PitchbookRecord = {
  slug: string; overview?: PbSourced | null; last_round?: PbSourced | null; valuation_history?: PbSourced[];
  investors?: { matched?: PbInvestor[]; brief?: string | null; total_reported?: number | null } | null;
  financials?: PbSourced | null; comparables?: PbSourced[];
  provenance?: { plugin_id?: string | null; session_id?: string | null; fetched_at?: string | null; source?: string | null } | null;
  availability?: Partial<Record<PbSectionKey, PbAvailability>> | null;
};
export type PitchbookResponse = {
  company: string; name?: string; data: PitchbookRecord | null; enriched?: boolean; next_run_utc?: string | null;
  /** Not expected from the Investor Finder plugin (no credentials needed) — rendered honestly if the backend ever sends it. */
  state?: "NEEDS_CREDENTIALS" | string; fields?: string[];
};
export type PitchbookRunResponse = { execution_id?: string; status?: string; fallback?: "local"; job_id?: string; code?: string; message?: string };
