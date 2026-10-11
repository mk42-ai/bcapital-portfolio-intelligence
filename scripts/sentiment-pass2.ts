#!/usr/bin/env tsx
/**
 * sentiment-pass2.ts — deterministic second sentiment scoring pass (rule "rule:news-mean-v1").
 *
 * Usage: INGEST_SECRET=… tsx scripts/sentiment-pass2.ts <baseUrl> [slug,slug,…]
 *   default slugs: perplexity-ai, apptronik, fervo-energy, flutterwave, writer (the five with a single sentiment_history row,
 *   so their delta was null). DB read from DB_PATH (default data/portfolio.sqlite) — point the server at the same file.
 *
 * Rule (in order, first that applies):
 *   R1 "news-mean"   — mean of the non-null news_items.sentiment_score among the company's latest ≤20 items
 *                      (ordered published_at desc, created_at desc). Score clamped to −1…+1 via sentiment.clampScore,
 *                      label via sentiment.labelFor. Evidence = those scored items (url + title).
 *   R2 "evidence-mean" — no scored news in the latest 20: fall back to the latest ≤20 scored items of any age.
 *   R3 "carry"       — no scored news at all: re-emit the current companies.sentiment score (delta 0, explicit).
 * Then POSTs {workflow_name:"sentiment-pass-2", model:"rule:news-mean-v1", companies:[{slug, sentiment:{score,label,evidence}}]}
 * to <baseUrl>/ingest with X-Ingest-Secret; /ingest computes delta vs the previous sentiment_history row.
 */
import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getDb, schema } from "../src/db/client.js";
import { clampScore, labelFor } from "../src/sentiment.js";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) throw new Error("usage: sentiment-pass2.ts <baseUrl> [slugs,comma,separated]");
const slugs = (process.argv[3] ?? "perplexity-ai,apptronik,fervo-energy,flutterwave,writer").split(",").map((s) => s.trim()).filter(Boolean);
const secret = process.env.INGEST_SECRET; if (!secret) throw new Error("INGEST_SECRET not set");

const { db } = await getDb();
const companies: any[] = []; const report: any[] = [];
for (const slug of slugs) {
  const order = [desc(schema.newsItems.publishedAt), desc(schema.newsItems.createdAt)];
  const latest = db.select().from(schema.newsItems).where(eq(schema.newsItems.companySlug, slug)).orderBy(...order).limit(20).all();
  let scored = latest.filter((n) => n.sentimentScore !== null && Number.isFinite(n.sentimentScore));
  let rule = "R1 news-mean (latest<=20, non-null sentiment_score)";
  if (!scored.length) {
    scored = db.select().from(schema.newsItems).where(and(eq(schema.newsItems.companySlug, slug), isNotNull(schema.newsItems.sentimentScore))).orderBy(...order).limit(20).all();
    rule = "R2 evidence-mean (latest<=20 scored items of any age)";
  }
  let score: number;
  if (scored.length) score = clampScore(scored.reduce((a, n) => a + (n.sentimentScore as number), 0) / scored.length);
  else {
    const c = db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).get();
    if (!c) { report.push({ slug, error: "unknown slug" }); continue; }
    score = clampScore(c.sentiment?.score ?? 0); rule = "R3 carry (no scored news)";
  }
  const evidence = scored.slice(0, 10).map((n) => ({ url: n.url ?? "", quote: `${n.title} (item sentiment ${n.sentimentScore})`, source: n.source ?? undefined }));
  companies.push({ slug, sentiment: { score, label: labelFor(score), evidence } });
  report.push({ slug, rule, latest_items: latest.length, scored_items: scored.length, score, label: labelFor(score) });
}
const body = { workflow_name: "sentiment-pass-2", model: "rule:news-mean-v1", run_at: new Date().toISOString(), companies };
const r = await fetch(`${base}/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": secret }, body: JSON.stringify(body) });
const txt = await r.text();
console.log(JSON.stringify({ at: new Date().toISOString(), base, status: r.status, report, response: txt.slice(0, 600) }, null, 2));
if (!r.ok) process.exit(1);
