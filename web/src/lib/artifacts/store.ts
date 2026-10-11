"use client";
import { useEffect, useSyncExternalStore } from "react";
import { fromWire, kindFromMime, type Artifact, type ArtifactKind, type ArtifactWire } from "./types";

/** Client module store for artifacts. Persists the last list in localStorage so the panel paints instantly. */
const LS_KEY = "bcap.artifacts.v1";
export type ArtifactsState = { items: Artifact[]; loading: boolean; loaded: boolean; error: string | null };
export type ArtifactEvent = { name: string; url?: string; mime?: string; kind?: ArtifactKind | string; artifactId?: string; mediaId?: string; size?: number; threadId?: string | null };

let state: ArtifactsState = { items: [], loading: false, loaded: false, error: null };
let hydrated = false;
let inflight: Promise<Artifact[]> | null = null;
const subs = new Set<() => void>();
const SERVER_STATE: ArtifactsState = { items: [], loading: false, loaded: false, error: null };

function emit() { for (const s of subs) s(); }
function set(p: Partial<ArtifactsState>) {
  state = { ...state, ...p };
  if (p.items) { try { window.localStorage.setItem(LS_KEY, JSON.stringify(state.items.filter((a) => !a.pending).slice(0, 200))); } catch { /* quota / private mode */ } }
  emit();
}
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try { const raw = window.localStorage.getItem(LS_KEY); if (raw) { const arr = JSON.parse(raw) as Artifact[]; if (Array.isArray(arr)) state = { ...state, items: arr }; } } catch { /* ignore */ }
}
const sortNewest = (a: Artifact[]) => [...a].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));

export const artifactsStore = {
  getState: (): ArtifactsState => { hydrate(); return state; },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  list: (): Artifact[] => { hydrate(); return state.items; },
  /** GET /api/artifacts (optionally scoped to a thread). Keeps optimistic pending entries that the server does not yet know. */
  refresh(threadId?: string): Promise<Artifact[]> {
    hydrate();
    if (inflight && !threadId) return inflight;
    set({ loading: true });
    const p = (async () => {
      try {
        const r = await fetch(`/api/artifacts${threadId ? `?thread_id=${encodeURIComponent(threadId)}` : ""}`, { cache: "no-store", headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { data: (Artifact | ArtifactWire)[] };
        const fresh = (j.data ?? []).map((a) => ("size_bytes" in a ? fromWire(a) : a));
        const ids = new Set(fresh.map((a) => a.id));
        const names = new Set(fresh.map((a) => a.name));
        const keep = state.items.filter((a) => (a.pending || a.failed) && !ids.has(a.id) && !names.has(a.name));
        const merged = threadId ? sortNewest([...fresh, ...state.items.filter((a) => !ids.has(a.id))]) : sortNewest([...keep, ...fresh]);
        set({ items: merged, loading: false, loaded: true, error: null });
        return merged;
      } catch (e) { set({ loading: false, loaded: true, error: (e as Error).message }); return state.items; }
      finally { inflight = null; }
    })();
    if (!threadId) inflight = p;
    return p;
  },
  add(a: Artifact) { hydrate(); set({ items: sortNewest([a, ...state.items.filter((x) => x.id !== a.id)]) }); },
  /** Optimistic entry for an agent event (artifact_ready etc.), then refresh from the backend. */
  upsertFromEvent(ev: ArtifactEvent): Artifact {
    hydrate();
    const id = ev.artifactId || `pending_${Math.random().toString(16).slice(2, 14)}`;
    const mime = ev.mime || "application/octet-stream";
    const kind = (["document", "image", "video", "audio", "file"].includes(String(ev.kind)) ? ev.kind : kindFromMime(mime, ev.name)) as ArtifactKind;
    const contentUrl = ev.artifactId ? `/api/artifacts/${encodeURIComponent(ev.artifactId)}/content` : (ev.url ?? "");
    const existing = state.items.find((x) => x.id === id);
    const a: Artifact = {
      id, name: ev.name, kind, mime, sizeBytes: ev.size ?? existing?.sizeBytes ?? 0, version: existing?.version ?? 1, source: "agent",
      mediaId: ev.mediaId ?? null, mediaStatus: ev.mediaId ? "stored" : null, mediaMessage: null, threadId: ev.threadId ?? null, sessionId: null,
      originEvent: "ondemand_agent.artifact_ready", contentUrl, thumbnailUrl: kind === "image" ? contentUrl : null,
      createdAt: existing?.createdAt ?? new Date().toISOString(), pending: !ev.artifactId,
    };
    artifactsStore.add(a);
    void artifactsStore.refresh();
    return a;
  },
  /** DELETE /api/artifacts/<id>; optimistic removal, restored on failure. */
  async remove(id: string): Promise<boolean> {
    const prev = state.items;
    set({ items: state.items.filter((a) => a.id !== id) });
    if (id.startsWith("pending_")) return true;
    try {
      const r = await fetch(`/api/artifacts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
      return true;
    } catch (e) { set({ items: prev, error: `Delete failed: ${(e as Error).message}` }); return false; }
  },
};

/** Hook: subscribes to the store and triggers the first fetch on mount. */
export function useArtifacts(): ArtifactsState & { refresh: (threadId?: string) => Promise<Artifact[]> } {
  const s = useSyncExternalStore(artifactsStore.subscribe, artifactsStore.getState, () => SERVER_STATE);
  useEffect(() => { if (!artifactsStore.getState().loaded && !inflight) void artifactsStore.refresh(); }, []);
  return { ...s, refresh: artifactsStore.refresh };
}

/* ---------- panel open state (separate tiny store) ---------- */
export type PanelState = { open: boolean; selectedId: string | null };
let panel: PanelState = { open: false, selectedId: null };
const PANEL_SERVER: PanelState = { open: false, selectedId: null };
const psubs = new Set<() => void>();
const pset = (p: Partial<PanelState>) => { panel = { ...panel, ...p }; for (const s of psubs) s(); };
export const artifactsPanel = {
  getState: (): PanelState => panel,
  subscribe(fn: () => void) { psubs.add(fn); return () => { psubs.delete(fn); }; },
  open(id?: string) { pset({ open: true, selectedId: id ?? panel.selectedId }); },
  close() { pset({ open: false }); },
  toggle() { if (panel.open) artifactsPanel.close(); else artifactsPanel.open(); },
  select(id: string | null) { pset({ selectedId: id }); },
};
/** Hook: `open` is the boolean state; use `show(id?)` (or artifactsPanel.open) to open. */
export type PanelHook = PanelState & { show: (id?: string) => void; close: () => void; toggle: () => void; select: (id: string | null) => void };
export function useArtifactsPanel(): PanelHook {
  const s = useSyncExternalStore(artifactsPanel.subscribe, artifactsPanel.getState, () => PANEL_SERVER);
  return { ...s, show: artifactsPanel.open, close: artifactsPanel.close, toggle: artifactsPanel.toggle, select: artifactsPanel.select };
}
