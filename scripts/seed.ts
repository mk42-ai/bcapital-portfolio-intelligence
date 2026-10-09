import fs from "node:fs";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "../src/db/client.js";

const seedPath = process.argv[2] ?? "data/seed.json";
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const { db } = await getDb();
const now = nowIso();
const runId = `seed-${now}`;

db.delete(schema.companies).run();
db.delete(schema.newsItems).run();
db.delete(schema.sentimentHistory).run();
db.delete(schema.sectorRollups).run();

let news = 0;
for (const c of seed.companies) {
  db.insert(schema.companies).values({
    id: c.id, name: c.name, matrixName: c.matrix_name, slug: c.slug, sector: c.sector, sectorRaw: c.sector_raw, region: c.region, stage: c.stage,
    status: c.status, website: c.website, linkedinUrl: c.linkedin_url, hq: c.hq, employees: c.employees, logoUrl: c.logo_url, brandTokens: c.brand_tokens,
    bCapitalFund: c.b_capital_fund, bCapitalRole: c.b_capital_role, bCapitalRound: c.b_capital_round, estimatedTicketSizeUsd: c.estimated_ticket_size_usd,
    estimatedOwnershipPct: c.estimated_ownership_pct, estimateConfidence: c.estimate_confidence, estimateRationale: c.estimate_rationale,
    latestNews: c.latest_news, sentiment: c.sentiment, sources: c.sources, screenshotRef: c.screenshot_ref, anonResolution: c.anon_resolution,
    isFocus: !!c.is_focus, inBrandMatrix: !!c.in_brand_matrix, lastChecked: c.last_checked, createdAt: now, updatedAt: now,
  }).run();
  for (const n of c.latest_news ?? []) {
    const id = n.id ?? "n-" + crypto.createHash("sha1").update(c.slug + "|" + (n.url ?? n.title)).digest("hex").slice(0, 16);
    db.insert(schema.newsItems).values({ id, companySlug: c.slug, title: n.title, url: n.url ?? null, source: n.source ?? null, kind: n.kind ?? "news", publishedAt: n.published_at ?? null, summary: n.summary ?? null, imageUrl: n.image_url ?? null, sentimentScore: null, ingestRunId: runId, createdAt: now }).onConflictDoNothing().run();
    news++;
  }
  db.insert(schema.sentimentHistory).values({ companySlug: c.slug, score: c.sentiment.score, label: c.sentiment.label, evidence: c.sentiment.evidence ?? [], delta: null, model: "seed", workflowId: null, executionId: null, ingestRunId: runId, recordedAt: now }).run();
}

// Initial roll-ups (portfolio + per sector + per region), excluding the firm record itself.
const rows = db.select().from(schema.companies).all().filter((r) => r.bCapitalRole !== "firm");
function label(s: number) { return s <= -0.6 ? "very negative" : s <= -0.2 ? "negative" : s < 0.2 ? "neutral" : s < 0.6 ? "positive" : "very positive"; }
function rollup(scope: string, key: string, list: typeof rows) {
  const avg = list.length ? list.reduce((a, r) => a + r.sentiment.score, 0) / list.length : 0;
  const movers = [...list].sort((a, b) => Math.abs(b.sentiment.score) - Math.abs(a.sentiment.score)).slice(0, 5).map((r) => ({ slug: r.slug, name: r.name, score: r.sentiment.score, delta: 0 }));
  db.insert(schema.sectorRollups).values({ scope, key, companyCount: list.length, avgScore: +avg.toFixed(4), label: label(avg), delta: null, topMovers: movers, ingestRunId: runId, computedAt: now }).run();
}
rollup("portfolio", "ALL", rows);
for (const s of new Set(rows.map((r) => r.sector))) rollup("sector", s, rows.filter((r) => r.sector === s));
for (const g of new Set(rows.map((r) => r.region))) rollup("region", g, rows.filter((r) => r.region === g));

db.insert(schema.ingestRuns).values({ id: runId, source: "seed", workflowId: null, workflowName: null, executionId: null, model: "seed", companiesTouched: seed.companies.length, newsUpserted: news, sentimentRows: seed.companies.length, status: "ok", errors: [], rawSample: null, receivedAt: now, finishedAt: nowIso() }).run();
persist();
const count = db.get<{ n: number }>(sql`select count(*) as n from companies`)!.n;
const specCount = db.get<{ n: number }>(sql`select count(*) as n from companies where in_brand_matrix = 1 or slug = 'b-capital'`)!.n;
console.log(JSON.stringify({ ok: true, db_record_count_total: count, db_record_count_spec: specCount, news_items: news, seeded_at: now }));
