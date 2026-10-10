import "server-only";
import snapshot from "@/data/snapshot.json";
import pbSnapshot from "@/data/pitchbook-snapshot.json";
import type { Company, CompanySentiment, NewsItem, PortfolioSentiment, IngestRun, SignalScore, SignalBands, SignalsResponse, PitchbookResponse, PitchbookRecord } from "./types";

/** Server-side data access. Live backend first (ISR 120 s); the committed snapshot (fetched 2026-10-09T13:14Z) is the offline fallback so
 *  every page still renders with 136 records if the ephemeral sandbox backend is down. The `source` is surfaced in the UI. */
const BASE = (process.env.PORTFOLIO_API_URL ?? process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ?? "https://sb-4wdkkmzv7w2z.vercel.run").replace(/\/$/, "");
type Snap = { fetched_at: string; source: string; companies: Company[]; news: Record<string, NewsItem[]>; sentiment: Record<string, CompanySentiment>; portfolio: PortfolioSentiment; runs: IngestRun[] };
const snap = snapshot as unknown as Snap;
export type Sourced<T> = { data: T; source: "live" | "snapshot"; fetched_at: string };

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
export async function listCompanies(): Promise<Sourced<Company[]>> {
  const r = await get<{ data: Company[] }>("/companies?limit=200", () => ({ data: snap.companies }));
  return { ...r, data: r.data.data };
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
/** Evidence-weighted Signal Scores for the whole portfolio. No snapshot exists yet, so the offline fallback is an empty shape
 *  (source 'snapshot') and the UI renders its "history builds daily" / em-dash states instead of simulated numbers. */
export async function getSignals(): Promise<Sourced<SignalsResponse>> {
  return get<SignalsResponse>("/signals", () => ({ data: [], portfolio: { n: 0, mean: 0, p25: 0, p75: 0, computed_at: null, method: "" }, sectors: {} }));
}
export async function getSignal(slug: string): Promise<Sourced<{ data: SignalScore; bands: SignalBands } | null>> {
  const r = await get<{ data: SignalScore; bands: SignalBands } | null>(`/companies/${encodeURIComponent(slug)}/signal`, () => null);
  return { ...r, data: r.data?.data ? { data: r.data.data, bands: r.data.bands } : null };
}
/** All news across the portfolio (for News Pulse): N parallel calls would be slow against the sandbox, so use the per-company latest_news
 *  embedded in /companies (always ≥ the news table for workflow-written items) merged with the snapshot news table. */
export async function getAllNews(): Promise<Sourced<(NewsItem & { company_slug: string; company_name: string; company_logo: string | null; sector: string; sentiment_score: number | null; sentiment_delta: number | null })[]>> {
  const cs = await listCompanies();
  const items = new Map<string, NewsItem & { company_slug: string; company_name: string; company_logo: string | null; sector: string; sentiment_score: number | null; sentiment_delta: number | null }>();
  for (const c of cs.data) {
    const fromTable = snap.news[c.slug] ?? [];
    for (const n of [...(c.latest_news ?? []), ...fromTable]) {
      const id = n.id ?? `${c.slug}|${n.url ?? n.title}`;
      if (!items.has(id)) items.set(id, { ...n, id, company_slug: c.slug, company_name: c.name, company_logo: c.logo_url ?? null, sector: c.sector, sentiment_score: c.sentiment?.score ?? null, sentiment_delta: c.sentiment?.delta ?? null });
    }
  }
  return { data: [...items.values()].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")), source: cs.source, fetched_at: cs.fetched_at };
}
/** PitchBook record for one company (backend `/pitchbook/{slug}`). Live backend first; when it does not answer, the committed
 *  `pitchbook-snapshot.json` (regenerate with `node scripts/pitchbook-snapshot.mjs`) supplies the stored weekly record so first paint
 *  always has content (source 'snapshot'). Only a slug missing from BOTH yields `data: null` → the honest "offline" state. */
type PbSnap = { fetched_at: string; source: string; records: Record<string, { name: string; data: PitchbookRecord | null; next_run_utc: string | null }> };
const pbSnap = pbSnapshot as unknown as PbSnap;
function pitchbookFromSnapshot(slug: string): PitchbookResponse | null {
  const r = pbSnap.records[slug]; if (!r) return null;
  return { company: slug, name: r.name, data: r.data, enriched: false, next_run_utc: r.next_run_utc };
}
export async function getPitchbook(slug: string): Promise<Sourced<PitchbookResponse | null>> {
  const r = await get<PitchbookResponse | null>(`/pitchbook/${encodeURIComponent(slug)}`, () => pitchbookFromSnapshot(slug));
  // A live 200 with no record is still "answered": keep source 'live'. A live miss falls back to the snapshot above.
  if (r.source === "snapshot") return { ...r, fetched_at: pbSnap.fetched_at };
  return r;
}
/** Several PitchBook records in parallel (chat page pre-fetch for the default context companies), keyed by slug. */
export async function getPitchbookMany(slugs: string[]): Promise<Record<string, PitchbookResponse | null>> {
  const uniq = [...new Set(slugs)];
  const rs = await Promise.all(uniq.map(async (slug) => [slug, (await getPitchbook(slug)).data] as const));
  return Object.fromEntries(rs);
}
