import "server-only";
import snapshot from "@/data/snapshot.json";
import type { Company, CompanySentiment, NewsItem, PortfolioSentiment, IngestRun, SignalScore, SignalBands, SignalsResponse, PitchbookResponse } from "./types";

/** Server-side data access. Live backend first (ISR 120 s); the committed snapshot (fetched 2026-10-09T13:14Z) is the offline fallback so
 *  every page still renders with 136 records if the ephemeral sandbox backend is down. The `source` is surfaced in the UI. */
const BASE = (process.env.PORTFOLIO_API_URL ?? process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ?? "https://sb-4wdkkmzv7w2z.vercel.run").replace(/\/$/, "");
type Snap = { fetched_at: string; source: string; companies: Company[]; news: Record<string, NewsItem[]>; sentiment: Record<string, CompanySentiment>; portfolio: PortfolioSentiment; runs: IngestRun[] };
const snap = snapshot as unknown as Snap;
export type Sourced<T> = { data: T; source: "live" | "snapshot"; fetched_at: string };
/** One shared liveness probe (per-request, no-store, 2 s budget, one retry) used by the global badge — see components/shell/backend-status.tsx. */
export async function backendIsLive(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2000);
      const r = await fetch(`${BASE}/health`, { cache: "no-store", signal: ctl.signal, headers: { accept: "application/json" } });
      clearTimeout(t); if (r.ok) return true;
    } catch { /* retry once */ }
  }
  return false;
}

async function get<T>(path: string, fallback: () => T, revalidate = 120): Promise<Sourced<T>> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`${BASE}${path}`, { next: { revalidate }, signal: ctl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!r.ok) throw new Error(`${r.status}`);
    return { data: (await r.json()) as T, source: "live", fetched_at: new Date().toISOString() };
  } catch {
    return { data: fallback(), source: "snapshot", fetched_at: snap.fetched_at };
  }
}
export const backendBaseUrl = BASE;
/** `news_total` is the backend's single news count (same definition as /news/summary); null when served from the snapshot. */
export async function listCompanies(): Promise<Sourced<Company[]> & { news_total: number | null }> {
  const r = await get<{ data: Company[]; news_total?: number }>("/companies?limit=200", () => ({ data: snap.companies }));
  return { ...r, data: r.data.data, news_total: r.source === "live" ? r.data.news_total ?? null : null };
}
export async function getCompany(slug: string): Promise<Sourced<Company | null>> {
  const r = await get<{ data: Company } | null>(`/companies/${encodeURIComponent(slug)}`, () => { const c = snap.companies.find((x) => x.slug === slug || x.name.toLowerCase() === slug.toLowerCase()); return c ? { data: c } : null; });
  return { ...r, data: r.data?.data ?? null };
}
export async function getNews(slug: string): Promise<Sourced<NewsItem[]>> {
  const r = await get<{ data: NewsItem[] }>(`/companies/${encodeURIComponent(slug)}/news?limit=50`, () => ({ data: snap.news[slug] ?? [] }));
  return { ...r, data: r.data.data };
}
export async function getSentiment(slug: string): Promise<Sourced<CompanySentiment | null>> {
  return get<CompanySentiment | null>(`/companies/${encodeURIComponent(slug)}/sentiment?limit=60`, () => snap.sentiment[slug] ?? null);
}
export async function getPortfolio(): Promise<Sourced<PortfolioSentiment>> { return get<PortfolioSentiment>("/sentiment/portfolio", () => snap.portfolio); }
export async function getRuns(): Promise<Sourced<IngestRun[]>> {
  const r = await get<{ data: IngestRun[] }>("/ingest/runs", () => ({ data: snap.runs }));
  return { ...r, data: r.data.data };
}
/** Distinct sentiment scoring runs (backend GET /sentiment/runs, additive): one row per ingest_run_id in sentiment_history. */
export type SentimentRun = { ingest_run_id: string | null; sentiment_rows: number; companies: number; null_delta: number; moved: number; avg_score: number | null; started_at: string; finished_at: string; model: string | null; workflow_name: string | null; source: string | null };
export async function getSentimentRuns(): Promise<Sourced<{ data: SentimentRun[]; runs: number; companies_with_null_delta_now: number | null }>> {
  return get("/sentiment/runs", () => ({ data: [], runs: 0, companies_with_null_delta_now: null }));
}
/** Evidence-weighted Signal Scores for the whole portfolio. No snapshot exists yet, so the offline fallback is an empty shape
 *  (source 'snapshot') and the UI renders its "history builds daily" / em-dash states instead of simulated numbers. */
export async function getSignals(): Promise<Sourced<SignalsResponse>> {
  return get<SignalsResponse>("/signals", () => ({ data: [], portfolio: { n: 0, mean: 0, p25: 0, p75: 0, computed_at: null, method: "" }, sectors: {} }));
}
export async function getSignal(slug: string): Promise<Sourced<{ data: SignalScore; bands: SignalBands } | null>> {
  const r = await get<{ data: SignalScore; bands: SignalBands } | null>(`/companies/${encodeURIComponent(slug)}/signal`, () => null);
  return { ...r, data: r.data?.data ? { data: r.data.data, bands: r.data.bands } : null };
}
/** The ONE news total — the backend's `GET /news/summary` (count of news_items belonging to a listed company, de-duplicated by
 *  (company_slug,url); orphans excluded). Never a client-side re-sum. Offline fallback: the snapshot's row count (source 'snapshot'). */
export type NewsSummary = { total: number; by_company: Record<string, number>; companies: number; raw_rows: number; dedup_removed: number; orphan_items: number; definition: string };
export async function getNewsSummary(): Promise<Sourced<NewsSummary>> {
  return get<NewsSummary>("/news/summary", () => {
    const by_company: Record<string, number> = {}; let total = 0;
    for (const c of snap.companies) { const n = (snap.news[c.slug] ?? []).length; by_company[c.slug] = n; total += n; }
    return { total, by_company, companies: snap.companies.length, raw_rows: total, dedup_removed: 0, orphan_items: 0, definition: "snapshot rows (offline fallback)" };
  });
}
/** All news across the portfolio (for News Pulse). Items come from GET /companies/{slug}/news?limit=1000 per company (16 in flight, ISR 120 s);
 *  companies whose call fails fall back to their embedded latest_news + snapshot rows. `total` and `perCompany` are ALWAYS the backend's
 *  numbers from GET /news/summary (one definition — see src/app.ts newsTotal()), never a re-sum of the fetched lists. `source` is 'live'
 *  only when the summary AND every company list came from the backend; `liveCompanies`/`failedCompanies` expose the split for the badge. */
type FeedItem = NewsItem & { company_slug: string; company_name: string; company_logo: string | null; sector: string; sentiment_score: number | null; sentiment_delta: number | null };
export async function getAllNews(): Promise<Sourced<FeedItem[]> & { total: number; perCompany: Record<string, number>; definition: string; liveCompanies: number; failedCompanies: string[]; summarySource: "live" | "snapshot" }> {
  const [cs, summary] = await Promise.all([listCompanies(), getNewsSummary()]);
  const items = new Map<string, FeedItem>();
  const queue = [...cs.data]; let liveCompanies = 0; const failedCompanies: string[] = [];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const r = await get<{ data: NewsItem[] } | null>(`/companies/${encodeURIComponent(c.slug)}/news?limit=1000`, () => null);
      const list = r.data?.data ?? [...(c.latest_news ?? []), ...(snap.news[c.slug] ?? [])];
      if (r.data) liveCompanies++; else failedCompanies.push(c.slug);
      const seen = new Set<string>();
      for (const n of list) {
        const key = `${c.slug}|${(n.url ?? n.title ?? n.id ?? "").trim().toLowerCase()}`; // same (company_slug,url) rule as the backend
        if (seen.has(key)) continue; seen.add(key);
        const id = n.id ?? key;
        if (!items.has(id)) items.set(id, { ...n, id, company_slug: c.slug, company_name: c.name, company_logo: c.logo_url ?? null, sector: c.sector, sentiment_score: c.sentiment?.score ?? null, sentiment_delta: c.sentiment?.delta ?? null });
      }
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  const allLive = cs.source === "live" && summary.source === "live" && failedCompanies.length === 0;
  return { data: [...items.values()].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")), source: allLive ? "live" : "snapshot", fetched_at: summary.fetched_at, total: summary.data.total, perCompany: summary.data.by_company, definition: summary.data.definition, liveCompanies, failedCompanies, summarySource: summary.source };
}
/** PitchBook record for one company (backend `/pitchbook/{slug}`, built by the PitchBook team). No snapshot exists: the offline fallback is
 *  `null` (source 'snapshot'), which the panel renders as its honest "offline" state — never a blank card, never a credentials message. */
export async function getPitchbook(slug: string): Promise<Sourced<PitchbookResponse | null>> {
  return get<PitchbookResponse | null>(`/pitchbook/${encodeURIComponent(slug)}`, () => null);
}
