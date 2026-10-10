import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** One row per portfolio company (+ record 136 = the B Capital firm itself). JSON columns are stored as TEXT. */
export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    matrixName: text("matrix_name"),
    slug: text("slug").notNull(),
    sector: text("sector").notNull(),
    sectorRaw: text("sector_raw"),
    region: text("region").notNull(),
    stage: text("stage"),
    status: text("status").notNull(),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    hq: text("hq"),
    employees: integer("employees"),
    logoUrl: text("logo_url"),
    brandTokens: text("brand_tokens", { mode: "json" }).$type<BrandTokens>().notNull(),
    bCapitalFund: text("b_capital_fund"),
    bCapitalRole: text("b_capital_role").notNull(), // lead | co-lead | participant | unknown | firm
    bCapitalRound: text("b_capital_round"),
    estimatedTicketSizeUsd: real("estimated_ticket_size_usd"),
    estimatedOwnershipPct: real("estimated_ownership_pct"),
    estimateConfidence: text("estimate_confidence").notNull(), // high | medium | low
    estimateRationale: text("estimate_rationale").notNull(),
    latestNews: text("latest_news", { mode: "json" }).$type<NewsItem[]>().notNull(),
    sentiment: text("sentiment", { mode: "json" }).$type<Sentiment>().notNull(),
    sources: text("sources", { mode: "json" }).$type<string[]>().notNull(),
    screenshotRef: text("screenshot_ref"),
    anonResolution: text("anon_resolution"),
    isFocus: integer("is_focus", { mode: "boolean" }).notNull().default(false),
    inBrandMatrix: integer("in_brand_matrix", { mode: "boolean" }).notNull().default(true),
    lastChecked: text("last_checked"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("companies_slug_uq").on(t.slug), index("companies_sector_idx").on(t.sector), index("companies_region_idx").on(t.region), index("companies_role_idx").on(t.bCapitalRole)],
);

export const newsItems = sqliteTable(
  "news_items",
  {
    id: text("id").primaryKey(), // stable: sha1(slug+url) or workflow-provided id
    companySlug: text("company_slug").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    source: text("source"),
    kind: text("kind").notNull().default("news"), // news | status_change | social | funding
    publishedAt: text("published_at"),
    summary: text("summary"),
    imageUrl: text("image_url"),
    sentimentScore: real("sentiment_score"),
    ingestRunId: text("ingest_run_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("news_company_idx").on(t.companySlug), index("news_published_idx").on(t.publishedAt)],
);

export const sentimentHistory = sqliteTable(
  "sentiment_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companySlug: text("company_slug").notNull(),
    score: real("score").notNull(),
    label: text("label").notNull(),
    evidence: text("evidence", { mode: "json" }).$type<Evidence[]>().notNull(),
    delta: real("delta"), // vs previous row for the same company
    model: text("model"), // e.g. predefined-claude-fable-5.1
    workflowId: text("workflow_id"),
    executionId: text("execution_id"),
    ingestRunId: text("ingest_run_id"),
    recordedAt: text("recorded_at").notNull(),
  },
  (t) => [index("sent_hist_company_idx").on(t.companySlug, t.recordedAt)],
);

export const sectorRollups = sqliteTable(
  "sector_rollups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scope: text("scope").notNull(), // 'portfolio' | 'sector' | 'region'
    key: text("key").notNull(), // 'ALL' | sector name | region name
    companyCount: integer("company_count").notNull(),
    avgScore: real("avg_score").notNull(),
    label: text("label").notNull(),
    delta: real("delta"),
    topMovers: text("top_movers", { mode: "json" }).$type<Mover[]>().notNull(),
    ingestRunId: text("ingest_run_id"),
    computedAt: text("computed_at").notNull(),
  },
  (t) => [index("rollup_scope_key_idx").on(t.scope, t.key, t.computedAt)],
);

export const ingestRuns = sqliteTable("ingest_runs", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // 'seed' | 'workflow' | 'manual'
  workflowId: text("workflow_id"),
  workflowName: text("workflow_name"),
  executionId: text("execution_id"),
  model: text("model"),
  companiesTouched: integer("companies_touched").notNull().default(0),
  newsUpserted: integer("news_upserted").notNull().default(0),
  sentimentRows: integer("sentiment_rows").notNull().default(0),
  status: text("status").notNull(), // ok | partial | error
  errors: text("errors", { mode: "json" }).$type<string[]>().notNull(),
  rawSample: text("raw_sample"), // first 4 KB of the raw request body (debugging the undocumented webhook payload shape)
  receivedAt: text("received_at").notNull(),
  finishedAt: text("finished_at"),
});

export type BrandTokens = { primary: string | null; secondary: string | null; background: string | null; text: string | null; fonts: string[]; evidence_tier?: string; [k: string]: unknown };
export type NewsItem = { id?: string; title: string; url?: string; source?: string; kind?: string; published_at?: string; summary?: string; image_url?: string; fetched_at?: string };
export type Evidence = { url: string; quote: string; source?: string };
export type Sentiment = { score: number; label: string; evidence: Evidence[]; updated_at: string; basis?: string; delta?: number | null };
export type Mover = { slug: string; name: string; score: number; delta: number };
