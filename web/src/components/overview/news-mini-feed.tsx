"use client";
import { useState } from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import "./news-mini-feed.css";

/* a20 — Overview "News Pulse" mini-feed: 8 newest items with a 16px publisher favicon chip (same-origin /api/favicon proxy). */
export type NewsMiniItem = { title: string; url: string | null; source: string | null; published_at: string | null; company_name: string; company_slug: string };

const PUBLISHER: Record<string, string> = {
  "reuters.com": "Reuters", "techcrunch.com": "TechCrunch", "bloomberg.com": "Bloomberg", "ft.com": "Financial Times", "wsj.com": "WSJ",
  "cnbc.com": "CNBC", "theverge.com": "The Verge", "forbes.com": "Forbes", "axios.com": "Axios", "businesswire.com": "Business Wire", "prnewswire.com": "PR Newswire",
};
export const hostOf = (url: string | null | undefined): string => { if (!url) return ""; try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
export const publisherOf = (url: string | null | undefined, source?: string | null): string => { const h = hostOf(url); return PUBLISHER[h] ?? (h || source || "Source"); };
export const faviconFor = (host: string) => `/api/favicon?host=${encodeURIComponent(host)}`;

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso); if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  const d = Math.round(h / 24); if (d < 7) return `${d}d`;
  const w = Math.round(d / 7); if (w < 5) return `${w}w`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo`;
  return `${Math.round(d / 365)}y`;
}

function FaviconChip({ host }: { host: string }) {
  const [broken, setBroken] = useState(!host);
  if (broken) return <span className="nmf-chip nmf-chip--fallback" aria-hidden><Newspaper className="size-3" strokeWidth={1.75} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="nmf-chip" src={faviconFor(host)} alt="" width={16} height={16} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function EmptyGlyph() {
  const [missing, setMissing] = useState(false);
  if (missing) return <Newspaper className="nmf-empty__glyph" strokeWidth={1.5} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="nmf-empty__glyph" src="/brand/icons/icon-news-sentiment.png" data-testid="brand-icon" data-slot="empty-no-news" data-icon="news-sentiment" alt="" width={48} height={48} loading="lazy" decoding="async" onError={() => setMissing(true)} />;
}

export function NewsMiniFeed({ items, total }: { items: NewsMiniItem[]; total: number }) {
  const companies = new Set(items.map((i) => i.company_slug)).size;
  const now = Date.now();
  return (
    <section className="card nmf" data-testid="news-mini-feed" aria-labelledby="nmf-title">
      <header className="nmf__head">
        <div className="nmf__titles">
          <h2 id="nmf-title" className="nmf__title">News Pulse</h2>
          <p className="nmf__meta tabular-nums">{total.toLocaleString("en-US")} items · {companies} {companies === 1 ? "company" : "companies"}</p>
        </div>
        <Link href="/news" className="nmf__all" data-testid="news-mini-all">All news →</Link>
      </header>
      {items.length ? (
        <ol className="nmf__list">
          {items.map((n, i) => { const host = hostOf(n.url); const pub = publisherOf(n.url, n.source); return (
            <li key={`${n.company_slug}|${n.url ?? n.title}|${i}`} className="nmf-row" data-testid="news-mini-row">
              <FaviconChip host={host} />
              <span className="nmf-row__pub" title={host || undefined}>{pub}</span>
              <span className="nmf-row__title">
                {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="nmf-row__link">{n.title}</a> : <span className="nmf-row__link">{n.title}</span>}
              </span>
              <Link href={`/company/${n.company_slug}`} className="nmf-row__co">{n.company_name}</Link>
              <time className="nmf-row__time tabular-nums" dateTime={n.published_at ?? undefined} title={n.published_at ?? undefined} suppressHydrationWarning>{relTime(n.published_at, now)}</time>
            </li>); })}
        </ol>
      ) : (
        <div className="nmf-empty" role="status" data-testid="news-mini-empty"><EmptyGlyph /><p className="nmf-empty__text">No news yet</p><p className="nmf__meta">Items appear here after the next ingest run.</p></div>
      )}
    </section>
  );
}
