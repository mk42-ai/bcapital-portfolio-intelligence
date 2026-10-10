import type { Metadata } from "next";
import { listCompanies, getSignals } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { CompaniesList } from "@/components/companies/companies-list";

export const metadata: Metadata = { title: "Companies", description: "All 136 B Capital portfolio companies in one window-scrolled, virtualized list with search, sector filter, sort and an A–Z jump rail." };
export const revalidate = 120;

export default async function CompaniesPage() {
  const [cs, sig] = await Promise.all([listCompanies(), getSignals()]);
  const sigBy = new Map(sig.data.data.map((x) => [x.slug, x]));
  const rows = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({
    slug: c.slug, name: c.name, logo_url: c.logo_url, sector: c.sector, region: c.region, score: c.sentiment.score, newsCount: c.latest_news?.length ?? 0,
    signal: sigBy.get(c.slug)?.score ?? null, signal_confidence: sigBy.get(c.slug)?.confidence ?? null, signal_percentile: sigBy.get(c.slug)?.percentile ?? null,
  }));
  return (
    <>
      <PageHeader title="Companies" lede={`${rows.length} portfolio companies. Search, filter by sector, sort by name / Signal Score / sector, or use the A–Z rail. The page itself is the only scroller — arrow keys move between rows.`} source={cs.source} fetchedAt={cs.fetched_at} />
      <CompaniesList rows={rows} total={rows.length} />
    </>
  );
}
