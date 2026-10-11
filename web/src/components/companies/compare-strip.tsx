import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { fmtScore } from "@/lib/format";
import "./compare-strip.css";

/**
 * Side-by-side compare strip for 2–5 companies: one equal-width column per company (min 220px, 160px + scroll-snap at ≤390px),
 * a shared left label gutter so every row aligns for scanning, and a subtle green ink on the best value of each numeric row.
 * Light-only, brand green is the only accent. Server component (no state) — rendered by /compare.
 * Merge hint (a19): if `web/src/lib/sector-color.ts` exports `sectorColor(sector)`, swap SECTOR_FALLBACK for it below.
 */
export type CompareRow = {
  slug: string; name: string; logo_url: string | null; sector: string; region: string; stage: string | null;
  score: number | null; delta: number | null | undefined; news: number;
  lastDeal: string | null; signal: number | null;
};

const SECTOR_FALLBACK: Record<string, { ink: string; bg: string }> = {
  Technology: { ink: "#047857", bg: "#E6FAF3" },
  Healthcare: { ink: "#9D174D", bg: "#FCE7F3" },
  "Energy & Resilience": { ink: "#B45309", bg: "#FEF3C7" },
  Opportunistic: { ink: "#4B4F55", bg: "#F1F2F4" },
};
function sectorColorFallback(sector: string) { return SECTOR_FALLBACK[sector] ?? SECTOR_FALLBACK.Opportunistic; }

function best(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  return xs.length > 1 ? Math.max(...xs) : null;
}

function Delta({ d }: { d: number | null | undefined }) {
  if (d == null) return <span className="compare-delta compare-delta--first">first run</span>;
  if (d === 0) return <span className="compare-delta"><Minus className="size-3" aria-hidden /> ±0.00</span>;
  const up = d > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={up ? "compare-delta compare-delta--up" : "compare-delta compare-delta--down"} aria-label={`${up ? "up" : "down"} ${Math.abs(d).toFixed(2)} vs prior run`}><Icon className="size-3" aria-hidden /> {up ? "+" : "−"}{Math.abs(d).toFixed(2)}</span>;
}

export function CompareStrip({ rows }: { rows: CompareRow[] }) {
  const bestScore = best(rows.map((r) => r.score));
  const bestNews = best(rows.map((r) => r.news));
  const bestSignal = best(rows.map((r) => r.signal));
  const hasDeal = rows.some((r) => r.lastDeal);
  const hasSignal = rows.some((r) => r.signal != null);
  const labels: { key: string; label: string }[] = [
    { key: "sentiment", label: "Sentiment" }, { key: "news", label: "News" }, { key: "stage", label: "Stage" }, { key: "region", label: "Region" },
    ...(hasDeal ? [{ key: "deal", label: "Last deal" }] : []), ...(hasSignal ? [{ key: "signal", label: "Signal" }] : []),
  ];
  return (
    <div className="compare-strip" data-testid="compare-strip" role="table" aria-label={`Comparing ${rows.length} companies`} style={{ ["--compare-n" as string]: rows.length }}>
      <div className="compare-gutter" role="rowgroup" aria-hidden>
        <div className="compare-head compare-gutter-head" />
        {labels.map((l) => <div key={l.key} className="compare-row-label" role="rowheader">{l.label}</div>)}
      </div>
      <div className="compare-cols" role="rowgroup">
        {rows.map((r) => {
          const sc = sectorColorFallback(r.sector);
          return (
            <div key={r.slug} className="compare-col" data-slug={r.slug} role="row">
              <div className="compare-head" role="cell">
                <CompanyLogo name={r.name} src={r.logo_url} slug={r.slug} size={36} eager />
                <Link href={`/company/${r.slug}`} className="compare-name" data-testid="compare-name">{r.name}</Link>
                <span className="compare-sector" style={{ color: sc.ink, background: sc.bg }}>{r.sector}</span>
              </div>
              <div className="compare-cell" role="cell" data-row="sentiment" aria-label={`Sentiment ${fmtScore(r.score)}`}>
                <span className={r.score != null && r.score === bestScore ? "compare-val compare-val--best" : "compare-val"}>{fmtScore(r.score)}</span>
                <Delta d={r.delta} />
                <span className="compare-mobile-label">Sentiment</span>
              </div>
              <div className="compare-cell" role="cell" data-row="news"><span className={r.news === bestNews ? "compare-val compare-val--best" : "compare-val"}>{r.news}</span><span className="compare-mobile-label">News</span></div>
              <div className="compare-cell" role="cell" data-row="stage"><span className="compare-val compare-val--text">{r.stage ?? "—"}</span><span className="compare-mobile-label">Stage</span></div>
              <div className="compare-cell" role="cell" data-row="region"><span className="compare-val compare-val--text">{r.region || "—"}</span><span className="compare-mobile-label">Region</span></div>
              {hasDeal && <div className="compare-cell" role="cell" data-row="deal"><span className="compare-val compare-val--text">{r.lastDeal ?? "—"}</span><span className="compare-mobile-label">Last deal</span></div>}
              {hasSignal && <div className="compare-cell" role="cell" data-row="signal"><span className={r.signal != null && r.signal === bestSignal ? "compare-val compare-val--best" : "compare-val"}>{r.signal == null ? "—" : Math.round(r.signal)}</span><span className="compare-mobile-label">Signal</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
