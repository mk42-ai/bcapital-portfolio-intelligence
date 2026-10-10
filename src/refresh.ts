/**
 * Live news refresh through the OnDemand Chat API (Perplexity plugin) — no Flow Builder round-trip.
 *
 * Per company: create a chat session → stream a query → collect `plugin_sources` items (title/url/domain/imageUrl)
 * and the fulfillment answer text → match published dates from the answer → backfill og:image for items without an
 * image → upsert news_items + companies.latest_news → one ingest_runs row (source "refresh").
 *
 * Stream shape (observed, not documented): SSE frames `event:<heartbeat|thinking|message>` + `data:{...}`;
 * eventType ∈ planning_*, step_*, plugin_sources, fulfillment_thinking, fulfillment, metricsLog; terminal `data:[DONE]`.
 * The first fulfillment token typically arrives 40–70 s after the query (Perplexity research phase).
 */
import crypto from "node:crypto";
import { sql, eq, asc, desc } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "./db/client.js";
import { config } from "./config.js";

export const ONDEMAND_BASE = process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io";
export const NEWS_PLUGIN_ID = process.env.ONDEMAND_NEWS_PLUGIN_ID ?? "plugin-1722260873"; // Perplexity
export const NEWS_PLUGIN_IDS = (process.env.ONDEMAND_NEWS_PLUGIN_IDS ?? `${NEWS_PLUGIN_ID},plugin-1741871229`).split(",").map((x) => x.trim()).filter(Boolean); // Perplexity first, GPT Search fallback (Perplexity credits ran out 2026-10-10T01:03Z)
const STREAM_TIMEOUT_MS = 120_000;
const OG_TIMEOUT_MS = 6_000;
const OG_MAX_BYTES = 200 * 1024;

export type RefreshOptions = { slugs?: string[]; limit?: number; concurrency?: number };
export type RefreshNewsItem = { id: string; company_slug: string; title: string; url: string; source: string | null; published_at: string | null; image_url: string | null; fetched_at: string };
export type RefreshResult = {
  ingest_run_id: string;
  status: "ok" | "partial" | "error";
  companies_touched: number;
  news_upserted: number;
  with_images: number;
  dated: number;
  errors: string[];
  companies: { slug: string; name: string; session_id: string | null; items: number; with_images: number; dated: number; ms: number; error?: string }[];
  items: RefreshNewsItem[];
  started_at: string;
  finished_at: string;
};

type SourceItem = { title: string; url: string; domain?: string; imageUrl?: string };

let running: Promise<RefreshResult> | null = null;
let lastResult: RefreshResult | null = null;
let nextScheduledAt: string | null = null;
export function setNextScheduledAt(iso: string | null): void { nextScheduledAt = iso; }
export function getRefreshState() { return { running: running !== null, last: lastResult, next_scheduled_at: nextScheduledAt }; }

function apiKey(): string {
  const k = process.env.ONDEMAND_API_KEY ?? "";
  if (!k) throw new Error("ONDEMAND_API_KEY is not configured");
  return k;
}

async function createSession(): Promise<string> {
  const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions`, {
    method: "POST",
    headers: { apikey: apiKey(), "content-type": "application/json" },
    body: JSON.stringify({ externalUserId: "refresh-bot", pluginIds: NEWS_PLUGIN_IDS, contextMetadata: [{ key: "purpose", value: "portfolio-news-refresh" }] }),
  });
  if (!res.ok) throw new Error(`session create failed: HTTP ${res.status}`);
  const json: any = await res.json();
  const id = json?.data?.id ?? json?.id;
  if (!id) throw new Error("session create: no id in response");
  return String(id);
}

/** Streams the query and returns the collected plugin sources + the concatenated answer. */
async function streamQuery(sessionId: string, query: string): Promise<{ sources: SourceItem[]; answer: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  const sources: SourceItem[] = [];
  let answer = "";
  try {
    const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions/${sessionId}/query`, {
      method: "POST",
      headers: { apikey: apiKey(), "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ query, endpointId: process.env.ONDEMAND_DEFAULT_MODEL || config.ondemandDefaultModel || "predefined-claude-fable-5.1", responseMode: "stream", pluginIds: NEWS_PLUGIN_IDS, modelConfigs: { temperature: 0.1 } }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`query failed: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const handle = (line: string) => {
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      let f: any; try { f = JSON.parse(payload); } catch { return; }
      if (f?.eventType === "plugin_sources" && Array.isArray(f?.sources?.items)) {
        for (const it of f.sources.items) if (it?.url && it?.title) sources.push({ title: String(it.title), url: String(it.url), domain: it.domain ? String(it.domain) : undefined, imageUrl: it.imageUrl ? String(it.imageUrl) : undefined });
      } else if (f?.eventType === "fulfillment" && typeof f?.answer === "string") {
        answer += f.answer;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).replace(/\r$/, "")); buf = buf.slice(nl + 1); }
    }
    if (buf) handle(buf);
  } finally {
    clearTimeout(timer);
  }
  // Fallback for plugins that return no `plugin_sources` frames (e.g. GPT Search, or Perplexity when its credits are exhausted and the
  // model answers from another source): mine "**Title** … URL: https://…" style items out of the answer text. Images are back-filled
  // from og:image later; the date extractor works on the same answer text.
  if (sources.length === 0 && answer) {
    const seen = new Set<string>();
    for (const m of answer.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
      const url = m[0].replace(/[.,;:!?]+$/, "");
      if (seen.has(url)) continue; seen.add(url);
      const before = answer.slice(Math.max(0, m.index! - 600), m.index!);
      const bold = [...before.matchAll(/\*\*([^*\n]{8,160})\*\*/g)].pop();
      const title = (bold ? bold[1] : (before.split("\n").filter((l) => l.trim()).pop() || "")).replace(/^[-*\d.\s]+/, "").replace(/^(Title|URL|Source)\s*:\s*/i, "").trim();
      if (!title || /^(url|source|date)$/i.test(title)) continue;
      if (/did not appear|no (new|additional)|not (found|covered)|outside (the|this) window|^summary$/i.test(title) || title.endsWith(":")) continue;
      let domain: string | undefined; try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
      if (/credits|internal server error/i.test(title)) continue;
      sources.push({ title: title.slice(0, 200), url, domain });
      if (sources.length >= 8) break;
    }
  }
  return { sources, answer };
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };
const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b|\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi;
function normDate(m: RegExpMatchArray): string | null {
  let y: string, mo: string, d: string;
  if (m[1]) { y = m[1]; mo = m[2]; d = m[3]; }
  else if (m[4]) { y = m[6]; mo = MONTHS[m[4].toLowerCase()]; d = m[5].padStart(2, "0"); }
  else { y = m[9]; mo = MONTHS[m[8].toLowerCase()]; d = m[7].padStart(2, "0"); }
  if (!mo) return null;
  const iso = `${y}-${mo}-${d}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

/** Finds a published date in the answer text near the item's URL or title (±400 chars window; nearest date wins). */
export function extractDate(answer: string, item: SourceItem): string | null {
  if (!answer) return null;
  const lower = answer.toLowerCase();
  const anchors: number[] = [];
  const u = item.url.toLowerCase().replace(/\/$/, "");
  for (let i = lower.indexOf(u); i >= 0; i = lower.indexOf(u, i + 1)) anchors.push(i);
  if (!anchors.length) { try { const p = new URL(item.url).pathname.replace(/\/$/, "").toLowerCase(); if (p.length > 12) for (let i = lower.indexOf(p); i >= 0; i = lower.indexOf(p, i + 1)) anchors.push(i); } catch { /* ignore */ } }
  if (!anchors.length) {
    const t = norm(item.title).split(" ").filter((w) => w.length > 3).slice(0, 6).join(" ");
    const normAns = norm(answer);
    if (t.length >= 12) { const i = normAns.indexOf(t); if (i >= 0) anchors.push(Math.min(answer.length - 1, Math.round((i / Math.max(1, normAns.length)) * answer.length))); }
    if (!anchors.length) { const first = norm(item.title).split(" ").filter((w) => w.length > 4).slice(0, 3).join(" "); if (first.length >= 10) { const i = normAns.indexOf(first); if (i >= 0) anchors.push(Math.round((i / Math.max(1, normAns.length)) * answer.length)); } }
  }
  if (!anchors.length) return null;
  const dates: { idx: number; iso: string }[] = [];
  for (const m of answer.matchAll(DATE_RE)) { const iso = normDate(m); if (iso && m.index !== undefined) dates.push({ idx: m.index, iso }); }
  if (!dates.length) return null;
  let best: { dist: number; iso: string } | null = null;
  for (const a of anchors) for (const d of dates) { const dist = Math.abs(d.idx - a); if (dist <= 400 && (!best || dist < best.dist)) best = { dist, iso: d.iso }; }
  return best?.iso ?? null;
}

/** A published date is only kept when it is not in the future (event listings and "save the date" pages otherwise surface as the newest news) and not older than 3 years. */
export function plausibleDate(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime(); // tolerate timezone-ahead "today"
  if (t > today) return null;
  if (t < now.getTime() - 3 * 365.25 * 86_400_000) return null;
  return iso;
}

/** Fallback date from the URL path (/2026/09/24/ or /2026/09/ → first of month) or a -YYYY-MM-DD slug. */
export function dateFromUrl(url: string): string | null {
  const m = url.match(/\/(20\d{2})\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?\//) ?? url.match(/[-_/](20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[-_/.]|$)/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** GET the article (6 s, ≤200 KB, browser UA) and read og:image / twitter:image + article:published_time / datePublished. */
export async function fetchPageMeta(url: string): Promise<{ image: string | null; published: string | null }> {
  const none = { image: null, published: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OG_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", accept: "text/html,*/*" } });
    if (!res.ok || !res.body) return none;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let html = "";
    while (html.length < OG_MAX_BYTES) { const { value, done } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); }
    try { await reader.cancel(); } catch { /* ignore */ }
    const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
    const pick = (keys: string[]) => {
      for (const m of metas) {
        const attrs = m.toLowerCase();
        if (!keys.some((k) => attrs.includes(`property="${k}"`) || attrs.includes(`name="${k}"`) || attrs.includes(`property='${k}'`) || attrs.includes(`name='${k}'`))) continue;
        const c = m.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
        const v = (c?.[2] ?? c?.[3] ?? "").trim();
        if (v) return v;
      }
      return null;
    };
    const img = pick(["og:image", "og:image:secure_url"]) ?? pick(["twitter:image", "twitter:image:src"]);
    let image: string | null = null;
    if (img) { try { image = new URL(img.replace(/&amp;/g, "&"), url).toString(); } catch { image = null; } }
    let pub = pick(["article:published_time", "og:article:published_time", "datepublished", "date", "pubdate", "publish-date", "parsely-pub-date", "sailthru.date", "dc.date", "dc.date.issued"]);
    if (!pub) { const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i); pub = ld?.[1] ?? null; }
    if (!pub) { const t = html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i); pub = t?.[1] ?? null; }
    let published: string | null = null;
    if (pub) { const ms = Date.parse(pub); if (!Number.isNaN(ms)) published = new Date(ms).toISOString().slice(0, 10); else { const m = pub.match(/^(\d{4}-\d{2}-\d{2})/); published = m?.[1] ?? null; } }
    return { image, published };
  } catch {
    return none;
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchOgImage(url: string): Promise<string | null> { return (await fetchPageMeta(url)).image; }

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => { for (;;) { const idx = i++; if (idx >= items.length) return; out[idx] = await fn(items[idx]); } });
  await Promise.all(workers);
  return out;
}

/** Refreshes news for the given slugs (or the `limit` stalest companies by updated_at). Serialised: a second call joins the in-flight run. */
export function refreshCompanies(opts: RefreshOptions = {}): Promise<RefreshResult> {
  if (running) return running;
  running = doRefresh(opts).finally(() => { running = null; });
  return running;
}

async function doRefresh(opts: RefreshOptions): Promise<RefreshResult> {
  const { db } = await getDb();
  const startedAt = nowIso();
  const runId = `rf-${startedAt.replace(/[:.]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 6));
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
  const notFirm = sql`${schema.companies.bCapitalRole} != 'firm'`;
  let targets: (typeof schema.companies.$inferSelect)[];
  const errors: string[] = [];
  if (opts.slugs?.length) {
    targets = [];
    for (const s of opts.slugs.map((x) => String(x).trim().toLowerCase()).filter(Boolean)) {
      const row = db.select().from(schema.companies).where(eq(schema.companies.slug, s)).get();
      if (!row) errors.push(`unknown slug: ${s}`); else if (row.bCapitalRole === "firm") errors.push(`skipped firm record: ${s}`); else targets.push(row);
    }
    targets = targets.slice(0, limit);
  } else {
    targets = db.select().from(schema.companies).where(notFirm).orderBy(asc(schema.companies.updatedAt), asc(schema.companies.id)).limit(limit).all();
  }

  const items: RefreshNewsItem[] = [];
  const perCompany = await mapLimit(targets, concurrency, async (row) => {
    const t0 = Date.now();
    const rep = { slug: row.slug, name: row.name, session_id: null as string | null, items: 0, with_images: 0, dated: 0, ms: 0, error: undefined as string | undefined };
    try {
      const sid = await createSession();
      rep.session_id = sid;
      const query = `Latest news about ${row.name} (${row.website ?? "no website on file"}) from the last 60 days. List up to 6 items, newest first, each as: title — source — published date (YYYY-MM-DD) — URL.`;
      const { sources, answer } = await streamQuery(sid, query);
      // Dedupe by URL, keep order of first appearance, cap at 12 per company.
      const seen = new Set<string>();
      const uniq = sources.filter((s) => { const k = s.url.replace(/\/$/, ""); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
      const fetchedAt = nowIso();
      const recs = await mapLimit(uniq, 3, async (s) => {
        let image = s.imageUrl?.trim() || null;
        let published = plausibleDate(extractDate(answer, s) ?? dateFromUrl(s.url));
        if (!image || !published) { const meta = await fetchPageMeta(s.url); image = image ?? meta.image; published = published ?? plausibleDate(meta.published); }
        let source = s.domain ?? null; if (!source) { try { source = new URL(s.url).hostname; } catch { source = null; } }
        const id = "n-" + crypto.createHash("sha1").update(row.slug + "|" + s.url).digest("hex").slice(0, 16);
        return { id, company_slug: row.slug, title: s.title.trim(), url: s.url, source, published_at: published, image_url: image, fetched_at: fetchedAt } as RefreshNewsItem;
      });
      // DB writes are serialised on the single sql.js connection; nothing concurrent touches the same company.
      const newsOut: schema.NewsItem[] = [];
      for (const r of recs) {
        const existing = db.select({ publishedAt: schema.newsItems.publishedAt, imageUrl: schema.newsItems.imageUrl, summary: schema.newsItems.summary }).from(schema.newsItems).where(eq(schema.newsItems.id, r.id)).get();
        const publishedAt = r.published_at ?? existing?.publishedAt ?? null;
        const imageUrl = r.image_url ?? existing?.imageUrl ?? null;
        db.insert(schema.newsItems).values({ id: r.id, companySlug: row.slug, title: r.title, url: r.url, source: r.source, kind: "news", publishedAt, summary: existing?.summary ?? null, imageUrl, sentimentScore: null, ingestRunId: runId, createdAt: fetchedAt })
          .onConflictDoUpdate({ target: schema.newsItems.id, set: { title: r.title, source: r.source, publishedAt, imageUrl, ingestRunId: runId, createdAt: fetchedAt } }).run();
        r.published_at = publishedAt; r.image_url = imageUrl;
        items.push(r);
        newsOut.push({ id: r.id, title: r.title, url: r.url, source: r.source ?? undefined, kind: "news", published_at: publishedAt ?? undefined, image_url: imageUrl ?? undefined, fetched_at: fetchedAt });
      }
      rep.items = recs.length; rep.with_images = recs.filter((r) => r.image_url).length; rep.dated = recs.filter((r) => r.published_at).length;
      const byDate = (a: schema.NewsItem, b: schema.NewsItem) => (b.published_at ?? "").localeCompare(a.published_at ?? "");
      const merged = [...newsOut, ...row.latestNews.filter((o) => !newsOut.some((n) => n.id === o.id))].sort(byDate).slice(0, 25);
      db.update(schema.companies).set({ latestNews: merged, lastChecked: fetchedAt, updatedAt: fetchedAt }).where(eq(schema.companies.id, row.id)).run();
      if (!recs.length) errors.push(`${row.slug}: no sources returned`);
    } catch (e) {
      rep.error = (e as Error)?.name === "AbortError" ? `stream timeout after ${STREAM_TIMEOUT_MS / 1000}s` : String((e as Error)?.message ?? e);
      errors.push(`${row.slug}: ${rep.error}`);
    }
    rep.ms = Date.now() - t0;
    return rep;
  });

  const touched = perCompany.filter((r) => !r.error).length;
  const finishedAt = nowIso();
  const status: RefreshResult["status"] = touched === 0 && targets.length ? "error" : errors.length ? "partial" : "ok";
  db.insert(schema.ingestRuns).values({ id: runId, source: "refresh", workflowId: null, workflowName: "ondemand-refresh", executionId: null, model: process.env.ONDEMAND_DEFAULT_MODEL || config.ondemandDefaultModel, companiesTouched: touched, newsUpserted: items.length, sentimentRows: 0, status, errors, rawSample: JSON.stringify({ plugins: NEWS_PLUGIN_IDS, slugs: targets.map((t) => t.slug), concurrency }).slice(0, 4096), receivedAt: startedAt, finishedAt }).run();
  persist();
  const result: RefreshResult = { ingest_run_id: runId, status, companies_touched: touched, news_upserted: items.length, with_images: items.filter((i) => i.image_url).length, dated: items.filter((i) => i.published_at).length, errors, companies: perCompany, items, started_at: startedAt, finished_at: finishedAt };
  lastResult = result;
  return result;
}

/** Last refresh run as persisted (survives process restarts via ingest_runs). */
export async function lastRefreshRun() {
  const { db } = await getDb();
  const row = db.select().from(schema.ingestRuns).where(eq(schema.ingestRuns.source, "refresh")).orderBy(desc(schema.ingestRuns.receivedAt)).limit(1).get();
  if (!row) return null;
  const { rawSample, ...rest } = row;
  return rest;
}
