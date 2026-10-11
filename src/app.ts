import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import crypto from "node:crypto";
import { sql, eq, and, like, desc, asc } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "./db/client.js";
import { config } from "./config.js";
import { buildOpenApi } from "./openapi.js";
import { labelFor, clampScore, normaliseEvidence, rollup } from "./sentiment.js";
import { scorePortfolio, type CompanyInput, type SignalScore } from "./scoring.js";
import { enrichShard, getProfile, profileCoverage, enrichCompany, ENRICH_PLUGINS } from "./enrich.js";
import { refreshCompanies, lastRefreshRun, getRefreshState } from "./refresh.js";
import { fetchPitchbook, pitchbookShard, getPitchbookRecord, listPitchbookRecords, writePitchbookRecord, normaliseIncomingRecord, salvageRecords, applyEnrichment, nextMondayUtc, PITCHBOOK_PLUGIN_ID, PITCHBOOK_SOURCE } from "./pitchbook.js";
import { ONDEMAND_USER_AGENT } from "./config.js";

type Vars = { requestId: string };
const inner = new Hono<{ Variables: Vars }>();
/** Public app: strips an optional /apps/<endpoint-name> reverse-proxy prefix (OnDemand serverless gateway) or the
 *  configured BASE_PATH, then delegates to the route table — so every route works with and without the prefix. */
export const app = new Hono<{ Variables: Vars }>();
app.all("*", async (c) => {
  const u = new URL(c.req.raw.url);
  let p = u.pathname;
  if (config.basePath && p.startsWith(config.basePath)) p = p.slice(config.basePath.length) || "/";
  const m = p.match(/^\/apps\/[^/]+(\/.*)?$/);
  if (m) p = m[1] || "/";
  if (p === u.pathname) return inner.fetch(c.req.raw);
  const rewritten = new Request(new URL(p + u.search, u.origin).toString(), c.req.raw);
  return inner.fetch(rewritten);
});

inner.use("*", cors());
if (process.env.NODE_ENV !== "test") inner.use("*", logger());
inner.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("X-Request-Id", c.get("requestId"));
  c.header("X-Timestamp-Utc", nowIso());
  await next();
});

const err = (c: any, status: number, errorCode: string, message: string) => c.json({ message, errorCode }, status as any);

/** ONE news-count definition (source of truth for /health, /companies, /companies/{slug}, /news/count, /news/summary and the frontend):
 *  news_total = count of news_items rows that belong to a listed company (orphans excluded), de-duplicated by (company_slug, url)
 *  (url compared lower-cased/trimmed; rows without a url fall back to the title). Never latest_news.length, never a client-side re-sum. */
export const NEWS_TOTAL_DEFINITION = "count(*) of news_items rows belonging to a listed company (orphans excluded), de-duplicated by (company_slug, url)";
const NEWS_KEY = sql.raw("lower(trim(coalesce(nullif(n.url, ''), n.title)))");
function newsCounts(db: any): Map<string, number> {
  const rows = db.all(sql`select n.company_slug as slug, count(distinct ${NEWS_KEY}) as n from news_items n join companies c on c.slug = n.company_slug group by n.company_slug`) as { slug: string; n: number }[];
  return new Map(rows.map((r) => [r.slug, Number(r.n)]));
}
function newsTotal(db: any, counts?: Map<string, number>): number {
  return [...(counts ?? newsCounts(db)).values()].reduce((a, b) => a + b, 0);
}
/** Full breakdown behind newsTotal(): raw rows, duplicates removed by the (company_slug,url) rule, orphan rows. */
function newsSummary(db: any) {
  const counts = newsCounts(db);
  const total = newsTotal(db, counts);
  const raw_rows = Number((db.get(sql`select count(*) as n from news_items`) as { n: number }).n);
  const orphan_items = Number((db.get(sql`select count(*) as n from news_items where company_slug not in (select slug from companies)`) as { n: number }).n);
  const slugs = db.select({ slug: schema.companies.slug }).from(schema.companies).orderBy(asc(schema.companies.slug)).all() as { slug: string }[];
  const by_company: Record<string, number> = {};
  for (const s of slugs) by_company[s.slug] = counts.get(s.slug) ?? 0;
  return { total, by_company, companies: slugs.length, raw_rows, dedup_removed: raw_rows - orphan_items - total, orphan_items, definition: NEWS_TOTAL_DEFINITION };
}
/** Per-company sentiment run dates from sentiment_history: latest row → scored_at, the row before it → prior_run_at. */
export type RunDates = { scored_at: string | null; prior_run_at: string | null; prior_score: number | null; model: string | null; ingest_run_id: string | null };
export function sentimentRunDates(db: any): Map<string, RunDates> {
  const rows = db.all(sql`select company_slug as slug,
      max(case when rn = 1 then recorded_at end) as scored_at, max(case when rn = 2 then recorded_at end) as prior_run_at,
      max(case when rn = 2 then score end) as prior_score, max(case when rn = 1 then model end) as model, max(case when rn = 1 then ingest_run_id end) as ingest_run_id
    from (select company_slug, recorded_at, score, model, ingest_run_id, row_number() over (partition by company_slug order by recorded_at desc, id desc) as rn from sentiment_history)
    where rn <= 2 group by company_slug`) as any[];
  return new Map(rows.map((r) => [r.slug, { scored_at: r.scored_at ?? null, prior_run_at: r.prior_run_at ?? null, prior_score: r.prior_score ?? null, model: r.model ?? null, ingest_run_id: r.ingest_run_id ?? null }]));
}
/** News reconciliation (computed, never estimated): raw rows incl. orphans, de-dup by url / by title, 30d/7d windows, no-url, per company + totals. */
export const FOCUS_RECON_SLUGS = ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer", "perplexity-ai"];
export function newsReconciliation(db: any, asOf = nowIso().slice(0, 10)) {
  const d30 = new Date(Date.parse(asOf + "T00:00:00Z") - 30 * 864e5).toISOString().slice(0, 10);
  const d7 = new Date(Date.parse(asOf + "T00:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
  const per = db.all(sql`select n.company_slug as slug, count(*) as raw,
      count(distinct case when nullif(trim(n.url), '') is not null then lower(trim(n.url)) end) + sum(case when nullif(trim(n.url), '') is null then 1 else 0 end) as dedup_url,
      count(distinct lower(trim(n.title))) as dedup_title,
      count(distinct ${NEWS_KEY}) as summary_def,
      sum(case when substr(n.published_at, 1, 10) >= ${d30} then 1 else 0 end) as in_window_30d,
      sum(case when substr(n.published_at, 1, 10) >= ${d7} then 1 else 0 end) as in_window_7d,
      sum(case when nullif(trim(n.url), '') is null then 1 else 0 end) as no_url,
      sum(case when n.published_at is null or n.published_at = '' then 1 else 0 end) as no_date,
      sum(case when n.sentiment_score is not null then 1 else 0 end) as scored,
      max(case when c.slug is null then 1 else 0 end) as orphan
    from news_items n left join companies c on c.slug = n.company_slug group by n.company_slug order by n.company_slug`) as any[];
  const num = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "slug" ? v : Number(v ?? 0)]));
  const rows = per.map(num) as any[];
  const sum = (k: string, list = rows) => list.reduce((a, r) => a + (r[k] ?? 0), 0);
  const listed = rows.filter((r) => !r.orphan);
  const keys = ["raw", "dedup_url", "dedup_title", "summary_def", "in_window_30d", "in_window_7d", "no_url", "no_date", "scored"];
  const totals = (list: any[]) => Object.fromEntries(keys.map((k) => [k, sum(k, list)]));
  const companies = Number((db.get(sql`select count(*) as n from companies`) as { n: number }).n);
  const embedded = db.all(sql`select slug, json_array_length(latest_news) as n from companies`) as { slug: string; n: number }[];
  const embeddedTotal = embedded.reduce((a, r) => a + Number(r.n), 0);
  const embeddedCap = Math.max(0, ...embedded.map((r) => Number(r.n)));
  const focus = FOCUS_RECON_SLUGS.map((slug) => rows.find((r) => r.slug === slug) ?? { slug, raw: 0, dedup_url: 0, dedup_title: 0, summary_def: 0, in_window_30d: 0, in_window_7d: 0, no_url: 0, no_date: 0, scored: 0, orphan: 0 });
  const owner5 = ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer"];
  const owner5Sum = owner5.reduce((a, s) => a + (rows.find((r) => r.slug === s)?.summary_def ?? 0), 0);
  return {
    as_of: asOf, windows: { d30_from: d30, d7_from: d7 }, companies, companies_with_news: listed.length,
    totals: { all_rows: totals(rows), listed_companies: totals(listed), orphan_rows: sum("raw", rows.filter((r) => r.orphan)), orphan_slugs: rows.filter((r) => r.orphan).map((r) => r.slug) },
    news_summary_total: newsTotal(db), news_summary_definition: NEWS_TOTAL_DEFINITION,
    legacy_latest_news: { embedded_total: embeddedTotal, per_company_cap_observed: embeddedCap, cap_in_code: 25, note: "Σ len(latest_news) as /companies returns it (embedded, capped per company by /ingest merge .slice(0,25))" },
    owner_figures: {
      raw_2104: { seen: 2104, now_raw_rows: sum("raw", rows), note: "Σ /companies/{slug}/news?limit=1000 before de-dup = raw news_items rows of listed companies; 2104 was the pre-dedupe count, scripts/dedupe-news.ts removed the exact duplicates (see proof/data-lane/news-dedupe.json)" },
      embedded_182: { seen: 182, now_embedded_total: embeddedTotal, cap: embeddedCap, note: embeddedTotal === 182 ? "reproduces" : "does NOT reproduce from latest_news (cap 25/company → Σ " + embeddedTotal + "); 182 matches the chat-plugin directory page count, not a news count" },
      focus_150: { seen: 150, seen_parts: { aimotive: 19, apptronik: 33, "fervo-energy": 37, flutterwave: 38, writer: 23 }, now_parts: Object.fromEntries(owner5.map((s) => [s, rows.find((r) => r.slug === s)?.summary_def ?? 0])), now_sum: owner5Sum, matches: owner5Sum === 150 },
    },
    focus, by_company: rows,
  };
}
function toApi(r: typeof schema.companies.$inferSelect, counts?: Map<string, number>, runs?: Map<string, RunDates>) {
  const rd = runs?.get(r.slug);
  return {
    news_count: counts ? counts.get(r.slug) ?? 0 : undefined,
    id: r.id, name: r.name, matrix_name: r.matrixName, slug: r.slug, sector: r.sector, region: r.region, stage: r.stage, status: r.status, website: r.website,
    linkedin_url: r.linkedinUrl, hq: r.hq, employees: r.employees, logo_url: r.logoUrl, brand_tokens: r.brandTokens, b_capital_fund: r.bCapitalFund,
    b_capital_role: r.bCapitalRole, b_capital_round: r.bCapitalRound, estimated_ticket_size_usd: r.estimatedTicketSizeUsd, estimated_ownership_pct: r.estimatedOwnershipPct,
    estimate_confidence: r.estimateConfidence, estimate_rationale: r.estimateRationale, latest_news: r.latestNews, sentiment: rd ? { ...r.sentiment, scored_at: rd.scored_at, prior_run_at: rd.prior_run_at, prior_score: rd.prior_score, model: rd.model, ingest_run_id: rd.ingest_run_id } : r.sentiment, sources: r.sources,
    screenshot_ref: r.screenshotRef, anon_resolution: r.anonResolution, is_focus: r.isFocus, in_brand_matrix: r.inBrandMatrix, last_checked: r.lastChecked, updated_at: r.updatedAt,
  };
}

function serverUrl(c: any): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/$/, "");
  const u = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? u.host;
  return `${proto}://${host}${config.basePath}`;
}

// ---------- meta ----------
inner.get("/", (c) => c.json({ name: "B Capital Portfolio Intelligence API", docs: `${serverUrl(c)}/openapi.json`, health: `${serverUrl(c)}/health` }));
inner.get("/health", async (c) => {
  const { db } = await getDb();
  const total = db.get<{ n: number }>(sql`select count(*) as n from companies`)!.n;
  const spec = db.get<{ n: number }>(sql`select count(*) as n from companies where in_brand_matrix = 1 or slug = 'b-capital'`)!.n;
  const lastRun = db.select().from(schema.ingestRuns).orderBy(desc(schema.ingestRuns.receivedAt)).limit(1).get();
  return c.json({ status: "ok", db_record_count: spec, db_record_count_total: total, news_total: newsTotal(db), news_total_definition: NEWS_TOTAL_DEFINITION, last_ingest: lastRun ? { id: lastRun.id, source: lastRun.source, received_at: lastRun.receivedAt, status: lastRun.status } : null, model: config.ondemandDefaultModel, earliest_test_utc: config.earliestTestUtc || null, version: config.version, timestamp: nowIso() });
});
inner.get("/openapi.json", (c) => c.json(buildOpenApi(serverUrl(c))));

// ---------- companies ----------
inner.get("/companies", async (c) => {
  const { db } = await getDb();
  const { sector, region, status, role, focus, sort = "name" } = c.req.query();
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50") || 50));
  if (role && !["lead", "co-lead", "participant", "unknown", "firm"].includes(role)) return err(c, 400, "invalid_request", "role must be lead|co-lead|participant|unknown|firm");
  const conds = [] as any[];
  if (sector) conds.push(sql`lower(${schema.companies.sector}) = lower(${sector})`);
  if (region) conds.push(sql`lower(${schema.companies.region}) = lower(${region})`);
  if (status) conds.push(like(sql`lower(${schema.companies.status})`, `%${status.toLowerCase()}%`));
  if (role) conds.push(eq(schema.companies.bCapitalRole, role));
  if (focus === "true") conds.push(eq(schema.companies.isFocus, true));
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.companies).where(where).get()!.n;
  const order = sort === "sentiment" ? desc(sql`json_extract(${schema.companies.sentiment}, '$.score')`) : sort === "updated_at" ? desc(schema.companies.updatedAt) : sort === "ticket" ? desc(schema.companies.estimatedTicketSizeUsd) : asc(schema.companies.name);
  const rows = db.select().from(schema.companies).where(where).orderBy(order).limit(limit).offset((page - 1) * limit).all();
  const counts = newsCounts(db); const runs = sentimentRunDates(db);
  return c.json({ data: rows.map((r) => toApi(r, counts, runs)), news_total: newsTotal(db, counts), news_total_definition: NEWS_TOTAL_DEFINITION, pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }, filters: { sector: sector ?? null, region: region ?? null, status: status ?? null, role: role ?? null, focus: focus === "true" }, timestamp: nowIso() });
});

async function findCompany(slugOrName: string) {
  const { db } = await getDb();
  const s = slugOrName.trim().toLowerCase();
  return (
    db.select().from(schema.companies).where(eq(schema.companies.slug, s)).get() ??
    db.select().from(schema.companies).where(sql`lower(${schema.companies.name}) = ${s}`).get() ??
    db.select().from(schema.companies).where(sql`lower(${schema.companies.matrixName}) = ${s}`).get() ??
    db.select().from(schema.companies).where(sql`replace(replace(lower(${schema.companies.name}),' ','-'),'.','') = ${s.replace(/\s+/g, "-")}`).get()
  );
}

inner.get("/companies/:slug", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const { db } = await getDb();
  return c.json({ data: toApi(row, newsCounts(db), sentimentRunDates(db)), timestamp: nowIso() });
});

inner.get("/companies/:slug/news", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const { db } = await getDb();
  const limit = Math.min(1000, Math.max(1, parseInt(c.req.query("limit") ?? "20") || 20)); // max 1000 so Σ over companies with limit=1000 is never truncated
  const kind = c.req.query("kind");
  const conds = [eq(schema.newsItems.companySlug, row.slug)];
  if (kind) conds.push(eq(schema.newsItems.kind, kind));
  const items = db.select().from(schema.newsItems).where(and(...conds)).orderBy(desc(schema.newsItems.publishedAt), desc(schema.newsItems.createdAt)).limit(limit).all();
  return c.json({ company: row.slug, name: row.name, data: items.map((n) => ({ id: n.id, title: n.title, url: n.url, source: n.source, kind: n.kind, published_at: n.publishedAt, summary: n.summary, image_url: n.imageUrl, sentiment_score: n.sentimentScore, ingest_run_id: n.ingestRunId, fetched_at: n.createdAt })), timestamp: nowIso() });
});

inner.get("/companies/:slug/sentiment", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const { db } = await getDb();
  const limit = Math.min(365, Math.max(1, parseInt(c.req.query("limit") ?? "30") || 30));
  const hist = db.select().from(schema.sentimentHistory).where(eq(schema.sentimentHistory.companySlug, row.slug)).orderBy(desc(schema.sentimentHistory.recordedAt), desc(schema.sentimentHistory.id)).limit(limit).all();
  const delta = hist.length >= 2 ? +(hist[0].score - hist[1].score).toFixed(4) : hist[0]?.delta ?? null;
  return c.json({ company: row.slug, name: row.name, current: { ...row.sentiment, delta }, delta, history: hist.map((h) => ({ score: h.score, label: h.label, delta: h.delta, model: h.model, recorded_at: h.recordedAt, workflow_id: h.workflowId, execution_id: h.executionId, evidence: h.evidence })), timestamp: nowIso() });
});

// ---------- portfolio sentiment ----------
inner.get("/sentiment/portfolio", async (c) => {
  const { db } = await getDb();
  const latestAt = db.get<{ t: string | null }>(sql`select max(computed_at) as t from sector_rollups`)?.t;
  const rows = latestAt ? db.select().from(schema.sectorRollups).where(eq(schema.sectorRollups.computedAt, latestAt)).all() : [];
  const fmt = (r: typeof schema.sectorRollups.$inferSelect) => ({ scope: r.scope, key: r.key, company_count: r.companyCount, avg_score: r.avgScore, label: r.label, delta: r.delta, top_movers: r.topMovers, computed_at: r.computedAt, ingest_run_id: r.ingestRunId });
  const portfolio = rows.find((r) => r.scope === "portfolio");
  const companies = db.select().from(schema.companies).where(sql`${schema.companies.bCapitalRole} != 'firm'`).all();
  const movers = companies.map((r) => ({ slug: r.slug, name: r.name, sector: r.sector, score: r.sentiment.score, label: r.sentiment.label, delta: r.sentiment.delta ?? 0 })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || Math.abs(b.score) - Math.abs(a.score)).slice(0, 10);
  const focus = companies.filter((r) => r.isFocus).map((r) => ({ slug: r.slug, name: r.name, score: r.sentiment.score, label: r.sentiment.label, delta: r.sentiment.delta ?? null, top_evidence: r.sentiment.evidence?.[0] ?? null, updated_at: r.sentiment.updated_at }));
  return c.json({ portfolio: portfolio ? fmt(portfolio) : null, sectors: rows.filter((r) => r.scope === "sector").map(fmt), regions: rows.filter((r) => r.scope === "region").map(fmt), top_movers: movers, focus, computed_at: latestAt, timestamp: nowIso() });
});

// ---------- search ----------
inner.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return err(c, 400, "invalid_request", "q must be at least 2 characters");
  const { db } = await getDb();
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20") || 20));
  const pat = `%${q.toLowerCase()}%`;
  const companies = db.select().from(schema.companies).where(sql`lower(${schema.companies.name}) like ${pat} or lower(${schema.companies.sector}) like ${pat} or lower(${schema.companies.status}) like ${pat} or lower(coalesce(${schema.companies.hq},'')) like ${pat} or lower(coalesce(${schema.companies.stage},'')) like ${pat} or lower(coalesce(${schema.companies.anonResolution},'')) like ${pat}`).limit(limit).all();
  const news = db.select().from(schema.newsItems).where(sql`lower(${schema.newsItems.title}) like ${pat} or lower(coalesce(${schema.newsItems.summary},'')) like ${pat}`).orderBy(desc(schema.newsItems.publishedAt)).limit(limit).all();
  return c.json({ q, companies: companies.map((r) => ({ slug: r.slug, name: r.name, sector: r.sector, region: r.region, status: r.status, sentiment: r.sentiment.score, label: r.sentiment.label })), news: news.map((n) => ({ id: n.id, company_slug: n.companySlug, title: n.title, url: n.url, source: n.source, kind: n.kind, published_at: n.publishedAt, summary: n.summary })), timestamp: nowIso() });
});

// ---------- ingest (workflow write-back) ----------
function extractJson(text: string): any | null {
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* */ } }
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch { /* */ } }
  return null;
}
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Shared write-auth for /ingest and /refresh. Primary: X-Ingest-Secret header. The Flow Builder webhook-delivery schema
 *  (live docs: url, method, basicAuth — no custom headers) cannot set it, so the same secret is also accepted as HTTP Basic
 *  password (username 'ingest') or ?secret=. Returns an error Response or null when authorised. */
function requireIngestSecret(c: any): Response | null {
  let secret = c.req.header("x-ingest-secret") ?? "";
  const auth = c.req.header("authorization") ?? "";
  if (!secret && /^basic /i.test(auth)) { try { const [, pw] = Buffer.from(auth.slice(6), "base64").toString().split(/:(.*)/s); secret = pw ?? ""; } catch { /* ignore */ } }
  if (!secret) secret = c.req.query("secret") ?? "";
  if (!config.ingestSecret) return err(c, 503, "resource_unavailable", "INGEST_SECRET is not configured on the server");
  if (!secret || !timingSafeEqual(secret, config.ingestSecret)) return err(c, 401, "unauthenticated", "Missing or invalid X-Ingest-Secret");
  return null;
}

inner.post("/ingest", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  const raw = await c.req.text();
  let body: any = extractJson(raw);
  // Flow Builder webhook delivery wraps the result; unwrap common envelopes.
  if (body && typeof body === "object") {
    for (const k of ["payload", "data", "result", "output", "body"]) if (body[k] && typeof body[k] === "object" && !body.companies) body = body[k];
    if (typeof body === "string") body = extractJson(body);
  }
  const { db } = await getDb();
  const now = nowIso();
  const runId = `ing-${now.replace(/[:.]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
  const errors: string[] = [];
  if (!body || typeof body !== "object" || !Array.isArray(body.companies)) {
    db.insert(schema.ingestRuns).values({ id: runId, source: "workflow", workflowId: body?.workflow_id ?? null, workflowName: body?.workflow_name ?? null, executionId: body?.execution_id ?? null, model: body?.model ?? null, companiesTouched: 0, newsUpserted: 0, sentimentRows: 0, status: "error", errors: ["body has no companies[] array"], rawSample: raw.slice(0, 4096), receivedAt: now, finishedAt: nowIso() }).run();
    persist();
    return err(c, 400, "invalid_request", "Body must be JSON with a companies[] array (an LLM text payload containing such JSON is also accepted)");
  }
  let touched = 0, newsUp = 0, sentRows = 0; const unmatched: string[] = [];
  for (const item of body.companies) {
    const key = String(item.slug ?? item.name ?? item.company ?? "").trim();
    if (!key) { errors.push("company entry without slug/name"); continue; }
    const row = await findCompany(key);
    if (!row) { unmatched.push(key); continue; }
    touched++;
    const patch: Partial<typeof schema.companies.$inferInsert> = { updatedAt: now };
    if (item.status && typeof item.status === "string") patch.status = item.status;
    if (Number.isFinite(Number(item.employees)) && item.employees !== null && item.employees !== undefined && item.employees !== "") patch.employees = Number(item.employees);
    if (item.stage && typeof item.stage === "string") patch.stage = item.stage;
    const newsIn: any[] = Array.isArray(item.news) ? item.news : Array.isArray(item.latest_news) ? item.latest_news : [];
    const newsOut = [] as any[];
    for (const n of newsIn.slice(0, 50)) {
      const title = String(n?.title ?? n?.headline ?? "").trim(); if (!title) continue;
      const url = n?.url ? String(n.url) : null;
      const id = "n-" + crypto.createHash("sha1").update(row.slug + "|" + (url ?? title)).digest("hex").slice(0, 16);
      const rec = { id, companySlug: row.slug, title, url, source: n?.source ? String(n.source) : url ? new URL(url).hostname : null, kind: String(n?.kind ?? "news"), publishedAt: n?.published_at ?? n?.date ?? null, summary: n?.summary ? String(n.summary) : null, imageUrl: n?.image_url ?? n?.image ?? null, sentimentScore: n?.sentiment_score !== undefined ? clampScore(n.sentiment_score) : null, ingestRunId: runId, createdAt: now };
      db.insert(schema.newsItems).values(rec).onConflictDoUpdate({ target: schema.newsItems.id, set: { title: rec.title, summary: rec.summary, imageUrl: rec.imageUrl, publishedAt: rec.publishedAt, sentimentScore: rec.sentimentScore, ingestRunId: runId } }).run();
      newsUp++; newsOut.push({ id, title, url, source: rec.source, kind: rec.kind, published_at: rec.publishedAt, summary: rec.summary, image_url: rec.imageUrl });
    }
    if (newsOut.length) {
      const merged = [...newsOut, ...row.latestNews.filter((o) => !newsOut.some((n) => n.id === o.id))].slice(0, 25);
      patch.latestNews = merged;
    }
    const s = item.sentiment ?? (item.score !== undefined ? { score: item.score, label: item.label, evidence: item.evidence } : null);
    if (s && (s.score !== undefined || s.label)) {
      const score = clampScore(s.score); const label = (typeof s.label === "string" && s.label.trim()) ? s.label.trim().toLowerCase() : labelFor(score);
      const prev = db.select().from(schema.sentimentHistory).where(eq(schema.sentimentHistory.companySlug, row.slug)).orderBy(desc(schema.sentimentHistory.recordedAt), desc(schema.sentimentHistory.id)).limit(1).get();
      const delta = prev ? +(score - prev.score).toFixed(4) : null;
      const evidence = normaliseEvidence(s.evidence);
      db.insert(schema.sentimentHistory).values({ companySlug: row.slug, score, label, evidence, delta, model: body.model ?? config.ondemandDefaultModel, workflowId: body.workflow_id ?? null, executionId: body.execution_id ?? null, ingestRunId: runId, recordedAt: now }).run();
      sentRows++;
      patch.sentiment = { score, label, evidence, updated_at: now, basis: `workflow ${body.workflow_name ?? body.workflow_id ?? "unknown"}`, delta };
    }
    db.update(schema.companies).set(patch).where(eq(schema.companies.id, row.id)).run();
  }
  // Recompute authoritative roll-ups + deltas vs previous computation.
  const all = db.select().from(schema.companies).where(sql`${schema.companies.bCapitalRole} != 'firm'`).all().map((r) => ({ slug: r.slug, name: r.name, sector: r.sector, region: r.region, score: r.sentiment.score, delta: r.sentiment.delta ?? null }));
  const prevAt = db.get<{ t: string | null }>(sql`select max(computed_at) as t from sector_rollups`)?.t ?? null;
  const prevRows = prevAt ? db.select().from(schema.sectorRollups).where(eq(schema.sectorRollups.computedAt, prevAt)).all() : [];
  const computedAt = nowIso() === now ? now : nowIso();
  let rollups = 0;
  const write = (scope: string, key: string, list: typeof all) => {
    const r = rollup(list); const prev = prevRows.find((p) => p.scope === scope && p.key === key);
    db.insert(schema.sectorRollups).values({ scope, key, companyCount: r.companyCount, avgScore: r.avgScore, label: r.label, delta: prev ? +(r.avgScore - prev.avgScore).toFixed(4) : null, topMovers: r.topMovers, ingestRunId: runId, computedAt }).run(); rollups++;
  };
  write("portfolio", "ALL", all);
  for (const s of new Set(all.map((r) => r.sector))) write("sector", s, all.filter((r) => r.sector === s));
  for (const g of new Set(all.map((r) => r.region))) write("region", g, all.filter((r) => r.region === g));
  const status = unmatched.length || errors.length ? (touched ? "partial" : "error") : "ok";
  db.insert(schema.ingestRuns).values({ id: runId, source: "workflow", workflowId: body.workflow_id ?? null, workflowName: body.workflow_name ?? null, executionId: body.execution_id ?? null, model: body.model ?? null, companiesTouched: touched, newsUpserted: newsUp, sentimentRows: sentRows, status, errors: [...errors, ...unmatched.map((u) => `unmatched company: ${u}`)], rawSample: raw.slice(0, 4096), receivedAt: now, finishedAt: nowIso() }).run();
  persist();
  return c.json({ ingest_run_id: runId, companies_touched: touched, news_upserted: newsUp, sentiment_rows: sentRows, unmatched, rollups_recomputed: rollups, status, received_at: now, finished_at: nowIso() });
});

inner.get("/ingest/runs", async (c) => {
  const { db } = await getDb();
  const rows = db.select().from(schema.ingestRuns).orderBy(desc(schema.ingestRuns.receivedAt)).limit(50).all();
  return c.json({ data: rows.map(({ rawSample, ...r }) => r), timestamp: nowIso() });
});

// ---------- refresh (live Perplexity news via OnDemand Chat API) ----------
inner.post("/refresh", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  if (!process.env.ONDEMAND_API_KEY) return err(c, 503, "resource_unavailable", "ONDEMAND_API_KEY is not configured on the server");
  let body: any = {};
  try { const raw = await c.req.text(); body = raw.trim() ? JSON.parse(raw) : {}; } catch { return err(c, 400, "invalid_request", "Body must be JSON: {slugs?: string[], limit?: number}"); }
  const slugs = Array.isArray(body?.slugs) ? body.slugs.map((s: unknown) => String(s)) : undefined;
  const limit = Number.isFinite(Number(body?.limit)) && body.limit !== null && body.limit !== undefined && body.limit !== "" ? Number(body.limit) : undefined;
  const concurrency = Number.isFinite(Number(body?.concurrency)) && body.concurrency ? Number(body.concurrency) : undefined;
  const r = await refreshCompanies({ slugs, limit, concurrency });
  return c.json({ ingest_run_id: r.ingest_run_id, status: r.status, companies_touched: r.companies_touched, news_upserted: r.news_upserted, with_images: r.with_images, dated: r.dated, errors: r.errors, companies: r.companies, items: r.items, started_at: r.started_at, finished_at: r.finished_at });
});

inner.get("/refresh/status", async (c) => {
  const state = getRefreshState();
  const last = await lastRefreshRun();
  const { db } = await getDb();
  const withImages = db.get<{ n: number }>(sql`select count(*) as n from news_items where image_url is not null and image_url != ''`)!.n;
  const total = newsTotal(db); // single definition (see NEWS_TOTAL_DEFINITION)
  const refreshMinutes = Number(process.env.REFRESH_CRON_MINUTES ?? 60);
  return c.json({ running: state.running, last_run: last ? { id: last.id, status: last.status, companies_touched: last.companiesTouched, news_upserted: last.newsUpserted, errors: last.errors, plugin_errors: (last.errors ?? []).filter((e) => /upstream plugin error/i.test(String(e))).length, started_at: last.receivedAt, finished_at: last.finishedAt, model: last.model } : null, last_result: state.last ? { ingest_run_id: state.last.ingest_run_id, with_images: state.last.with_images, dated: state.last.dated, companies: state.last.companies.map(({ session_id, ...x }) => x) } : null, scheduler: { enabled: refreshMinutes > 0, interval_minutes: refreshMinutes > 0 ? refreshMinutes : null, batch_limit: 40, next_scheduled_at: state.next_scheduled_at }, news_items_total: total, news_items_with_images: withImages, timestamp: nowIso() });
});


// ---------- Signal Score (evidence-weighted; src/scoring.ts) ----------
let signalCache: { at: number; key: string; scores: SignalScore[] } | null = null;
async function computeSignals(): Promise<SignalScore[]> {
  const { db } = await getDb();
  const stamp = db.get<{ t: string | null; n: number }>(sql`select max(updated_at) as t, count(*) as n from companies`);
  const newsStamp = db.get<{ t: string | null; n: number }>(sql`select max(created_at) as t, count(*) as n from news_items`);
  const key = `${stamp?.t}|${stamp?.n}|${newsStamp?.t}|${newsStamp?.n}`;
  if (signalCache && signalCache.key === key && Date.now() - signalCache.at < 60_000) return signalCache.scores;
  const companies = db.select().from(schema.companies).where(sql`${schema.companies.bCapitalRole} != 'firm'`).all();
  const news = db.select({ slug: schema.newsItems.companySlug, url: schema.newsItems.url, title: schema.newsItems.title, source: schema.newsItems.source, publishedAt: schema.newsItems.publishedAt, sentiment: schema.newsItems.sentimentScore, kind: schema.newsItems.kind }).from(schema.newsItems).all();
  const hist = db.select({ slug: schema.sentimentHistory.companySlug, score: schema.sentimentHistory.score, at: schema.sentimentHistory.recordedAt }).from(schema.sentimentHistory).orderBy(desc(schema.sentimentHistory.recordedAt)).all();
  const newsBy = new Map<string, CompanyInput["items"]>(); for (const n of news) newsBy.set(n.slug, [...(newsBy.get(n.slug) ?? []), { url: n.url, title: n.title, source: n.source, published_at: n.publishedAt, sentiment: n.sentiment, kind: n.kind }]);
  const histBy = new Map<string, CompanyInput["history"]>(); for (const h of hist) histBy.set(h.slug, [...(histBy.get(h.slug) ?? []), { score: h.score, recorded_at: h.at }]);
  const inputs: CompanyInput[] = companies.map((c) => {
    // Items without their own sentiment inherit the company's evidence-level sentiment only when the evidence quotes that URL; otherwise null.
    const evUrls = new Set((c.sentiment.evidence ?? []).map((e) => e.url));
    const items = (newsBy.get(c.slug) ?? []).map((it) => ({ ...it, sentiment: it.sentiment ?? (it.url && evUrls.has(it.url) ? c.sentiment.score : null) }));
    return { slug: c.slug, name: c.name, sector: c.sector, website: c.website, items, history: histBy.get(c.slug) ?? [], current: c.sentiment.score };
  });
  const scores = scorePortfolio(inputs);
  signalCache = { at: Date.now(), key, scores };
  return scores;
}
inner.get("/signals", async (c) => {
  const scores = await computeSignals();
  const sector = c.req.query("sector");
  const rows = sector ? scores.filter((s) => s.sector.toLowerCase() === sector.toLowerCase()) : scores;
  const compact = rows.map(({ slug, sector: sec, score, confidence, percentile, label, factors, contributions, momentum, evidence, sparkline }) => ({ slug, sector: sec, score, confidence, percentile, label, factors, contributions, momentum, evidence, sparkline }));
  const sectors: Record<string, { n: number; mean: number; p25: number; p75: number }> = {};
  for (const sec of new Set(scores.map((s) => s.sector))) { const xs = scores.filter((s) => s.sector === sec).map((s) => s.score).sort((a, b) => a - b); sectors[sec] = { n: xs.length, mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), p25: xs[Math.floor(xs.length * 0.25)], p75: xs[Math.floor(xs.length * 0.75)] }; }
  const all = scores.map((s) => s.score).sort((a, b) => a - b);
  return c.json({ data: compact, portfolio: { n: all.length, mean: Math.round(all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)), p25: all[Math.floor(all.length * 0.25)] ?? null, p75: all[Math.floor(all.length * 0.75)] ?? null, computed_at: scores[0]?.computed_at ?? nowIso(), method: scores[0]?.method ?? null }, sectors, timestamp: nowIso() });
});
inner.get("/companies/:slug/signal", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const scores = await computeSignals(); const s = scores.find((x) => x.slug === row.slug);
  if (!s) return err(c, 404, "not_found", "No signal for this record (firm row)");
  const sect = scores.filter((x) => x.sector === s.sector).map((x) => x.score).sort((a, b) => a - b);
  const all = scores.map((x) => x.score).sort((a, b) => a - b);
  const band = (xs: number[]) => ({ p25: xs[Math.floor(xs.length * 0.25)] ?? null, median: xs[Math.floor(xs.length * 0.5)] ?? null, p75: xs[Math.floor(xs.length * 0.75)] ?? null });
  return c.json({ company: row.slug, name: row.name, data: s, bands: { portfolio: band(all), sector: band(sect) }, timestamp: nowIso() });
});
// ---------- enrichment profiles (src/enrich.ts) ----------
inner.get("/companies/:slug/profile", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const p = await getProfile(row.slug);
  if (!p) return c.json({ company: row.slug, name: row.name, data: null, enriched: false, timestamp: nowIso() });
  return c.json({ company: row.slug, name: row.name, data: p, enriched: true, timestamp: nowIso() });
});
inner.get("/enrich/status", async (c) => c.json({ ...(await profileCoverage()), plugins: ENRICH_PLUGINS, timestamp: nowIso() }));
inner.post("/enrich", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  if (!process.env.ONDEMAND_API_KEY) return err(c, 503, "resource_unavailable", "ONDEMAND_API_KEY is not configured on the server");
  let body: any = {};
  try { const raw = await c.req.text(); body = raw.trim() ? JSON.parse(raw) : {}; } catch { return err(c, 400, "invalid_request", "Body must be JSON: {slugs: string[], concurrency?: number}"); }
  const slugs: string[] = Array.isArray(body?.slugs) ? body.slugs.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean) : [];
  if (!slugs.length) return err(c, 400, "invalid_request", "slugs[] is required");
  if (slugs.length === 1 && body?.dry_run) { const row = await findCompany(slugs[0]); if (!row) return err(c, 404, "not_found", slugs[0]); const p = await enrichCompany(row, { write: false }); return c.json({ dry_run: true, profile: p, timestamp: nowIso() }); }
  const conc = Math.max(1, Math.min(Number(body?.concurrency) || 2, 3));
  if (body?.async) {
    // Long shards outlive the proxy's request timeout: run in the background and expose progress at /enrich/jobs/:id.
    const jobId = `job-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
    const job: EnrichJob = { id: jobId, slugs: slugs.slice(0, 20), status: "running", started_at: nowIso(), finished_at: null, result: null, error: null };
    enrichJobs.set(jobId, job);
    enrichShard(job.slugs, conc).then((r) => { job.result = r; job.status = "done"; job.finished_at = nowIso(); }).catch((e) => { job.error = String((e as Error)?.message ?? e); job.status = "error"; job.finished_at = nowIso(); });
    return c.json({ job_id: jobId, status: "running", slugs: job.slugs, poll: `/enrich/jobs/${jobId}`, timestamp: nowIso() }, 202);
  }
  const r = await enrichShard(slugs.slice(0, 20), conc);
  return c.json({ ...r, timestamp: nowIso() });
});
type EnrichJob = { id: string; slugs: string[]; status: "running" | "done" | "error"; started_at: string; finished_at: string | null; result: Awaited<ReturnType<typeof enrichShard>> | null; error: string | null };
const enrichJobs = new Map<string, EnrichJob>();
inner.get("/enrich/jobs/:id", async (c) => {
  const job = enrichJobs.get(c.req.param("id")); if (!job) return err(c, 404, "not_found", "unknown job");
  const done = new Set(job.result?.results.map((r) => r.slug) ?? []);
  const progress: { slug: string; enriched: boolean; coverage_pct: number | null }[] = [];
  for (const s of job.slugs) { const p = await getProfile(s); progress.push({ slug: s, enriched: !!p && p.fetched_at >= job.started_at, coverage_pct: p && p.fetched_at >= job.started_at ? p.coverage_pct : null }); }
  return c.json({ ...job, progress, completed: progress.filter((x) => x.enriched).length, total: job.slugs.length, timestamp: nowIso() }); void done;
});
inner.get("/enrich/jobs", async (c) => c.json({ data: [...enrichJobs.values()].map(({ result, ...j }) => ({ ...j, completed: result?.results.length ?? null })), timestamp: nowIso() }));

// ---------- PitchBook (src/pitchbook.ts — plugin-1777018662 "Pitchbook Investor Finder", the only PitchBook plugin in the directory) ----------
type PitchbookJob = { id: string; slugs: string[]; status: "running" | "done" | "error"; started_at: string; finished_at: string | null; result: Awaited<ReturnType<typeof pitchbookShard>> | null; error: string | null };
const pitchbookJobs = new Map<string, PitchbookJob>();
const PITCHBOOK_META = { plugin_id: PITCHBOOK_PLUGIN_ID, source: PITCHBOOK_SOURCE, cadence: "0 0 6 * * 1 (Mon 06:00 UTC)", availability_note: "investors VERIFIED via searchInvestors; overview/last_round/valuation_history/financials/comparables NOT_AVAILABLE_FROM_PLUGIN (back-filled FROM_ENRICHMENT when a profile exists)" };
function startPitchbookJob(slugs: string[], conc: number): PitchbookJob {
  const jobId = `pbjob-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
  const job: PitchbookJob = { id: jobId, slugs, status: "running", started_at: nowIso(), finished_at: null, result: null, error: null };
  pitchbookJobs.set(jobId, job);
  pitchbookShard(job.slugs, conc).then((r) => { job.result = r; job.status = "done"; job.finished_at = nowIso(); }).catch((e) => { job.error = String((e as Error)?.message ?? e); job.status = "error"; job.finished_at = nowIso(); });
  return job;
}
inner.get("/pitchbook", async (c) => {
  const data = await listPitchbookRecords();
  return c.json({ data, count: data.length, next_run_utc: nextMondayUtc(), workflow_id: process.env.PITCHBOOK_WORKFLOW_ID ?? null, ...PITCHBOOK_META, timestamp: nowIso() });
});
inner.get("/pitchbook/jobs/:id", async (c) => {
  const job = pitchbookJobs.get(c.req.param("id")); if (!job) return err(c, 404, "not_found", "unknown job");
  const progress: { slug: string; enriched: boolean; investors: number | null }[] = [];
  for (const s of job.slugs) { const r = await getPitchbookRecord(s); const fresh = !!r && r.provenance.fetched_at >= job.started_at; progress.push({ slug: s, enriched: fresh, investors: fresh ? r!.investors.matched.length : null }); }
  return c.json({ ...job, progress, completed: progress.filter((x) => x.enriched).length, total: job.slugs.length, timestamp: nowIso() });
});
inner.get("/pitchbook/jobs", async (c) => c.json({ data: [...pitchbookJobs.values()].map(({ result, ...j }) => ({ ...j, completed: result?.results.length ?? null })), timestamp: nowIso() }));
inner.get("/pitchbook/:slug", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const data = await getPitchbookRecord(row.slug);
  return c.json({ company: row.slug, name: row.name, data, enriched: !!data, next_run_utc: nextMondayUtc(), ...PITCHBOOK_META, timestamp: nowIso() });
});
inner.post("/pitchbook/ingest", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  const raw = await c.req.text();
  let body: any = extractJson(raw);
  if (body && typeof body === "object") { for (const k of ["payload", "data", "result", "output", "body"]) if (body[k] && typeof body[k] === "object" && !body.records && !body.slugs) body = body[k]; if (typeof body === "string") body = extractJson(body); }
  let salvage: ReturnType<typeof salvageRecords> | null = null;
  // Flow Builder webhook delivery posts the LLM text verbatim; a truncated answer (output budget) is still JSON-salvageable record by record.
  if ((!body || typeof body !== "object" || !Array.isArray(body.records)) && /"slug"\s*:/.test(raw)) { salvage = salvageRecords(raw); if (salvage.records.length) body = { ...(body && typeof body === "object" ? body : {}), records: salvage.records, workflow_name: salvage.workflow_name }; }
  if (!body || typeof body !== "object") return err(c, 400, "invalid_request", "Body must be JSON: {records:[PitchbookRecord]} or {slugs:[...], async?:true}");
  const now = nowIso();
  if (Array.isArray(body.records)) {
    const written: string[] = []; const rejected: { index: number; error: string }[] = []; const unmatched: string[] = [];
    for (const [i, item] of (body.records as any[]).entries()) {
      const n = normaliseIncomingRecord(item, now); if (!n.ok) { rejected.push({ index: i, error: n.error }); continue; }
      const row = await findCompany(n.record.slug); if (!row || row.bCapitalRole === "firm") { unmatched.push(n.record.slug); continue; }
      n.record.slug = row.slug; if (body.execution_id && !n.record.provenance.note) n.record.provenance.note = `workflow execution ${body.execution_id}`;
      applyEnrichment(n.record, await getProfile(row.slug).catch(() => null)); // overview/last_round FROM_ENRICHMENT when a profile exists — never claimed as PitchBook data
      await writePitchbookRecord(n.record); written.push(row.slug);
    }
    const status = written.length ? (rejected.length || unmatched.length ? "partial" : "ok") : "error";
    return c.json({ mode: "records", status, written: written.length, slugs: written, rejected, unmatched, salvaged: salvage ? { complete_json: salvage.complete_json, truncated_records: salvage.truncated } : null, next_run_utc: nextMondayUtc(), received_at: now, finished_at: nowIso() }, status === "error" ? 400 : 200);
  }
  if (Array.isArray(body.slugs)) {
    if (!process.env.ONDEMAND_API_KEY) return err(c, 503, "resource_unavailable", "ONDEMAND_API_KEY is not configured on the server");
    const slugs: string[] = body.slugs.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (!slugs.length) return err(c, 400, "invalid_request", "slugs[] is empty");
    const conc = Math.max(1, Math.min(Number(body?.concurrency) || 2, 2));
    if (slugs.length === 1 && body?.dry_run) { const row = await findCompany(slugs[0]); if (!row) return err(c, 404, "not_found", slugs[0]); return c.json({ dry_run: true, record: await fetchPitchbook(row, { write: false }), timestamp: nowIso() }); }
    if (body?.async) { const job = startPitchbookJob(slugs, conc); return c.json({ mode: "slugs", job_id: job.id, status: "running", slugs: job.slugs, poll: `/pitchbook/jobs/${job.id}`, timestamp: nowIso() }, 202); }
    const r = await pitchbookShard(slugs, conc);
    return c.json({ mode: "slugs", ...r, next_run_utc: nextMondayUtc(), timestamp: nowIso() });
  }
  return err(c, 400, "invalid_request", "Body must contain records[] or slugs[]");
});
/** UI 'Run now' relay: executes the weekly OnDemand workflow (env PITCHBOOK_WORKFLOW_ID) or falls back to a local async ingest of every portfolio company. */
inner.post("/pitchbook/run", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  const wfId = (process.env.PITCHBOOK_WORKFLOW_ID ?? "").trim(); const apikey = process.env.ONDEMAND_API_KEY ?? "";
  const base = (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
  if (wfId && apikey) {
    try {
      const r = await fetch(`${base}/automation/api/workflow/${wfId}/execute`, { method: "POST", headers: { apikey, "content-type": "application/json", "user-agent": ONDEMAND_USER_AGENT }, body: JSON.stringify({ payload: {} }), signal: AbortSignal.timeout(30_000) });
      const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch { /* keep text */ }
      const d = j?.data ?? j; const execId = d?.executionId ?? d?.executionID ?? d?.id ?? null;
      if (r.ok && execId) return c.json({ mode: "workflow", workflow_id: wfId, execution_id: String(execId), status: String(d?.status ?? "executing"), next_run_utc: nextMondayUtc(), timestamp: nowIso() });
      return c.json({ mode: "workflow", workflow_id: wfId, execution_id: execId ? String(execId) : null, status: "error", http_status: r.status, detail: txt.slice(0, 300), next_run_utc: nextMondayUtc(), timestamp: nowIso() }, 502);
    } catch (e) { return c.json({ mode: "workflow", workflow_id: wfId, execution_id: null, status: "error", detail: String((e as Error)?.message ?? e), next_run_utc: nextMondayUtc(), timestamp: nowIso() }, 502); }
  }
  if (!apikey) return err(c, 503, "resource_unavailable", "ONDEMAND_API_KEY is not configured on the server");
  const { db } = await getDb();
  const slugs = db.select({ slug: schema.companies.slug }).from(schema.companies).where(sql`${schema.companies.bCapitalRole} != 'firm'`).orderBy(desc(schema.companies.isFocus), asc(schema.companies.slug)).all().map((r) => r.slug);
  const job = startPitchbookJob(slugs, 2);
  return c.json({ fallback: "local", reason: "PITCHBOOK_WORKFLOW_ID is not set", job_id: job.id, status: "running", total: slugs.length, poll: `/pitchbook/jobs/${job.id}`, next_run_utc: nextMondayUtc(), timestamp: nowIso() }, 202);
});

// ---------- news count ----------
inner.get("/news/count", async (c) => {
  const { db } = await getDb();
  const s = newsSummary(db);
  return c.json({ total: s.total, by_company: s.by_company, companies: s.companies, orphan_items: s.orphan_items, dedup_removed: s.dedup_removed, definition: s.definition, timestamp: nowIso() });
});
inner.get("/news/summary", async (c) => {
  const { db } = await getDb();
  const rec = newsReconciliation(db);
  return c.json({ ...newsSummary(db), reconciliation: { raw_rows_all: rec.totals.all_rows.raw, dedup_url: rec.totals.listed_companies.dedup_url, dedup_title: rec.totals.listed_companies.dedup_title, in_window_30d: rec.totals.listed_companies.in_window_30d, in_window_7d: rec.totals.listed_companies.in_window_7d, no_url: rec.totals.listed_companies.no_url, embedded_latest_news_total: rec.legacy_latest_news.embedded_total, detail: "/news/reconciliation" }, timestamp: nowIso() });
});
/** Full reconciliation: same SQL as scripts/news-reconciliation.ts (proof/data-lane/news-reconciliation-2026-10-11.json). */
inner.get("/news/reconciliation", async (c) => {
  const { db } = await getDb();
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("as_of") ?? "") ? c.req.query("as_of")! : undefined;
  return c.json({ ...newsReconciliation(db, asOf), timestamp: nowIso() });
});
/** Distinct sentiment ingest runs (sentiment_history grouped by ingest_run_id) with counts. */
inner.get("/sentiment/runs", async (c) => {
  const { db } = await getDb();
  const rows = db.all(sql`select h.ingest_run_id as ingest_run_id, count(*) as sentiment_rows, count(distinct h.company_slug) as companies, sum(case when h.delta is null then 1 else 0 end) as null_delta,
      sum(case when h.delta is not null and h.delta != 0 then 1 else 0 end) as moved, round(avg(h.score), 4) as avg_score, min(h.recorded_at) as started_at, max(h.recorded_at) as finished_at,
      max(h.model) as model, max(r.workflow_name) as workflow_name, max(r.source) as source
    from sentiment_history h left join ingest_runs r on r.id = h.ingest_run_id group by h.ingest_run_id order by min(h.recorded_at) desc`) as any[];
  const nullDeltaNow = Number((db.get(sql`select count(*) as n from companies where json_extract(sentiment, '$.delta') is null`) as { n: number }).n);
  return c.json({ data: rows.map((r) => ({ ...r, sentiment_rows: Number(r.sentiment_rows), companies: Number(r.companies), null_delta: Number(r.null_delta), moved: Number(r.moved), avg_score: r.avg_score === null ? null : Number(r.avg_score) })), runs: rows.length, companies_with_null_delta_now: nullDeltaNow, timestamp: nowIso() });
});

// ---------- artifacts ----------
const ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;
const ARTIFACT_KINDS = ["document", "image", "video", "audio", "file"] as const;
function kindFromMime(mime: string, name: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (/^(text\/|application\/(pdf|json|msword|rtf|xml|vnd\.openxmlformats|vnd\.ms-|vnd\.oasis))/.test(m) || /\.(pdf|docx?|xlsx?|pptx?|md|txt|csv|json|html?)$/i.test(name)) return "document";
  return "file";
}
function mimeFromName(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", html: "text/html", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  return map[ext] ?? "application/octet-stream";
}
function artifactToApi(c: any, r: Omit<typeof schema.artifacts.$inferSelect, "bytes">) {
  const content_url = `${serverUrl(c)}/artifacts/${r.id}/content`;
  return {
    id: r.id, name: r.name, kind: r.kind, mime: r.mime, size_bytes: r.sizeBytes, version: r.version, source: r.source,
    media_id: r.mediaId ?? null, media_status: r.mediaStatus ?? null, media_message: r.mediaMessage ?? null,
    media_source_url: r.mediaSourceUrl ?? null, media_url_expires_at: r.mediaUrlExpiresAt ?? null, media_external_user_id: r.mediaExternalUserId ?? null,
    media_plugins: parsePlugins(r.mediaPlugins),
    thread_id: r.threadId ?? null, session_id: r.sessionId ?? null, origin_event: r.originEvent ?? null,
    content_url, thumbnail_url: r.kind === "image" ? content_url : null, created_at: r.createdAt, deleted_at: r.deletedAt ?? null,
  };
}
const artifactMeta = {
  id: schema.artifacts.id, name: schema.artifacts.name, kind: schema.artifacts.kind, mime: schema.artifacts.mime, sizeBytes: schema.artifacts.sizeBytes,
  version: schema.artifacts.version, source: schema.artifacts.source, mediaId: schema.artifacts.mediaId, mediaStatus: schema.artifacts.mediaStatus,
  mediaMessage: schema.artifacts.mediaMessage, mediaSourceUrl: schema.artifacts.mediaSourceUrl, mediaUrlExpiresAt: schema.artifacts.mediaUrlExpiresAt,
  mediaExternalUserId: schema.artifacts.mediaExternalUserId, mediaPlugins: schema.artifacts.mediaPlugins, threadId: schema.artifacts.threadId, sessionId: schema.artifacts.sessionId, originEvent: schema.artifacts.originEvent,
  createdAt: schema.artifacts.createdAt, deletedAt: schema.artifacts.deletedAt,
};
/** Defensive: a stored media URL must never carry a SAS signature (`se=`/`sig=`) — strip the whole query string (and fragment). */
export function unsignedUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u.trim()) return null;
  const v = u.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  return v.replace(/[?#].*$/, "") || null;
}
/** `se=` (SAS expiry) from a signed URL → ISO string, or null. */
export function expiryFromSignedUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try { const se = new URL(u).searchParams.get("se"); if (!se) return null; const t = Date.parse(se); return Number.isNaN(t) ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z"); } catch { return null; }
}
function parsePlugins(v: string | null | undefined): string[] | null {
  if (!v) return null;
  try { const j = JSON.parse(v); return Array.isArray(j) ? j.map(String) : null; } catch { return null; }
}
function pluginsIn(v: unknown): string | null {
  if (Array.isArray(v)) { const a = v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()).slice(0, 20); return a.length ? JSON.stringify(a) : null; }
  if (typeof v === "string" && v.trim()) { try { const j = JSON.parse(v); if (Array.isArray(j)) return pluginsIn(j); } catch { /* csv */ } return pluginsIn(v.split(",")); }
  return null;
}
const tooLarge = (c: any, n?: number) => err(c, 413, "payload_too_large", `Artifact exceeds the 25 MB limit${n ? ` (${n} bytes)` : ""}`);
const optStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

inner.post("/artifacts", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  const ct = (c.req.header("content-type") ?? "").toLowerCase();
  const cl = Number(c.req.header("content-length") ?? 0);
  // multipart/base64 envelopes add overhead: allow ~37% headroom before rejecting on the header alone.
  if (cl && cl > ARTIFACT_MAX_BYTES * 1.37 + 64 * 1024) return tooLarge(c, cl);
  let bytes: Buffer; let name = ""; let mime = ""; const f: Record<string, unknown> = {};
  try {
    if (ct.startsWith("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return err(c, 400, "invalid_request", "multipart body must include a 'file' part");
      for (const [k, v] of form.entries()) if (k !== "file" && typeof v === "string") f[k] = v;
      bytes = Buffer.from(await (file as File).arrayBuffer());
      name = optStr(f.name) ?? ((file as File).name || "upload.bin");
      mime = optStr(f.mime) ?? ((file as File).type || mimeFromName(name));
    } else if (ct.includes("application/json") || ct === "") {
      let body: any;
      try { body = JSON.parse(await c.req.text()); } catch { return err(c, 400, "invalid_request", "Body must be JSON {name, mime, content_base64} | {name, url} or multipart/form-data"); }
      if (!body || typeof body !== "object") return err(c, 400, "invalid_request", "Body must be a JSON object");
      Object.assign(f, body);
      if (typeof body.content_base64 === "string") {
        const b64 = body.content_base64.replace(/^data:[^,]*,/, "");
        if (b64.length * 0.75 > ARTIFACT_MAX_BYTES + 4) return tooLarge(c, Math.floor(b64.length * 0.75));
        bytes = Buffer.from(b64, "base64");
        name = optStr(body.name) ?? "upload.bin";
        mime = optStr(body.mime) ?? mimeFromName(name);
      } else if (typeof body.url === "string") {
        let u: URL; try { u = new URL(body.url); } catch { return err(c, 400, "invalid_request", "url must be an absolute http(s) URL"); }
        if (!/^https?:$/.test(u.protocol)) return err(c, 400, "invalid_request", "url must be http(s)");
        const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) return err(c, 502, "upstream_error", `Fetching url failed: HTTP ${r.status}`);
        const len = Number(r.headers.get("content-length") ?? 0);
        if (len > ARTIFACT_MAX_BYTES) return tooLarge(c, len);
        bytes = Buffer.from(await r.arrayBuffer());
        name = optStr(body.name) ?? (decodeURIComponent(u.pathname.split("/").pop() || "") || "download.bin");
        mime = optStr(body.mime) ?? (r.headers.get("content-type")?.split(";")[0].trim() || mimeFromName(name));
      } else return err(c, 400, "invalid_request", "JSON body needs content_base64 or url");
    } else return err(c, 415, "unsupported_media_type", "Use multipart/form-data or application/json");
  } catch (e) {
    return err(c, 400, "invalid_request", `Could not read upload: ${(e as Error).message}`);
  }
  if (bytes.length > ARTIFACT_MAX_BYTES) return tooLarge(c, bytes.length);
  if (!bytes.length) return err(c, 400, "invalid_request", "Artifact is empty");
  const kindIn = optStr(f.kind);
  if (kindIn && !(ARTIFACT_KINDS as readonly string[]).includes(kindIn)) return err(c, 400, "invalid_request", "kind must be document|image|video|audio|file");
  const source = optStr(f.source) ?? "upload";
  if (!["upload", "generated", "agent"].includes(source)) return err(c, 400, "invalid_request", "source must be upload|generated|agent");
  const mediaStatus = optStr(f.media_status);
  if (mediaStatus && !["stored", "local", "failed"].includes(mediaStatus)) return err(c, 400, "invalid_request", "media_status must be stored|local|failed");
  const threadId = optStr(f.thread_id);
  const { db } = await getDb();
  const prev = db.get<{ v: number | null }>(threadId === null
    ? sql`select max(version) as v from artifacts where name = ${name} and thread_id is null`
    : sql`select max(version) as v from artifacts where name = ${name} and thread_id = ${threadId}`);
  const row = {
    id: `art_${crypto.randomBytes(6).toString("hex")}`, name, kind: kindIn ?? kindFromMime(mime, name), mime, sizeBytes: bytes.length,
    version: (prev?.v ?? 0) + 1, source, mediaId: optStr(f.media_id), mediaStatus, mediaMessage: optStr(f.media_message),
    // NEVER persist a signed URL: the query string (SAS `se=`/`sig=`) is stripped server-side whatever the caller sent.
    mediaSourceUrl: unsignedUrl(f.media_source_url), mediaUrlExpiresAt: optStr(f.media_url_expires_at) ?? expiryFromSignedUrl(f.media_source_url),
    mediaExternalUserId: optStr(f.media_external_user_id)?.slice(0, 64) ?? null, mediaPlugins: pluginsIn(f.media_plugins),
    threadId, sessionId: optStr(f.session_id), originEvent: optStr(f.origin_event) ?? (source === "upload" ? "upload" : null),
    bytes, createdAt: nowIso(), deletedAt: null,
  };
  db.insert(schema.artifacts).values(row).run();
  persist();
  const { bytes: _b, ...meta } = row;
  return c.json({ data: artifactToApi(c, meta) }, 201);
});

inner.get("/artifacts", async (c) => {
  const { db } = await getDb();
  const threadId = c.req.query("thread_id"); const kind = c.req.query("kind");
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") ?? "100") || 100));
  const conds = [sql`${schema.artifacts.deletedAt} is null`] as any[];
  if (threadId) conds.push(eq(schema.artifacts.threadId, threadId));
  if (kind) conds.push(eq(schema.artifacts.kind, kind));
  const where = and(...conds);
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.artifacts).where(where).get()!.n;
  const rows = db.select(artifactMeta).from(schema.artifacts).where(where).orderBy(desc(schema.artifacts.createdAt), desc(sql`rowid`)).limit(limit).all();
  return c.json({ data: rows.map((r) => artifactToApi(c, r)), total, timestamp: nowIso() });
});

inner.get("/artifacts/:id", async (c) => {
  const { db } = await getDb();
  const r = db.select(artifactMeta).from(schema.artifacts).where(and(eq(schema.artifacts.id, c.req.param("id")), sql`${schema.artifacts.deletedAt} is null`)).get();
  if (!r) return err(c, 404, "not_found", `No artifact with id '${c.req.param("id")}'`);
  return c.json({ data: artifactToApi(c, r) });
});

inner.get("/artifacts/:id/content", async (c) => {
  const { db } = await getDb();
  const r = db.select().from(schema.artifacts).where(and(eq(schema.artifacts.id, c.req.param("id")), sql`${schema.artifacts.deletedAt} is null`)).get();
  if (!r) return err(c, 404, "not_found", `No artifact with id '${c.req.param("id")}'`);
  const dl = ["1", "true"].includes(c.req.query("download") ?? "");
  const safe = r.name.replace(/["\\\r\n]/g, "_");
  const buf = Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes as unknown as Uint8Array);
  return new Response(new Uint8Array(buf), { status: 200, headers: {
    "content-type": r.mime, "content-length": String(buf.length), "cache-control": "private, max-age=300",
    "content-disposition": `${dl ? "attachment" : "inline"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(r.name)}`,
    "access-control-allow-origin": "*", "x-request-id": c.get("requestId"),
  } });
});

// ---------- re-sign on open: fresh OnDemand signed URL (10-min memory cache per media_id), honest backend fallback ----------
type SignedEntry = { url: string; sourceUrl: string | null; expiresAt: string | null; name: string | null; cachedAt: number };
const signedCache = new Map<string, SignedEntry>();
const SIGNED_TTL_MS = 10 * 60_000;
type OdMedia = { id?: string; _id?: string; url?: string; sourceUrl?: string; name?: string; mimeType?: string };
/** Documented fetch-media = list only (no GET-by-id): page through `GET /media/v1/public/file` until the id matches (≤ 5 pages × 50). */
async function fetchOnDemandMedia(mediaId: string, externalUserId: string): Promise<SignedEntry | null> {
  const hit = signedCache.get(mediaId);
  if (hit && Date.now() - hit.cachedAt < SIGNED_TTL_MS && (!hit.expiresAt || Date.parse(hit.expiresAt) > Date.now() + 60_000)) return hit;
  if (!config.ondemandApiKey) return null;
  for (let page = 1; page <= 5; page++) {
    const u = `${config.ondemandBaseUrl}/media/v1/public/file?limit=50&page=${page}&sort=-createdAt&externalUserId=${encodeURIComponent(externalUserId)}`;
    const r = await fetch(u, { headers: { apikey: config.ondemandApiKey, accept: "application/json", "user-agent": ONDEMAND_USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`OnDemand fetch media HTTP ${r.status}`);
    const j: any = await r.json().catch(() => ({}));
    const list: OdMedia[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : Array.isArray(j?.data?.files) ? j.data.files : [];
    const m = list.find((x) => String(x.id ?? x._id ?? "") === mediaId);
    if (m && typeof m.url === "string") {
      const e: SignedEntry = { url: m.url, sourceUrl: unsignedUrl(m.sourceUrl ?? m.url), expiresAt: expiryFromSignedUrl(m.url), name: m.name ?? null, cachedAt: Date.now() };
      signedCache.set(mediaId, e);
      return e;
    }
    if (list.length < 50) break;
  }
  return null;
}
/** Version history: every non-deleted row sharing (name, thread_id) with :id, newest version first. */
inner.get("/artifacts/:id/versions", async (c) => {
  const { db } = await getDb();
  const r = db.select(artifactMeta).from(schema.artifacts).where(and(eq(schema.artifacts.id, c.req.param("id")), sql`${schema.artifacts.deletedAt} is null`)).get();
  if (!r) return err(c, 404, "not_found", `No artifact with id '${c.req.param("id")}'`);
  const conds = [sql`${schema.artifacts.deletedAt} is null`, eq(schema.artifacts.name, r.name), r.threadId ? eq(schema.artifacts.threadId, r.threadId) : sql`${schema.artifacts.threadId} is null`];
  const rows = db.select(artifactMeta).from(schema.artifacts).where(and(...conds)).orderBy(desc(schema.artifacts.version), desc(schema.artifacts.createdAt)).all();
  const data = rows.map((v) => ({ id: v.id, version: v.version, size_bytes: v.sizeBytes, created_at: v.createdAt, media_status: v.mediaStatus ?? null, media_id: v.mediaId ?? null, source: v.source, content_url: `${serverUrl(c)}/artifacts/${v.id}/content` }));
  return c.json({ data, name: r.name, thread_id: r.threadId ?? null, latest_version: data.reduce((m, v) => Math.max(m, v.version), 0) || r.version }, 200, { "cache-control": "no-store" });
});

inner.get("/artifacts/:id/signed-url", async (c) => {
  const { db } = await getDb();
  const r = db.select(artifactMeta).from(schema.artifacts).where(and(eq(schema.artifacts.id, c.req.param("id")), sql`${schema.artifacts.deletedAt} is null`)).get();
  if (!r) return err(c, 404, "not_found", `No artifact with id '${c.req.param("id")}'`);
  const fallbackUrl = `${serverUrl(c)}/artifacts/${r.id}/content${["1", "true"].includes(c.req.query("download") ?? "") ? "?download=1" : ""}`;
  const fallback = (media_message: string | null) => c.json({ data: { id: r.id, media_id: r.mediaId ?? null, url: fallbackUrl, source: "backend", source_url: r.mediaSourceUrl ?? null, expires_at: null, media_message } }, 200, { "cache-control": "no-store" });
  if (!r.mediaId) return fallback(r.mediaMessage ?? "No OnDemand media id for this artifact — served from the portfolio backend");
  if (!config.ondemandApiKey) return fallback("ONDEMAND_API_KEY is not configured on the server — served from the portfolio backend");
  try {
    const m = await fetchOnDemandMedia(r.mediaId, r.mediaExternalUserId ?? "INV-001");
    if (!m) return fallback(`OnDemand media ${r.mediaId} not found in the account's media list — served from the portfolio backend`);
    // Media registered by URL keeps OUR 2-hour blob relay as its url (no SAS at all) — that link dies; the backend copy is the durable one.
    if (/\/api\/media\/blob\//.test(m.url) && !/[?&](sig|se)=/.test(m.url)) return fallback(`OnDemand media ${r.mediaId} points at the expired upload relay — served from the portfolio backend`);
    return c.json({ data: { id: r.id, media_id: r.mediaId, url: m.url, source_url: m.sourceUrl ?? r.mediaSourceUrl ?? null, expires_at: m.expiresAt, source: "ondemand", media_message: null } }, 200, { "cache-control": "no-store" });
  } catch (e) {
    return fallback(`OnDemand media lookup failed: ${String((e as Error)?.message ?? e).slice(0, 160)} — served from the portfolio backend`);
  }
});

inner.delete("/artifacts/:id", async (c) => {
  const denied = requireIngestSecret(c); if (denied) return denied;
  const { db } = await getDb();
  const r = db.select(artifactMeta).from(schema.artifacts).where(and(eq(schema.artifacts.id, c.req.param("id")), sql`${schema.artifacts.deletedAt} is null`)).get();
  if (!r) return err(c, 404, "not_found", `No artifact with id '${c.req.param("id")}'`);
  const deletedAt = nowIso();
  // Soft-delete and drop the payload so the committed DB does not keep deleted bytes.
  db.update(schema.artifacts).set({ deletedAt, bytes: Buffer.alloc(0) }).where(eq(schema.artifacts.id, r.id)).run();
  persist();
  return c.json({ data: { id: r.id, deleted_at: deletedAt } });
});

inner.notFound((c) => err(c, 404, "not_found", `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}`));
inner.onError((e, c) => { console.error(e); return err(c, 500, "server_error", e.message); });
