"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Search, Newspaper, LayoutGrid, List } from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { SignalMini } from "@/components/charts/signal-bullet";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtScore } from "@/lib/format";
import { CompanyCard } from "@/components/companies/company-card";
import "./toolbar.css";
import { parseCompaniesState, serializeCompaniesState, useUrlState, type CompaniesSort } from "@/lib/url-state";

export type CompanyListRow = {
  slug: string; name: string; logo_url: string | null; sector: string; region: string; score: number; newsCount: number;
  delta?: number | null; stage?: string | null; last_deal?: { round?: string | null; amount_usd?: number | null; date?: string | null } | null;
  signal: number | null; signal_confidence: number | null; signal_percentile: number | null;
  /** a29: ISO date of the last deal (null/undefined → sorted last). */
  lastDeal?: string | null;
};
type SortKey = CompaniesSort;
type ViewMode = "grid" | "list";
const SORT_KEYS: readonly SortKey[] = ["name", "signal", "sector", "delta", "news", "deal"];
const SCROLL_KEY = "bcap.companies.scroll";
const VIEW_KEY = "bcap.companies.view";
/** Local fallback matching a18's `sectorColor()` table (fill / ink) — no hard dependency on `@/lib/sector-color`. Never blue. */
const SECTOR_TINT: Record<string, [string, string]> = {
  Technology: ["#0AC985", "#047857"], Healthcare: ["#0D9488", "#115E59"], "Energy & Resilience": ["#F59E0B", "#92400E"],
  Financial: ["#A21CAF", "#701A75"], Consumer: ["#F97316", "#9A3412"], Industrial: ["#65A30D", "#3F6212"], Opportunistic: ["#D97706", "#78350F"],
};
const OTHER_TINT: [string, string] = ["#78716C", "#44403C"];
const sectorTint = (s: string) => SECTOR_TINT[s] ?? OTHER_TINT;
const byName = (a: CompanyListRow, b: CompanyListRow) => a.name.localeCompare(b.name);
const dealTime = (r: CompanyListRow) => { const t = r.lastDeal ? Date.parse(r.lastDeal) : NaN; return Number.isFinite(t) ? t : null; };
const COMPARATORS: Record<SortKey, (a: CompanyListRow, b: CompanyListRow) => number> = {
  name: byName,
  sector: (a, b) => a.sector.localeCompare(b.sector) || byName(a, b),
  signal: (a, b) => ((b.signal ?? -1) - (a.signal ?? -1)) || byName(a, b),
  delta: (a, b) => (Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)) || byName(a, b),
  news: (a, b) => (b.newsCount - a.newsCount) || byName(a, b),
  deal: (a, b) => { const da = dealTime(a), db = dealTime(b); if (da == null && db == null) return byName(a, b); if (da == null) return 1; if (db == null) return -1; return (db - da) || byName(a, b); },
};
const DESKTOP_ROW = 65, MOBILE_ROW = 85; // a36: min-h + 1px border-b → estimate matches the measured row
const letterOf = (s: string) => { const ch = (s.trim()[0] ?? "#").toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; };
const readStore = (): Record<string, number> => { try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "{}") as Record<string, number>; } catch { return {}; } };

/**
 * Full portfolio list: ONE scroll container (the document) — rows are window-virtualized with @tanstack/react-virtual, so
 * there is no inner max-height scroller to trap wheel/touch events. Sticky filter header, A–Z jump rail (desktop), roving
 * keyboard focus (Arrow/Home/End/PageUp/PageDown), aria-rowcount/aria-rowindex + a live region, and per-filter scroll
 * restoration via sessionStorage.
 */
export function CompaniesList({ rows, total, initialState }: { rows: CompanyListRow[]; total: number; initialState?: string }) {
  // a37: filter/sort/view/search state lives in the URL (?q=&sector=&sort=&view=&letter=) — shareable and back/forward safe.
  // Initial values come from useSearchParams(); edits are written back with router.replace (debounced 150 ms, no scroll)
  // and the state is re-read whenever the search params change (back/forward). Defaults are omitted → clean `/companies`.
  const [urlState, setUrlState, urlSerialized] = useUrlState(parseCompaniesState, serializeCompaniesState, initialState);
  const { q, sector, sort, view } = urlState;
  const setQ = useCallback((v: string) => setUrlState({ q: v }), [setUrlState]);
  const setSector = useCallback((v: string) => setUrlState({ sector: v }), [setUrlState]);
  const setSort = useCallback((v: SortKey) => setUrlState({ sort: v }), [setUrlState]);
  const pickView = useCallback((v: ViewMode) => { setUrlState({ view: v }); try { localStorage.setItem(VIEW_KEY, v); } catch { /* quota */ } }, [setUrlState]);
  // remembered view (localStorage) applies only when the URL does not pin one
  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if ((v === "grid" || v === "list") && !/(^|&)view=/.test(urlSerialized) && v !== view) setUrlState({ view: v }); } catch { /* private mode */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mobile, setMobile] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [margin, setMargin] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);
  const sectorCounts = useMemo(() => { const m = new Map<string, number>(); rows.forEach((r) => m.set(r.sector, (m.get(r.sector) ?? 0) + 1)); return m; }, [rows]);
  const sortedNames = useMemo(() => rows.map((r) => r.name).sort((a, b) => a.localeCompare(b)), [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = rows.filter((r) => (!sector || r.sector === sector) && (!needle || [r.name, r.sector, r.region].some((v) => v.toLowerCase().includes(needle))));
    return [...hit].sort(COMPARATORS[sort] ?? byName);
  }, [rows, q, sector, sort]);
  const filterKey = `${q.trim().toLowerCase()}|${sector}|${sort}`;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches); on();
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, []);
  useLayoutEffect(() => { const el = listRef.current; if (el) setMargin(Math.round(el.getBoundingClientRect().top + window.scrollY)); }, [visible.length, mobile]);

  const virtualizer = useWindowVirtualizer({ count: visible.length, estimateSize: () => (mobile ? MOBILE_ROW : DESKTOP_ROW), overscan: 4, scrollMargin: margin, getItemKey: (i) => visible[i]?.slug ?? i });
  useEffect(() => { virtualizer.measure(); }, [mobile, virtualizer]);
  const items = virtualizer.getVirtualItems();
  const lastVisible = visible.length > 0 && items.some((it) => it.index === visible.length - 1);
  const maxNews = useMemo(() => visible.reduce((m, r) => Math.max(m, r.newsCount), 0), [visible]);

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
      default: {
        // a33: first-letter typeahead — jump to the NEXT visible company whose name starts with the typed letter (wraps; "#" for digits/symbols).
        if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey || e.key === " ") return;
        const want = /[a-z]/i.test(e.key) ? e.key.toUpperCase() : "#";
        const n = visible.length;
        for (let step = 1; step <= n; step++) { const i = (Math.max(cur, -1) + step) % n; if (letterOf(visible[i]!.name) === want) { e.preventDefault(); jumpTo(i, true); return; } }
      }
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div ref={headerRef} className="sticky top-14 z-20 -mx-4 mb-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8" data-testid="companies-filter-bar">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label htmlFor="companies-search" className="sr-only">Search companies</label>
            <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="companies-search" type="search" data-testid="companies-search" placeholder="Search name, sector, region…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <label htmlFor="companies-sort" className="sr-only">Sort by</label>
            <Select id="companies-sort" data-testid="companies-sort" className="w-auto" value={sort} onChange={(e) => { const v = e.target.value as SortKey; setSort(SORT_KEYS.includes(v) ? v : "name"); }}>
              <option value="name">Sort: name</option><option value="signal">Sort: sentiment</option><option value="sector">Sort: sector</option>
              <option value="delta">Sort: Δ sentiment</option><option value="news">Sort: news count</option><option value="deal">Sort: last deal</option>
            </Select>
            <div className="companies-view ml-auto" role="group" aria-label="View" data-testid="companies-view">
              <button type="button" className="companies-view__btn" data-testid="companies-view-grid" aria-pressed={view === "grid"} aria-label="Grid view" title="Grid view" onClick={() => pickView("grid")}><LayoutGrid className="size-4" aria-hidden /></button>
              <button type="button" className="companies-view__btn" data-testid="companies-view-list" aria-pressed={view === "list"} aria-label="List view" title="List view" onClick={() => pickView("list")}><List className="size-4" aria-hidden /></button>
            </div>
            <p className="text-sm text-muted tabular-nums" role="status" data-testid="companies-count">Showing {visible.length} of {total}</p>
          </div>
          <div className="companies-chips mt-2" role="group" aria-label="Filter by sector" data-testid="companies-sector-chips">
            <button type="button" className="chip-sector" data-sector="" data-testid="companies-sector-chip-all" aria-pressed={sector === ""} onClick={() => setSector("")}
              style={{ "--chip-fill": "#1F2937", "--chip-ink": "#1F2937" } as CSSProperties}>All<span className="chip-sector__n">{rows.length}</span></button>
            {sectors.map((s) => { const [fill, ink] = sectorTint(s); return (
              <button key={s} type="button" className="chip-sector" data-sector={s} data-testid="companies-sector-chip" aria-pressed={sector === s} onClick={() => setSector(sector === s ? "" : s)}
                style={{ "--chip-fill": fill, "--chip-ink": ink } as CSSProperties}><span className="chip-sector__dot" aria-hidden />{s}<span className="chip-sector__n">{sectorCounts.get(s) ?? 0}</span></button>); })}
            <label htmlFor="companies-sector" className="sr-only">Sector</label>
            <select id="companies-sector" data-testid="companies-sector" className="sr-only" tabIndex={-1} value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
        </div>
        {/* a35 axe: the live region must not be a direct child of role="grid" (aria-required-children) */}
        <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="companies-live">{focusIdx != null ? `Row ${focusIdx + 1} of ${visible.length}` : ""}</p>
        <div data-testid="companies-list" data-url-state={urlSerialized} data-view={view} data-total={total} data-visible={visible.length} data-last-visible={lastVisible ? "true" : undefined} role="grid" aria-label="Portfolio companies" aria-rowcount={visible.length} aria-colcount={1}
          className="relative [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:auto]" onKeyDown={onKeyDown}>
          <div ref={listRef} role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {items.map((it) => { const c = visible[it.index]; const isLast = it.index === visible.length - 1; return (
              <div key={it.key} data-index={it.index} ref={virtualizer.measureElement} data-testid="company-row" role="row" aria-rowindex={it.index + 1} data-last={isLast ? "true" : undefined}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${it.start - virtualizer.options.scrollMargin}px)` }}
                className="border-b border-border hover:bg-surface-2">
                <div role="gridcell">
                  <CompanyCard row={c} maxNews={maxNews} variant={view}
                    linkProps={{ "data-index": it.index, "data-testid": "company-row-link", tabIndex: focusIdx == null ? (it.index === 0 ? 0 : -1) : (focusIdx === it.index ? 0 : -1), onFocus: () => setFocusIdx(it.index) }} />
                </div>
              </div>); })}
          </div>
          {visible.length === 0 && <EmptyState icon="no-results" compact className="my-4 border-dashed" title="No companies match" body="Try a shorter search or another sector." action={<button type="button" className="text-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-ring" onClick={() => { setQ(""); setSector(""); }}>Clear filters</button>} />}
        </div>
        <script type="application/json" data-testid="companies-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(sortedNames).replace(/</g, "\\u003c") }} />
      </div>
      <nav aria-label="Jump to letter" data-testid="companies-az" className="sticky top-20 hidden w-8 shrink-0 flex-col items-center gap-0.5 self-start pt-2 lg:flex">
        {letters.map(([l, i]) => <button key={l} type="button" data-testid={`az-${l === "#" ? "hash" : l}`} data-letter={l} onClick={() => jumpTo(i)} aria-label={`Jump to companies starting with ${l}`} className="tap grid size-7 place-items-center rounded-md text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring">{l}</button>)}
      </nav>
    </div>
  );
}
