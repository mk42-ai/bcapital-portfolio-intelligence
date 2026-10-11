import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Gauge, Handshake, Minus, Newspaper, Sparkles } from "lucide-react";
import type { Company, CompanySentiment, SignalScore } from "@/lib/types";
import { LogoImg } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";
import { Badge } from "@/components/ui/badge";
import "./detail-header.css";

/** Sector tint — mirrors web/src/lib/sector-color.ts when that lands at merge; local fallback otherwise. No blue hue (brand audit). */
const SECTOR_FILL: Record<string, string> = { Technology: "#0AC985", Healthcare: "#0D9488", "Energy & Resilience": "#F59E0B", Financial: "#A21CAF", Consumer: "#F97316", Industrial: "#65A30D" };
export function sectorFill(sector: string | null | undefined): string {
  if (!sector) return "#78716C";
  if (SECTOR_FILL[sector]) return SECTOR_FILL[sector];
  const k = Object.keys(SECTOR_FILL).find((s) => sector.toLowerCase().includes(s.toLowerCase().split(" ")[0]));
  return k ? SECTOR_FILL[k] : "#78716C";
}

export type LastDeal = { round: string; amount: string; date: string } | null;
const TIER_TONE: Record<string, "primary" | "info" | "accent" | "muted"> = { Verified: "primary", Observed: "info", "Third-party": "accent", Missing: "muted" };
const fmtScore = (n: number) => (n > 0 ? "+" : "") + n.toFixed(2);

function Tile({ label, icon, value, sub, testId }: { label: string; icon: ReactNode; value: ReactNode; sub?: ReactNode; testId: string }) {
  return (
    <div className="dh-tile" role="listitem" data-testid={testId}>
      <span className="dh-tile-label"><span className="dh-tile-icon" aria-hidden>{icon}</span>{label}</span>
      <span className="dh-tile-value tabular-nums">{value}</span>
      {sub && <span className="dh-tile-sub tabular-nums">{sub}</span>}
    </div>
  );
}

export function DetailHeader({ company, sentiment, newsCount, lastDeal, signal, source, sourceBadge }: {
  company: Company; sentiment: CompanySentiment | null; newsCount: number; lastDeal: LastDeal; signal?: SignalScore | null;
  /** fetch source of the company dataset (kept for parity with the page call-site; the resolved badge is passed in as `sourceBadge`) */
  source?: "live" | "snapshot"; sourceBadge?: ReactNode;
}) {
  const fill = sectorFill(company.sector);
  const tier = company.brand_tokens.evidence_tier ?? "Missing";
  const score = sentiment?.current?.score ?? company.sentiment?.score ?? null;
  const delta = sentiment?.delta ?? sentiment?.current?.delta ?? company.sentiment?.delta ?? null;
  const founded = (company as Company & { founded?: number | string | null }).founded ?? null;
  const metaLine = [company.sector, company.region, company.stage, founded ? `founded ${founded}` : null].filter(Boolean).join(" · ");
  const DeltaIcon = delta == null ? Minus : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <header className="dh" data-testid="company-detail-header" data-source={source} style={{ ["--dh-sector" as string]: fill }}>
      <div className="dh-band" aria-hidden data-hue-audit-ignore="sector-tint" />
      <div className="dh-body">
        <div className="dh-top">
          <div className="dh-logo">
            <LogoImg src={resolveLogo({ slug: company.slug, name: company.name, logoUrl: company.logo_url })} name={company.name} alt={`${company.name} logo`} size={44} eager imgClassName="max-h-11" className="text-xl" />
          </div>
          <div className="dh-title">
            <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{company.name}</h1>
            <p className="dh-meta"><span className="dh-dot" aria-hidden data-hue-audit-ignore="sector-tint" />{metaLine}</p>
            <p className="dh-meta-2">{company.status}{company.hq ? ` · ${company.hq}` : ""}{company.employees ? ` · ${company.employees.toLocaleString("en-US")} employees` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={TIER_TONE[tier] ?? "muted"}>evidence · {tier}</Badge>
              {company.is_focus && <Badge tone="primary">focus company</Badge>}
              {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="chip border-border bg-surface-2 text-foreground underline-offset-2 hover:underline">{company.website.replace(/^https?:\/\//, "")}</a>}
              {company.linkedin_url && <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="chip border-border bg-surface-2 text-foreground underline-offset-2 hover:underline">LinkedIn</a>}
            </div>
          </div>
          {sourceBadge && <div className="dh-source">{sourceBadge}</div>}
        </div>
        <div className="dh-kpis" role="list" aria-label="Key metrics">
          <Tile testId="dh-kpi-sentiment" label="Sentiment" icon={<Gauge size={14} />}
            value={score == null ? "—" : fmtScore(score)}
            sub={<span className={`dh-delta ${delta == null ? "" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}`}><DeltaIcon size={12} aria-hidden />{delta == null ? "first run" : `${fmtScore(delta)} vs prior run`}</span>} />
          <Tile testId="dh-kpi-news" label="News" icon={<Newspaper size={14} />} value={newsCount.toLocaleString("en-US")} sub="items" />
          <Tile testId="dh-kpi-deal" label="Last deal" icon={<Handshake size={14} />}
            value={lastDeal ? lastDeal.round : "—"} sub={lastDeal ? `${lastDeal.amount} · ${lastDeal.date}` : "no round-level data"} />
          <Tile testId="dh-kpi-signal" label="Signal" icon={<Sparkles size={14} />}
            value={signal ? signal.score : "—"} sub={signal ? `${signal.label} · ${Math.round(signal.confidence * 100)}% confidence` : "no snapshot yet"} />
        </div>
      </div>
    </header>
  );
}
