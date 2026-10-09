import type { Metadata } from "next";
import { Suspense } from "react";
import { Cpu, HeartPulse, Zap } from "lucide-react";
import Link from "next/link";
import { listCompanies, getPortfolio, getRuns, getAllNews } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { KpiTiles } from "@/components/overview/kpi-tiles";
import { Filters } from "@/components/overview/filters";
import { StatusChips } from "@/components/overview/status-chips";
import { HeatmapSSR } from "@/components/charts/heatmap-ssr";
import { TreemapSSR } from "@/components/charts/treemap-ssr";
import { PagedTable } from "@/components/overview/paged-table";
import { HBar } from "@/components/charts/hbar";
import { Gauge } from "@/components/charts/gauge";
import { EstimateBadge } from "@/components/overview/estimate-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import OverviewSkeleton from "./loading";
import { statusChips, PORTFOLIO_EVENTS } from "@/lib/status";
import { fmtUsd, fmtPct, fmtScore, fmtDelta, SECTORS } from "@/lib/format";
import workflows from "@/data/workflows.json";

export const metadata: Metadata = { title: "Portfolio Overview", description: "B Capital portfolio overview: 136 records, sector/region treemap, KPI heatmap, sentiment gauges, status events and flagged ownership estimates." };
export const revalidate = 120;
const SECTOR_ICON = { Technology: Cpu, Healthcare: HeartPulse, "Energy & Resilience": Zap } as const;

export default function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Suspense fallback={<OverviewSkeleton />}><OverviewBody searchParams={searchParams} /></Suspense>;
}
async function OverviewBody({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [cs, pf, runs, news] = await Promise.all([listCompanies(), getPortfolio(), getRuns(), getAllNews()]);
  const all = cs.data.filter((c) => c.b_capital_role !== "firm");
  const newsCount = new Map<string, number>(); for (const n of news.data) newsCount.set(n.company_slug, (newsCount.get(n.company_slug) ?? 0) + 1);
  const lastRun = runs.data.find((r) => r.workflowName && r.workflowName !== "smoke") ?? runs.data[0];
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  const stageOf = (c: typeof all[number]) => c.stage ? (c.stage.match(/Series [A-Z]|Seed|IPO|Public|Growth|Late-stage/i)?.[0] ?? "Other") : "Unknown";
  const statusOf = (c: typeof all[number]) => c.status.startsWith("public") ? "public" : c.status.includes("unicorn") ? "unicorn" : c.status.includes("renamed") ? "renamed" : c.status.includes("merged") ? "merged" : "private";
  const filtered = all.filter((c) => (!sp.sector || c.sector === sp.sector) && (!sp.region || c.region === sp.region) && (!sp.stage || stageOf(c) === sp.stage) && (!sp.status || statusOf(c) === sp.status) && (!sp.role || c.b_capital_role === sp.role));
  const rows = filtered.map((c) => ({ ...c, newsCount: newsCount.get(c.slug) ?? 0 }));
  const groupBy: "sector" | "region" = sp.group === "region" ? "region" : "sector";
  const group = (key: "sector" | "region") => ({ name: "Portfolio", children: uniq(filtered.map((c) => c[key])).map((g) => ({ name: g, children: filtered.filter((c) => c[key] === g).map((c) => ({ name: c.name, slug: c.slug, value: Math.max(c.estimated_ticket_size_usd ?? 0, 2_000_000), score: c.sentiment.score })) })) });
  // Heatmap: focus companies + top movers + most-covered, capped at 24 rows for legibility; full table below covers the rest.
  const maxNews = Math.max(1, ...rows.map((r) => r.newsCount));
  const recency = (c: typeof all[number]) => { const d = c.latest_news?.map((n) => n.published_at).filter(Boolean).sort().at(-1); if (!d) return 0; const days = (Date.parse("2026-10-09") - Date.parse(d)) / 864e5; return Math.max(0, Math.min(100, Math.round(100 - days / 7.3))); };
  const heatRows = [...rows].sort((a, b) => (Number(b.is_focus) - Number(a.is_focus)) || (Math.abs(b.sentiment.delta ?? 0) - Math.abs(a.sentiment.delta ?? 0)) || (b.newsCount - a.newsCount)).slice(0, 24)
    .map((c) => ({ id: c.name, slug: c.slug, data: [{ x: "Sentiment", y: Math.round((c.sentiment.score + 1) * 50) }, { x: "News volume", y: Math.round((c.newsCount / maxNews) * 100) }, { x: "Funding recency", y: recency(c) }] }));
  const chips = [...all.flatMap((c) => statusChips(c).map((chip) => ({ chip, name: c.name, slug: c.slug }))), ...PORTFOLIO_EVENTS.map((chip) => ({ chip, name: "Synack", slug: null as string | null }))].sort((a, b) => (b.chip.date ?? "").localeCompare(a.chip.date ?? ""));
  const sectorRoll = (s: string) => pf.data.sectors.find((r) => r.key === s);
  const est = [...all].filter((c) => c.estimated_ticket_size_usd).sort((a, b) => (b.estimated_ticket_size_usd ?? 0) - (a.estimated_ticket_size_usd ?? 0)).slice(0, 10);
  const counts = { public: all.filter((c) => statusOf(c) === "public").length, unicorn: all.filter((c) => statusOf(c) === "unicorn").length, renamed: all.filter((c) => statusOf(c) === "renamed").length };
  return (
    <>
      
      <PageHeader title="Portfolio Overview" lede={`${all.length} portfolio companies + the firm record (136 spec records). Sentiment scored daily at 06:00 UTC by ${workflows.model} across ${workflows.workflows.length} Flow Builder workflows.`} source={cs.source} fetchedAt={cs.fetched_at} />
      <KpiTiles tiles={[
        { label: "Companies", value: String(all.length), sub: `${all.filter((c) => c.in_brand_matrix).length} in brand matrix` },
        { label: "Sectors", value: String(uniq(all.map((c) => c.sector)).length), sub: SECTORS.join(" · ") },
        { label: "Public / IPO", value: String(counts.public), sub: "Fervo (FRVO), Meesho" },
        { label: "Unicorn / renamed", value: `${counts.unicorn} / ${counts.renamed}`, sub: "Code Metal · Judi Rx" },
        { label: "Portfolio sentiment", value: fmtScore(pf.data.portfolio?.avg_score ?? 0), sub: `${pf.data.portfolio?.label ?? "—"} · Δ ${fmtDelta(pf.data.portfolio?.delta)}` },
        { label: "Last workflow run", value: lastRun ? lastRun.receivedAt.slice(11, 16) + " UTC" : "—", sub: lastRun ? `${lastRun.workflowName ?? lastRun.source} · ${lastRun.receivedAt.slice(0, 10)}` : "no runs yet" },
      ]} />
      <Suspense fallback={<Skeleton className="mb-6 h-24 w-full" />}>
        <Filters sectors={uniq(all.map((c) => c.sector))} regions={uniq(all.map((c) => c.region))} stages={uniq(all.map(stageOf))} statuses={["private", "public", "unicorn", "renamed", "merged"]} />
      </Suspense>
      <p className="mb-4 text-sm text-muted" role="status">{filtered.length === all.length ? `Showing all ${all.length} companies` : `Showing ${filtered.length} of ${all.length} companies`}</p>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" id="treemap"><CardHeader><CardTitle>Sector / region treemap</CardTitle><CardDescription>Tile size = estimated B Capital ticket (flagged estimates, min $2M floor for visibility); click a tile to open the company.</CardDescription></CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Group treemap by" className="mb-3 inline-flex h-10 items-center rounded-lg bg-surface-2 p-1">
              {(["sector", "region"] as const).map((m) => { const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "e2e") as [string, string][]); p.set("group", m); return <a key={m} href={`/overview?${p.toString()}#treemap`} role="radio" aria-checked={groupBy === m} className={`inline-flex min-h-8 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-ring ${groupBy === m ? "bg-surface text-foreground shadow" : "text-muted"}`}>By {m}</a>; })}
            </div>
            {filtered.length ? <TreemapSSR data={group(groupBy)} mode={groupBy} /> : <p className="text-sm text-muted">No companies match these filters.</p>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Sentiment gauges by sector</CardTitle><CardDescription>Average workflow score, −1 … +1</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {(["Technology", "Healthcare", "Energy & Resilience"] as const).map((s) => { const r = sectorRoll(s); const Icon = SECTOR_ICON[s]; return (
              <div key={s} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                <span className="hidden size-10 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-muted sm:grid" aria-hidden><Icon className="size-5" strokeWidth={1.75} /></span>
                <div className="flex-1"><p className="text-sm font-semibold">{s}</p><p className="text-xs text-muted">{r?.company_count ?? 0} companies · {r?.label ?? "—"} · Δ {fmtDelta(r?.delta)}</p></div>
                <div className="w-28"><Gauge score={r?.avg_score ?? 0} label={s} size={112} /></div>
              </div>); })}
          </CardContent></Card>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle>KPI heatmap</CardTitle><CardDescription>Rows: focus companies + top movers (24). Columns scaled 0–100: sentiment, news volume, funding recency.</CardDescription></CardHeader><CardContent><HeatmapSSR rows={heatRows} /></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Estimated ownership & ticket</CardTitle><CardDescription>Every value is a flagged estimate — hover/focus the badge for <code>estimate_confidence</code> + <code>estimate_rationale</code>.</CardDescription></CardHeader>
          <CardContent>
            <HBar ariaLabel="Top 10 estimated B Capital ticket sizes in USD" data={est.map((c) => ({ name: c.name, value: c.estimated_ticket_size_usd ?? 0, color: c.estimate_confidence === "medium" ? "var(--chart-2)" : c.estimate_confidence === "high" ? "var(--chart-1)" : "var(--chart-3)" }))} format={(v) => fmtUsd(v)} />
            <ul className="mt-3 divide-y divide-border text-sm">
              {est.slice(0, 6).map((c) => <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link href={`/company/${c.slug}`} className="font-medium underline-offset-2 hover:underline">{c.name}</Link><span className="tabular-nums text-muted">{fmtUsd(c.estimated_ticket_size_usd)} · {fmtPct(c.estimated_ownership_pct)} · {c.b_capital_role}</span><EstimateBadge confidence={c.estimate_confidence} rationale={c.estimate_rationale} /></li>)}
            </ul>
          </CardContent></Card>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle>Status events</CardTitle><CardDescription>IPO · rebrand · acquired · unicorn · funding — from the status-change register (dates verified 2026-10-09).</CardDescription></CardHeader><CardContent><StatusChips items={chips} /></CardContent></Card>

      <Card className="mt-5"><CardHeader><CardTitle>Top movers</CardTitle><CardDescription>Largest sentiment deltas vs the previous workflow run</CardDescription></CardHeader>
        <CardContent><ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{pf.data.top_movers.slice(0, 5).map((m) => <li key={m.slug} className="rounded-lg border border-border bg-surface-2 p-3"><Link href={`/company/${m.slug}`} className="font-medium underline-offset-2 hover:underline">{m.name}</Link><p className="mt-1 text-sm tabular-nums">{fmtScore(m.score)} <Badge tone={m.delta >= 0 ? "primary" : "danger"}>{fmtDelta(m.delta)}</Badge></p><p className="text-xs text-muted">{m.sector} · {m.label}</p></li>)}</ul></CardContent></Card>

      <Card className="mt-5"><CardHeader><CardTitle>All companies ({rows.length})</CardTitle><CardDescription>Accessible table equivalent of the treemap and heatmap. Scroll horizontally on small screens.</CardDescription></CardHeader>
        <CardContent><PagedTable rows={rows.sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, region: c.region, b_capital_role: c.b_capital_role, estimated_ticket_size_usd: c.estimated_ticket_size_usd, estimated_ownership_pct: c.estimated_ownership_pct, estimate_confidence: c.estimate_confidence, estimate_rationale: c.estimate_rationale, is_focus: c.is_focus, score: c.sentiment.score, delta: c.sentiment.delta ?? null, newsCount: c.newsCount }))} caption="Portfolio companies with sentiment, news count and flagged estimates" /></CardContent></Card>
    </>
  );
}
