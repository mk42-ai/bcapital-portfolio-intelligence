import type { Metadata } from "next";
import { listCompanies, getSignals, getPitchbook } from "@/lib/api";
import { DEFAULT_FOCUS } from "@/lib/plugins";
import type { PitchbookResponse } from "@/lib/types";
import { ChatCanvas } from "@/components/chat/canvas/chat-canvas";
export const metadata: Metadata = { title: "Chat", description: "Analyst chat over the B Capital portfolio — ask about any portfolio company; answers stream with sources." };
export const revalidate = 120;
export default async function ChatPage() {
  const [cs, sig] = await Promise.all([listCompanies(), getSignals()]);
  const sigBy = new Map(sig.data.data.map((x) => [x.slug, x]));
  const companies = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, status: c.status, stage: c.stage, sentiment: { score: c.sentiment.score, label: c.sentiment.label, delta: c.sentiment.delta ?? null, updated_at: c.sentiment.updated_at ?? null, basis: c.sentiment.basis ?? null }, news_count: (c.latest_news ?? []).length, latest_news: (c.latest_news ?? []).slice(0, 5).map((n) => ({ title: n.title, url: n.url, published_at: n.published_at, source: n.source ?? null })), estimated_ticket_size_usd: c.estimated_ticket_size_usd, estimated_ownership_pct: c.estimated_ownership_pct, b_capital_role: c.b_capital_role }));
  const logos = new Map(cs.data.map((c) => [c.slug, c.logo_url]));
  // PitchBook drawer data is server-rendered from the stored workflow records (zero client fetch on first paint) for the default context companies.
  const pb = await Promise.all(DEFAULT_FOCUS.map(async (slug) => [slug, (await getPitchbook(slug)).data] as const));
  const pitchbook: Record<string, PitchbookResponse | null> = Object.fromEntries(pb);
  return (
    <ChatCanvas companies={companies} fetchedAt={cs.fetched_at} source={cs.source} pitchbook={pitchbook}
      sidebar={companies.map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, logo_url: logos.get(c.slug) ?? null, score: c.sentiment.score, news: c.latest_news.length, signal: sigBy.get(c.slug)?.score ?? null, signal_confidence: sigBy.get(c.slug)?.confidence ?? null, signal_percentile: sigBy.get(c.slug)?.percentile ?? null }))} />
  );
}
