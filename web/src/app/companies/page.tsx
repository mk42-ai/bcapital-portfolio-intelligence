import type { Metadata } from "next";
import { Suspense } from "react";
import { listCompanies, getSignals } from "@/lib/api";
import { resolveLogo } from "@/lib/local-logos";
import { PageHeader } from "@/components/shell/page-header";
import { CompaniesList, type CompanyListRow } from "@/components/companies/companies-list";

export const metadata: Metadata = { title: "Companies", description: "All 136 B Capital portfolio companies in one window-scrolled, virtualized list with search, sector filter, sort and an A–Z jump rail." };
export const revalidate = 120;

const SKELETON_ROWS = 12;

/** a36: only the fields the list renders cross the RSC boundary (no brand_tokens / latest_news / sentiment detail); numbers are rounded so the
 * serialized props stay small, and the logo is resolved server-side (local mark or a real http(s) URL, else null → monogram). */
async function rowsForList() {
  const [cs, sig] = await Promise.all([listCompanies(), getSignals()]);
  const sigBy = new Map(sig.data.data.map((x) => [x.slug, x]));
  const r2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);
  const rows = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => {
    const s = sigBy.get(c.slug);
    return {
      slug: c.slug, name: c.name, logo_url: resolveLogo({ slug: c.slug, name: c.name, logoUrl: c.logo_url }), sector: c.sector, region: c.region,
      score: r2(c.sentiment.score) ?? 0, delta: c.sentiment.delta ?? null, stage: c.stage ?? null, newsCount: c.news_count ?? c.latest_news?.length ?? 0,
      signal: s?.score == null ? null : Math.round(s.score), signal_confidence: r2(s?.confidence), signal_percentile: s?.percentile == null ? null : Math.round(s.percentile),
    } satisfies CompanyListRow;
  });
  return { rows, source: cs.source, fetchedAt: cs.fetched_at };
}

/** Same geometry as the real rows (65px desktop / 85px mobile incl. border) so the stream-in swap causes no layout shift. */
function ListSkeleton() {
  return (
    <div aria-hidden data-testid="companies-skeleton" className="animate-pulse">
      <div className="mb-2 h-12 border-b border-border" />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="flex min-h-[84px] items-center gap-3 border-b border-border px-1 py-2 lg:min-h-16">
          <span className="size-7 shrink-0 rounded border border-border bg-surface-2" />
          <span className="h-4 w-40 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

async function CompaniesBody() {
  const { rows, source, fetchedAt } = await rowsForList();
  return (
    <>
      <PageHeader title="Companies" lede={`${rows.length} portfolio companies. Search, filter by sector, sort by name / Signal Score / sector, or use the A–Z rail. The page itself is the only scroller — arrow keys move between rows.`} source={source} fetchedAt={fetchedAt} />
      <CompaniesList rows={rows} total={rows.length} />
    </>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<><PageHeader title="Companies" lede="Loading the portfolio list…" /><ListSkeleton /></>}>
      <CompaniesBody />
    </Suspense>
  );
}
