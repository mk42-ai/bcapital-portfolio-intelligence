import "server-only";
import snapshot from "@/data/snapshot.json";
import type { Company, CompanySentiment, NewsItem, PortfolioSentiment, IngestRun } from "./types";

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
