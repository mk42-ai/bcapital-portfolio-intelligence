import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import crypto from "node:crypto";
import { sql, eq, and, like, desc, asc } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "./db/client.js";
import { config } from "./config.js";
import { buildOpenApi } from "./openapi.js";
import { labelFor, clampScore, normaliseEvidence, rollup } from "./sentiment.js";

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

function toApi(r: typeof schema.companies.$inferSelect) {
  return {
    id: r.id, name: r.name, matrix_name: r.matrixName, slug: r.slug, sector: r.sector, region: r.region, stage: r.stage, status: r.status, website: r.website,
    linkedin_url: r.linkedinUrl, hq: r.hq, employees: r.employees, logo_url: r.logoUrl, brand_tokens: r.brandTokens, b_capital_fund: r.bCapitalFund,
    b_capital_role: r.bCapitalRole, b_capital_round: r.bCapitalRound, estimated_ticket_size_usd: r.estimatedTicketSizeUsd, estimated_ownership_pct: r.estimatedOwnershipPct,
    estimate_confidence: r.estimateConfidence, estimate_rationale: r.estimateRationale, latest_news: r.latestNews, sentiment: r.sentiment, sources: r.sources,
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
  return c.json({ status: "ok", db_record_count: spec, db_record_count_total: total, last_ingest: lastRun ? { id: lastRun.id, source: lastRun.source, received_at: lastRun.receivedAt, status: lastRun.status } : null, model: config.ondemandDefaultModel, deferred_plugins: config.deferredPlugins, earliest_test_utc: config.earliestTestUtc || null, version: config.version, timestamp: nowIso() });
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
  return c.json({ data: rows.map(toApi), pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }, filters: { sector: sector ?? null, region: region ?? null, status: status ?? null, role: role ?? null, focus: focus === "true" }, timestamp: nowIso() });
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
  return c.json({ data: toApi(row), timestamp: nowIso() });
});

inner.get("/companies/:slug/news", async (c) => {
  const row = await findCompany(c.req.param("slug"));
  if (!row) return err(c, 404, "not_found", `No company with slug '${c.req.param("slug")}'`);
  const { db } = await getDb();
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20") || 20));
  const kind = c.req.query("kind");
  const conds = [eq(schema.newsItems.companySlug, row.slug)];
  if (kind) conds.push(eq(schema.newsItems.kind, kind));
  const items = db.select().from(schema.newsItems).where(and(...conds)).orderBy(desc(schema.newsItems.publishedAt), desc(schema.newsItems.createdAt)).limit(limit).all();
  return c.json({ company: row.slug, name: row.name, data: items.map((n) => ({ id: n.id, title: n.title, url: n.url, source: n.source, kind: n.kind, published_at: n.publishedAt, summary: n.summary, image_url: n.imageUrl, sentiment_score: n.sentimentScore, ingest_run_id: n.ingestRunId })), timestamp: nowIso() });
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

inner.post("/ingest", async (c) => {
  // Primary: X-Ingest-Secret header. The Flow Builder webhook-delivery schema (live docs: url, method, basicAuth — no custom
  // headers) cannot set it, so the same secret is also accepted as HTTP Basic password (username 'ingest') or ?secret=.
  let secret = c.req.header("x-ingest-secret") ?? "";
  const auth = c.req.header("authorization") ?? "";
  if (!secret && /^basic /i.test(auth)) { try { const [, pw] = Buffer.from(auth.slice(6), "base64").toString().split(/:(.*)/s); secret = pw ?? ""; } catch { /* ignore */ } }
  if (!secret) secret = c.req.query("secret") ?? "";
  if (!config.ingestSecret) return err(c, 503, "resource_unavailable", "INGEST_SECRET is not configured on the server");
  if (!secret || !timingSafeEqual(secret, config.ingestSecret)) return err(c, 401, "unauthenticated", "Missing or invalid X-Ingest-Secret");
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

inner.notFound((c) => err(c, 404, "not_found", `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}`));
inner.onError((e, c) => { console.error(e); return err(c, 500, "server_error", e.message); });
