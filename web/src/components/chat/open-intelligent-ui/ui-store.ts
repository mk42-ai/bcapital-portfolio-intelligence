"use client";
/**
 * Chat canvas UI state shared across the shell, the nav rail, the top bar, the composer and the inspector drawer (module store +
 * localStorage; SSR-safe via getServerSnapshot defaults). Owners: nav rail (Agent 21) `navCollapsed`; top bar (Agent 20) `tab`;
 * drawer (Agent 24) `inspectorOpen`; composer (Agent 23) `draft` (PitchBook ask-in-chat injects into the EXISTING composer here).
 */
import { useSyncExternalStore } from "react";
export type UiState = { navCollapsed: boolean; inspectorOpen: boolean; tab: "plan" | "run"; draft: string; draftVersion: number };
const KEYS = { nav: "bcap.nav.rail", inspector: "bcap.chat.inspector", tab: "bcap.chat.tab" } as const;
const DEFAULTS: UiState = { navCollapsed: false, inspectorOpen: false, tab: "plan", draft: "", draftVersion: 0 };
let state: UiState | null = null;
const listeners = new Set<() => void>();
const read = (): UiState => {
  if (state) return state;
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const nav = localStorage.getItem(KEYS.nav); const insp = localStorage.getItem(KEYS.inspector); const tab = localStorage.getItem(KEYS.tab);
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    state = { ...DEFAULTS, navCollapsed: nav === "collapsed", inspectorOpen: mobile ? false : insp === "open", tab: tab === "run" ? "run" : "plan" };
  } catch { state = DEFAULTS; }
  return state;
};
export const getUi = () => read();
export function setUi(patch: Partial<UiState>) {
  const next = { ...read(), ...patch }; state = next;
  try { localStorage.setItem(KEYS.nav, next.navCollapsed ? "collapsed" : "open"); localStorage.setItem(KEYS.inspector, next.inspectorOpen ? "open" : "closed"); localStorage.setItem(KEYS.tab, next.tab); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export const useUi = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => DEFAULTS);
/** Composer injection: PitchBook ask-in-chat / starters put text into the EXISTING composer (never a new thread). */
export const setComposerDraft = (text: string) => setUi({ draft: text, draftVersion: read().draftVersion + 1 });
