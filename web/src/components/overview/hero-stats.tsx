"use client";
import { useEffect, useRef, useState } from "react";
import "./hero-stats.css";

/** a17 — Overview verdict row. The largest number answers "am I okay?" first; the rest is context. */
export type HeroStatsProps = {
  /** mean of sentiment.score over the companies list (−1..1) */
  sentimentMean: number | null;
  /** mean of sentiment.delta over the companies list (null when no prior run) */
  sentimentDeltaMean: number | null;
  companies: number;
  /** backend news_total — never a client re-sum */
  newsTotal: number;
  /** ISO timestamp of the last scoring run, or null */
  lastRunAt: string | null;
};

const DURATION_MS = 600;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** rAF count-up 0 → value. SSR and first client render show the FINAL value (no hydration jump);
 *  the animation only starts after mount, and never when prefers-reduced-motion: reduce matches. */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced || !Number.isFinite(value)) { setDisplay(value); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setDisplay(value * easeOut(t));
      if (t < 1) raf.current = requestAnimationFrame(tick); else raf.current = null;
    };
    setDisplay(0);
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, [value]);
  return display;
}

const fmtSigned = (n: number, digits = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function relTime(iso: string, nowMs: number): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 14) return `${d} d ago`;
  const w = Math.round(d / 7); if (w < 9) return `${w} wk ago`;
  return `${Math.round(d / 30)} mo ago`;
}
const fmtUtc = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };

function Tile({ k, label, children, sub, title, primary }: { k: string; label: string; children: React.ReactNode; sub?: React.ReactNode; title?: string; primary?: boolean }) {
  return (
    <div className={`hero-stat${primary ? " hero-stat--primary" : ""}`} data-key={k} role="group" aria-label={label}>
      <dt className="hero-stat-label">{label}</dt>
      <dd className="hero-stat-value" title={title}>{children}</dd>
      {sub != null && <dd className="hero-stat-sub">{sub}</dd>}
    </div>
  );
}

export function HeroStats({ sentimentMean, sentimentDeltaMean, companies, newsTotal, lastRunAt }: HeroStatsProps) {
  const sent = useCountUp(sentimentMean ?? 0);
  const comp = useCountUp(companies);
  const news = useCountUp(newsTotal);
  // relative time: SSR uses render-time clock; client refreshes after mount (suppressHydrationWarning covers the drift).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const delta = sentimentDeltaMean;
  const trend = delta == null || Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down";
  return (
    <section className="hero-stats" data-testid="hero-stats" aria-label="Portfolio verdict">
      <dl className="hero-stats-grid">
        <Tile k="sentiment" label="Portfolio sentiment" primary title={sentimentMean == null ? undefined : `Mean sentiment score across ${companies} companies (−1 to +1)`}
          sub={<span className="hero-stat-delta" data-trend={trend}>{"Δ vs last run "}<span className="hero-stat-delta-num">{delta == null ? "—" : fmtSigned(delta)}</span></span>}>
          {sentimentMean == null ? "—" : fmtSigned(sent)}
        </Tile>
        <Tile k="companies" label="Companies tracked" sub="portfolio records, firm excluded">{fmtInt(comp)}</Tile>
        <Tile k="news" label="News items" sub="backend news_total">{fmtInt(news)}</Tile>
        <Tile k="last-run" label="Last scoring run" title={lastRunAt ? fmtUtc(lastRunAt) : undefined} sub={lastRunAt ? <time dateTime={lastRunAt}>{fmtUtc(lastRunAt)}</time> : "no runs yet"}>
          <span suppressHydrationWarning>{lastRunAt ? relTime(lastRunAt, now) : "—"}</span>
        </Tile>
      </dl>
    </section>
  );
}
