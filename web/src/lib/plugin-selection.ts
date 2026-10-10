"use client";
import { useSyncExternalStore } from "react";
import { PLUGIN_CATALOGUE, PINNED_PLUGIN_ID } from "./plugin-catalogue";

export const PLUGIN_SELECTION_KEY = "bcap.chat.plugins.session.v1";

const CATALOGUE_IDS = PLUGIN_CATALOGUE.map((p) => p.id);
const DEFAULT_IDS = PLUGIN_CATALOGUE.filter((p) => p.defaultOn || p.pinned).map((p) => p.id);

/** Pinned id first, then catalogue order; unknown ids dropped; duplicates removed. */
function normalize(ids: readonly string[]): string[] {
  const want = new Set(ids);
  want.add(PINNED_PLUGIN_ID);
  const out = [PINNED_PLUGIN_ID];
  for (const id of CATALOGUE_IDS) if (id !== PINNED_PLUGIN_ID && want.has(id)) out.push(id);
  return out;
}

const SERVER_SNAPSHOT: string[] = normalize(DEFAULT_IDS);
let cache: string[] | null = null;
const listeners = new Set<() => void>();

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
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === PLUGIN_SELECTION_KEY) { cache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/** Non-hook getter for the fetch wrapper. SSR-safe → [PINNED_PLUGIN_ID]. Always starts with the pinned id. */
export function getSelectedPluginIds(): string[] {
  return [...read()];
}

export function setSelectedPluginIds(ids: string[]): void { write(ids); }

export function togglePlugin(id: string, on: boolean): void {
  if (id === PINNED_PLUGIN_ID) return; // can never be removed
  const cur = read();
  write(on ? [...cur, id] : cur.filter((x) => x !== id));
}

export type PluginSelectionApi = {
  toggle(id: string, on: boolean): void;
  set(ids: string[]): void;
  isOn(id: string): boolean;
};

const api: PluginSelectionApi = {
  toggle: togglePlugin,
  set: setSelectedPluginIds,
  isOn: (id) => read().includes(id),
};

/** Ordered selected plugin ids (pinned first) + mutators. Session-scoped (sessionStorage). */
export function usePluginSelection(): [string[], PluginSelectionApi] {
  const ids = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  return [ids, api];
}
