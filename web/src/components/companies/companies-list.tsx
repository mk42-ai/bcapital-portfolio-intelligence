"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Search, Newspaper } from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { SignalMini } from "@/components/charts/signal-bullet";
import { Input, Select } from "@/components/ui/input";
import { fmtScore } from "@/lib/format";

export type CompanyListRow = {
  slug: string; name: string; logo_url: string | null; sector: string; region: string; score: number; newsCount: number;
  signal: number | null; signal_confidence: number | null; signal_percentile: number | null;
};
type SortKey = "name" | "signal" | "sector";
const SCROLL_KEY = "bcap.companies.scroll";
const DESKTOP_ROW = 64, MOBILE_ROW = 84;
const letterOf = (s: string) => { const ch = (s.trim()[0] ?? "#").toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; };
const readStore = (): Record<string, number> => { try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "{}") as Record<string, number>; } catch { return {}; } };

/**
 * Full portfolio list: ONE scroll container (the document) — rows are window-virtualized with @tanstack/react-virtual, so
 * there is no inner max-height scroller to trap wheel/touch events. Sticky filter header, A–Z jump rail (desktop), roving
 * keyboard focus (Arrow/Home/End/PageUp/PageDown), aria-rowcount/aria-rowindex + a live region, and per-filter scroll
 * restoration via sessionStorage.
 */
export function CompaniesList({ rows, total }: { rows: CompanyListRow[]; total: number }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [mobile, setMobile] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [margin, setMargin] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);
  const sortedNames = useMemo(() => rows.map((r) => r.name).sort((a, b) => a.localeCompare(b)), [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = rows.filter((r) => (!sector || r.sector === sector) && (!needle || [r.name, r.sector, r.region].some((v) => v.toLowerCase().includes(needle))));
    return [...hit].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "sector" ? (a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name)) : ((b.signal ?? -1) - (a.signal ?? -1) || a.name.localeCompare(b.name)));
  }, [rows, q, sector, sort]);
  const filterKey = `${q.trim().toLowerCase()}|${sector}|${sort}`;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches); on();
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, []);
  useLayoutEffect(() => { const el = listRef.current; if (el) setMargin(Math.round(el.getBoundingClientRect().top + window.scrollY)); }, [visible.length, mobile]);

  const virtualizer = useWindowVirtualizer({ count: visible.length, estimateSize: () => (mobile ? MOBILE_ROW : DESKTOP_ROW), overscan: 8, scrollMargin: margin, getItemKey: (i) => visible[i]?.slug ?? i });
  useEffect(() => { virtualizer.measure(); }, [mobile, virtualizer]);
  const items = virtualizer.getVirtualItems();
  const lastVisible = visible.length > 0 && items.some((it) => it.index === visible.length - 1);

  // --- scroll restoration per filter key (sessionStorage) ---
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (restored.current === filterKey) return;
    restored.current = filterKey;
    const y = readStore()[filterKey];
    if (typeof y === "number" && y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [filterKey]);
  useEffect(() => {
    let t: number | undefined;
    const onScroll = () => { if (t) return; t = window.setTimeout(() => { t = undefined; const s = readStore(); s[filterKey] = window.scrollY; try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(s)); } catch { /* quota */ } }, 120); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (t) window.clearTimeout(t); };
  }, [filterKey]);

  // --- A–Z rail ---
  const letters = useMemo(() => { const m = new Map<string, number>(); visible.forEach((r, i) => { const l = letterOf(r.name); if (!m.has(l)) m.set(l, i); }); return [...m.entries()]; }, [visible]);
  const headerH = () => headerRef.current?.getBoundingClientRect().height ?? 0;
  const jumpTo = useCallback((i: number, focus = false) => {
    virtualizer.scrollToIndex(i, { align: "start" });
    requestAnimationFrame(() => {
      window.scrollBy(0, -headerH() - 8);
      if (focus) requestAnimationFrame(() => { listRef.current?.querySelector<HTMLAnchorElement>(`a[data-index="${i}"]`)?.focus({ preventScroll: true }); setFocusIdx(i); });
    });
  }, [virtualizer]);

  // --- roving focus ---
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
    const cur = Number(t.closest<HTMLElement>("[data-index]")?.dataset.index ?? focusIdx ?? -1);
    const last = visible.length - 1; if (last < 0) return;
    const go = (i: number) => { e.preventDefault(); const n = Math.max(0, Math.min(last, i)); virtualizer.scrollToIndex(n, { align: "auto" }); requestAnimationFrame(() => { const a = listRef.current?.querySelector<HTMLAnchorElement>(`a[data-index="${n}"]`); a?.focus({ preventScroll: true }); setFocusIdx(n); const r = a?.getBoundingClientRect(); if (r && r.top < headerH()) window.scrollBy(0, r.top - headerH() - 8); }); };
    switch (e.key) {
      case "ArrowDown": go(cur + 1); break;
      case "ArrowUp": go(cur - 1); break;
      case "Home": e.preventDefault(); jumpTo(0, true); break;
      case "End": e.preventDefault(); jumpTo(last, true); break;
      case "PageDown": e.preventDefault(); window.scrollBy({ top: window.innerHeight - headerH(), behavior: "auto" }); break;
      case "PageUp": e.preventDefault(); window.scrollBy({ top: -(window.innerHeight - headerH()), behavior: "auto" }); break;
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div ref={headerRef} className="sticky top-14 z-20 -mx-4 mb-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8" data-testid="companies-filter-bar">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label htmlFor="companies-search" className="sr-only">Search companies</label>
            <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="companies-search" type="search" data-testid="companies-search" placeholder="Search name, sector, region…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <label htmlFor="companies-sector" className="sr-only">Sector</label>
            <Select id="companies-sector" data-testid="companies-sector" className="w-auto" value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            <label htmlFor="companies-sort" className="sr-only">Sort by</label>
            <Select id="companies-sort" data-testid="companies-sort" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="name">Sort: name</option><option value="signal">Sort: signal</option><option value="sector">Sort: sector</option></Select>
            <p className="ml-auto text-sm text-muted tabular-nums" role="status" data-testid="companies-count">Showing {visible.length} of {total}</p>
          </div>
        </div>
        <div data-testid="companies-list" data-total={total} data-visible={visible.length} data-last-visible={lastVisible ? "true" : undefined} role="grid" aria-label="Portfolio companies" aria-rowcount={visible.length} aria-colcount={1}
          className="relative [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:auto]" onKeyDown={onKeyDown}>
          <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="companies-live">{focusIdx != null ? `Row ${focusIdx + 1} of ${visible.length}` : ""}</p>
          <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {items.map((it) => { const c = visible[it.index]; const isLast = it.index === visible.length - 1; return (
              <div key={it.key} data-index={it.index} ref={virtualizer.measureElement} data-testid="company-row" role="row" aria-rowindex={it.index + 1} data-last={isLast ? "true" : undefined}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${it.start - virtualizer.options.scrollMargin}px)` }}
                className="border-b border-border hover:bg-surface-2">
                <div role="gridcell" className="flex min-h-[84px] items-center gap-3 px-1 py-2 lg:min-h-16">
                  <CompanyLogo name={c.name} src={c.logo_url} slug={c.slug} size={28} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/company/${c.slug}`} data-index={it.index} data-testid="company-row-link" tabIndex={focusIdx == null ? (it.index === 0 ? 0 : -1) : (focusIdx === it.index ? 0 : -1)} onFocus={() => setFocusIdx(it.index)}
                      className="block truncate font-medium underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-ring rounded"><span data-testid="company-row-name">{c.name}</span></Link>
                    <p className="truncate text-xs text-muted">{c.sector} · {c.region}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs tabular-nums lg:hidden">{c.signal != null ? <><SignalMini score={c.signal} confidence={c.signal_confidence ?? 0} percentile={c.signal_percentile} name={c.name} /><span>{Math.round(c.signal)}</span></> : <span className="text-muted">signal —</span>}<span className="inline-flex items-center gap-1 text-muted"><Newspaper className="size-3.5" aria-hidden />{c.newsCount}</span></p>
                  </div>
                  <div className="hidden w-32 items-center justify-end gap-2 text-sm tabular-nums lg:flex">{c.signal != null ? <><SignalMini score={c.signal} confidence={c.signal_confidence ?? 0} percentile={c.signal_percentile} name={c.name} /><span>{Math.round(c.signal)}</span></> : <span className="text-muted" title={`Sentiment ${fmtScore(c.score)} · Signal Score not yet computed`}>—</span>}</div>
                  <div className="hidden w-16 items-center justify-end gap-1 text-sm tabular-nums text-muted lg:flex" title={`${c.newsCount} news items`}><Newspaper className="size-4" aria-hidden /><span>{c.newsCount}</span><span className="sr-only">news items</span></div>
                </div>
              </div>); })}
          </div>
          {visible.length === 0 && <p className="py-10 text-center text-sm text-muted">No companies match these filters.</p>}
        </div>
        <script type="application/json" data-testid="companies-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(sortedNames).replace(/</g, "\\u003c") }} />
      </div>
      <nav aria-label="Jump to letter" data-testid="companies-az" className="sticky top-20 hidden w-8 shrink-0 flex-col items-center gap-0.5 self-start pt-2 lg:flex">
        {letters.map(([l, i]) => <button key={l} type="button" data-testid={`az-${l === "#" ? "hash" : l}`} data-letter={l} onClick={() => jumpTo(i)} aria-label={`Jump to companies starting with ${l}`} className="tap grid size-7 place-items-center rounded-md text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring">{l}</button>)}
      </nav>
    </div>
  );
}
