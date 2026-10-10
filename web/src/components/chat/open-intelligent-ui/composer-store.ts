"use client";
/**
 * Composer draft store — ONE source of truth for the text in the chat composer (the app owns the composer row: Attach | textarea | mic | send).
 * Other surfaces (PitchBook "ask in chat" chips in the inspector drawer or on a company page) append a question here; nothing in this
 * module sends a message or creates a thread. The draft survives a client navigation (company page → /chat) via sessionStorage.
 */
import { useSyncExternalStore } from "react";
const KEY = "bcap.chat.draft.v1";
let draft = "";
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); try { if (draft) sessionStorage.setItem(KEY, draft); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } };
const hydrate = () => { if (hydrated || typeof window === "undefined") return; hydrated = true; try { const v = sessionStorage.getItem(KEY); if (v && !draft) draft = v; } catch { /* ignore */ } };
export const composerStore = {
  get: () => draft,
  set: (text: string) => { hydrate(); draft = text; emit(); },
  /** Appends a question on its own line (used by "Ask in chat"), then focuses the textarea when it is mounted. */
  append: (text: string) => { hydrate(); draft = draft.trim() ? `${draft.replace(/\s+$/, "")}\n${text}` : text; emit(); composerStore.focus(); },
  clear: () => { draft = ""; emit(); },
  focus: () => { if (typeof document === "undefined") return; requestAnimationFrame(() => { const el = document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); },
  subscribe: (l: () => void) => { hydrate(); listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useDraft = () => useSyncExternalStore(composerStore.subscribe, composerStore.get, () => "");

/* ---------- composer slots: DOM hosts owned by the app composer row, consumed by the voice dock / context chips (no MutationObservers) ---------- */
export type ComposerSlotName = "mic" | "panel" | "above";
const slots: Record<ComposerSlotName, HTMLElement | null> = { mic: null, panel: null, above: null };
const slotListeners = new Set<() => void>();
export const registerComposerSlot = (name: ComposerSlotName, el: HTMLElement | null) => { if (slots[name] === el) return; slots[name] = el; slotListeners.forEach((l) => l()); };
export const useComposerSlot = (name: ComposerSlotName) => useSyncExternalStore((l) => { slotListeners.add(l); return () => { slotListeners.delete(l); }; }, () => slots[name], () => null);

/* ---------- inspector drawer open state (top-bar toggle ↔ drawer) ---------- */
let inspectorOpen = false;
const inspectorListeners = new Set<() => void>();
export const inspectorStore = {
  get: () => inspectorOpen,
  set: (v: boolean) => { if (inspectorOpen === v) return; inspectorOpen = v; inspectorListeners.forEach((l) => l()); },
  toggle: () => inspectorStore.set(!inspectorOpen),
  subscribe: (l: () => void) => { inspectorListeners.add(l); return () => { inspectorListeners.delete(l); }; },
};
export const useInspectorOpen = () => useSyncExternalStore(inspectorStore.subscribe, inspectorStore.get, () => false);
