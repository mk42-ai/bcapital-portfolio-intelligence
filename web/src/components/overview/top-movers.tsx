"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { imageSrc } from "@/lib/img-proxy";
import "./top-movers.css";

export type TopMover = { slug: string; name: string; sector: string; score: number; delta: number | null; prior_run_at?: string | null; logo_url?: string | null };

/** Local fallback matching a18's sector-color table (bg / ink) — no hard dependency on `@/lib/sector-color`. */
const SECTOR_TINT: Record<string, [string, string]> = {
  Technology: ["#0AC985", "#047857"],
  Healthcare: ["#0D9488", "#115E59"],
  "Energy & Resilience": ["#F59E0B", "#92400E"],
  Financial: ["#A21CAF", "#701A75"],
  Consumer: ["#F97316", "#9A3412"],
  Industrial: ["#65A30D", "#3F6212"],
};
const OTHER_TINT: [string, string] = ["#78716C", "#44403C"];
export function sectorTint(sector: string | null | undefined): { bg: string; ink: string } {
  const [bg, ink] = (sector && SECTOR_TINT[sector]) || OTHER_TINT;
  return { bg, ink };
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24); return `${d} d ago`;
}
const absUtc = (iso: string | null | undefined) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };
const fmtSigned = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2);

function LogoChip({ src, name }: { src: string | null | undefined; name: string }) {
  const [broken, setBroken] = useState(false);
  const url = src ? imageSrc(src, 48) : null;
  const mono = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  if (!url || broken) return <span className="tm-logo tm-logo--mono" aria-hidden>{mono}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="tm-logo" src={url} alt="" width={24} height={24} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

export function TopMovers({ movers, lastRunAt }: { movers: TopMover[]; lastRunAt: string | null | undefined }) {
  const moved = movers.filter((m) => m.delta != null && m.delta !== 0);
  return (
    <section className="card tm-card" data-testid="top-movers" aria-labelledby="top-movers-title">
      <header className="tm-head">
        <h2 id="top-movers-title" className="tm-title">Top movers since last run</h2>
        <p className="tm-sub text-muted">{lastRunAt ? <>scored <time dateTime={lastRunAt}>{relativeTime(lastRunAt)}</time> · {absUtc(lastRunAt)}</> : "no runs yet"}</p>
      </header>
      {moved.length === 0 ? (
        <p className="tm-empty text-muted">No movement since the last run</p>
      ) : (
        <ul className="tm-list">
          {movers.map((m) => {
            const tint = sectorTint(m.sector);
            const d = m.delta;
            const dir = d == null ? "none" : d > 0 ? "up" : d < 0 ? "down" : "flat";
            const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
            return (
              <li key={m.slug} className="tm-row" data-testid="mover-row" data-slug={m.slug} data-dir={dir}>
                <LogoChip src={m.logo_url} name={m.name} />
                <Link href={`/company/${m.slug}`} className="tm-name">{m.name}</Link>
                <span className="tm-pill" style={{ backgroundColor: `${tint.bg}1F`, color: tint.ink, borderColor: `${tint.bg}66` }}>{m.sector}</span>
                <span className="tm-score tabular-nums" aria-label={`score ${m.score.toFixed(2)}`}>{m.score.toFixed(2)}</span>
                <span className={`tm-delta tm-delta--${dir} tabular-nums`}>
                  <Icon className="tm-arrow" strokeWidth={2} aria-hidden />
                  {d == null ? <span className="text-muted">first run</span> : fmtSigned(d)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
