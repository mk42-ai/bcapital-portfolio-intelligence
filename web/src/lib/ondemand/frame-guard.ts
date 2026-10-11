/**
 * frame-guard.ts — a7: PURE SSE hardening helpers shared by the /api/chat bridge (server) and the chat shell's client tee.
 * No I/O, no state outside the guard object, never throws.
 *
 *   makeFrameGuard()        dedupe exact-duplicate seqs, count gaps, flag out-of-order (stale) frames — caller decides what to drop
 *   splitSseLines(buf)      SSE-spec line splitting: \r\n / \n / \r, multi-line `data:` joined with "\n", `event:` / `id:` / `retry:`, `:` comments
 *   isTerminal(data)        "[DONE]" / "[ERROR]…" control payloads (checked before JSON parsing)
 *   coalesceThinking(d[])   merge consecutive same-channel (+ same stepId) reasoning deltas into one
 */
import { TERMINAL } from "./eventMap";

export type FrameVerdict = "ok" | "dup" | "gap" | "stale";
export type FrameGuardStats = { accepted: number; dup: number; gap: number; stale: number; missing: number; lastSeq: number | null; total: number };
export type FrameGuard = {
  /** `seq` = upstream eventIndex (or any monotonic counter); `key` = optional identity (e.g. messageId:eventIndex) used when seq is absent/duplicated. */
  accept(seq?: number, key?: string): FrameVerdict;
  readonly stats: FrameGuardStats;
  reset(): void;
};

const MAX_KEYS = 4096;

export function makeFrameGuard(): FrameGuard {
  const stats: FrameGuardStats = { accepted: 0, dup: 0, gap: 0, stale: 0, missing: 0, lastSeq: null, total: 0 };
  const seenSeq = new Set<number>();
  const seenKey = new Set<string>();
  const remember = <T>(set: Set<T>, v: T) => { set.add(v); if (set.size > MAX_KEYS) { const first = set.values().next().value as T; set.delete(first); } };
  return {
    stats,
    reset() { seenSeq.clear(); seenKey.clear(); Object.assign(stats, { accepted: 0, dup: 0, gap: 0, stale: 0, missing: 0, lastSeq: null, total: 0 }); },
    accept(seq, key) {
      stats.total++;
      const hasSeq = typeof seq === "number" && Number.isFinite(seq);
      // exact duplicate (by seq, or by key when there is no seq)
      if (hasSeq && seenSeq.has(seq as number)) { stats.dup++; return "dup"; }
      if (!hasSeq && key && seenKey.has(key)) { stats.dup++; return "dup"; }
      if (key) remember(seenKey, key);
      if (!hasSeq) { stats.accepted++; return "ok"; }
      const s = seq as number;
      remember(seenSeq, s);
      const last = stats.lastSeq;
      if (last === null) { stats.lastSeq = s; stats.accepted++; return "ok"; }
      if (s < last) { stats.stale++; stats.accepted++; return "stale"; }      // out-of-order: still delivered, caller decides
      if (s > last + 1) { stats.gap++; stats.missing += s - last - 1; stats.lastSeq = s; stats.accepted++; return "gap"; }
      stats.lastSeq = s; stats.accepted++; return "ok";
    },
  };
}

/** One parsed SSE event: `event` name ("" when absent → "message" per spec), joined `data`, optional id/retry. */
export type SseFrame = { event: string; data: string; id?: string; retry?: number };
export type SseSplit = { frames: SseFrame[]; rest: string };

/**
 * Split a (possibly partial) SSE text buffer into complete frames. A frame ends at a blank line. Handles `\r\n`, `\n` and lone `\r` line ends,
 * multiple `data:` lines (joined with "\n", one optional leading space stripped per spec), `event:`, `id:`, `retry:`, and `:` comment lines
 * (ignored). The unterminated tail is returned in `rest` so the caller can prepend it to the next chunk. Frames with no data lines are dropped
 * (comment-only keep-alives), unless they carry an `event:` name.
 */
export function splitSseLines(buf: string): SseSplit {
  const frames: SseFrame[] = [];
  // find the last complete frame boundary (blank line) — everything after it is `rest`
  const normalized = buf.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lastBoundary = normalized.lastIndexOf("\n\n");
  if (lastBoundary < 0) return { frames, rest: buf };
  const complete = normalized.slice(0, lastBoundary + 1);
  const rest = normalized.slice(lastBoundary + 2);
  for (const block of complete.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let event = ""; let id: string | undefined; let retry: number | undefined; const data: string[] = []; let sawData = false;
    for (const line of block.split("\n")) {
      if (line === "") continue;
      if (line.startsWith(":")) continue; // comment
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      switch (field) {
        case "data": data.push(value); sawData = true; break;
        case "event": event = value.trim(); break;
        case "id": id = value; break;
        case "retry": { const n = Number(value); if (Number.isFinite(n)) retry = n; break; }
        default: break; // unknown field → ignored per spec
      }
    }
    if (!sawData && !event) continue;
    frames.push({ event, data: data.join("\n"), ...(id !== undefined ? { id } : {}), ...(retry !== undefined ? { retry } : {}) });
  }
  return { frames, rest };
}

/** `[DONE]` / `[ERROR]` / `[ERROR]: …` control payloads. Tolerates surrounding whitespace. */
export function isTerminal(data: string): "done" | "error" | null {
  const d = (data ?? "").trim();
  if (d === TERMINAL.done) return "done";
  if (d.startsWith(TERMINAL.errorPrefix)) return "error";
  return null;
}

export type ThinkingDelta = { channel: string; delta: string; stepId?: string };
/** Merge runs of consecutive deltas that share channel + stepId. Empty deltas are dropped; order is preserved. */
export function coalesceThinking<T extends ThinkingDelta>(deltas: readonly T[]): T[] {
  const out: T[] = [];
  for (const d of deltas) {
    if (!d || typeof d.delta !== "string" || d.delta === "") continue;
    const prev = out[out.length - 1];
    if (prev && prev.channel === d.channel && (prev.stepId ?? "") === (d.stepId ?? "")) out[out.length - 1] = { ...prev, delta: prev.delta + d.delta };
    else out.push({ ...d });
  }
  return out;
}
