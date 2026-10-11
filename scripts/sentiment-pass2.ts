#!/usr/bin/env tsx
/**
 * sentiment-pass2.ts — deterministic second sentiment scoring pass (rule "rule:news-mean-v1") over the STORED news corpus only.
 *
 * Usage: INGEST_SECRET=… tsx scripts/sentiment-pass2.ts <baseUrl> [slug,slug,…|all] [--out proof/data-lane/x.json] [--label local|live]
 *   default slugs: perplexity-ai, apptronik, fervo-energy, flutterwave, writer. `all` = every company in the DB (137).
 *   DB read from DB_PATH (default data/portfolio.sqlite) — for a LOCAL run point the server at the same file.
 *   No web search / no fabricated articles: the only input is news_items (2026-10-11 the owner's step-2 web search returned ZERO sources).
 *
 * Rule (in order, first that applies):
 *   R1 "news-mean"   — mean of the non-null news_items.sentiment_score among the company's latest ≤20 items
 *                      (ordered published_at desc, created_at desc). Score clamped to −1…+1 via sentiment.clampScore,
 *                      label via sentiment.labelFor. Evidence = those scored items (url + title).
 *   R2 "evidence-mean" — no scored news in the latest 20: fall back to the latest ≤20 scored items of any age.
 *   R3 "carry"       — no scored news at all: re-emit the current companies.sentiment score (delta 0, explicit).
 * Per company the report records prior_run_at (= recorded_at of the latest sentiment_history row BEFORE this ingest, i.e. the
 * row /ingest computes the delta against), prior_score, the rule and the items used. After the POST the script reads back
 * <base>/companies/{slug}/sentiment for the focus slugs (+ /companies?limit=200 for the null-delta count) so scored_at and the
 * server-side delta come from the server, not from this script.
 * POST body: {workflow_name:"sentiment-pass-2", model:"rule:news-mean-v1", run_at, prior_runs:{slug:prior_run_at}, companies:[{slug, sentiment:{score,label,evidence}, rule, prior_run_at}]}
 */
import fs from "node:fs";
import path from "node:path";
import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getDb, schema } from "../src/db/client.js";
import { clampScore, labelFor } from "../src/sentiment.js";

const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const base = (positional[0] ?? "").replace(/\/$/, "");
if (!base) throw new Error("usage: sentiment-pass2.ts <baseUrl> [slugs,comma,separated|all] [--out file.json] [--label x]");
const secret = process.env.INGEST_SECRET; if (!secret) throw new Error("INGEST_SECRET not set");
const label = flag("--label") ?? "run";
const FOCUS = ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer", "perplexity-ai"];

const { db } = await getDb();
const slugArg = positional[1] ?? "perplexity-ai,apptronik,fervo-energy,flutterwave,writer";
const slugs = slugArg === "all" ? db.select({ slug: schema.companies.slug }).from(schema.companies).all().map((r) => r.slug) : slugArg.split(",").map((s) => s.trim()).filter(Boolean);

const companies: any[] = []; const report: any[] = []; const priorRuns: Record<string, string | null> = {};
for (const slug of slugs) {
  const order = [desc(schema.newsItems.publishedAt), desc(schema.newsItems.createdAt)];
  const latest = db.select().from(schema.newsItems).where(eq(schema.newsItems.companySlug, slug)).orderBy(...order).limit(20).all();
  let scored = latest.filter((n) => n.sentimentScore !== null && Number.isFinite(n.sentimentScore));
  let rule = "R1 news-mean (latest<=20, non-null sentiment_score)";
  if (!scored.length) {
    scored = db.select().from(schema.newsItems).where(and(eq(schema.newsItems.companySlug, slug), isNotNull(schema.newsItems.sentimentScore))).orderBy(...order).limit(20).all();
    rule = "R2 evidence-mean (latest<=20 scored items of any age)";
  }
  const c = db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).get();
  if (!c) { report.push({ slug, error: "unknown slug" }); continue; }
  let score: number;
  if (scored.length) score = clampScore(scored.reduce((a, n) => a + (n.sentimentScore as number), 0) / scored.length);
  else { score = clampScore(c.sentiment?.score ?? 0); rule = "R3 carry (no scored news)"; }
  const prev = db.select().from(schema.sentimentHistory).where(eq(schema.sentimentHistory.companySlug, slug)).orderBy(desc(schema.sentimentHistory.recordedAt), desc(schema.sentimentHistory.id)).limit(1).get();
  const prior_run_at = prev?.recordedAt ?? null; priorRuns[slug] = prior_run_at;
  const evidence = scored.slice(0, 10).map((n) => ({ url: n.url ?? "", quote: `${n.title} (item sentiment ${n.sentimentScore})`, source: n.source ?? undefined }));
  companies.push({ slug, sentiment: { score, label: labelFor(score), evidence }, rule, prior_run_at });
  report.push({ slug, name: c.name, rule, latest_items: latest.length, items_used: scored.length, score, label: labelFor(score), prior_run_at, prior_score: prev?.score ?? null, prior_run_id: prev?.ingestRunId ?? null, expected_delta: prev ? +(score - prev.score).toFixed(4) : null, delta_before_pass: c.sentiment?.delta ?? null });
}
const nullBefore = report.filter((r) => !r.error && r.delta_before_pass === null).length;
const run_at = new Date().toISOString();
const body = { workflow_name: "sentiment-pass-2", model: "rule:news-mean-v1", run_at, corpus: "stored news_items only (no web search)", prior_runs: priorRuns, companies };
const r = await fetch(`${base}/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": secret }, body: JSON.stringify(body) });
const txt = await r.text();
let ingest: any = null; try { ingest = JSON.parse(txt); } catch { /* keep text */ }

// Read back from the server: scored_at / delta for the focus slugs, null-delta count over all companies.
const readback: Record<string, any> = {};
if (r.ok) {
  for (const slug of FOCUS.filter((s) => slugs.includes(s))) {
    try {
      const j: any = await (await fetch(`${base}/companies/${slug}/sentiment`)).json();
      const h0 = j.history?.[0]; const h1 = j.history?.[1];
      readback[slug] = { score: j.current?.score, delta: j.delta, scored_at: h0?.recorded_at ?? null, prior_run_at: h1?.recorded_at ?? null, model: h0?.model ?? null, history_rows: j.history?.length ?? 0 };
    } catch (e) { readback[slug] = { error: String(e) }; }
  }
}
let nullAfter: number | null = null; let companiesSeen: number | null = null;
if (r.ok) {
  try { const j: any = await (await fetch(`${base}/companies?limit=200`)).json(); companiesSeen = j.data.length; nullAfter = j.data.filter((c: any) => c.sentiment?.delta === null || c.sentiment?.delta === undefined).length; } catch { /* ignore */ }
}
const out = { at: new Date().toISOString(), label, base, run_at, status: r.status, ingest_run_id: ingest?.ingest_run_id ?? null, response: ingest ?? txt.slice(0, 600), companies_scored: companies.length, rules: Object.fromEntries(["R1", "R2", "R3"].map((k) => [k, report.filter((x) => String(x.rule).startsWith(k)).length])), null_delta_before: nullBefore, null_delta_after: nullAfter, companies_seen_after: companiesSeen, focus: FOCUS.map((s) => ({ ...(report.find((x) => x.slug === s) ?? { slug: s }), server: readback[s] ?? null })), report };
const outFile = flag("--out");
if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(out, null, 2)); }
console.log(JSON.stringify({ ...out, report: undefined }, null, 2));
if (!r.ok) process.exit(1);
