#!/usr/bin/env tsx
/**
 * news-reconciliation.ts — computed (never estimated) news reconciliation over the backend DB.
 *
 * Usage: DB_PATH=data/portfolio.sqlite tsx scripts/news-reconciliation.ts [as_of=YYYY-MM-DD] [out_prefix]
 *   default as_of 2026-10-11, default out proof/data-lane/news-reconciliation-<as_of>
 *
 * Reuses the SAME SQL as GET /news/reconciliation (src/app.ts newsReconciliation) so the proof file and the live route
 * agree by construction. Writes <out_prefix>.json and <out_prefix>.md.
 *
 * Definitions (per company_slug, over news_items):
 *   raw            count(*) — every ingested row, orphans included in the all_rows totals
 *   dedup_url      distinct lower(trim(url)) among rows with a url + every row without a url counted once each
 *   dedup_title    distinct lower(trim(title))
 *   summary_def    distinct lower(trim(coalesce(nullif(url,''), title))) — the /news/summary rule (news_total)
 *   in_window_30d  published_at (first 10 chars) >= as_of − 30 d; in_window_7d likewise with 7 d (undated rows are OUT of window)
 *   no_url         rows whose url is null/empty; no_date rows whose published_at is null/empty
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/client.js";
import { newsReconciliation, NEWS_TOTAL_DEFINITION } from "../src/app.js";

const asOf = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] ?? "") ? process.argv[2] : "2026-10-11";
const outPrefix = process.argv[3] ?? path.resolve("proof/data-lane", `news-reconciliation-${asOf}`);
const { db } = await getDb();
const rec = newsReconciliation(db, asOf);
const generated_at = new Date().toISOString();
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
fs.writeFileSync(outPrefix + ".json", JSON.stringify({ generated_at, db_path: process.env.DB_PATH ?? "data/portfolio.sqlite", ...rec }, null, 2));

const row = (r: any) => `| ${r.slug} | ${r.raw} | ${r.dedup_url} | ${r.dedup_title} | ${r.in_window_30d} | ${r.in_window_7d} | ${r.no_url} | ${r.summary_def} |`;
const hdr = "| company | raw | deduped(url) | deduped(title) | in-window-30d | in-window-7d | no-url | definition used by /news/summary |\n|---|---|---|---|---|---|---|---|";
const tot = (name: string, t: any) => `| **${name}** | ${t.raw} | ${t.dedup_url} | ${t.dedup_title} | ${t.in_window_30d} | ${t.in_window_7d} | ${t.no_url} | ${t.summary_def} |`;
const of = rec.owner_figures;
const md = `# News reconciliation — ${asOf} (computed from news_items, generated ${generated_at})

Definition used by \`/news/summary\` (= \`news_total\` on /health and /companies): ${NEWS_TOTAL_DEFINITION}.
Windows: 30 d = published_at ≥ ${rec.windows.d30_from}, 7 d = published_at ≥ ${rec.windows.d7_from}; undated rows (${rec.totals.all_rows.no_date}) fall outside both windows.
Companies in DB: ${rec.companies}; companies with ≥1 news row: ${rec.companies_with_news}; orphan rows (company_slug not in companies): ${rec.totals.orphan_rows} ${rec.totals.orphan_slugs.length ? `(${rec.totals.orphan_slugs.join(", ")})` : ""}.

## Focus companies + totals

${hdr}
${rec.focus.map(row).join("\n")}
${tot("all 137 (listed companies)", rec.totals.listed_companies)}
${tot("all rows incl. orphans", rec.totals.all_rows)}

## The three figures the owner saw

| figure | what it was | now | verdict |
|---|---|---|---|
| **2,104 raw** | Σ \`/companies/{slug}/news?limit=1000\` before de-dup | raw rows now **${of.raw_2104.now_raw_rows}**; \`/news/summary.total\` = **${rec.news_summary_total}** | ${of.raw_2104.note} |
| **182** | legacy \`latest_news\` embedded count | Σ len(latest_news) over /companies = **${rec.legacy_latest_news.embedded_total}** (observed per-company cap **${rec.legacy_latest_news.per_company_cap_observed}**, code cap ${rec.legacy_latest_news.cap_in_code}) | ${of.embedded_182.note} |
| **150 = 19+33+37+38+23** | inspector per-company news_count for aimotive, apptronik, fervo-energy, flutterwave, writer | ${Object.entries(of.focus_150.now_parts).map(([k, v]) => `${k} ${v}`).join(" + ")} = **${of.focus_150.now_sum}** | ${of.focus_150.matches ? "sums to 150 — reproduces exactly under the /news/summary rule" : `does not sum to 150 (now ${of.focus_150.now_sum}); differences come from the de-dup pass / later ingests — compare per-company columns above`} |

## All companies

${hdr}
${rec.by_company.map(row).join("\n")}
`;
fs.writeFileSync(outPrefix + ".md", md);
console.log(JSON.stringify({ generated_at, as_of: asOf, out: [outPrefix + ".json", outPrefix + ".md"], news_summary_total: rec.news_summary_total, totals: rec.totals, legacy_latest_news: rec.legacy_latest_news, owner_figures: rec.owner_figures, focus: rec.focus }, null, 2));
