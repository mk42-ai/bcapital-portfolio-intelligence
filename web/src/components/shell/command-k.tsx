"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Building2, Command, LayoutDashboard, MessageSquare, Newspaper, Search } from "lucide-react";
import { resolveLogo } from "@/lib/local-logos";
import "./command-k.css";

/** Custom event any component can dispatch to open the switcher: `window.dispatchEvent(new Event("bcap:cmdk"))`. */
export const CMDK_OPEN_EVENT = "bcap:cmdk";

type Row = { slug: string; name: string; sector: string; logo_url: string | null; score: number | null };
type QuickRoute = { href: string; label: string; icon: typeof LayoutDashboard };

const QUICK: QuickRoute[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/news", label: "News Pulse", icon: Newspaper },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/artifacts", label: "Artifacts", icon: Archive },
];

/* ---- sector colour: the shared hue-audited tokens (a18) — ink colour for monograms/pills. ---- */
import { sectorColor as sharedSectorColor } from "@/lib/sector-color";
function sectorColor(sector: string | null | undefined): string { return sharedSectorColor(sector).ink; }

/* ---- module-scope cache: fetched once per page load ---- */
let cache: Row[] | null = null;
let inflight: Promise<Row[]> | null = null;
async function loadCompanies(): Promise<Row[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const parse = async (url: string): Promise<Row[]> => {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { data?: Array<{ slug: string; name: string; sector: string; logo_url: string | null; sentiment?: { score?: number | null } | null }> };
      return (j.data ?? []).map((c) => ({ slug: c.slug, name: c.name, sector: c.sector ?? "", logo_url: c.logo_url ?? null, score: typeof c.sentiment?.score === "number" ? c.sentiment.score : null }));
    };
    try { cache = await parse("/api/portfolio/companies?limit=200"); }
    catch { try { cache = await parse("/api/portfolio/companies"); } catch { cache = []; } }
    inflight = null;
    return cache;
  })();
  return inflight;
}

/** Simple subsequence fuzzy match; returns a score (lower is better) or -1 when no match. */
function fuzzy(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase(); let i = 0, gaps = 0, last = -1;
  for (const ch of q) { const idx = t.indexOf(ch, i); if (idx < 0) return -1; if (last >= 0) gaps += idx - last - 1; last = idx; i = idx + 1; }
  const prefix = t.startsWith(q) ? 0 : 10; const word = t.includes(q) ? 0 : 5;
  return gaps + prefix + word;
}

const FOCUSABLE = 'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Cmd/Ctrl+K company switcher. Mounted once in the Shell; opens on the shortcut or the `bcap:cmdk` window event.
 * Lazily fetches the company list once (module cache), fuzzy-matches name/sector, keyboard navigable, focus-trapped,
 * returns focus to the element that opened it. Light-only, white panel, charcoal ink, green focus ring.
 */
export function CommandK() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(cache);
  const [active, setActive] = useState(0);
  const [failedLogos, setFailedLogos] = useState<Record<string, true>>({});
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const show = useCallback(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setQuery(""); setActive(0); setOpen(true);
    if (!cache) loadCompanies().then(setRows); else setRows(cache);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    const el = openerRef.current; openerRef.current = null;
    if (el && typeof el.focus === "function" && document.contains(el)) requestAnimationFrame(() => el.focus());
  }, []);

  // Global shortcut + custom open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => { if (o) { hide(); return false; } show(); return true; }); }
    };
    const onEvt = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(CMDK_OPEN_EVENT, onEvt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(CMDK_OPEN_EVENT, onEvt); };
  }, [show, hide]);

  // Autofocus + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(t); document.body.style.overflow = prev; };
  }, [open]);

  const q = query.trim().toLowerCase();
  const quick = useMemo(() => QUICK.filter((r) => !q || fuzzy(q, r.label) >= 0), [q]);
  const companies = useMemo(() => {
    const src = rows ?? [];
    if (!q) return src.slice(0, 50);
    return src
      .map((r) => { const a = fuzzy(q, r.name), b = fuzzy(q, r.sector); const s = a < 0 ? b : b < 0 ? a : Math.min(a, b + 2); return { r, s }; })
      .filter((x) => x.s >= 0).sort((x, y) => x.s - y.s || x.r.name.localeCompare(y.r.name)).slice(0, 50).map((x) => x.r);
  }, [rows, q]);
  type Item = { kind: "route"; href: string; label: string; icon: QuickRoute["icon"] } | { kind: "company"; row: Row };
  const items: Item[] = useMemo(() => [
    ...quick.map((r) => ({ kind: "route" as const, href: r.href, label: r.label, icon: r.icon })),
    ...companies.map((row) => ({ kind: "company" as const, row })),
  ], [quick, companies]);
  useEffect(() => { setActive(0); }, [q, rows]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback((it: Item | undefined) => {
    if (!it) return;
    const href = it.kind === "route" ? it.href : `/company/${encodeURIComponent(it.row.slug)}`;
    hide(); router.push(href);
  }, [hide, router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (items.length ? (i + 1) % items.length : 0)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, items.length - 1)); return; }
    if (e.key === "Enter") { e.preventDefault(); go(items[active]); return; }
    if (e.key === "Tab") {
      // Focus trap: keep Tab inside the panel.
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  if (!open) return null;
  const activeId = items[active] ? `cmdk-opt-${active}` : undefined;
  return (
    <div className="cmdk-backdrop" data-testid="cmdk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Switch company" data-testid="cmdk" className="cmdk-panel" onKeyDown={onKeyDown}>
        <div className="cmdk-search">
          <Search className="cmdk-search-icon" aria-hidden />
          <input
            ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
            placeholder="Search companies or go to…" aria-label="Search companies" data-testid="cmdk-input"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={activeId} aria-autocomplete="list"
            autoComplete="off" spellCheck={false} className="cmdk-input" />
          <kbd className="cmdk-kbd" aria-hidden><Command className="size-3" aria-hidden />K</kbd>
        </div>
        <ul ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="cmdk-list" data-testid="cmdk-list">
          {quick.length > 0 && <li role="presentation" className="cmdk-group">Go to</li>}
          {items.map((it, i) => {
            const selected = i === active;
            if (it.kind === "route") {
              const Icon = it.icon;
              return (
                <li key={`r-${it.href}`} id={`cmdk-opt-${i}`} role="option" aria-selected={selected} data-index={i} data-testid="cmdk-route"
                  className="cmdk-row" data-active={selected ? "true" : "false"} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)}>
                  <span className="cmdk-chip cmdk-chip-route" aria-hidden><Icon className="size-3.5" /></span>
                  <span className="cmdk-name">{it.label}</span>
                </li>
              );
            }
            const { row } = it; const color = sectorColor(row.sector);
            const logo = failedLogos[row.slug] ? null : resolveLogo({ slug: row.slug, name: row.name, logoUrl: row.logo_url });
            const first = i === quick.length;
            return (
              <li key={`c-${row.slug}`} id={`cmdk-opt-${i}`} role="option" aria-selected={selected} data-index={i} data-testid="cmdk-company" data-slug={row.slug}
                className={first ? "cmdk-row cmdk-row-first-company" : "cmdk-row"} data-active={selected ? "true" : "false"}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)}>
                <span className="cmdk-chip" style={{ borderColor: color, color }} aria-hidden>
                  {logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logo} alt="" width={20} height={20} loading="lazy" decoding="async" onError={() => setFailedLogos((f) => ({ ...f, [row.slug]: true }))} />
                    : <span className="cmdk-mono" style={{ background: color }}>{row.name.trim().charAt(0).toUpperCase()}</span>}
                </span>
                <span className="cmdk-name">{row.name}</span>
                {row.sector && <span className="cmdk-sector" style={{ color, borderColor: color }}>{row.sector}</span>}
                {row.score != null && <span className="cmdk-score" data-testid="cmdk-score">{row.score > 0 ? "+" : ""}{row.score.toFixed(2)}</span>}
              </li>
            );
          })}
          {rows === null && <li role="presentation" className="cmdk-empty" data-testid="cmdk-loading">Loading companies…</li>}
          {rows !== null && items.length === 0 && <li role="presentation" className="cmdk-empty" data-testid="cmdk-empty">No matches</li>}
        </ul>
        <div className="cmdk-foot" aria-hidden><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  );
}
