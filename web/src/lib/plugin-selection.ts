"use client";
import { useSyncExternalStore } from "react";
import { PLUGIN_CATALOGUE, PINNED_PLUGIN_ID } from "./plugin-catalogue";

export const PLUGIN_SELECTION_KEY = "bcap.chat.plugins.session.v1";

const CATALOGUE_IDS = PLUGIN_CATALOGUE.map((p) => p.id);
const DEFAULT_IDS = PLUGIN_CATALOGUE.filter((p) => p.defaultOn || p.pinned).map((p) => p.id);

/** Ordered set of ids a user may select: curated catalogue until the panel publishes the merged live list. */
let KNOWN_IDS: string[] = [...CATALOGUE_IDS];

/** Pinned id first, then known-list order; unknown ids dropped; duplicates removed. */
function normalize(ids: readonly string[]): string[] {
  const want = new Set(ids);
  want.add(PINNED_PLUGIN_ID);
  const out = [PINNED_PLUGIN_ID];
  for (const id of KNOWN_IDS) if (id !== PINNED_PLUGIN_ID && want.has(id)) out.push(id);
  return out;
}

const SERVER_SNAPSHOT: string[] = normalize(DEFAULT_IDS);
let cache: string[] | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function read(): string[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (cache) return cache;
  try {
    const raw = window.sessionStorage.getItem(PLUGIN_SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    cache = normalize(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : DEFAULT_IDS);
  } catch {
    cache = normalize(DEFAULT_IDS);
  }
  return cache;
}

function write(ids: readonly string[]) {
  const next = normalize(ids);
  const prev = cache;
  if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return;
  cache = next;
  try { window.sessionStorage.setItem(PLUGIN_SELECTION_KEY, JSON.stringify(next)); } catch { /* quota / private mode — keep in-memory */ }
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === PLUGIN_SELECTION_KEY) { cache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/**
 * Publish the set of selectable ids (called by the panel after `/api/plugins` resolves, with the merged list).
 * Ids previously stored in sessionStorage that are not in the new list are dropped; the pinned id always survives.
 */
export function setKnownPluginIds(ids: string[]): void {
  const next = [PINNED_PLUGIN_ID, ...ids.filter((id, i, a) => id !== PINNED_PLUGIN_ID && a.indexOf(id) === i)];
  if (next.length === KNOWN_IDS.length && next.every((v, i) => v === KNOWN_IDS[i])) return;
  KNOWN_IDS = next;
  if (typeof window === "undefined") return;
  const prev = cache;
  cache = null; // re-normalise the stored selection against the new known set
  const fresh = read();
  if (!prev || prev.length !== fresh.length || prev.some((v, i) => v !== fresh[i])) {
    try { window.sessionStorage.setItem(PLUGIN_SELECTION_KEY, JSON.stringify(fresh)); } catch { /* keep in-memory */ }
    notify();
  }
}

export const getKnownPluginIds = (): string[] => [...KNOWN_IDS];

/** Non-hook getter for the fetch wrapper. SSR-safe → [PINNED_PLUGIN_ID]. Always starts with the pinned id. Reflects the CURRENT (per-turn) selection. */
export function getSelectedPluginIds(): string[] {
  return [...read()];
}

export function setSelectedPluginIds(ids: string[]): void { write(ids); }

export function togglePlugin(id: string, on: boolean): void {
  if (id === PINNED_PLUGIN_ID) return; // can never be removed
  const cur = read();
  write(on ? [...cur, id] : cur.filter((x) => x !== id));
}

/** Per-turn reset: drop every optional plugin, keeping only the pinned one. */
export function resetOptionalPlugins(): void { write([PINNED_PLUGIN_ID]); }

export type PluginSelectionApi = {
  toggle(id: string, on: boolean): void;
  set(ids: string[]): void;
  reset(): void;
  isOn(id: string): boolean;
};

const api: PluginSelectionApi = {
  toggle: togglePlugin,
  set: setSelectedPluginIds,
  reset: resetOptionalPlugins,
  isOn: (id) => read().includes(id),
};

/** Ordered selected plugin ids (pinned first) + mutators. Session-scoped (sessionStorage). */
export function usePluginSelection(): [string[], PluginSelectionApi] {
  const ids = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  return [ids, api];
}
