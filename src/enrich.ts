/**
 * enrich.ts — company profile enrichment through the OnDemand Chat API with the VERIFIED plugin set.
 *
 * Per company: ONE session (pluginIds = the verified set) → one structured-JSON query → the stream's `plugin_sources` items and the
 * fulfillment answer → strict JSON parse → every field carries {value, source_url, published_date, fetched_at, plugin} → plausibleDate guard
 * → dedupe (funding rounds by date+amount, news by url, competitors by name) → `company_profiles` row (one per company, JSON columns) +
 * news_items upsert for the dated news → ingest_runs row (source "enrich").
 *
 * Honesty rules: a field without a source_url from the stream is written as {value:"unknown", reason:"no sourced value returned"}; the
 * Perplexity "Not enough credits" signature is recorded verbatim as plugin_status.perplexity = "BLOCKED BY EXTERNAL DEPENDENCY"; nothing is
 * ever substituted silently — the other plugins' results are kept and labelled with the plugin that produced them.
 */
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "./db/client.js";
import { config, ONDEMAND_REASONING_MODE, ONDEMAND_USER_AGENT } from "./config.js";
import { plausibleDate, dateFromUrl } from "./refresh.js";

export const ONDEMAND_BASE = process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io";
export const PERPLEXITY_ID = "plugin-1722260873";
/** Verified against the live /plugin/v1/search directory and probed 2026-10-10 (see proof/credit-probe): each one answers through the chat API. */
export const ENRICH_PLUGINS: { id: string; name: string; role: string }[] = [
  { id: PERPLEXITY_ID, name: "Perplexity", role: "web research with citations (pinned)" },
  { id: "plugin-1741871229", name: "GPT Search", role: "web search fallback with citations" },
  { id: "plugin-1718116202", name: "LinkedIn Search", role: "company profile: HQ, founded, headcount, funding fields" },
  { id: "plugin-1751872652", name: "X Search Agent", role: "social signal (X)" },
  { id: "plugin-1748003575", name: "Reddit Posts", role: "social signal (Reddit)" },
  { id: "plugin-1716429542", name: "US Stock Fundamental Analysis", role: "listed comps (e.g. FRVO)" },
];
export const ENRICH_PLUGIN_IDS = (process.env.ONDEMAND_ENRICH_PLUGIN_IDS ?? ENRICH_PLUGINS.map((p) => p.id).join(",")).split(",").map((x) => x.trim()).filter(Boolean);
const UPSTREAM_ERROR_RE = /not enough credits|"error"\s*:\s*"internal server error"|tool returned an error/i;
const STREAM_TIMEOUT_MS = 240_000;
const headers = () => { const k = process.env.ONDEMAND_API_KEY ?? ""; if (!k) throw new Error("ONDEMAND_API_KEY is not configured"); return { apikey: k, "content-type": "application/json", "user-agent": ONDEMAND_USER_AGENT }; };

export type Sourced<T = string> = { value: T | "unknown"; source_url: string | null; published_date: string | null; fetched_at: string; plugin: string | null; reason?: string };
export type FundingRound = { date: string | null; amount_usd: number | null; amount_text: string; round: string; lead_investors: string[]; source_url: string | null; published_date: string | null; fetched_at: string; plugin: string | null };
export type ProfileNews = { title: string; url: string; source: string; published_date: string | null; sentiment: number | null; fetched_at: string; plugin: string | null };
export type CompanyProfile = {
  slug: string; description: Sourced; sector: Sourced; hq: Sourced; founded: Sourced; ceo: Sourced; founders: Sourced<string[]>; headcount: Sourced; total_raised: Sourced; last_valuation: Sourced;
  funding_rounds: FundingRound[]; key_products: Sourced<string[]>; competitors: Sourced<string[]>; recent_news: ProfileNews[]; risk_signals: Sourced<string[]>; social_sentiment: Sourced;
  plugin_status: Record<string, string>; sources_seen: { url: string; title: string; domain: string; plugin: string }[]; coverage: Record<string, boolean>; session_id: string | null; raw_answer_chars: number; fetched_at: string; errors: string[];
};

type SourceItem = { title: string; url: string; domain?: string; pluginName?: string; pluginId?: string };
type StreamOut = { sources: SourceItem[]; answer: string; pluginErrors: Record<string, string>; frames: number; eventTypes: Record<string, number> };

async function createSession(pluginIds: string[]): Promise<string> {
  const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions`, { method: "POST", headers: headers(), body: JSON.stringify({ externalUserId: "enrich-bot", pluginIds, contextMetadata: [{ key: "purpose", value: "portfolio-enrichment" }] }) });
  if (!res.ok) throw new Error(`session create failed: HTTP ${res.status}`);
  const json: any = await res.json(); const id = json?.data?.id ?? json?.id; if (!id) throw new Error("session create: no id"); return String(id);
}

async function streamQuery(sessionId: string, query: string, pluginIds: string[]): Promise<StreamOut> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  const out: StreamOut = { sources: [], answer: "", pluginErrors: {}, frames: 0, eventTypes: {} };
  try {
    const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions/${sessionId}/query`, { method: "POST", headers: { ...headers(), accept: "text/event-stream" }, body: JSON.stringify({ query, endpointId: config.ondemandDefaultModel, responseMode: "stream", pluginIds, reasoningMode: ONDEMAND_REASONING_MODE, modelConfigs: { temperature: 0.1 } }), signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`query failed: HTTP ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let currentPlugin = "";
    const handle = (line: string) => {
      if (!line.startsWith("data:")) return; const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") return;
      let f: any; try { f = JSON.parse(payload); } catch { return; }
      out.frames++; const et = String(f?.eventType ?? "?"); out.eventTypes[et] = (out.eventTypes[et] ?? 0) + 1;
      if (et === "step_output") { const d = String(f?.output?.delta ?? ""); const m = d.match(/"pluginId"\s*:\s*"(plugin-\d+)"/); if (m) currentPlugin = m[1]; }
      if (/^(fulfillment_thinking|step_thinking|step_output|fulfillment)$/.test(et)) {
        const txt = typeof f?.answer === "string" ? f.answer : String(f?.thinking?.delta ?? f?.output?.delta ?? "");
        const m = txt.match(UPSTREAM_ERROR_RE);
        if (m) { const key = currentPlugin || PERPLEXITY_ID; if (!out.pluginErrors[key]) out.pluginErrors[key] = payload.slice(0, 600); }
      }
      if (et === "plugin_sources" && Array.isArray(f?.sources?.items)) { for (const it of f.sources.items) if (it?.url) out.sources.push({ title: String(it.title ?? it.url), url: String(it.url), domain: it.domain ? String(it.domain) : undefined, pluginName: f.sources.pluginName, pluginId: f.sources.pluginId }); }
      if (et === "fulfillment" && typeof f?.answer === "string") out.answer += f.answer;
    };
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl: number; while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).replace(/\r$/, "")); buf = buf.slice(nl + 1); } }
    if (buf) handle(buf);
  } finally { clearTimeout(timer); }
  return out;
}

/** The structured ask. The model is told to only cite URLs that came back from the plugins and to say "unknown" otherwise. */
export function buildQuery(name: string, website: string | null, sector: string): string {
  return `You are compiling a verified company profile for ${name}${website ? ` (${website})` : ""} (sector on file: ${sector}). Use the plugins to research, then answer ONLY with one JSON object (no prose, no markdown fence) of this exact shape:
{"description":{"value":"","source_url":"","published_date":"YYYY-MM-DD"},"sector":{"value":"","source_url":""},"hq":{"value":"City, Country","source_url":""},"founded":{"value":"YYYY","source_url":""},"ceo":{"value":"","source_url":""},"founders":{"value":["..."],"source_url":""},"headcount":{"value":"e.g. 250 (estimate)","source_url":"","published_date":""},"total_raised":{"value":"lifetime PRIVATE capital raised, e.g. $935M (exclude IPO proceeds; say so if only IPO is known)","source_url":"","published_date":""},"last_valuation":{"value":"e.g. $5.3B (Feb 2026)","source_url":"","published_date":""},"funding_rounds":[{"date":"YYYY-MM-DD or YYYY-MM","amount_text":"$350M","round":"Series A | Series A extension | IPO | debt/project financing","lead_investors":["..."],"source_url":""}],"key_products":{"value":["..."],"source_url":""},"competitors":{"value":["..."],"source_url":""},"recent_news":[{"title":"","url":"","source":"domain","published_date":"YYYY-MM-DD","sentiment":0.0}],"risk_signals":{"value":["..."],"source_url":""},"social_sentiment":{"value":"one sentence on X/Reddit tone with a count if known","source_url":""}}
Rules: every source_url must be a URL that actually appeared in a plugin result during this query — never invent or recall URLs. If a field cannot be sourced, set its value to "unknown" and source_url to "". recent_news: the 5 most recent dated items, newest first, each with sentiment for the company in [-1,1] (−1 very negative, 0 neutral, +1 very positive) judged from the item itself. Dates must be real publication dates. Keep description under 60 words. funding_rounds: list EVERY known priced round newest first (seed → latest, IPO as its own row), one row per round; hq: keep dual HQs ("San Francisco, US / Lagos, Nigeria"). Prefer primary sources (company newsroom, SEC filings, TechCrunch/Reuters/Bloomberg/CNBC) over aggregators; if only an aggregator (fundbat, seedtable, multiples.vc, altis.vc) is available, still cite it.`;
}

const now = () => nowIso();
function S<T>(v: unknown, src: unknown, date: unknown, plugin: string | null, fetched: string, allowed: Set<string>, kind: "text" | "list" = "text"): Sourced<any> {
  const url = typeof src === "string" && /^https?:\/\//.test(src) ? src.trim() : null;
  const okUrl = url && allowed.has(url.replace(/\/$/, ""));
  const val: any = kind === "list" ? (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "unknown") : []) : typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  const empty = kind === "list" ? val.length === 0 : !val || /^unknown$/i.test(val) || /^(n\/a|none|null)$/i.test(val);
  if (empty) return { value: "unknown", source_url: null, published_date: null, fetched_at: fetched, plugin: null, reason: "no sourced value returned" };
  if (!okUrl) return { value: "unknown", source_url: null, published_date: null, fetched_at: fetched, plugin: null, reason: url ? "source_url not present in plugin results (possible hallucination) — dropped" : "value given without a source_url — dropped" };
  return { value: val, source_url: url, published_date: plausibleDate(typeof date === "string" ? date : null) ?? dateFromUrl(url), fetched_at: fetched, plugin };
}
const parseAmount = (t: string): number | null => { const m = t.replace(/,/g, "").match(/\$?\s*([\d.]+)\s*(bn|b|billion|m|mm|million|k)?/i); if (!m) return null; const n = parseFloat(m[1]); if (!Number.isFinite(n)) return null; const u = (m[2] ?? "").toLowerCase(); return Math.round(n * (u.startsWith("b") ? 1e9 : u.startsWith("m") ? 1e6 : u === "k" ? 1e3 : 1)); };

function extractJson(answer: string): any | null {
  const i = answer.indexOf("{"); if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = i; k < answer.length; k++) { const c = answer[k]; if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(answer.slice(i, k + 1)); } catch { return null; } } } }
  return null;
}

/** Enrich one company; returns the profile (also written to the DB when `write`). Exported for the shard runner and tests (parse path). */
export async function enrichCompany(row: typeof schema.companies.$inferSelect, opts: { pluginIds?: string[]; write?: boolean } = {}): Promise<CompanyProfile> {
  const fetched = now(); const pluginIds = opts.pluginIds ?? ENRICH_PLUGIN_IDS; const errors: string[] = [];
  const base: CompanyProfile = { slug: row.slug, description: S(undefined, null, null, null, fetched, new Set()), sector: S(undefined, null, null, null, fetched, new Set()), hq: S(undefined, null, null, null, fetched, new Set()), founded: S(undefined, null, null, null, fetched, new Set()), ceo: S(undefined, null, null, null, fetched, new Set()), founders: S(undefined, null, null, null, fetched, new Set(), "list"), headcount: S(undefined, null, null, null, fetched, new Set()), total_raised: S(undefined, null, null, null, fetched, new Set()), last_valuation: S(undefined, null, null, null, fetched, new Set()), funding_rounds: [], key_products: S(undefined, null, null, null, fetched, new Set(), "list"), competitors: S(undefined, null, null, null, fetched, new Set(), "list"), recent_news: [], risk_signals: S(undefined, null, null, null, fetched, new Set(), "list"), social_sentiment: S(undefined, null, null, null, fetched, new Set()), plugin_status: {}, sources_seen: [], coverage: {}, session_id: null, raw_answer_chars: 0, fetched_at: fetched, errors };
  let stream: StreamOut | null = null;
  try {
    const sid = await createSession(pluginIds); base.session_id = sid;
    stream = await streamQuery(sid, buildQuery(row.name, row.website, row.sector), pluginIds);
  } catch (e) { errors.push(`stream: ${(e as Error)?.name === "AbortError" ? `timeout after ${STREAM_TIMEOUT_MS / 1000}s` : String((e as Error)?.message ?? e)}`); }
  const profile = parseProfile(base, stream, pluginIds, fetched);
  if (opts.write !== false) await writeProfile(row, profile);
  return profile;
}

/** Pure parse step (unit-testable): stream → profile with provenance + guards. */
export function parseProfile(base: CompanyProfile, stream: StreamOut | null, pluginIds: string[], fetched: string): CompanyProfile {
  const p = base;
  const names = Object.fromEntries(ENRICH_PLUGINS.map((x) => [x.id, x.name]));
  for (const id of pluginIds) p.plugin_status[names[id] ?? id] = "attached";
  if (!stream) return finalize(p);
  p.raw_answer_chars = stream.answer.length;
  for (const [id, raw] of Object.entries(stream.pluginErrors)) { const n = names[id] ?? id; p.plugin_status[n] = /credits/i.test(raw) ? "BLOCKED BY EXTERNAL DEPENDENCY (Not enough credits)" : "error"; p.errors.push(`${n}: upstream error frame: ${raw.slice(0, 300)}`); }
  const byPlugin = new Map<string, number>(); for (const s of stream.sources) byPlugin.set(s.pluginName ?? s.pluginId ?? "?", (byPlugin.get(s.pluginName ?? s.pluginId ?? "?") ?? 0) + 1);
  for (const [n, c] of byPlugin) if (!p.plugin_status[n] || p.plugin_status[n] === "attached") p.plugin_status[n] = `returned ${c} sources`;
  // Plugins that answer inline (no plugin_sources frame) leave fingerprints in the cited URLs: GPT Search tags utm_source=openai, LinkedIn/X/Reddit cite their own domains.
  const answerUrls = [...stream.answer.matchAll(/https?:\/\/[^\s)\]"'`<>]+/g)].map((m) => m[0]);
  const fp: Record<string, (u: string) => boolean> = { "GPT Search": (u) => /utm_source=openai/i.test(u), "LinkedIn Search": (u) => /linkedin\.com\//i.test(u), "X Search Agent": (u) => /(^https?:\/\/(www\.)?(x|twitter)\.com\/)/i.test(u), "Reddit Posts": (u) => /reddit\.com\//i.test(u) };
  for (const id of pluginIds) { const n = names[id] ?? id; if (p.plugin_status[n] !== "attached") continue; const k = fp[n] ? answerUrls.filter(fp[n]).length : 0; p.plugin_status[n] = k ? `answered inline · ${k} cited url${k === 1 ? "" : "s"}` : "attached, not used by the planner (no sources frame, no cited url)"; }
  const seenUrl = new Set<string>();
  for (const s of stream.sources) { const k = s.url.replace(/\/$/, ""); if (seenUrl.has(k)) continue; seenUrl.add(k); let domain = s.domain; if (!domain) { try { domain = new URL(s.url).hostname.replace(/^www\./, ""); } catch { domain = "?"; } } p.sources_seen.push({ url: s.url, title: s.title, domain, plugin: s.pluginName ?? s.pluginId ?? "?" }); }
  // URLs the model may cite = plugin_sources URLs + markdown URLs inside the answer that match a plugin domain (GPT Search inlines its links).
  const allowed = new Set(seenUrl);
  for (const m of stream.answer.matchAll(/https?:\/\/[^\s)\]"'`<>]+/g)) { const u = m[0].replace(/[.,;:!?]+$/, "").replace(/\/$/, ""); allowed.add(u); }
  const pluginFor = (url: string | null) => { if (!url) return null; const s = stream.sources.find((x) => x.url.replace(/\/$/, "") === url.replace(/\/$/, "")); return s?.pluginName ?? s?.pluginId ?? (url ? "answer" : null); };
  const j = extractJson(stream.answer);
  if (!j) { p.errors.push("answer did not contain a parseable JSON object"); return finalize(p); }
  const F = (key: string, kind: "text" | "list" = "text") => { const o = j[key] ?? {}; const r = S(o?.value ?? o, o?.source_url, o?.published_date, null, fetched, allowed, kind); r.plugin = pluginFor(r.source_url); return r; };
  p.description = F("description"); p.sector = F("sector"); p.hq = F("hq"); p.founded = F("founded"); p.ceo = F("ceo"); p.founders = F("founders", "list"); p.headcount = F("headcount"); p.total_raised = F("total_raised"); p.last_valuation = F("last_valuation");
  p.key_products = F("key_products", "list"); p.competitors = F("competitors", "list"); p.risk_signals = F("risk_signals", "list"); p.social_sentiment = F("social_sentiment");
  const seenRound = new Set<string>();
  for (const r of Array.isArray(j.funding_rounds) ? j.funding_rounds : []) {
    const url = typeof r?.source_url === "string" && allowed.has(r.source_url.replace(/\/$/, "")) ? r.source_url : null; if (!url) continue;
    const dateRaw = typeof r?.date === "string" ? (r.date.length === 7 ? `${r.date}-01` : r.date) : null; const date = plausibleDate(dateRaw);
    const amountText = String(r?.amount_text ?? r?.amount ?? "").trim(); const key = `${date ?? "?"}|${amountText.toLowerCase()}`; if (seenRound.has(key)) continue; seenRound.add(key);
    p.funding_rounds.push({ date, amount_usd: parseAmount(amountText), amount_text: amountText, round: String(r?.round ?? "").trim(), lead_investors: Array.isArray(r?.lead_investors) ? r.lead_investors.map(String) : [], source_url: url, published_date: date, fetched_at: fetched, plugin: pluginFor(url) });
  }
  p.funding_rounds.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const seenNews = new Set<string>();
  for (const n of Array.isArray(j.recent_news) ? j.recent_news : []) {
    const url = typeof n?.url === "string" ? n.url.trim() : ""; if (!url || !allowed.has(url.replace(/\/$/, "")) || seenNews.has(url)) continue; seenNews.add(url);
    let source = String(n?.source ?? ""); if (!source) { try { source = new URL(url).hostname.replace(/^www\./, ""); } catch { source = "?"; } }
    const sentNum = typeof n?.sentiment === "number" && Number.isFinite(n.sentiment) ? Math.max(-1, Math.min(1, n.sentiment)) : typeof n?.sentiment === "string" && Number.isFinite(parseFloat(n.sentiment)) ? Math.max(-1, Math.min(1, parseFloat(n.sentiment))) : null;
    p.recent_news.push({ title: String(n?.title ?? url).trim(), url, source, published_date: plausibleDate(typeof n?.published_date === "string" ? n.published_date : null) ?? dateFromUrl(url), sentiment: sentNum, fetched_at: fetched, plugin: pluginFor(url) });
  }
  p.recent_news.sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? "")); p.recent_news = p.recent_news.slice(0, 5);
  return finalize(p);
}
function finalize(p: CompanyProfile): CompanyProfile {
  const has = (s: Sourced<any>) => s.value !== "unknown";
  p.coverage = { description: has(p.description), sector: has(p.sector), hq: has(p.hq), founded: has(p.founded), ceo: has(p.ceo), founders: has(p.founders), headcount: has(p.headcount), total_raised: has(p.total_raised), last_valuation: has(p.last_valuation), funding_rounds: p.funding_rounds.length > 0, key_products: has(p.key_products), competitors: has(p.competitors), recent_news: p.recent_news.length > 0, risk_signals: has(p.risk_signals), social_sentiment: has(p.social_sentiment) };
  return p;
}

async function writeProfile(row: typeof schema.companies.$inferSelect, p: CompanyProfile) {
  const { db, raw } = await getDb();
  ensureTable(raw);
  const covered = Object.values(p.coverage).filter(Boolean).length;
  raw.run(`insert into company_profiles (slug, profile, coverage_pct, session_id, fetched_at, updated_at) values (?, ?, ?, ?, ?, ?) on conflict(slug) do update set profile = excluded.profile, coverage_pct = excluded.coverage_pct, session_id = excluded.session_id, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at`, [p.slug, JSON.stringify(p), Math.round((covered / Object.keys(p.coverage).length) * 100), p.session_id, p.fetched_at, p.fetched_at]);
  // Dated news with provenance → news_items (kind "news", source plugin in summary) + companies.latest_news merge; sourced HQ/headcount → companies columns.
  const newsOut: schema.NewsItem[] = [];
  for (const n of p.recent_news) {
    const id = "n-" + crypto.createHash("sha1").update(row.slug + "|" + n.url).digest("hex").slice(0, 16);
    db.insert(schema.newsItems).values({ id, companySlug: row.slug, title: n.title, url: n.url, source: n.source, kind: "news", publishedAt: n.published_date, summary: `via ${n.plugin ?? "enrichment"}`, imageUrl: null, sentimentScore: n.sentiment, ingestRunId: `enrich-${p.fetched_at}`, createdAt: n.fetched_at })
      .onConflictDoUpdate({ target: schema.newsItems.id, set: { title: n.title, source: n.source, publishedAt: sql`coalesce(${n.published_date}, published_at)`, sentimentScore: sql`coalesce(${n.sentiment}, sentiment_score)`, createdAt: n.fetched_at } }).run();
    newsOut.push({ id, title: n.title, url: n.url, source: n.source, kind: "news", published_at: n.published_date ?? undefined, fetched_at: n.fetched_at });
  }
  const merged = [...newsOut, ...row.latestNews.filter((o) => !newsOut.some((n) => n.id === o.id))].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 25);
  // Headcount: parse the LEADING number only ("964 (estimate, March 2026)" → 964; "1,200+" → 1200; "~300 per press" → 300); never digit-strip dates in.
  const empM = p.headcount.value !== "unknown" ? String(p.headcount.value).replace(/,/g, "").match(/(\d{2,6})/) : null;
  const emp = empM ? parseInt(empM[1], 10) : NaN;
  db.update(schema.companies).set({ latestNews: merged, hq: p.hq.value !== "unknown" ? String(p.hq.value) : row.hq, employees: Number.isFinite(emp) && emp > 0 ? emp : row.employees, lastChecked: p.fetched_at, updatedAt: p.fetched_at }).where(eq(schema.companies.id, row.id)).run();
  persist();
}

export function ensureTable(raw: { run: (sql: string) => unknown }) {
  raw.run(`create table if not exists company_profiles (slug text primary key, profile text not null, coverage_pct integer not null default 0, session_id text, fetched_at text not null, updated_at text not null)`);
}

export async function getProfile(slug: string): Promise<(CompanyProfile & { coverage_pct: number }) | null> {
  const { raw } = await getDb(); ensureTable(raw);
  const res = raw.exec(`select profile, coverage_pct from company_profiles where slug = ?`, [slug]);
  const r = res[0]?.values?.[0]; if (!r) return null;
  return { ...(JSON.parse(String(r[0])) as CompanyProfile), coverage_pct: Number(r[1]) };
}
export async function profileCoverage(): Promise<{ companies: number; by_field: Record<string, number>; avg_coverage_pct: number; blocked_perplexity: number }> {
  const { raw } = await getDb(); ensureTable(raw);
  const res = raw.exec(`select profile from company_profiles`); const rows = (res[0]?.values ?? []).map((v) => JSON.parse(String(v[0])) as CompanyProfile);
  const by: Record<string, number> = {}; let pct = 0; let blocked = 0;
  for (const p of rows) { let c = 0; for (const [k, v] of Object.entries(p.coverage)) { by[k] = (by[k] ?? 0) + (v ? 1 : 0); if (v) c++; } pct += c / Math.max(1, Object.keys(p.coverage).length); if (/BLOCKED/.test(p.plugin_status["Perplexity"] ?? "")) blocked++; }
  return { companies: rows.length, by_field: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, rows.length ? Math.round((v / rows.length) * 100) : 0])), avg_coverage_pct: rows.length ? Math.round((pct / rows.length) * 100) : 0, blocked_perplexity: blocked };
}

/** Runs a shard: enriches the listed slugs with bounded concurrency; one ingest_runs row. */
export async function enrichShard(slugs: string[], concurrency = 2): Promise<{ ingest_run_id: string; started_at: string; finished_at: string; results: { slug: string; coverage_pct: number; plugin_status: Record<string, string>; errors: string[]; ms: number }[]; coverage_by_field: Record<string, number> }> {
  const { db } = await getDb(); const startedAt = now(); const runId = `en-${startedAt.replace(/[:.]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
  const rows = slugs.map((s) => db.select().from(schema.companies).where(eq(schema.companies.slug, s)).get()).filter((r): r is NonNullable<typeof r> => !!r && r.bCapitalRole !== "firm");
  const results: { slug: string; coverage_pct: number; plugin_status: Record<string, string>; errors: string[]; ms: number }[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, async () => { for (;;) { const idx = i++; if (idx >= rows.length) return; const row = rows[idx]; const t0 = Date.now(); const p = await enrichCompany(row); const covered = Object.values(p.coverage).filter(Boolean).length; results.push({ slug: row.slug, coverage_pct: Math.round((covered / Object.keys(p.coverage).length) * 100), plugin_status: p.plugin_status, errors: p.errors, ms: Date.now() - t0 }); } }));
  const by: Record<string, number> = {};
  for (const r of results) { const prof = await getProfile(r.slug); if (prof) for (const [k, v] of Object.entries(prof.coverage)) by[k] = (by[k] ?? 0) + (v ? 1 : 0); }
  const coverage_by_field = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, results.length ? Math.round((v / results.length) * 100) : 0]));
  const finishedAt = now();
  db.insert(schema.ingestRuns).values({ id: runId, source: "enrich", workflowId: null, workflowName: "ondemand-enrich", executionId: null, model: config.ondemandDefaultModel, companiesTouched: results.filter((r) => !r.errors.some((e) => e.startsWith("stream"))).length, newsUpserted: 0, sentimentRows: 0, status: results.every((r) => r.errors.length === 0) ? "ok" : "partial", errors: results.flatMap((r) => r.errors.map((e) => `${r.slug}: ${e}`)).slice(0, 200), rawSample: JSON.stringify({ plugins: ENRICH_PLUGIN_IDS, slugs, coverage_by_field }).slice(0, 4096), receivedAt: startedAt, finishedAt }).run();
  persist();
  return { ingest_run_id: runId, started_at: startedAt, finished_at: finishedAt, results, coverage_by_field };
}
