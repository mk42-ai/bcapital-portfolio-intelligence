"use client";
/**
 * Live-stream store + SSE tee. Fed by a tee of the SSE body (res.clone()) in the chat shell's fetch wrapper — independent of OpenUI's own
 * parser. Every setStream() call is coalesced into ONE notify per animation frame (rAF), so a burst of 50 deltas costs one React commit.
 * Split out of chat-shell.tsx (2026-10-10) so citation / card / drawer modules can subscribe without importing the shell.
 */
import { useSyncExternalStore } from "react";
import { sessionFor, rememberSources, sourcesKey, rememberMeta, type StoredSource, type StoredMeta } from "./local-storage";
import { hostOf } from "./citations";
import { PLUGIN_ID, PLUGIN_NAME, MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { CLIENT_EVENT as CE } from "@/lib/ondemand/eventMap";

export type CoCtx = { slug: string; name: string; sector: string; status: string; stage: string | null; sentiment: { score: number; label: string; delta?: number | null; updated_at?: string | null; basis?: string | null }; news_count?: number; latest_news: { title: string; url: string | null; published_at: string | null; source?: string | null }[]; estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; b_capital_role: string };
export type Source = StoredSource;
/** Chat endpoint — overridable for local mock-SSE verification (NEXT_PUBLIC_CHAT_API_URL=http://127.0.0.1:3404/api/chat). */
export const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat";
/** Favicon proxy for source chips (favicons only — never AI-generated assets). */
export const faviconFor = (url: string) => `/api/favicon?host=${encodeURIComponent(hostOf(url))}`;

/* ------------------------------------------------------------------------------------------------------------------
 * Live-stream store. Fed by a tee of the SSE body (res.clone()) in the fetch wrapper — independent of OpenUI's own parser.
 * Every setStream() call is coalesced into ONE notify per animation frame (rAF), so a burst of 50 deltas costs one React commit.
 * ---------------------------------------------------------------------------------------------------------------- */
export type StreamPhase = "idle" | "connecting" | "planning" | "researching" | "answering" | "awaiting-input";
type StreamError = { code: string; message: string; raw?: string } | null;
export type PlanStep = { id: string; title: string; query?: string; plugins?: string[]; state: "pending" | "running" | "done" | "failed" };
export type StepSummary = { index: number; stepId: string; state: "pending" | "done"; text: string; optimistic: boolean; startedAt: number; doneAt?: string };
export type Prompt =
  | { kind: "clarification"; queries: { question: string; options?: string[] }[] }
  | { kind: "awaiting_input"; prompt: string; options: string[]; inputType?: string; allowCustom?: boolean }
  | { kind: "require_creds"; pluginId: string | null; service: string | null; fields: { key: string; label?: string; type?: string }[] }
  | { kind: "awaiting_browser_action"; action: string | null; message: string | null; url: string | null };
export type StreamState = {
  phase: StreamPhase; detail: string; startedAt: number; sessionId: string | null; version: number;
  firstStatusMs: number | null; firstTokenMs: number | null; firstCitationMs: number | null; chunks: number; thinking: string; thinkingKinds: string[]; error: StreamError;
  sources: Source[]; metrics: Record<string, number> | null; lastThreadId: string | null;
  pluginIds: string[]; suggested: { id: string; name: string; logoUrl?: string }[]; plan: { objective: string | null; steps: PlanStep[]; provisional?: boolean } | null;
  summaries: StepSummary[]; prompt: Prompt | null; filler: boolean; fillerTick: number; text: string; answerDone: boolean; integrity: { dupes: number; gaps: number; frames: number } | null;
  request: Record<string, unknown> | null; agentLog: { subtype: string; at: number }[]; stepRaw: Record<string, string>;
  attachments: { mediaId: string; name: string; kind?: string; extractedChars?: number; grounded?: boolean }[] | null; voice: { phase: string; text?: string } | null;
};
export const IDLE: StreamState = { phase: "idle", detail: "", startedAt: 0, sessionId: null, version: 0, firstStatusMs: null, firstTokenMs: null, firstCitationMs: null, chunks: 0, thinking: "", thinkingKinds: [], error: null, sources: [], metrics: null, lastThreadId: null, pluginIds: [PLUGIN_ID], suggested: [], plan: null, summaries: [], prompt: null, filler: false, fillerTick: 0, text: "", answerDone: false, integrity: null, request: null, agentLog: [], stepRaw: {}, attachments: null, voice: null };
let streamState: StreamState = IDLE;
/** Current (flushed) store value — for one-off reads outside React (e.g. the fetch wrapper copying `version`). */
export const currentStream = () => streamState;
let pending: Partial<StreamState> | null = null; let rafId = 0;
export const liveSources = new Map<string, Source[]>();
export const liveMeta = new Map<string, StoredMeta>();
const listeners = new Set<() => void>();
const flush = () => { rafId = 0; if (!pending) return; const p = pending; pending = null; streamState = { ...streamState, ...p, version: streamState.version + 1 }; listeners.forEach((l) => l()); };
const FLUSH_MS = () => (typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches ? 140 : 80);
let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;
export const setStream = (patch: Partial<StreamState>, immediate = false) => {
  pending = { ...(pending ?? {}), ...patch };
  if (immediate || typeof requestAnimationFrame === "undefined") { if (rafId && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafId); if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; } rafId = 0; flush(); return; }
  // Time-boxed coalescing: a burst of deltas costs ONE commit per 80 ms (140 ms on narrow viewports) instead of one per animation frame.
  if (!flushTimer && !rafId) flushTimer = setTimeout(() => { flushTimer = 0; rafId = requestAnimationFrame(flush); }, FLUSH_MS());
};
/** Reads the latest value including not-yet-flushed patches (for tee-side accumulation). */
const peek = (): StreamState => ({ ...streamState, ...(pending ?? {}) });
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getStream = () => streamState;
export const useStreamState = () => useSyncExternalStore(subscribe, getStream, () => IDLE);
/** Narrow subscription: re-render only when the selected value changes (previous assistant messages must not re-render per token). */
export function useStreamSelector<T>(sel: (s: StreamState) => T): T { return useSyncExternalStore(subscribe, () => sel(streamState), () => sel(IDLE)); }
export const getStreamPhase = () => streamState.phase;
/** Non-React subscription (voice TTS queue): cb receives the flushed store after every commit; returns the unsubscribe. */
export const subscribeStream = (cb: (s: Pick<StreamState, "phase" | "text" | "answerDone" | "version" | "lastThreadId" | "error">) => void) => { const l = () => cb(streamState); listeners.add(l); return () => { listeners.delete(l); }; };
export const getStreamSnapshot = () => streamState;
let currentThreadId: string | null = null;
export const setCurrentThreadId = (id: string | null) => { currentThreadId = id; };
export const getCurrentThreadId = () => currentThreadId; // selected thread (kept by <Persistence>) so uploads before the first turn still find the thread's session
/** The OnDemand session of the given thread (in-memory ref first, then localStorage), or the live stream's session — used by attachment uploads. */
export const getCurrentSessionId = (ref: Record<string, string>, tid: string | null): string | null => (tid && (ref[tid] ?? sessionFor(tid))) || streamState.sessionId || null;
export const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting to OnDemand…", "creating-session": "Creating OnDemand session…", querying: `Submitting to ${MODEL_LABEL}…`,
  streaming: `${MODEL_LABEL} is planning…`, planning: `${MODEL_LABEL} is planning…`, researching: `Searching with ${PLUGIN_NAME}…`, answering: "Writing the answer…", "awaiting-input": "Waiting for your input…", done: "Done",
};

type AgUiFrame = { seq?: number; type?: string; name?: string; value?: Record<string, unknown>; delta?: string; toolCallName?: string; message?: string; code?: string };

export async function teeStream(res: Response, threadId: string, onSession: (sid: string) => void) {
  const body = res.body; if (!body) return;
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
  const t0 = peek().startedAt || Date.now();
  const finalize = () => {
    const st = peek(); const key = sourcesKey(st.text);
    const meta: StoredMeta = { model: MODEL_LABEL, modelId: MODEL_ID, reasoningMode: REASONING_MODE, pluginId: PLUGIN_ID, pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, firstCitationMs: st.firstCitationMs, totalMs: Date.now() - t0, chunks: st.chunks, metrics: st.metrics, thinking: st.thinking.slice(0, 6000), error: st.error ? { code: st.error.code, message: st.error.message } : null, at: new Date().toISOString(), summaries: st.summaries.map((s) => ({ index: s.index, text: s.text, doneAt: s.doneAt ?? null })), plan: st.plan };
    liveMeta.set(key, meta); rememberMeta(key, meta);
    if (st.sources.length) { liveSources.set(key, st.sources); rememberSources(key, st.sources); }
  };
  const seen = new Set<number>(); let lastSeq = 0; let dupes = 0; let gapsSeen = 0;
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return; const data = line.slice(5).trim(); if (!data) return;
    if (data === "[DONE]") { finalize(); setStream({ phase: "idle", detail: "", answerDone: true, integrity: { dupes, gaps: gapsSeen, frames: lastSeq } }, true); return; }
    let f: AgUiFrame; try { f = JSON.parse(data) as AgUiFrame; } catch { return; } // a partial frame never parses: the line splitter only hands over complete lines, the tail stays in `buf`
    // Idempotent frames: the bridge stamps every frame with `seq`; a replayed/duplicated frame is dropped, a gap is counted (surfaced in the rail).
    if (typeof f.seq === "number") { if (seen.has(f.seq)) { dupes++; return; } if (lastSeq && f.seq > lastSeq + 1) gapsSeen += f.seq - lastSeq - 1; seen.add(f.seq); lastSeq = Math.max(lastSeq, f.seq); }
    const now = Date.now(); const st = peek();
    switch (f.type) {
      case "RUN_STARTED": setStream({ firstStatusMs: st.firstStatusMs ?? now - t0, ...(st.phase === "idle" ? { phase: "connecting", detail: PHASE_LABEL.connecting } : {}) }, true); break;
      case "CUSTOM": {
        const v = f.value ?? {};
        switch (f.name) {
          case CE.session: if (typeof v.sessionId === "string" && v.sessionId) { onSession(v.sessionId); setStream({ sessionId: v.sessionId }); } break;
          case CE.status: {
            if (typeof v.phase !== "string") break;
            const p = v.phase; const phase: StreamPhase = p === "researching" ? "researching" : p === "answering" ? "answering" : p === "awaiting-input" ? "awaiting-input" : p === "streaming" || p === "planning" ? "planning" : p === "done" ? "answering" : "connecting";
            const extra: Partial<StreamState> = { firstStatusMs: st.firstStatusMs ?? now - t0 };
            if (Array.isArray(v.pluginIds)) extra.pluginIds = v.pluginIds.map(String);
            if (typeof v.statusMessage === "string" && v.statusMessage && p === "planning") extra.detail = v.statusMessage;
            if (st.phase !== "answering" || phase === "answering" || phase === "awaiting-input") setStream({ phase, detail: extra.detail ?? PHASE_LABEL[p] ?? PHASE_LABEL[phase] ?? "Working…", ...extra }, st.firstStatusMs == null);
            else setStream(extra);
            break;
          }
          case CE.thinking: if (typeof v.delta === "string") { const kind = String(v.kind ?? "thinking"); setStream({ thinking: (st.thinking + v.delta).slice(-12000), thinkingKinds: st.thinkingKinds.includes(kind) ? st.thinkingKinds : [...st.thinkingKinds, kind], ...(st.phase === "connecting" ? { phase: "planning", detail: PHASE_LABEL.planning } : {}) }); } break;
          case CE.sources: if (Array.isArray(v.sources)) { const items = (v.sources as Partial<Source>[]).filter((x): x is Source => typeof x.url === "string" && !!x.url).map((x) => ({ url: x.url, title: x.title || x.sourceName || x.url, sourceName: x.sourceName || x.title || x.url, ...(typeof x.imageUrl === "string" && /^https?:\/\//.test(x.imageUrl) ? { imageUrl: x.imageUrl } : {}) })); setStream({ sources: items, firstCitationMs: st.firstCitationMs ?? (items.length ? now - t0 : null) }); } break;
          case CE.metrics: if (v.publicMetrics && typeof v.publicMetrics === "object") setStream({ metrics: v.publicMetrics as Record<string, number> }); break;
          case CE.error: setStream({ error: { code: String(v.code ?? "error"), message: String(v.message ?? "Upstream error"), raw: typeof v.raw === "string" ? v.raw : undefined } }, true); break;
          case CE.plugins: if (Array.isArray(v.plugins) && v.plugins.length) setStream({ suggested: (v.plugins as { id: string; name: string; logoUrl?: string }[]) }); break;
          case CE.plan: { const steps = Array.isArray(v.steps) ? (v.steps as Omit<PlanStep, "state">[]).map((s, i) => ({ ...s, id: String(s.id ?? i + 1), state: "pending" as const })) : []; if (v.provisional && st.plan && !st.plan.provisional) break; setStream({ plan: { objective: typeof v.objective === "string" ? v.objective : null, steps, provisional: !!v.provisional }, ...(typeof v.objective === "string" && v.objective ? { detail: v.objective } : {}) }); break; }
          case CE.step: {
            const phase = String(v.phase); const stepId = String(v.stepId ?? ""); const index = Number(v.index ?? 0);
            const next: PlanStep["state"] = phase === "start" ? "running" : phase === "failed" ? "failed" : "done";
            const plan: { objective: string | null; steps: PlanStep[] } | null = st.plan ? { ...st.plan, steps: st.plan.steps.map((s, i): PlanStep => (s.id === stepId || i + 1 === index ? { ...s, state: next } : phase === "start" && s.state === "running" ? { ...s, state: "done" } : s)) } : (phase === "start" ? { objective: null, steps: [{ id: stepId || String(index), title: String(v.label ?? `Step ${index}`), query: typeof v.query === "string" ? v.query : undefined, state: "running" }] } : st.plan);
            if (phase === "start" && st.plan && !st.plan.steps.some((s, i) => s.id === stepId || i + 1 === index)) plan!.steps.push({ id: stepId || String(index), title: String(v.label ?? `Step ${index}`), query: typeof v.query === "string" ? v.query : undefined, state: "running" });
            setStream({ plan, ...(phase === "start" && typeof v.label === "string" ? { detail: v.label } : {}) });
            break;
          }
          case CE.summary: {
            const index = Number(v.index ?? 0); const stepId = String(v.stepId ?? "");
            const existing = st.summaries.find((s) => s.index === index);
            let summaries: StepSummary[];
            if (v.phase === "start") summaries = existing ? st.summaries : [...st.summaries, { index, stepId, state: "pending", text: "", optimistic: !!v.optimistic, startedAt: now - t0 }];
            else summaries = existing ? st.summaries.map((s) => (s.index === index ? { ...s, state: "done", text: String(v.text ?? ""), doneAt: String(v.at ?? new Date().toISOString()) } : s)) : [...st.summaries, { index, stepId, state: "done", text: String(v.text ?? ""), optimistic: false, startedAt: now - t0, doneAt: String(v.at ?? new Date().toISOString()) }];
            setStream({ summaries });
            break;
          }
          case CE.clarification: setStream({ prompt: { kind: "clarification", queries: (v.queries as { question: string; options?: string[] }[]) ?? [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.awaitingInput: setStream({ prompt: { kind: "awaiting_input", prompt: String(v.prompt ?? ""), options: Array.isArray(v.options) ? v.options.map(String) : [], ...(typeof v.inputType === "string" ? { inputType: v.inputType } : {}), ...(typeof v.allowCustom === "boolean" ? { allowCustom: v.allowCustom } : {}) }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.requireCreds: setStream({ prompt: { kind: "require_creds", pluginId: (v.pluginId as string) ?? null, service: (v.service as string) ?? null, fields: (v.fields as { key: string; label?: string; type?: string }[]) ?? [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.awaitingBrowserAction: setStream({ prompt: { kind: "awaiting_browser_action", action: (v.action as string) ?? null, message: (v.message as string) ?? null, url: (v.url as string) ?? null }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.filler: setStream({ filler: !!v.on, fillerTick: v.on ? Number(v.tick ?? 0) : 0 }, true); break;
          case CE.request: setStream({ request: v }); break;
          case CE.agent: setStream({ agentLog: [...st.agentLog.slice(-30), { subtype: String(v.subtype ?? "agent"), at: now - t0 }] }); break;
          case CE.attachments: if (Array.isArray(v.items)) setStream({ attachments: (v.items as StreamState["attachments"]) ?? [] }); break;
          case CE.voice: if (typeof v.phase === "string") setStream({ voice: { phase: v.phase, ...(typeof v.text === "string" ? { text: v.text } : {}) } }); break;
        }
        break;
      }
      case "TOOL_CALL_START": if (st.phase === "connecting" || st.phase === "planning") setStream({ phase: "researching", detail: `Searching with ${f.toolCallName || PLUGIN_NAME}…` }); break;
      case "TEXT_MESSAGE_CONTENT": case "TEXT_MESSAGE_CHUNK":
        if (f.delta) { const text = st.text + f.delta; const hasCite = st.firstCitationMs == null && /\]\(https?:\/\/[^\s)]+\)|https?:\/\/\S{8,}/.test(text); setStream({ text, chunks: st.chunks + 1, firstTokenMs: st.firstTokenMs ?? now - t0, ...(hasCite ? { firstCitationMs: now - t0 } : {}), ...(st.phase !== "answering" ? { phase: "answering", detail: PHASE_LABEL.answering, prompt: null } : {}) }, st.firstTokenMs == null); }
        break;
      case "RUN_ERROR": setStream({ error: st.error ?? { code: f.code ?? "run_error", message: f.message ?? "The run failed" } }, true); finalize(); setStream({ phase: "idle", detail: "" }, true); break;
      case "RUN_FINISHED": finalize(); setStream({ phase: "idle", detail: "", answerDone: true }, true); break;
    }
  };
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? ""; for (const l of lines) handle(l); }
    if (buf.trim()) handle(buf);
  } catch { /* aborted (Stop) or network — the UI path reports it */ }
  finally { if (peek().phase !== "idle") { finalize(); setStream({ phase: "idle", detail: "" }, true); } void threadId; }
}
