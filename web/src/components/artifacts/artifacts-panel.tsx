"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useArtifacts, useArtifactsPanel } from "@/lib/artifacts/store";
import type { Artifact, ArtifactFilter } from "@/lib/artifacts/types";
import { ArtifactCard } from "./artifact-card";
import { ArtifactPreview } from "./artifact-preview";
import "./artifacts.css";

const FILTERS: { id: ArtifactFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "document", label: "Documents" }, { id: "image", label: "Images" }, { id: "video", label: "Videos" }, { id: "upload", label: "Uploads" },
];
export const EMPTY_TEXT = "No artifacts yet — generated reports, images and your uploads appear here.";
const matches = (a: Artifact, f: ArtifactFilter) => f === "all" || (f === "upload" ? a.source === "upload" : a.kind === f);
const isToday = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

export function ArtifactsEmpty() {
  return <div className="art-empty" data-testid="artifacts-empty"><img src="/icons/artifacts/empty-artifacts.png" alt="" width={96} height={96} /><p>{EMPTY_TEXT}</p></div>;
}

/** Filter chips + grouped list (Today / Earlier). Controlled filter + selection so the panel and the /artifacts page share it. */
export function ArtifactsList({ items, filter, onFilter, selectedId, onPreview, loading, error }: { items: Artifact[]; filter: ArtifactFilter; onFilter: (f: ArtifactFilter) => void; selectedId?: string | null; onPreview: (a: Artifact) => void; loading?: boolean; error?: string | null }) {
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((a) => matches(a, f.id)).length])) as Record<ArtifactFilter, number>, [items]);
  const shown = items.filter((a) => matches(a, filter));
  const today = shown.filter((a) => isToday(a.createdAt)); const earlier = shown.filter((a) => !isToday(a.createdAt));
  const group = (label: string, list: Artifact[]) => list.length > 0 && (
    <div key={label}>
      <h3 className="art-group-label">{label}</h3>
      <ul className="art-list" role="list">{list.map((a) => <li key={a.id}><ArtifactCard artifact={a} selected={a.id === selectedId} onPreview={onPreview} /></li>)}</ul>
    </div>
  );
  return (
    <div className="art-browser art-root" data-testid="artifacts-list">
      <div className="art-filters" role="group" aria-label="Filter artifacts">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="art-chip" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)} data-testid={`artifacts-filter-${f.id}`}>
            {f.label}<span className="art-chip-n">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {error && items.length > 0 && <p className="art-error" role="status">Could not refresh ({error}); showing the last saved list.</p>}
      {shown.length === 0 ? (loading && items.length === 0 ? <p className="art-note" role="status">Loading artifacts…</p> : items.length === 0 ? <ArtifactsEmpty /> : <p className="art-note">No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} yet.</p>)
        : <>{group("Today", today)}{group("Earlier", earlier)}</>}
    </div>
  );
}

/** Shared browser used by the panel and the /artifacts page: list + filters, preview (in place in the panel; beside/below on the page). */
export function ArtifactsBrowser({ variant = "panel", filter, onFilter, selectedId, onSelect }: { variant?: "panel" | "page"; filter: ArtifactFilter; onFilter: (f: ArtifactFilter) => void; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { items: allItems, loading, error, loaded } = useArtifacts();
  // /artifacts page: the localStorage cache would paint first and the fresh list would then insert NEW cards above it (CLS 0.14 measured on the
  // live run). The page waits for the first backend refresh (≈100 ms) behind a reserved skeleton; the side panel keeps the instant cached paint.
  const items = variant === "page" && !loaded ? [] : allItems;
  const selected = selectedId ? items.find((a) => a.id === selectedId) ?? null : null;
  const list = <ArtifactsList items={items} filter={filter} onFilter={onFilter} selectedId={selectedId} onPreview={(a) => onSelect(a.id)} loading={loading || (variant === "page" && !loaded)} error={error} />;
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
  const filterRef = useRef<ArtifactFilter>("all");
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
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),iframe,video,[tabindex]:not([tabindex='-1'])"));
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
          <img src="/icons/artifacts/artifacts-header.png" alt="" width={24} height={24} />
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
function PanelBrowser({ selectedId, onSelect, filterRef }: { selectedId: string | null; onSelect: (id: string | null) => void; filterRef: React.MutableRefObject<ArtifactFilter> }) {
  const [filter, setFilter] = useState<ArtifactFilter>(filterRef.current);
  return <ArtifactsBrowser variant="panel" filter={filter} onFilter={(f) => { filterRef.current = f; setFilter(f); }} selectedId={selectedId} onSelect={onSelect} />;
}

/** Button that opens the panel, with a count badge. Pass testId="artifacts-toggle-shell" for the shell placement. */
export function ArtifactsToggle({ className, testId = "artifacts-toggle", showLabel = false }: { className?: string; testId?: string; showLabel?: boolean }) {
  const { items } = useArtifacts();
  const p = useArtifactsPanel();
  return (
    <button type="button" className={["art-toggle art-root", className].filter(Boolean).join(" ")} onClick={() => p.toggle()} aria-label="Open artifacts" aria-expanded={p.open} aria-haspopup="dialog" data-testid={testId} title="Artifacts">
      <img src="/icons/artifacts/artifacts-header.png" alt="" width={20} height={20} />
      {showLabel && <span>Artifacts</span>}
      {items.length > 0 && <span className="art-toggle-badge" data-testid={`${testId}-count`} aria-hidden>{items.length > 99 ? "99+" : items.length}</span>}
    </button>
  );
}
