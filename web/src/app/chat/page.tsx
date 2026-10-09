import type { Metadata } from "next";
import { listCompanies } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { ChatView } from "@/components/chat/chat-view";
export const metadata: Metadata = { title: "Chat" };
export const revalidate = 120;
export default async function ChatPage() {
  const cs = await listCompanies();
  const companies = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, status: c.status, stage: c.stage, sentiment: { score: c.sentiment.score, label: c.sentiment.label, delta: c.sentiment.delta ?? null }, latest_news: (c.latest_news ?? []).slice(0, 5).map((n) => ({ title: n.title, url: n.url, published_at: n.published_at })), estimated_ticket_size_usd: c.estimated_ticket_size_usd, estimated_ownership_pct: c.estimated_ownership_pct, b_capital_role: c.b_capital_role }));
  return (<><PageHeader title="Analyst chat" lede="SSE streaming over the OnDemand Chat & Agent Tools API via the same-origin proxy — your key never leaves your browser except as the x-ondemand-key header." /><ChatView companies={companies} /></>);
}
