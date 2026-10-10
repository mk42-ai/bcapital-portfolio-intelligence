import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getNews, getSentiment, getSignal, listCompanies } from "@/lib/api";
import { CompanyThemeScope, Swatches } from "@/components/company/brand-theme";
import { FundingTimeline } from "@/components/company/funding-timeline";
import { NewsCard } from "@/components/company/news-cards";
import { SentimentPanel } from "@/components/company/sentiment-panel";
import { SignalPanel } from "@/components/company/signal-panel";
import { PitchbookPanel } from "@/components/company/pitchbook-panel";
import { SignalMini } from "@/components/charts/signal-bullet";
import { EstimateBadge } from "@/components/overview/estimate-badge";
import { StatusChips } from "@/components/overview/status-chips";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LogoImg } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";
import { statusChips } from "@/lib/status";
import { fmtUsd, fmtPct } from "@/lib/format";
import workflows from "@/data/workflows.json";

export const revalidate = 120;
export async function generateStaticParams() { const cs = await listCompanies(); return cs.data.filter((c) => c.is_focus || c.slug === "b-capital" || c.slug === "judi-rx" || c.slug === "code-metal" || c.slug === "meesho").map((c) => ({ slug: c.slug })); }
// Do NOT call notFound() here: a notFound() thrown from generateMetadata on an ISR route is handled outside the segment boundary, which
// made unknown slugs answer HTTP 200 with the root not-found body on the deployed build. The page component below throws notFound()
// itself, so the segment-level not-found.tsx renders with a real 404 status; metadata just falls back to a noindex title.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const c = await getCompany(slug); if (!c.data) return { title: "Company not found", robots: { index: false, follow: false } }; return { title: `${c.data.name} — ${c.data.sector}`, description: `${c.data.name}: brand palette, fonts, sentiment timeline, funding timeline and news.` }; }
const TIER_TONE: Record<string, "primary" | "info" | "accent" | "muted"> = { Verified: "primary", Observed: "info", "Third-party": "accent", Missing: "muted" };

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCompany(slug); if (!c.data) notFound();
  const company = c.data;
  const [news, sent, sig] = await Promise.all([getNews(company.slug), getSentiment(company.slug), getSignal(company.slug)]);
  const tier = company.brand_tokens.evidence_tier ?? "Missing";
  const wf = workflows.workflows.find((w) => w.id === sent.data?.history?.find((h) => h.workflow_id)?.workflow_id) ?? (company.is_focus ? workflows.workflows[0] : null);
  const lastScored = sent.data?.history?.find((h) => h.model && h.model !== "seed");
  return (
    <CompanyThemeScope tokens={company.brand_tokens}>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted"><Link href="/overview" className="underline-offset-2 hover:underline">Overview</Link> <span aria-hidden>/</span> <span aria-current="page">{company.name}</span></nav>
      <header className="mb-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start gap-5 p-6">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white p-2">
            <LogoImg src={resolveLogo({ slug: company.slug, name: company.name, logoUrl: company.logo_url })} name={company.name} alt={`${company.name} logo`} size={64} eager imgClassName="max-h-16" className="text-2xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted"><span className="inline-block size-2.5 rounded-full border border-border" style={{ background: "var(--co-accent)" }} aria-hidden />{company.sector} · {company.region}</p>
            <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-semibold sm:text-4xl">{company.name}{sig.data && <span className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-muted" title={`Signal Score ${sig.data.data.score} / 100`}><SignalMini score={sig.data.data.score} confidence={sig.data.data.confidence} percentile={sig.data.data.percentile} label={sig.data.data.label} name={company.name} /><span className="tabular-nums">{sig.data.data.score}</span></span>}</h1>
            <p className="mt-1 text-sm text-muted">{company.status}{company.hq ? ` · ${company.hq}` : ""}{company.employees ? ` · ${company.employees.toLocaleString()} employees` : ""}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={TIER_TONE[tier] ?? "muted"}>evidence · {tier}</Badge>
              {company.is_focus && <Badge tone="primary">focus company</Badge>}
              {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="chip border-border bg-surface-2 text-foreground underline-offset-2 hover:underline">{company.website.replace(/^https?:\/\//, "")}</a>}
              {company.linkedin_url && <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="chip border-border bg-surface-2 text-foreground underline-offset-2 hover:underline">LinkedIn</a>}
            </div>
          </div>
        </div>
      </header>
      <p className="mb-5 text-xs text-muted">Data source: <Badge tone={c.source === "live" ? "primary" : "muted"}>{c.source === "live" ? "live backend" : "cached snapshot"}</Badge> · Last updated by daily workflow <time dateTime={lastScored?.recorded_at ?? company.updated_at}>{lastScored?.recorded_at ?? company.updated_at}</time>{wf ? <> (workflow <code>{wf.id}</code> · {wf.name}, {workflows.schedule_human}, model {workflows.model})</> : <> (seed data — first scoring run lands at the next {workflows.schedule_human} cycle)</>} · source {c.source}</p>
      {statusChips(company).length > 0 && <div className="mb-5"><StatusChips items={statusChips(company).map((chip) => ({ chip, name: company.name, slug: null }))} /></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Brand palette & type</CardTitle><CardDescription>Hex values from the brand matrix with WCAG 2.2 contrast against the company background. The company primary is used only as the small accent chip above (AA-checked at runtime); the page itself stays neutral.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><Swatches tokens={company.brand_tokens} />
            <div><h3 className="text-sm font-semibold">Fonts</h3>{company.brand_tokens.fonts?.length ? <ul className="mt-1 flex flex-wrap gap-2">{company.brand_tokens.fonts.map((f) => <li key={f}><Badge>{f}</Badge></li>)}</ul> : <p className="text-sm text-muted">No fonts observed.</p>}{company.brand_tokens.guideline_url && <p className="mt-2 text-sm"><a href={company.brand_tokens.guideline_url} target="_blank" rel="noopener noreferrer" className="text-primary-soft underline-offset-2 hover:underline">Official brand guidelines ↗</a></p>}</div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle>B Capital position</CardTitle><CardDescription>Role, fund and flagged estimates</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted">Role</span> · <strong>{company.b_capital_role}</strong>{company.b_capital_fund && <> · {company.b_capital_fund}</>}</p>
            {company.b_capital_round && <p><span className="text-muted">Round</span> · {company.b_capital_round}</p>}
            {company.stage && <p><span className="text-muted">Stage</span> · {company.stage}</p>}
            <p className="flex flex-wrap items-center gap-2"><span className="text-muted">Est. ticket</span> <strong className="tabular-nums">{fmtUsd(company.estimated_ticket_size_usd)}</strong><span className="text-muted">Est. ownership</span> <strong className="tabular-nums">{fmtPct(company.estimated_ownership_pct)}</strong><EstimateBadge confidence={company.estimate_confidence} rationale={company.estimate_rationale} /></p>
            <p className="text-xs text-muted">{company.estimate_rationale}</p>
          </CardContent></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Signal Score &amp; sentiment timeline</CardTitle><CardDescription>Evidence-weighted Signal Score (0–100, z within portfolio + sector) above the daily {workflows.model} sentiment from LinkedIn, Reddit, X and news evidence</CardDescription></CardHeader><CardContent className="space-y-5">{sig.data ? <SignalPanel s={sig.data.data} bands={sig.data.bands} name={company.name} /> : <p className="text-sm text-muted">Signal Score unavailable (backend offline — no snapshot yet).</p>}{sent.data ? <div className="border-t border-border pt-4"><SentimentPanel s={sent.data} /></div> : <p className="text-sm text-muted">No sentiment yet.</p>}</CardContent></Card>
        <Card data-testid="pitchbook-card"><CardHeader><CardTitle>PitchBook</CardTitle><CardDescription>Investor matches from the PitchBook Investor Finder plugin</CardDescription></CardHeader><CardContent><PitchbookPanel company={company} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Funding timeline</CardTitle><CardDescription>PitchBook-style: round · date · amount · post-money · lead · B Capital participation</CardDescription></CardHeader><CardContent><FundingTimeline company={company} /></CardContent></Card>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle>News ({news.data.length})</CardTitle><CardDescription>Perplexity results written back by the workflow, newest first, with source citations</CardDescription></CardHeader>
        <CardContent>{news.data.length ? <div className="grid min-w-0 gap-3 md:grid-cols-2">{news.data.map((n, i) => <NewsCard key={n.id} n={n} companyName={company.name} companySlug={company.slug} companyLogo={company.logo_url} eager={i < 6} />)}</div> : <EmptyState kind="news" title="No news yet for this company" body="The daily workflow (06:00 UTC) adds Perplexity news with sources and images as it finds them." action={<Button asChild variant="outline"><Link href="/news">Open News Pulse</Link></Button>} />}</CardContent></Card>

      {company.sources?.length > 0 && <details className="mt-5 text-xs text-muted"><summary className="cursor-pointer">Brand-matrix sources ({company.sources.length})</summary><ul className="mt-2 space-y-1">{company.sources.map((s, i) => <li key={i} className="break-all">{s}</li>)}</ul></details>}
    </CompanyThemeScope>
  );
}
