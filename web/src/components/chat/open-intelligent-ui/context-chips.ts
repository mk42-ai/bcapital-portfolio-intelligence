"use client";
import { useSyncExternalStore } from "react";

/**
 * Structured "Ask in chat" context chips (PitchBook facts / investor rows) queued for the NEXT chat turn.
 * Module store + sessionStorage so a chip pushed on /company/<slug> survives the router.push to /chat?skip=1 — the chat shell renders
 * them above the composer and, on send, prepends a compact `Context:` block to the message and adds the PitchBook plugin to that turn.
 * Chips never create a thread: they only decorate the next message of whatever thread is open.
 */
export type ContextChip = { id: string; company: string; field: string; value: string; source: string | null; fetched_at: string | null; plugin_id: string | null };

export const CONTEXT_CHIPS_KEY = "bcap.chat.context-chips";
export const CHIP_MIME = "application/x-bcap-chip";
/** Pitchbook Investor Finder — the only PitchBook plugin on the account (no credentials needed). */
export const PITCHBOOK_PLUGIN_ID = "plugin-1777018662";
export const PITCHBOOK_PLUGIN_NAME = "Pitchbook Investor Finder";
const MAX_CHIPS = 8;
const EMPTY: ContextChip[] = [];

let cache: ContextChip[] | null = null;
const listeners = new Set<() => void>();

function read(): ContextChip[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try { const raw = window.sessionStorage.getItem(CONTEXT_CHIPS_KEY); const v = raw ? (JSON.parse(raw) as unknown) : null; cache = Array.isArray(v) ? (v as ContextChip[]).filter((c) => c && typeof c.id === "string" && typeof c.value === "string") : []; }
  catch { cache = []; }
  return cache;
}
function write(next: ContextChip[]) {
  cache = next;
  try { if (next.length) window.sessionStorage.setItem(CONTEXT_CHIPS_KEY, JSON.stringify(next)); else window.sessionStorage.removeItem(CONTEXT_CHIPS_KEY); } catch { /* quota / private mode — keep in-memory */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function getContextChips(): ContextChip[] { return read(); }
export function useContextChips(): ContextChip[] { return useSyncExternalStore(subscribe, read, () => EMPTY); }
/** Idempotent on `id` (re-asking the same fact moves it to the end instead of duplicating it); capped at MAX_CHIPS (oldest dropped). */
export function addContextChip(chip: ContextChip) { write([...read().filter((c) => c.id !== chip.id), chip].slice(-MAX_CHIPS)); }
export function removeContextChip(id: string) { write(read().filter((c) => c.id !== id)); }
export function clearContextChips() { write([]); }

export const chipId = (company: string, field: string, value: string) => `${company}|${field}|${value}`.slice(0, 200);
export const domainOf = (url: string | null | undefined) => { if (!url) return null; try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.replace(/^https?:\/\//, "").split("/")[0] || null; } };
const dateOf = (s: string | null | undefined) => { if (!s) return null; const d = new Date(s); return isNaN(+d) ? s : d.toISOString().slice(0, 10); };
/** One line per chip: `Context: <company> · <field>: <value> (source <domain>, <date>)`. */
export function chipLine(c: ContextChip): string {
  const src = domainOf(c.source) ?? (c.plugin_id ? PITCHBOOK_PLUGIN_NAME : null); const date = dateOf(c.fetched_at);
  const prov = [src ? `source ${src}` : null, date].filter(Boolean).join(", ");
  return `Context: ${c.company} · ${c.field}: ${c.value}${prov ? ` (${prov})` : ""}`;
}
export const chipsBlock = (chips: ContextChip[]) => chips.map(chipLine).join("\n");

/** Drag payload (HTML5 DnD). `setChipTransfer` is called from onDragStart; `readChipTransfer` from the document-level drop listener. */
export function setChipTransfer(dt: DataTransfer, chip: ContextChip) {
  dt.setData(CHIP_MIME, JSON.stringify(chip)); dt.setData("text/plain", chipLine(chip)); dt.effectAllowed = "copy";
}
export const hasChipTransfer = (dt: DataTransfer | null) => !!dt && Array.from(dt.types ?? []).includes(CHIP_MIME);
export function readChipTransfer(dt: DataTransfer | null): ContextChip | null {
  if (!dt) return null;
  try { const raw = dt.getData(CHIP_MIME); if (!raw) return null; const c = JSON.parse(raw) as ContextChip; return c && typeof c.id === "string" && typeof c.value === "string" ? c : null; } catch { return null; }
}
