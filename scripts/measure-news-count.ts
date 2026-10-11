/**
 * Measures the "one news count" from a live backend: raw Σ over GET /companies/{slug}/news?limit=1000, distinct ids, distinct urls,
 * distinct (company_slug,url) pairs, per-company duplicates, orphan items (/news/count), /health news_total and /news/summary.
 * Usage: npx tsx scripts/measure-news-count.ts [baseUrl] [outFile]
 */
const base = (process.argv[2] ?? "https://sb-51xmkpgnapk5.vercel.run").replace(/\/$/, "");
const out = process.argv[3] ?? "proof/data-lane/news-count-measurement.json";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const j = async (p: string) => { const r = await fetch(`${base}${p}`, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
(async () => {
  const health = await j("/health");
  const companies: { slug: string; name: string; news_count?: number }[] = [];
  for (let page = 1; ; page++) { const r = await j(`/companies?limit=200&page=${page}`); companies.push(...r.data); if (page >= r.pagination.total_pages) break; }
  const ids = new Set<string>(); const urls = new Set<string>(); const pairs = new Set<string>();
  let raw = 0; const dupPerCompany: Record<string, number> = {}; const perCompany: Record<string, number> = {}; const failed: string[] = [];
  const queue = [...companies];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let list: { id: string; url: string | null; title: string }[] = [];
      try { list = (await j(`/companies/${encodeURIComponent(c.slug)}/news?limit=1000`)).data; } catch (e) { failed.push(c.slug); continue; }
      raw += list.length; perCompany[c.slug] = list.length;
      const seen = new Set<string>();
      for (const n of list) {
        ids.add(n.id); if (n.url) urls.add(n.url);
        const k = `${c.slug}|${(n.url ?? n.title).trim().toLowerCase()}`;
        if (seen.has(k)) dupPerCompany[c.slug] = (dupPerCompany[c.slug] ?? 0) + 1; else { seen.add(k); pairs.add(k); }
      }
    }
  }));
  let count: any = null; let summary: any = null;
  try { count = await j("/news/count"); } catch (e) { count = { error: String(e) }; }
  try { summary = await j("/news/summary"); } catch (e) { summary = { error: String(e) }; }
  const result = {
    measured_at: new Date().toISOString(), base, companies: companies.length, failed_fetches: failed,
    health_news_total: health.news_total, news_count_total: count?.total ?? null, news_count_orphans: count?.orphan_items ?? null,
    raw_sum: raw, distinct_ids: ids.size, distinct_urls: urls.size, distinct_company_url_pairs: pairs.size,
    duplicates_removed_by_company_url: raw - pairs.size, duplicates_per_company: dupPerCompany,
    sum_of_company_news_count_field: companies.reduce((a, c) => a + (c.news_count ?? 0), 0),
    news_summary: summary,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2));
  const { duplicates_per_company, news_summary, ...brief } = result;
  console.log(JSON.stringify(brief, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
