"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, X } from "lucide-react";
import { useArtifacts, useArtifactsPanel } from "@/lib/artifacts/store";
import type { Artifact, ArtifactDateFilter, ArtifactFilter } from "@/lib/artifacts/types";
import { ArtifactCard } from "./artifact-card";
import { ArtifactPreview } from "./artifact-preview";
import "./artifacts.css";

export const FILTERS: { id: ArtifactFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "document", label: "Documents" }, { id: "image", label: "Images" }, { id: "video", label: "Videos" }, { id: "audio", label: "Audio" },
  { id: "upload", label: "Uploads" }, { id: "generated", label: "Generated" },
];
export const DATE_FILTERS: { id: ArtifactDateFilter; label: string; days: number | null }[] = [
  { id: "today", label: "Today", days: 1 }, { id: "7d", label: "7 days", days: 7 }, { id: "30d", label: "30 days", days: 30 }, { id: "all", label: "All time", days: null },
];
export const EMPTY_TEXT = "No artifacts yet — reports and uploads from Chat appear here";
export const EMPTY_HINT = "Inputs you attach and files the agent writes are versioned here";
export const matchesType = (a: Artifact, f: ArtifactFilter) => f === "all" || (f === "upload" ? a.source === "upload" : f === "generated" ? a.source !== "upload" : a.kind === f);
const isToday = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
export const matchesDate = (a: Artifact, f: ArtifactDateFilter, now = Date.now()) => {
  if (f === "all") return true;
  if (f === "today") return isToday(a.createdAt);
  const days = f === "7d" ? 7 : 30; const t = Date.parse(a.createdAt);
  return !Number.isNaN(t) && now - t <= days * 86400_000;
};
/** Thread titles from the chat's localStorage thread list (bcap.chat.threads.v2) — falls back to "Thread <short id>". */
function threadTitles(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { const raw = window.localStorage.getItem("bcap.chat.threads.v2"); const arr = raw ? (JSON.parse(raw) as { id: string; title?: string }[]) : []; return Object.fromEntries(arr.filter((t) => t && t.id).map((t) => [t.id, (t.title ?? "").trim()])); } catch { return {}; }
}
export const threadLabel = (id: string, titles: Record<string, string>) => titles[id] || `Thread ${id.slice(0, 8)}`;

export function ArtifactsEmpty() {
  return (
    <div className="art-empty" data-testid="artifacts-empty">
      <img src="/icons/empty-artifacts.png" alt="" width={120} height={120} loading="lazy" decoding="async" data-testid="artifacts-empty-icon" />
      <p>{EMPTY_TEXT}</p>
      <p className="art-empty-hint">{EMPTY_HINT}</p>
      <Link href="/chat" className="art-btn is-primary art-empty-cta" data-testid="artifacts-empty-cta"><MessageSquare aria-hidden />Go to Chat</Link>
    </div>
  );
}

export type ArtifactsFilters = { type: ArtifactFilter; thread: string; date: ArtifactDateFilter };
export const DEFAULT_FILTERS: ArtifactsFilters = { type: "all", thread: "all", date: "all" };

/** Filter chips (type) + thread/date selects + grouped list (Today / Earlier). Controlled so the panel and /artifacts page share it. */
export function ArtifactsList({ items, filters, onFilters, selectedId, onPreview, loading, error, showThread = true, showHistory = false }: { items: Artifact[]; filters: ArtifactsFilters; onFilters: (f: ArtifactsFilters) => void; selectedId?: string | null; onPreview: (a: Artifact) => void; loading?: boolean; error?: string | null; showThread?: boolean; showHistory?: boolean }) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => { setTitles(threadTitles()); }, [items.length]);
  const byDate = useMemo(() => items.filter((a) => matchesDate(a, filters.date) && (filters.thread === "all" || a.threadId === filters.thread)), [items, filters.date, filters.thread]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, byDate.filter((a) => matchesType(a, f.id)).length])) as Record<ArtifactFilter, number>, [byDate]);
  const threads = useMemo(() => { const seen = new Map<string, number>(); for (const a of items) if (a.threadId) seen.set(a.threadId, (seen.get(a.threadId) ?? 0) + 1); return [...seen.entries()]; }, [items]);
  const shown = byDate.filter((a) => matchesType(a, filters.type));
  const today = shown.filter((a) => isToday(a.createdAt)); const earlier = shown.filter((a) => !isToday(a.createdAt));
  const group = (label: string, list: Artifact[]) => list.length > 0 && (
    <div key={label}>
      <h3 className="art-group-label">{label}</h3>
      <ul className="art-list" role="list">{list.map((a) => <li key={a.id} data-testid="artifact-item" data-id={a.id}><ArtifactCard artifact={a} selected={a.id === selectedId} onPreview={onPreview} showHistory={showHistory} /></li>)}</ul>
    </div>
  );
  const set = (p: Partial<ArtifactsFilters>) => onFilters({ ...filters, ...p });
  return (
    <div className="art-browser art-root" data-testid="artifacts-list">
      <div className="art-filterbar">
        <div className="art-filters" role="group" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="art-chip" aria-pressed={filters.type === f.id} onClick={() => set({ type: f.id })} data-testid={`artifact-filter-${f.id}`}>
              <span data-testid={`artifacts-filter-${f.id}`}>{f.label}</span><span className="art-chip-n">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="art-selects">
          {showThread && (
            <label className="art-select"><span>Thread</span>
              <select value={filters.thread} onChange={(e) => set({ thread: e.target.value })} data-testid="artifact-filter-thread" aria-label="Filter by thread">
                <option value="all">All threads</option>
                {threads.map(([id, n]) => <option key={id} value={id}>{threadLabel(id, titles)} ({n})</option>)}
              </select>
            </label>
          )}
          <label className="art-select"><span>Date</span>
            <select value={filters.date} onChange={(e) => set({ date: e.target.value as ArtifactDateFilter })} data-testid="artifact-filter-date" aria-label="Filter by date">
              {DATE_FILTERS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error && items.length > 0 && <p className="art-error" role="status">Could not refresh ({error}); showing the last saved list.</p>}
      {shown.length === 0 ? (loading && items.length === 0 ? <p className="art-note" role="status">Loading artifacts…</p> : items.length === 0 ? <ArtifactsEmpty /> : <p className="art-note" data-testid="artifacts-no-match">No {FILTERS.find((f) => f.id === filters.type)?.label.toLowerCase()} match these filters.</p>)
        : <>{group("Today", today)}{group("Earlier", earlier)}</>}
    </div>
  );
}

/** Shared browser used by the panel and the /artifacts page: list + filters, preview (in place in the panel; beside/below on the page). */
export function ArtifactsBrowser({ variant = "panel", filters, onFilters, selectedId, onSelect }: { variant?: "panel" | "page"; filters: ArtifactsFilters; onFilters: (f: ArtifactsFilters) => void; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { items: allItems, loading, error, loaded } = useArtifacts();
  // /artifacts page: the localStorage cache would paint first and the fresh list would then insert NEW cards above it (CLS 0.14 measured on the
  // live run). The page waits for the first backend refresh (≈100 ms) behind a reserved skeleton; the side panel keeps the instant cached paint.
  const items = variant === "page" && !loaded ? [] : allItems;
  const selected = selectedId ? items.find((a) => a.id === selectedId) ?? null : null;
  const list = <ArtifactsList items={items} filters={filters} onFilters={onFilters} selectedId={selectedId} onPreview={(a) => onSelect(a.id)} loading={loading || (variant === "page" && !loaded)} error={error} showThread={variant === "page"} showHistory={variant === "page"} />;
  if (variant === "panel") {
    if (selected) return (
      <div className="art-browser">
        <ArtifactPreview artifact={selected} headerActions={<button type="button" className="art-btn" onClick={() => onSelect(null)} data-testid="artifact-preview-back"><ArrowLeft aria-hidden />Back</button>} />
        <ArtifactCard artifact={selected} selected onPreview={() => undefined} onDeleted={() => onSelect(null)} />
      </div>
    );
    return list;
  }
  return (
    <div className={`art-page-layout${selected ? " has-preview" : ""}`}>
      {list}
      {selected && <div className="art-page-preview" role="region" aria-label="Artifact preview"><ArtifactPreview artifact={selected} headerActions={<button type="button" className="art-icon-btn" aria-label="Close preview" onClick={() => onSelect(null)}><X className="size-4" aria-hidden /></button>} /></div>}
    </div>
  );
}

/** Global right-side drawer. Mount once (Shell). Opened via artifactsPanel.open(id?) or <ArtifactsToggle/>. */
export function ArtifactsPanel() {
  const p = useArtifactsPanel();
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const filterRef = useRef<ArtifactsFilters>(DEFAULT_FILTERS);
  const { items } = useArtifacts();
  const path = usePathname();
  useEffect(() => { if (path?.startsWith("/artifacts")) p.close(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => ref.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-testid='lightbox'], .media-video-modal")) { e.preventDefault(); p.close(); }
      if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),select,iframe,video,[tabindex]:not([tabindex='-1'])"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(t); document.removeEventListener("keydown", onKey); lastFocus.current?.focus?.(); };
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.open) return null;
  return (
    <>
      <div className="art-backdrop" onClick={p.close} aria-hidden />
      <div ref={ref} className="art-panel art-root" role="dialog" aria-modal="true" aria-labelledby="art-panel-title" tabIndex={-1} data-testid="artifacts-panel">
        <div className="art-panel-header">
          <img src="/icons/artifacts/artifacts-header.png" alt="" width={24} height={24} loading="lazy" decoding="async" />
          <h2 id="art-panel-title" className="art-panel-title">Artifacts</h2>
          <span className="art-count" data-testid="artifacts-count" aria-label={`${items.length} artifacts`}>{items.length}</span>
          <span className="art-spacer" />
          <button type="button" className="art-icon-btn" onClick={p.close} aria-label="Close artifacts" data-testid="artifacts-close"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="art-panel-body">
          <PanelBrowser selectedId={p.selectedId} onSelect={p.select} filterRef={filterRef} />
        </div>
      </div>
    </>
  );
}
function PanelBrowser({ selectedId, onSelect, filterRef }: { selectedId: string | null; onSelect: (id: string | null) => void; filterRef: React.MutableRefObject<ArtifactsFilters> }) {
  const [filters, setFilters] = useState<ArtifactsFilters>(filterRef.current);
  return <ArtifactsBrowser variant="panel" filters={filters} onFilters={(f) => { filterRef.current = f; setFilters(f); }} selectedId={selectedId} onSelect={onSelect} />;
}

/** Button that opens the panel, with a count badge. Pass testId="artifacts-toggle-shell" for the shell placement. */
export function ArtifactsToggle({ className, testId = "artifacts-toggle", showLabel = false }: { className?: string; testId?: string; showLabel?: boolean }) {
  const { items } = useArtifacts();
  const p = useArtifactsPanel();
  return (
    <button type="button" className={["art-toggle art-root", className].filter(Boolean).join(" ")} onClick={() => p.toggle()} aria-label="Open artifacts" aria-expanded={p.open} aria-haspopup="dialog" data-testid={testId} title="Artifacts">
      <img src="/icons/artifacts/artifacts-header.png" alt="" width={20} height={20} loading="lazy" decoding="async" />
      {showLabel && <span>Artifacts</span>}
      {items.length > 0 && <span className="art-toggle-badge" data-testid={`${testId}-count`} aria-hidden>{items.length > 99 ? "99+" : items.length}</span>}
    </button>
  );
}
