import type { Metadata } from "next";
import { listCompanies } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { ChatShell } from "@/components/chat/open-intelligent-ui/chat-shell";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
export const metadata: Metadata = { title: "Chat", description: "Analyst chat over the B Capital portfolio, streamed from OnDemand (DeepSeek Flash v4.1 · reasoning medium · Perplexity) through the server proxy." };
export const revalidate = 120;
export default async function ChatPage() {
  const cs = await listCompanies();
  const companies = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, status: c.status, stage: c.stage, sentiment: { score: c.sentiment.score, label: c.sentiment.label, delta: c.sentiment.delta ?? null, updated_at: c.sentiment.updated_at ?? null, basis: c.sentiment.basis ?? null }, news_count: (c.latest_news ?? []).length, latest_news: (c.latest_news ?? []).slice(0, 5).map((n) => ({ title: n.title, url: n.url, published_at: n.published_at, source: n.source ?? null })), estimated_ticket_size_usd: c.estimated_ticket_size_usd, estimated_ownership_pct: c.estimated_ownership_pct, b_capital_role: c.b_capital_role }));
  const logos = new Map(cs.data.map((c) => [c.slug, c.logo_url]));
  return (
    <>
      <PageHeader title="Analyst chat" lede="Open Intelligent UI chat shell (OpenUI AgentInterface) streaming OnDemand answers with Perplexity sources through the server-side proxy." source={cs.source} fetchedAt={cs.fetched_at} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ChatShell companies={companies} fetchedAt={cs.fetched_at} />
        <ChatSidebar companies={companies.map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, logo_url: logos.get(c.slug) ?? null, score: c.sentiment.score, news: c.latest_news.length }))} />
      </div>
    </>
  );
}
