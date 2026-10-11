#!/usr/bin/env tsx
/**
 * dedupe-news.ts — one-off: remove duplicate news_items rows under the single news-count definition
 * (same company_slug + same url, compared lower-cased/trimmed; rows without a url fall back to the title).
 * Keeps the EARLIEST row per key (min created_at, then id), deletes the rest, logs removed ids to proof/data-lane/news-dedupe.json.
 * Usage: DB_PATH=/tmp/lane-f.sqlite npx tsx scripts/dedupe-news.ts [--dry-run]
 */
import { sql } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "node:fs";
import { getDb, persist } from "../src/db/client.js";

const dry = process.argv.includes("--dry-run");
const { db } = await getDb();
const KEY_N = sql.raw("lower(trim(coalesce(nullif(n.url, ''), n.title)))");
const before = db.get<{ n: number }>(sql`select count(*) as n from news_items`)!.n;
const dups = db.all<{ id: string; company_slug: string; url: string | null; title: string; created_at: string; keep_id: string }>(sql`
  select n.id, n.company_slug, n.url, n.title, n.created_at,
    (select k.id from news_items k where k.company_slug = n.company_slug and lower(trim(coalesce(nullif(k.url, ''), k.title))) = ${KEY_N} order by k.created_at asc, k.id asc limit 1) as keep_id
  from news_items n
  where n.id != (select k.id from news_items k where k.company_slug = n.company_slug and lower(trim(coalesce(nullif(k.url, ''), k.title))) = ${KEY_N} order by k.created_at asc, k.id asc limit 1)
  order by n.company_slug, n.url`);
const orphans = db.all<{ id: string; company_slug: string }>(sql`select id, company_slug from news_items where company_slug not in (select slug from companies)`);
if (!dry) {
  for (const d of dups) db.run(sql`delete from news_items where id = ${d.id}`);
  for (const o of orphans) db.run(sql`delete from news_items where id = ${o.id}`);
  await persist();
}
const after = db.get<{ n: number }>(sql`select count(*) as n from news_items`)!.n;
const out = { at: new Date().toISOString(), db: process.env.DB_PATH ?? "data/portfolio.sqlite", dry_run: dry, rule: "keep earliest row per (company_slug, lower(trim(url|title))); drop orphan rows", before, removed_duplicates: dups.length, removed_orphans: orphans.length, after, removed: dups.map((d) => ({ removed_id: d.id, kept_id: d.keep_id, company_slug: d.company_slug, url: d.url, title: d.title })), orphan_ids: orphans.map((o) => o.id) };
mkdirSync("proof/data-lane", { recursive: true });
writeFileSync(`proof/data-lane/news-dedupe${dry ? "-dry-run" : ""}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, removed: out.removed.map((r) => `${r.company_slug}: -${r.removed_id} (kept ${r.kept_id})`) }, null, 2));
