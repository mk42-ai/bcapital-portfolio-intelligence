"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { resolveLogo } from "@/lib/local-logos";
import { BrandIcon } from "@/components/ui/brand-icon";
import { brandIconForCompany } from "@/lib/brand-icons";
import { imageSrc } from "@/lib/img-proxy";
import { fmtScore, fmtUsd } from "@/lib/format";
import "./company-card.css";

/**
 * Minimal row shape the card needs — `CompanyListRow` (companies-list.tsx) is structurally assignable. The optional
 * `delta` / `stage` / `last_deal` fields are rendered only when the row carries them (page.tsx may add them later).
 */
export type CompanyCardRow = {
  slug: string; name: string; logo_url: string | null; sector: string; region: string; score: number; newsCount: number;
  /** sentiment delta vs prior run — null/undefined = "first run" */ delta?: number | null;
  stage?: string | null;
  last_deal?: { round?: string | null; amount_usd?: number | null; date?: string | null } | null;
};

export type CompanyCardVariant = "list" | "grid";

/** Local fallback sector tint map (same as a19) — [tile bg, ink]. Superseded by `sectorColor()` if lib/sector-color.ts lands. */
const SECTOR_TINT: Record<string, [string, string]> = {
  "Technology": ["#0AC985", "#047857"],
  "Healthcare": ["#0D9488", "#115E59"],
  "Energy & Resilience": ["#F59E0B", "#92400E"],
  "Financial": ["#A21CAF", "#701A75"],
  "Consumer": ["#F97316", "#9A3412"],
  "Industrial": ["#65A30D", "#3F6212"],
};
const OTHER_TINT: [string, string] = ["#78716C", "#44403C"];
export function sectorTint(sector: string | null | undefined): [string, string] {
  if (!sector) return OTHER_TINT;
  const key = Object.keys(SECTOR_TINT).find((k) => sector.toLowerCase().startsWith(k.toLowerCase().split(" ")[0]));
  return key ? SECTOR_TINT[key] : OTHER_TINT;
}
const monogram = (name: string) => { const ch = (name.trim()[0] ?? "·").toUpperCase(); return ch; };

function LogoOrMonogram({ row }: { row: CompanyCardRow }) {
  const [bg, ink] = sectorTint(row.sector);
  const resolved = imageSrc(resolveLogo({ slug: row.slug, name: row.name, logoUrl: row.logo_url }), 120);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [resolved]);
  if (!resolved || failed) {
    return (
      <span className="company-card-chip company-card-chip--mono" data-testid="company-card-monogram" role="img" aria-label={row.name} title={row.name}
        style={{ background: `color-mix(in srgb, ${bg} 14%, #fff)`, color: ink, borderColor: `color-mix(in srgb, ${bg} 35%, #fff)` }}>
        {monogram(row.name)}
      </span>
    );
  }
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); };
  return (
    <span className="company-card-chip" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="company-card-logo" src={resolved} alt="" title={row.name} width={38} height={38} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={onLoad} />
    </span>
  );
}

function SentimentPill({ score, delta }: { score: number; delta: number | null | undefined }) {
  const dir = delta == null ? "first" : delta > 0.005 ? "up" : delta < -0.005 ? "down" : "flat";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const label = dir === "first" ? "first run" : dir === "flat" ? "no change" : `${delta! > 0 ? "+" : ""}${delta!.toFixed(2)} vs prior run`;
  return (
    <span className="company-card-sentiment" data-testid="company-card-sentiment" data-dir={dir} title={`Sentiment ${fmtScore(score)} · ${label}`}>
      <span className="company-card-score">{fmtScore(score)}</span>
      <Icon className="company-card-delta" aria-hidden />
      <span className="sr-only">{label}</span>
      {dir === "first" && <span className="company-card-first" aria-hidden>first run</span>}
    </span>
  );
}

function LastDeal({ row }: { row: CompanyCardRow }) {
  const d = row.last_deal;
  const parts = [d?.round ?? row.stage ?? null, d?.amount_usd != null ? fmtUsd(d.amount_usd) : null, d?.date ? d.date.slice(0, 10) : null].filter((p): p is string => !!p);
  if (!d && !row.stage) return null;
  if (parts.length === 0) return null;
  return <p className="company-card-deal" data-testid="company-card-deal">{parts.join(" · ")}</p>;
}

export type CompanyCardProps = {
  row: CompanyCardRow;
  /** max news count across the visible list — bar width = newsCount / maxNews */
  maxNews: number;
  variant?: CompanyCardVariant;
  /** attributes spread onto the name <Link> (data-index, data-testid, tabIndex, onFocus for roving focus) */
  linkProps?: Record<string, unknown>;
  children?: ReactNode;
};

/**
 * Company card: 40px logo chip (img → sector-tinted monogram on error/null), name link + "region · stage" muted line,
 * sector tag pill, sentiment pill (score 2dp + delta arrow), optional last-deal line, and a 4px news bar proportional to
 * `newsCount / maxNews`. `variant="list"` is a 72px-min 3-column grid `[40px 1fr auto]`; `variant="grid"` is a 160px
 * 2-row card. Light-only, state-only colour (brand green up / red down / grey first-run).
 */
export function CompanyCard({ row, maxNews, variant = "list", linkProps, children }: CompanyCardProps) {
  const pct = maxNews > 0 ? Math.max(0, Math.min(100, (row.newsCount / maxNews) * 100)) : 0;
  const sub = [row.region, row.stage ?? null].filter(Boolean).join(" · ");
  return (
    <div className="company-card" data-testid="company-card" data-variant={variant} data-sector={row.sector}>
      <LogoOrMonogram row={row} />
      <div className="company-card-main">
        <div className="company-card-title">
          <Link href={`/company/${row.slug}`} {...linkProps} className="company-card-link focus-visible:outline-3 focus-visible:outline-ring"><span data-testid="company-row-name">{row.name}</span></Link>
          <span className="chip-sector" data-sector={row.sector} data-testid="company-card-sector">{brandIconForCompany(row.slug, row.sector) && <BrandIcon name={brandIconForCompany(row.slug, row.sector)!} size={14} slot="company-card" className="mr-1 align-[-3px]" />}{row.sector}</span>
        </div>
        <p className="company-card-sub">{sub || "—"}</p>
        <LastDeal row={row} />
        {children}
      </div>
      <div className="company-card-side">
        <SentimentPill score={row.score} delta={row.delta} />
        <div className="company-card-news" data-testid="company-card-news" data-count={row.newsCount} title={`${row.newsCount} news items`}>
          <span className="company-card-news-track" aria-hidden><span className="company-card-news-fill" style={{ width: `${pct}%` }} /></span>
          <span className="company-card-news-count">{row.newsCount}<span className="sr-only"> news items</span></span>
        </div>
      </div>
    </div>
  );
}
