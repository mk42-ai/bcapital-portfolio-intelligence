"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { NewsItem } from "@/lib/types";
import { NewsCard } from "@/components/company/news-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dayKey, fmtDelta, fmtScore } from "@/lib/format";
type Item = NewsItem & { company_slug: string; company_name: string; sector: string; sentiment_score: number | null; sentiment_delta: number | null };
type Co = { slug: string; name: string; sector: string; score: number; delta: number | null };
const SOURCE_PLUGINS = [["all", "All sources"], ["perplexity", "Perplexity (news)"], ["gpt", "GPT Search (verification)"], ["linkedin", "LinkedIn"], ["reddit", "Reddit"], ["x", "X"], ["status", "Status changes"], ["seed", "Seed / intelligence JSON"]] as const;
function sourcePlugin(n: Item): string {
  const s = `${n.source ?? ""} ${n.url ?? ""}`.toLowerCase();
  if (n.kind === "status_change") return "status"; if (s.includes("linkedin")) return "linkedin"; if (s.includes("reddit")) return "reddit"; if (/(^|\W)(x\.com|twitter)/.test(s)) return "x";
  if (n.source === "intelligence_json" || (n.id ?? "").startsWith("seed-")) return "seed"; if (s.includes("utm_source=openai")) return "gpt"; return "perplexity";
}
const sentBucket = (s: number | null) => s == null ? "unknown" : s <= -0.2 ? "negative" : s < 0.2 ? "neutral" : "positive";
export function NewsFeed({ items, companies }: { items: Item[]; companies: Co[] }) {
  const [company, setCompany] = useState(""); const [sector, setSector] = useState(""); const [src, setSrc] = useState("all"); const [sent, setSent] = useState(""); const [q, setQ] = useState("");
  const sectors = useMemo(() => [...new Set(items.map((i) => i.sector))].sort(), [items]);
  const filtered = useMemo(() => items.filter((n) => (!company || n.company_slug === company) && (!sector || n.sector === sector) && (src === "all" || sourcePlugin(n) === src) && (!sent || sentBucket(n.sentiment_score) === sent) && (!q || `${n.title} ${n.summary ?? ""} ${n.company_name}`.toLowerCase().includes(q.toLowerCase()))), [items, company, sector, src, sent, q]);
  const groups = useMemo(() => { const m = new Map<string, Item[]>(); for (const n of filtered) { const k = dayKey(n.published_at); if (!m.has(k)) m.set(k, []); m.get(k)!.push(n); } return [...m.entries()].sort((a, b) => (a[0] === "Undated" ? 1 : b[0] === "Undated" ? -1 : b[0].localeCompare(a[0]))); }, [filtered]);
  const movers = useMemo(() => [...companies].filter((c) => c.delta != null && c.delta !== 0).sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, 8), [companies]);
  const reset = () => { setCompany(""); setSector(""); setSrc("all"); setSent(""); setQ(""); };
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <section aria-label="News filters" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1 lg:col-span-2"><label htmlFor="nf-q" className="text-xs font-medium text-muted">Search</label><Input id="nf-q" placeholder="headline, summary, company…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nf-company" className="text-xs font-medium text-muted">Company</label><Select id="nf-company" className="min-w-0" value={company} onChange={(e) => setCompany(e.target.value)}><option value="">All</option>{companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></div>
          <div className="flex flex-col gap-1"><label htmlFor="nf-sector" className="text-xs font-medium text-muted">Sector</label><Select id="nf-sector" value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
          <div className="flex flex-col gap-1"><label htmlFor="nf-src" className="text-xs font-medium text-muted">Source plugin</label><Select id="nf-src" value={src} onChange={(e) => setSrc(e.target.value)}>{SOURCE_PLUGINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div className="flex flex-col gap-1"><label htmlFor="nf-sent" className="text-xs font-medium text-muted">Company sentiment</label><Select id="nf-sent" value={sent} onChange={(e) => setSent(e.target.value)}><option value="">Any</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></Select></div>
          <div className="flex items-end lg:col-span-4"><p className="text-xs text-muted" role="status" aria-live="polite">{filtered.length} of {items.length} items{(company || sector || src !== "all" || sent || q) && <> · <button className="underline" onClick={reset}>clear filters</button></>}</p></div>
        </section>
        {groups.length === 0 ? (
          <EmptyState kind="news" title="No news matches these filters" body="Try a broader filter, or wait for the next 06:00 UTC workflow run to add fresh Perplexity results." action={<Button variant="outline" onClick={reset}>Clear filters</Button>} />
        ) : groups.map(([day, list]) => (
          <section key={day} aria-labelledby={`day-${day}`} className="mb-6">
            <h2 id={`day-${day}`} className="sticky top-14 z-10 mb-3 flex items-center gap-2 bg-background/95 py-1 font-display text-lg font-semibold backdrop-blur lg:top-0"><time dateTime={day !== "Undated" ? day : undefined}>{day}</time><Badge tone="muted">{list.length}</Badge></h2>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">{list.map((n) => (
              <div key={n.id} className="relative min-w-0"><NewsCard n={n} />
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><Link href={`/company/${n.company_slug}`} className="underline-offset-2 hover:underline">{n.company_name}</Link><span>sentiment {fmtScore(n.sentiment_score)}</span><Badge tone={(n.sentiment_delta ?? 0) > 0 ? "primary" : (n.sentiment_delta ?? 0) < 0 ? "danger" : "muted"}>Δ {fmtDelta(n.sentiment_delta)}</Badge><Badge tone="info">{sourcePlugin(n)}</Badge></p>
              </div>))}</div>
          </section>
        ))}
      </div>
      <aside aria-label="Sentiment deltas vs previous run" className="card h-fit p-4 lg:sticky lg:top-6">
        <h2 className="font-display text-lg font-semibold">Δ vs previous run</h2>
        <p className="mb-3 text-xs text-muted">Companies whose score moved in the latest workflow write-back</p>
        {movers.length ? <ul className="space-y-2">{movers.map((m) => <li key={m.slug} className="flex items-center justify-between gap-2 text-sm"><Link href={`/company/${m.slug}`} className="truncate underline-offset-2 hover:underline">{m.name}</Link><span className="flex items-center gap-1 tabular-nums"><span className="text-muted">{fmtScore(m.score)}</span><Badge tone={m.delta! > 0 ? "primary" : "danger"}>{fmtDelta(m.delta)}</Badge></span></li>)}</ul> : <p className="text-sm text-muted">No deltas yet.</p>}
      </aside>
    </div>
  );
}
