import type { Metadata } from "next";
import Link from "next/link";
import { listCompanies, getSignals } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CompareStrip, type CompareRow } from "@/components/companies/compare-strip";
import { fmtUsd } from "@/lib/format";

export const metadata: Metadata = { title: "Compare", description: "Side-by-side comparison of 2–5 B Capital portfolio companies: sentiment, news, stage, region, last deal and Signal Score." };
export const revalidate = 120;

const MAX = 5;
/** `?slugs=a,b,c` (also accepts repeated `slugs=` and `slug=` params): dedupe, keep order, cap at 5. */
function parseSlugs(sp: Record<string, string | string[] | undefined>): string[] {
  const raw = ([] as (string | undefined)[]).concat(sp.slugs, sp.slug).filter((v): v is string => typeof v === "string");
  const out: string[] = [];
  for (const part of raw.join(",").split(",")) {
    const s = part.trim().toLowerCase();
    if (s && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= MAX) break;
  }
  return out;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const wanted = parseSlugs(sp);
  const [cs, sig] = await Promise.all([listCompanies(), getSignals()]);
  const bySlug = new Map(cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => [c.slug, c]));
  const sigBy = new Map(sig.data.data.map((x) => [x.slug, x]));
  const found = wanted.filter((s) => bySlug.has(s));
  const unknown = wanted.filter((s) => !bySlug.has(s));
  const rows: CompareRow[] = found.map((s) => {
    const c = bySlug.get(s)!;
    const deal = c.b_capital_round ? `${c.b_capital_round}${c.estimated_ticket_size_usd ? ` · ${fmtUsd(c.estimated_ticket_size_usd)}` : ""}` : null;
    return {
      slug: c.slug, name: c.name, logo_url: c.logo_url, sector: c.sector, region: c.region, stage: c.stage,
      score: c.sentiment?.score ?? null, delta: c.sentiment?.delta, news: c.news_count ?? c.latest_news?.length ?? 0,
      lastDeal: deal, signal: sigBy.get(c.slug)?.score ?? null,
    };
  });
  const enough = rows.length >= 2;
  const lede = enough ? `${rows.length} companies side by side. Rows share one label gutter; the best value per numeric row is marked in green.${unknown.length ? ` Unknown slug${unknown.length > 1 ? "s" : ""} ignored: ${unknown.join(", ")}.` : ""}` : undefined;
  return (
    <>
      <PageHeader title="Compare" lede={lede} source={cs.source} fetchedAt={cs.fetched_at} />
      {enough ? (
        <CompareStrip rows={rows} />
      ) : (
        <EmptyState kind="picker" title="Pick 2–5 companies to compare" body={rows.length === 1 ? `Only ${rows.length} valid company in the link — add at least one more.` : "Open the companies list, choose up to five, then come back with ?slugs=a,b,c."}
          action={<Link href="/companies" className="text-sm font-semibold text-[var(--brand-green-ink)] underline-offset-4 hover:underline" data-testid="compare-empty-link">Browse companies →</Link>} />
      )}
    </>
  );
}
