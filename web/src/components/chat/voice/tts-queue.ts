"use client";
/**
 * TTS queue — turns the live SSE answer into speech, sentence by sentence (there is no streaming TTS endpoint; see docs/ONDEMAND_CONTRACTS.md).
 *  • subscribeStream() from chat-shell feeds the accumulated answer text; completed sentences (. ! ? followed by space/newline, ≥ 20 chars
 *    after cleaning) are enqueued once; markdown, citation chips like [1] and URLs are stripped before synthesis
 *  • every /api/voice/tts body carries { text, voice, pluginIds, sessionId } (parity with the typed turn — see docs/VOICE_PARITY.md)
 *  • ≤ 2 /api/voice/tts requests in flight, strictly ordered playback through ONE <audio> element routed via Web Audio gain (ducking)
 *  • stop() clears the queue and pauses; barge-in is wired by the dock: capture.onSpeechStart → stop() + cancelMessage()
 *  • a 400 not_subscribed from the relay surfaces as onError("not_subscribed") and the queue disables itself (BLOCKED_BY_EXTERNAL_DEPENDENCY)
 */
import { subscribeStream, getStreamSnapshot } from "@/components/chat/open-intelligent-ui/chat-shell";

export type TtsState = "idle" | "buffering" | "speaking";
export type TtsQueueOptions = {
  voice: () => string;
  onState?: (s: TtsState) => void;
  onSentence?: (text: string | null) => void;
  onError?: (code: "not_subscribed" | "upstream" | "playback", message: string) => void;
  /** Called once when the answer is done AND every queued sentence has been played (hands-free re-arm). */
  onFinished?: () => void;
  headers?: () => Record<string, string>;
  /** Parity context (voice-dock): the explicit plugin selection + current session id, sent in the /api/voice/tts body for logging/propagation. */
  context?: () => { pluginIds: string[]; sessionId: string | null };
};

const SENTENCE_END = /([.!?]+["”’)]*)(?=\s|$)/g;
const MIN_CHARS = 20;
const MAX_CHARS = 600;

/** Strip markdown / citations / URLs so the synthesiser reads prose only. */
export const cleanForSpeech = (s: string): string =>
  s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, " ")
    .replace(/\[(?:source|citation|cite)[^\]]*\]/gi, " ")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/gm, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/[*_~>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Returns completed sentences from `text` beyond `consumed` chars of RAW text; `final` flushes the trailing fragment. */
export function splitSentences(text: string, consumed: number, final: boolean): { sentences: string[]; consumed: number } {
  const out: string[] = []; let cursor = consumed; const tail = text.slice(consumed);
  SENTENCE_END.lastIndex = 0; let m: RegExpExecArray | null; let last = 0;
  while ((m = SENTENCE_END.exec(tail))) {
    const end = m.index + m[0].length; const raw = tail.slice(last, end); const clean = cleanForSpeech(raw);
    if (clean.length >= MIN_CHARS) { out.push(clean); last = end; }
    // shorter fragments stay attached to the next sentence (e.g. "Yes." or "1." or an abbreviation)
  }
  cursor = consumed + last;
  if (final) { const rest = cleanForSpeech(tail.slice(last)); if (rest.length >= 2) out.push(rest); cursor = text.length; }
  return { sentences: out.flatMap(chunk600), consumed: cursor };
}
const chunk600 = (s: string): string[] => { if (s.length <= MAX_CHARS) return [s]; const parts: string[] = []; let rest = s; while (rest.length > MAX_CHARS) { let cut = rest.lastIndexOf(", ", MAX_CHARS); if (cut < MAX_CHARS * 0.5) cut = rest.lastIndexOf(" ", MAX_CHARS); if (cut <= 0) cut = MAX_CHARS; parts.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim(); } if (rest) parts.push(rest); return parts; };

type Item = { id: number; text: string; url: Promise<string | null> };

export class TtsQueue {
  private opts: TtsQueueOptions;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null; private gain: GainNode | null = null;
  private queue: Item[] = []; private inFlight = 0; private nextId = 0; private pendingTexts: string[] = [];
  private playing: Item | null = null; private state: TtsState = "idle";
  private unsub: (() => void) | null = null; private consumed = 0; private threadVersion = -1; private answerDone = false; private generation = 0;
  private disabled = false; private _active = false;
  constructor(opts: TtsQueueOptions) { this.opts = opts; }

  /** Must be called from a user gesture once (autoplay policy): creates the <audio> + AudioContext. */
  prime() {
    if (typeof window === "undefined" || this.audio) return;
    const a = document.createElement("audio"); a.preload = "auto"; a.crossOrigin = "anonymous"; a.setAttribute("data-testid", "voice-audio"); a.style.display = "none"; document.body.appendChild(a); this.audio = a;
    try { const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; this.ctx = new Ctx(); this.gain = this.ctx.createGain(); this.ctx.createMediaElementSource(a).connect(this.gain); this.gain.connect(this.ctx.destination); } catch { this.ctx = null; this.gain = null; }
    void this.ctx?.resume().catch(() => {});
  }
  get active() { return this._active; }
  get isDisabled() { return this.disabled; }

  /** Start following the live stream for the NEXT answer. */
  follow() {
    this.prime(); this.unfollow(); this._active = true; this.disabled = false;
    this.consumed = 0; this.answerDone = false; this.generation++;
    const snap = getStreamSnapshot(); this.threadVersion = snap.version; let armed = snap.phase !== "idle"; let seenText = armed ? snap.text.length : 0; if (armed) this.consumed = 0;
    this.unsub = subscribeStream((s) => {
      if (!armed) { if (s.phase !== "idle" || s.text.length !== seenText) { armed = true; this.consumed = 0; } else return; }
      seenText = s.text.length;
      if (s.text.length < this.consumed) this.consumed = 0; // new turn reset
      const done = s.answerDone || (s.phase === "idle" && s.text.length > 0);
      const { sentences, consumed } = splitSentences(s.text, this.consumed, done);
      this.consumed = consumed; sentences.forEach((t) => this.enqueue(t));
      if (done && !this.answerDone) { this.answerDone = true; this.unfollow(); this.maybeFinished(); }
      if (s.phase === "idle" && s.error && !s.text) { this.answerDone = true; this.unfollow(); this.maybeFinished(); }
    });
  }
  unfollow() { this.unsub?.(); this.unsub = null; }

  /** Speak an arbitrary sentence (e.g. a confirmation) outside the stream. */
  say(text: string) { this.prime(); this._active = true; chunk600(cleanForSpeech(text)).forEach((t) => this.enqueue(t)); }

  private setState(s: TtsState) { if (this.state !== s) { this.state = s; this.opts.onState?.(s); } }
  private enqueue(text: string) { if (this.disabled || !text) return; this.pendingTexts.push(text); this.pump(); }
  private pump() {
    while (this.inFlight < 2 && this.pendingTexts.length) {
      const text = this.pendingTexts.shift()!; const gen = this.generation; this.inFlight++;
      const item: Item = { id: this.nextId++, text, url: this.synth(text).finally(() => { if (gen === this.generation) { this.inFlight--; this.pump(); } }) };
      this.queue.push(item);
    }
    if (this.queue.length && !this.playing) void this.playNext();
    if (this.queue.length || this.inFlight) this.setState(this.playing ? "speaking" : "buffering");
  }
  private context(): { pluginIds: string[]; sessionId: string | null } { try { const c = this.opts.context?.(); return { pluginIds: Array.isArray(c?.pluginIds) ? c!.pluginIds : [], sessionId: typeof c?.sessionId === "string" && c.sessionId ? c.sessionId : null }; } catch { return { pluginIds: [], sessionId: null }; } }
  private async synth(text: string): Promise<string | null> {
    try {
      const r = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json", ...(this.opts.headers?.() ?? {}) }, body: JSON.stringify({ text, voice: this.opts.voice(), ...this.context() }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; audioUrl?: string; code?: string; message?: string };
      if (j?.ok && j.audioUrl) return j.audioUrl;
      if (j?.code === "not_subscribed") { this.disabled = true; this.opts.onError?.("not_subscribed", j.message ?? "Voice service is not enabled on this OnDemand account"); this.stop(); return null; }
      this.opts.onError?.("upstream", j?.message ?? `Text-to-speech failed (HTTP ${r.status})`); return null;
    } catch (e) { this.opts.onError?.("upstream", (e as Error).message); return null; }
  }
  private async playNext(): Promise<void> {
    const item = this.queue.shift(); if (!item || !this.audio) { this.maybeFinished(); return; }
    this.playing = item; const gen = this.generation;
    const url = await item.url;
    if (gen !== this.generation) return; // stopped meanwhile
    if (!url) { this.playing = null; return void this.playNext(); }
    const a = this.audio; this.opts.onSentence?.(item.text); this.setState("speaking");
    if (this.gain) this.gain.gain.setTargetAtTime(1, this.ctx!.currentTime, 0.05);
    await new Promise<void>((resolve) => {
      const done = () => { a.onended = null; a.onerror = null; resolve(); };
      a.onended = done; a.onerror = () => { this.opts.onError?.("playback", "Audio playback failed"); done(); };
      a.src = url; a.play().catch((e: Error) => { if (e?.name !== "AbortError") this.opts.onError?.("playback", e?.message ?? "Playback blocked"); done(); });
    });
    if (gen !== this.generation) return;
    this.playing = null; this.opts.onSentence?.(null);
    if (this.queue.length) return void this.playNext();
    this.setState(this.inFlight || this.pendingTexts.length ? "buffering" : "idle"); this.maybeFinished();
  }
  private maybeFinished() { if (this.answerDone && !this.queue.length && !this.playing && !this.inFlight && !this.pendingTexts.length) { this._active = false; this.setState("idle"); this.opts.onFinished?.(); } }

  /** Lower the output while the user speaks (ducking) — restored on the next sentence. */
  duck(on: boolean) { if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(on ? 0.15 : 1, this.ctx.currentTime, 0.05); }

  /** Clears the queue, pauses playback, and stops following the stream. */
  stop() {
    this.generation++; this.unfollow(); this.queue = []; this.pendingTexts = []; this.inFlight = 0; this.playing = null; this.answerDone = false; this._active = false;
    const a = this.audio; if (a) { try { a.pause(); a.removeAttribute("src"); a.load(); } catch {} }
    this.opts.onSentence?.(null); this.setState("idle");
  }
  destroy() { this.stop(); this.audio?.remove(); this.audio = null; void this.ctx?.close().catch(() => {}); this.ctx = null; }
}
