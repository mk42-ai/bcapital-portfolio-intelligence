"use client";
/**
 * Voice-origin marker store (parity, Agent 26). A voice turn is an ORDINARY user message — same thread, same OnDemand session, same
 * plugin selection, same Plan rail/citations. The only difference is a 'via voice' chip on the user bubble: the dock records the
 * transcript here BEFORE calling processMessage; the custom UserMessage claims it by text the first time it renders and remembers the
 * claimed message id (localStorage) so the chip survives a reload. Nothing is prefixed to the text sent upstream.
 */
import { useSyncExternalStore } from "react";

const KEY = "bcap.chat.voice-origin.v1";
const pendingTexts = new Map<string, number>(); // transcript → recorded at
let claimed: Set<string> | null = null;
const listeners = new Set<() => void>();
const load = (): Set<string> => { if (claimed) return claimed; try { claimed = new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { claimed = new Set(); } return claimed; };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...load()].slice(-200))); } catch {} listeners.forEach((l) => l()); };

export const markVoiceOrigin = (text: string) => { pendingTexts.set(text.trim(), Date.now()); };
/** Idempotent: claims a pending transcript for `id` (within 5 min) or reports whether `id` was already claimed. */
export const claimVoiceOrigin = (id: string, text: string): boolean => {
  const set = load(); if (set.has(id)) return true;
  const at = pendingTexts.get(text.trim()); if (at == null || Date.now() - at > 5 * 60_000) return false;
  pendingTexts.delete(text.trim()); set.add(id); persist(); return true;
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useVoiceOrigin = (id: string, text: string) => useSyncExternalStore(subscribe, () => claimVoiceOrigin(id, text), () => false);
