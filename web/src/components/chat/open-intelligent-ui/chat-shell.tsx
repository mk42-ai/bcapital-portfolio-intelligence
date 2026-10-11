"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentInterface, fetchLLM, agUIAdapter, useThread, useThreadList, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { Message, UserMessage } from "@openuidev/react-headless";
import { AlertTriangle, ArrowDown, Paperclip, Wrench, Bot, Brain, Check, ChevronDown, Cpu, ExternalLink, KeyRound, ListChecks, Loader2, MessageSquareMore, Mic, Plus, RotateCcw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Chevron } from "@/components/ui/chevron";
import { responseTheme } from "./response-theme";
import { localThreadStorage, saveMessages, sessionFor, rememberSession, rememberSources, sourcesFor, sourcesKey, rememberMeta, metaFor, type StoredSource, type StoredMeta } from "./local-storage";
import { extractCitations, isCiteLabel, isOverflowLabel, publisherOf, hostOf, type Cite } from "./citations";
import { useSettings } from "@/lib/settings";
import { PLUGIN_ID, PLUGIN_NAME, MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { CLIENT_EVENT as CE, LABEL } from "@/lib/ondemand/eventMap";
import { getSelectedPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { pluginName as catalogueName, PLUGIN_CATALOGUE } from "@/lib/plugin-catalogue";
import { pluginLabel as rawPluginLabel } from "@/lib/ondemand/eventMap";
import { friendlyStepTitle, sanitizeObjective } from "@/lib/ondemand/plan";
/** unit1: friendly plugin label (falls back to the catalogue name, then the raw id). */
const friendlyPlugin = (idOrName: string | null | undefined) => rawPluginLabel(idOrName, catalogueName);
export type PlannerPayload = { planning: string; steps: Record<string, string> };
const EMPTY_PAYLOAD: PlannerPayload = { planning: "", steps: {} };
export const hasPayload = (p: PlannerPayload | null | undefined): p is PlannerPayload => !!p && (p.planning.trim().length > 0 || Object.values(p.steps).some((t) => t.trim().length > 0));
import { PluginFavicon, preloadPluginFavicons } from "@/components/ui/plugin-favicon";
import { BrandIcon } from "@/components/ui/brand-icon";
import { brandIconForOperation, brandIconForPlugin, brandIconForStarter } from "@/lib/brand-icons";
import { RunStatusHeader } from "@/components/chat/run-status-header";
import { fmtScore } from "@/lib/format";
import { VoiceDock } from "@/components/chat/voice/voice-dock";
import { useVoiceOrigin } from "@/components/chat/voice/voice-origin";
import { AttachmentBar, SentChips, attachmentsStore, useAttachments } from "./attachments";
import { ContextChipsBar } from "./context-chips-bar";
import { AppComposer } from "./app-composer";
import { buildContextPayload, contextSummary } from "@/lib/chat/context-payload";
import { getSettings } from "@/lib/settings";
import { composerStore } from "./composer-store";
import { chipsBlock, clearContextChips, getContextChips, PITCHBOOK_PLUGIN_ID } from "./context-chips";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { ArtifactsToggle } from "@/components/artifacts/artifacts-panel";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { ImageGrid } from "@/components/media/image-grid";
import { VideoPlayer } from "@/components/media/video-player";
import { artifactsStore } from "@/lib/artifacts/store";
import type { Artifact } from "@/lib/artifacts/types";

export type CoCtx = { slug: string; name: string; sector: string; status: string; stage: string | null; sentiment: { score: number; label: string; delta?: number | null; updated_at?: string | null; basis?: string | null }; prior_run_at?: string | null; news_count?: number; latest_news: { title: string; url: string | null; published_at: string | null; source?: string | null }[]; estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; b_capital_role: string };
type Source = StoredSource;
const starters = [
  { displayText: "Latest Fervo news", prompt: "What is the latest news about Fervo Energy? Cite sources.", icon: null },
  { displayText: "Biggest movers", prompt: "Which of my context companies moved most since the last sentiment run, and why?", icon: null },
  { displayText: "Compare two", prompt: "Compare Apptronik and WRITER on funding momentum and recent sentiment.", icon: null },
  { displayText: "LP update draft", prompt: "Draft a one-paragraph LP update on the portfolio's sentiment this week.", icon: null },
];

/** Chat endpoint — overridable for local mock-SSE verification (NEXT_PUBLIC_CHAT_API_URL=http://127.0.0.1:3404/api/chat). */
const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat";
/** Google favicon service for source chips (favicons only — never AI-generated assets). */
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
  | { kind: "awaiting_input"; prompt: string; options: string[] }
  | { kind: "require_creds"; pluginId: string | null; service: string | null; fields: { key: string; label?: string; type?: string }[] }
  | { kind: "awaiting_browser_action"; action: string | null; message: string | null; url: string | null };
type StreamState = {
  phase: StreamPhase; detail: string; startedAt: number; finishedAt: number | null; sessionId: string | null; version: number;
  firstStatusMs: number | null; firstTokenMs: number | null; firstCitationMs: number | null; toolsMs?: number | null; answerMs?: number | null; chunks: number; thinking: string; thinkingKinds: string[]; error: StreamError;
  sources: Source[]; metrics: Record<string, number> | null; lastThreadId: string | null;
  pluginIds: string[]; suggested: { id: string; name: string; logoUrl?: string }[]; plan: { objective: string | null; steps: PlanStep[]; provisional?: boolean } | null;
  summaries: StepSummary[]; prompt: Prompt | null; filler: boolean; fillerTick: number; text: string; answerDone: boolean; integrity: { dupes: number; gaps: number; frames: number } | null;
  request: Record<string, unknown> | null; agentLog: { subtype: string; at: number }[]; stepRaw: Record<string, string>;
  attachments: { mediaId: string; name: string; kind?: string; extractedChars?: number; grounded?: boolean }[] | null; voice: { phase: string; text?: string } | null;
  artifacts: LiveArtifact[]; outputs: StepOutput[]; tools: ToolRow[]; plannerPayload: PlannerPayload;
};
/** One Working row = one plugin/agent action (TOOL_CALL_START/ARGS/RESULT from the bridge). */
export type ToolRow = { id: string; name: string; pluginId: string; query: string; stepId: string; status: "running" | "done" | "failed"; sources?: number; durationMs?: number; message?: string; raw?: string; startedAt?: number; finishedAt?: number };
export type LiveArtifact = { key: string; name: string; phase: "creating" | "ready" | "failed"; artifact?: Artifact; message?: string; media?: { status?: string; id?: string | null; message?: string | null } };
export type StepOutput = { stepId: string; title: string; plugins: { pluginId: string; name: string; operationId?: string | null; params: Record<string, unknown> | null }[]; at: number };
const IDLE: StreamState = { phase: "idle", detail: "", startedAt: 0, finishedAt: null, sessionId: null, version: 0, firstStatusMs: null, firstTokenMs: null, firstCitationMs: null, chunks: 0, thinking: "", thinkingKinds: [], error: null, sources: [], metrics: null, lastThreadId: null, pluginIds: [PLUGIN_ID], suggested: [], plan: null, summaries: [], prompt: null, filler: false, fillerTick: 0, text: "", answerDone: false, integrity: null, request: null, agentLog: [], stepRaw: {}, attachments: null, voice: null, artifacts: [], outputs: [], tools: [], plannerPayload: EMPTY_PAYLOAD };
let streamState: StreamState = IDLE;
let pending: Partial<StreamState> | null = null; let rafId = 0;
const liveSources = new Map<string, Source[]>();
const liveMeta = new Map<string, StoredMeta>();
const listeners = new Set<() => void>();
const flush = () => { rafId = 0; if (!pending) return; const p = pending; pending = null; streamState = { ...streamState, ...p, version: streamState.version + 1 }; listeners.forEach((l) => l()); };
const FLUSH_MS = () => (typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches ? 140 : 80);
let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;
const setStream = (patch: Partial<StreamState>, immediate = false) => {
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
let currentThreadId: string | null = null; // selected thread (kept by <Persistence>) so uploads before the first turn still find the thread's session
/** The OnDemand session of the given thread (in-memory ref first, then localStorage), or the live stream's session — used by attachment uploads. */
export const getCurrentSessionId = (ref: Record<string, string>, tid: string | null): string | null => (tid && (ref[tid] ?? sessionFor(tid))) || streamState.sessionId || null;
const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting to OnDemand…", "creating-session": "Creating OnDemand session…", querying: `Submitting to ${MODEL_LABEL}…`,
  streaming: `${MODEL_LABEL} is planning…`, planning: `${MODEL_LABEL} is planning…`, researching: `Searching with ${PLUGIN_NAME}…`, answering: "Writing the answer…", "awaiting-input": "Waiting for your input…", done: "Done",
};

type AgUiFrame = { seq?: number; type?: string; name?: string; value?: Record<string, unknown>; delta?: string; toolCallName?: string; toolCallId?: string; content?: string; isError?: boolean; error?: string; message?: string; code?: string };
/** unit2 — tools vs answer time. toolsMs: first TOOL_CALL_START → last TOOL_CALL_RESULT (or first status → first token when tools exist but were never stamped); answerMs: first token → now (answer done). */
export function splitRunTimings(st: Pick<StreamState, "tools" | "firstStatusMs" | "firstTokenMs">, t0: number, doneAt: number): { toolsMs: number | null; answerMs: number | null } {
  // a8 — every input is guarded: non-finite/negative stamps are dropped, every result is clamped ≥ 0 (never NaN, never negative).
  const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const clamp = (n: number): number | null => (Number.isFinite(n) ? Math.max(0, n) : null);
  const tools = Array.isArray(st.tools) ? st.tools : [];
  const ftt = fin(st.firstTokenMs) ? Math.max(0, st.firstTokenMs) : null;
  const fe = fin(st.firstStatusMs) ? Math.max(0, st.firstStatusMs) : 0;
  let toolsMs: number | null = null;
  if (tools.length) {
    const starts = tools.map((t) => t.startedAt).filter(fin);
    const ends = tools.map((t) => t.finishedAt).filter(fin);
    if (starts.length && ends.length) toolsMs = clamp(Math.max(...ends) - Math.min(...starts)); // first TOOL_CALL_START → last TOOL_CALL_RESULT
    else if (ftt != null) toolsMs = clamp(ftt - fe);
    else { const sum = tools.reduce((a, t) => a + (fin(t.durationMs) ? Math.max(0, t.durationMs) : 0), 0); toolsMs = sum > 0 ? sum : null; }
  }
  const answerMs = ftt != null && fin(doneAt) && fin(t0) ? clamp(doneAt - t0 - ftt) : null; // first token → done
  return { toolsMs, answerMs };
}
/** Reads the cloned SSE body line-by-line (data: …) and updates the live store + localStorage; never throws into the UI path. */
async function teeStream(res: Response, threadId: string, onSession: (sid: string) => void) {
  const body = res.body; if (!body) return;
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
  const t0 = peek().startedAt || Date.now();
  const finalize = () => {
    const st = peek(); const key = sourcesKey(st.text);
    // unit2 — split the run time: toolsMs = first TOOL_CALL_START → last TOOL_CALL_RESULT (fallback: first status → first token when tools exist); answerMs = first token → answer done.
    const { toolsMs, answerMs } = splitRunTimings(st, t0, Date.now());
    // The live DOM never truncates the reasoning; ONLY the persisted (localStorage) copy is capped at 200,000 chars to stay inside the quota.
    const meta: StoredMeta & { thinkingKinds?: string[]; plannerPayload?: PlannerPayload } = { model: MODEL_LABEL, modelId: MODEL_ID, reasoningMode: REASONING_MODE, pluginId: PLUGIN_ID, pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, firstCitationMs: st.firstCitationMs, toolsMs, answerMs, totalMs: Date.now() - t0, chunks: st.chunks, metrics: st.metrics, thinking: st.thinking.slice(0, 200_000), thinkingKinds: st.thinkingKinds, error: st.error ? { code: st.error.code, message: st.error.message } : null, at: new Date().toISOString(), summaries: st.summaries.map((s) => ({ index: s.index, text: s.text, doneAt: s.doneAt ?? null })), plan: st.plan, artifacts: st.artifacts.filter((a) => a.phase === "ready" && a.artifact).map((a) => a.artifact!), tools: st.tools, artifactFailures: st.artifacts.filter((a) => a.phase === "failed").map((a) => ({ name: a.name, message: a.message ?? "" })), outputs: st.outputs, plannerPayload: hasPayload(st.plannerPayload) ? { planning: st.plannerPayload.planning.slice(0, 60_000), steps: Object.fromEntries(Object.entries(st.plannerPayload.steps).map(([k, v]) => [k, v.slice(0, 60_000)])) } : undefined };
    liveMeta.set(key, meta); rememberMeta(key, meta);
    if (st.finishedAt == null) setStream({ finishedAt: Date.now(), toolsMs, answerMs }, true); else setStream({ toolsMs, answerMs }, true); // freezes the run-header timer at totalMs
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
          case CE.thinking: if (typeof v.delta === "string") { const kind = String(v.kind ?? "thinking"); setStream({ thinking: st.thinking + v.delta, thinkingKinds: st.thinkingKinds.includes(kind) ? st.thinkingKinds : [...st.thinkingKinds, kind], ...(st.phase === "connecting" ? { phase: "planning", detail: PHASE_LABEL.planning } : {}) }); } break;
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
          case CE.awaitingInput: setStream({ prompt: { kind: "awaiting_input", prompt: String(v.prompt ?? ""), options: Array.isArray(v.options) ? v.options.map(String) : [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.requireCreds: setStream({ prompt: { kind: "require_creds", pluginId: (v.pluginId as string) ?? null, service: (v.service as string) ?? null, fields: (v.fields as { key: string; label?: string; type?: string }[]) ?? [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.awaitingBrowserAction: setStream({ prompt: { kind: "awaiting_browser_action", action: (v.action as string) ?? null, message: (v.message as string) ?? null, url: (v.url as string) ?? null }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case CE.filler: setStream({ filler: !!v.on, fillerTick: v.on ? Number(v.tick ?? 0) : 0 }, true); break;
          case CE.request: setStream({ request: v }); break;
          case CE.agent: setStream({ agentLog: [...st.agentLog.slice(-30), { subtype: String(v.subtype ?? "agent"), at: now - t0 }] }); break;
          case CE.attachments: if (Array.isArray(v.items)) setStream({ attachments: (v.items as StreamState["attachments"]) ?? [] }); break;
          case CE.artifact: {
            const key = String(v.key ?? v.name ?? ""); const phase = String(v.phase) as LiveArtifact["phase"];
            const art = v.artifact && typeof v.artifact === "object" ? (v.artifact as Artifact) : undefined;
            const entry: LiveArtifact = { key, name: String(v.name ?? art?.name ?? "file"), phase, artifact: art, message: typeof v.message === "string" ? v.message : undefined, media: (v.media as LiveArtifact["media"]) ?? undefined };
            const rest = st.artifacts.filter((a) => a.key !== key);
            setStream({ artifacts: [...rest, entry] }, true);
            if (art && phase === "ready") artifactsStore.add(art);
            break;
          }
          case CE.stepOutput: setStream({ outputs: [...st.outputs.filter((o) => o.stepId !== String(v.stepId)), { stepId: String(v.stepId ?? ""), title: String(v.title ?? ""), plugins: Array.isArray(v.plugins) ? (v.plugins as StepOutput["plugins"]) : [], at: now - t0 }] }); break;
          case CE.plannerPayload: if (typeof v.delta === "string") { const phase = v.phase === "planning" ? "planning" : "step"; const sid = String(v.stepId ?? "") || "0"; const cur = st.plannerPayload; const pk = typeof v.kind === "string" ? v.kind : phase === "planning" ? "plan" : "step_output"; setStream({ thinkingKinds: st.thinkingKinds.includes(pk) ? st.thinkingKinds : [...st.thinkingKinds, pk], /* phase chips unchanged: payload kinds still count */ plannerPayload: phase === "planning" ? { ...cur, planning: cur.planning + v.delta } : { ...cur, steps: { ...cur.steps, [sid]: (cur.steps[sid] ?? "") + v.delta } }, ...(st.phase === "connecting" ? { phase: "planning", detail: PHASE_LABEL.planning } : {}) }); } break;
          case CE.voice: if (typeof v.phase === "string") setStream({ voice: { phase: v.phase, ...(typeof v.text === "string" ? { text: v.text } : {}) } }); break;
        }
        break;
      }
      case "TOOL_CALL_START": if (f.toolCallId && !st.tools.some((t) => t.id === f.toolCallId)) setStream({ tools: [...st.tools, { id: f.toolCallId, name: f.toolCallName || PLUGIN_NAME, pluginId: PLUGIN_ID, query: "", stepId: "", status: "running", startedAt: now }] }, true); break;
      case "TOOL_CALL_ARGS": {
        let a: { plugin?: string; pluginId?: string; query?: string; stepId?: string } = {}; try { a = JSON.parse(f.delta ?? "{}"); } catch { /* partial */ }
        setStream({ tools: st.tools.map((t) => (t.id === f.toolCallId ? { ...t, name: a.plugin || t.name, pluginId: a.pluginId || t.pluginId, query: a.query || t.query, stepId: String(a.stepId ?? t.stepId ?? "") } : t)) }, true);
        break;
      }
      case "TOOL_CALL_RESULT": {
        let r: { status?: string; sources?: number; durationMs?: number; message?: string; raw?: string } = {}; try { r = JSON.parse(f.content ?? "{}"); } catch { /* raw */ }
        const failed = f.isError === true || r.status === "error";
        setStream({ tools: st.tools.map((t) => (t.id === f.toolCallId ? { ...t, status: failed ? "failed" : "done", sources: r.sources, durationMs: r.durationMs, message: r.message ?? (failed ? f.error : undefined), raw: r.raw, finishedAt: now } : t)) }, true);
        break;
      }
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

/* ------------------------------------------------------------------------------------------------------------------
 * Markdown with inline numbered citation chips (streamed) + reserved Sources rail
 * ---------------------------------------------------------------------------------------------------------------- */
const CiteChip = memo(function CiteChip({ n, cite }: { n: number; cite?: Cite }) {
  const url = cite?.url ?? "#"; const host = cite?.sourceName ?? hostOf(url); const pub = publisherOf(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="oiu-cite" data-testid="citation-chip" data-n={n} data-publisher={pub} aria-label={`Source ${n}: ${cite?.title ?? host}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oiu-cite__ico" src={faviconFor(url)} alt="" width={12} height={12} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <span className="oiu-cite__pub">{pub}</span>
      <span className="oiu-cite__n">{n}</span>
      <span className="oiu-cite__preview" role="tooltip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faviconFor(url)} alt="" width={14} height={14} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        <span className="oiu-cite__title">{cite?.title ?? host}</span><span className="oiu-cite__host">{host}</span>
      </span>
    </a>
  );
});
/** "+N" overflow chip: the 4th… citations of one claim, listed on hover/focus (each still a real link). */
const CiteOverflow = memo(function CiteOverflow({ ids, cites }: { ids: number[]; cites: Cite[] }) {
  return (
    <span className="oiu-cite oiu-cite--more" data-testid="citation-overflow" data-count={ids.length} tabIndex={0} aria-label={`${ids.length} more sources`}>
      <span className="oiu-cite__pub">+{ids.length}</span>
      <span className="oiu-cite__preview oiu-cite__preview--list" role="tooltip">
        {ids.map((n) => { const c = cites[n - 1]; const url = c?.url ?? "#"; return <a key={n} href={url} target="_blank" rel="noopener noreferrer" className="oiu-cite__more-item" data-testid="citation-chip" data-n={n} data-publisher={publisherOf(url)}><span className="oiu-cite__n">{n}</span><span className="oiu-cite__title">{c?.title ?? hostOf(url)}</span><span className="oiu-cite__host">{hostOf(url)}</span></a>; })}
      </span>
    </span>
  );
});
/** Debounced value: re-renders at most every `ms` while input keeps changing (markdown parse throttle, ~60 ms). */
function useThrottled<T>(value: T, ms: number): T {
  const [v, setV] = useState(value); const last = useRef(0); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const now = Date.now(); const wait = Math.max(0, ms - (now - last.current));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { last.current = Date.now(); setV(value); }, wait);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ms]);
  return v;
}
const CitedMarkdown = memo(function CitedMarkdown({ text, known, streaming, onCites }: { text: string; known: Source[]; streaming: boolean; onCites?: (c: Cite[]) => void }) {
  // Adaptive markdown cadence: a 15 KB answer with GFM tables costs ~60–200 ms to re-parse; parse less often as the text grows (and on narrow viewports).
  const narrow = typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches;
  const cadence = !streaming ? 0 : text.length > 9000 ? (narrow ? 600 : 400) : text.length > 4000 ? (narrow ? 400 : 250) : narrow ? 220 : 120;
  const throttled = useThrottled(text, cadence);
  const { md, cites } = useMemo(() => extractCitations(throttled, known, streaming), [throttled, known, streaming]);
  useEffect(() => { onCites?.(cites); }, [cites, onCites]);
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const label = Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : children;
      const n = isCiteLabel(label);
      if (n) return <CiteChip n={n} cite={cites[n - 1]} />;
      const more = isOverflowLabel(label);
      if (more) return <CiteOverflow ids={more.ids} cites={cites} />;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  }), [cites]);
  return <div className="oiu-md" data-testid="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{md}</ReactMarkdown>{streaming && <span className="oiu-caret" aria-hidden />}</div>;
});

function SourceList({ sources, compact, live, streamingNow }: { sources: Source[]; compact?: boolean; live?: boolean; streamingNow?: boolean }) {
  // Reserved space: the rail always renders (min-height) during a live run so chips appearing never shift the answer below.
  if (!sources.length && !live) return null;
  return (
    <nav className={`oiu-sources${compact ? " oiu-sources--compact" : ""}${live ? " oiu-sources--live" : ""}`} aria-label="Sources" data-testid="sources-rail" data-count={sources.length}>
      <p className="oiu-sources__title">Sources ({sources.length}){live && !sources.length ? (streamingNow ? " · waiting for the first citation…" : " · the plugin returned no citations for this answer") : ""}</p>
      <ol className="oiu-sources__list">
        {sources.map((src, i) => (
          <li key={src.url} className="oiu-sources__item oiu-sources__item--in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
            <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link" data-testid="source-link">
              <span className="oiu-sources__num">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconFor(src.url)} alt="" width={16} height={16} className="oiu-sources__favicon" loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" data-testid="source-favicon" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              <span className="oiu-sources__text">
                <span className="oiu-sources__name">{src.title && src.title !== src.sourceName ? src.title : src.sourceName}</span>
                <span className="oiu-sources__meta"><span className="oiu-sources__host">{src.sourceName}</span><span className="oiu-sources__path">{src.url.replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 72) || "/"}</span></span>
              </span>
              <ExternalLink className="oiu-sources__ext" aria-hidden />
              <span className="sr-only"> (source {i + 1}, opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
/** a8 — Run footer: a COMPACT two-segment bar (tools charcoal · answer green, proportional to totalMs) + one muted caption line
 *  "Tools 44.1 s · Answer 17.8 s · Total 61.9 s · 12,814 tokens". The verbose first-event / first-token values live in the dev disclosure
 *  (run-rail.tsx) and stay on the badge as data-* attrs only. Model/reasoning/plugins live in the RunHeader above the turn. */
const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const finiteMs = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null);
function AnswerBadge({ meta, live }: { meta: Partial<StoredMeta> | null; live?: boolean }) {
  const ftt = finiteMs(meta?.firstTokenMs); const fe = finiteMs(meta?.firstStatusMs); const total = finiteMs(meta?.totalMs);
  const hadTools = Array.isArray(meta?.tools) && meta.tools.length > 0;
  const toolsRaw = finiteMs(meta?.toolsMs);
  const tools = toolsRaw != null && (hadTools || toolsRaw > 0) ? toolsRaw : null; // no tools → the segment is omitted (single green bar)
  const answer = finiteMs(meta?.answerMs) ?? (ftt != null && total != null ? Math.max(0, total - ftt) : null);
  const streaming = !!live && answer == null;
  const tokens = typeof meta?.metrics?.totalTokens === "number" && Number.isFinite(meta.metrics.totalTokens) ? meta.metrics.totalTokens : null;
  // Segment widths: proportional to totalMs (fallback: tools+answer); the pair never exceeds 100 %.
  const span = total ?? ((tools ?? 0) + (answer ?? 0));
  const pct = (ms: number | null) => (ms == null || span <= 0 ? 0 : Math.min(100, Math.round((ms / span) * 1000) / 10));
  const toolsPct = pct(tools); const answerPct = streaming ? Math.max(0, 100 - toolsPct) : Math.min(pct(answer), 100 - toolsPct);
  const caption: string[] = [];
  if (tools != null) caption.push(`Tools ${fmtSec(tools)}`);
  if (streaming) caption.push("Answer streaming"); else if (answer != null) caption.push(`Answer ${fmtSec(answer)}`);
  if (total != null && !streaming) caption.push(`Total ${fmtSec(total)}`);
  if (tokens != null) caption.push(`${tokens.toLocaleString()} tokens`);
  const hasBar = tools != null || answer != null || streaming;
  return (
    <div className="oiu-run__footer" data-testid="run-footer" data-footer="true">
      <div className="oiu-badge oiu-tbar" data-testid="answer-badge" data-first-token-ms={ftt ?? ""} data-first-event-ms={fe ?? ""} data-total-ms={total ?? ""} data-tools-ms={tools ?? ""} data-answer-ms={answer ?? ""} data-streaming={streaming ? "true" : undefined} aria-label={`Run timings: ${caption.join(", ") || "not available"}`}>
        {hasBar && (
          <div className="oiu-tbar__track" aria-hidden>
            {tools != null && toolsPct > 0 && <span className="oiu-tbar__seg oiu-tbar__seg--tools" style={{ width: `${toolsPct}%` }} title={`Tools ${fmtSec(tools)} — plugin / tool time: first tool call → last tool result`} data-seg="tools" />}
            {(answer != null || streaming) && answerPct > 0 && <span className={`oiu-tbar__seg oiu-tbar__seg--answer${streaming ? " oiu-tbar__seg--live" : ""}`} style={{ width: `${answerPct}%` }} title={streaming ? "Answer — streaming: first token → answer done" : `Answer ${fmtSec(answer!)} — answer writing time: first token → answer done`} data-seg="answer" />}
          </div>
        )}
        <p className="oiu-tbar__caption">
          {caption.length ? caption.map((c, i) => <span key={c} className="oiu-tbar__item">{i > 0 && <span className="oiu-badge__sep" aria-hidden>·</span>}{c}</span>) : <span className="oiu-tbar__item">Timings n/a</span>}
        </p>
      </div>
    </div>
  );
}
/** Compact run header above every assistant turn: model · reasoning level · plugin favicons · live timer (ticks from startedAt, freezes at totalMs). */
const fmtElapsed = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)} s`);
function RunHeader({ live, startedAt, totalMs, pluginIds }: { live: boolean; startedAt: number; totalMs: number | null; pluginIds: string[] }) {
  const [now, setNow] = useState(() => Date.now());
  // Interval-driven (not frame-driven): the timer keeps ticking on heartbeat-only stretches until [DONE]/RUN_FINISHED.
  useEffect(() => { if (!live || totalMs != null) return; const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, [live, totalMs]);
  const ms = totalMs != null ? totalMs : live && startedAt ? Math.max(0, now - startedAt) : 0;
  const plugins = pluginIds.length ? pluginIds : [PLUGIN_ID];
  return (
    <div className="oiu-run__header" data-testid="run-header" data-live={live ? "true" : "false"} aria-label="Run">
      <Cpu className="size-3" aria-hidden /><span className="oiu-run__model">{MODEL_LABEL}</span>
      <span className="oiu-badge__sep">·</span><span className="oiu-run__reason">{REASONING_MODE}</span>
      <span className="oiu-badge__sep">·</span>
      <span className="oiu-run__plugins" aria-label="Plugins">{plugins.slice(0, 6).map((id) => <span key={id} className="oiu-run__plugin" title={id} data-plugin-id={id} aria-label={friendlyPlugin(id)}><PluginFavicon id={id} size={14} /><span className="oiu-run__plugin-label">{friendlyPlugin(id)}</span></span>)}</span>
      {(live || totalMs != null) && <span className="oiu-run__timer" data-testid="run-timer" data-state={live && totalMs == null ? "running" : "frozen"} data-ms={Math.round(ms)}>{live && totalMs == null ? <Loader2 className="size-3 oiu-spin" aria-hidden /> : null}{fmtElapsed(ms)}</span>}
    </div>
  );
}
/** Collapsible reasoning trace — virtualised: only the last ~40 lines are in the DOM while collapsed/streaming; full text on demand. */
function ThinkingTrace({ text, kinds, live }: { text: string; kinds?: string[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useMemo(() => `oiu-think-${Math.random().toString(36).slice(2, 8)}`, []);
  const lines = useMemo(() => text.split("\n"), [text]);
  if (!text.trim()) return null;
  const shown = open ? lines.slice(-400) : lines.slice(-40);
  return (
    <div className={`oiu-thinking${open ? " oiu-thinking--open" : ""}`} data-testid="thinking-trace" data-lines={lines.length}>
      <button type="button" className="oiu-thinking__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Brain className="size-3.5" aria-hidden /><span>{LABEL.thinking}</span>{kinds?.length ? <span className="sr-only">{kinds.join(", ")}</span> : null}<span className="oiu-thinking__len">{text.length.toLocaleString()} chars</span><ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div id={id} className="oiu-thinking__panel" aria-hidden={!open}><div className="oiu-thinking__inner"><pre className="oiu-thinking__pre">{open ? shown.join("\n") : shown.slice(-6).join("\n")}</pre></div></div>
    </div>
  );
}
/** Plan stepper (plan_created / step start / done / failed). a6: card title "Plan", objective ≤ 2 lines, numbered checklist with status dots;
 *  JSON-looking objectives are dropped and operationId titles made friendly client-side too (sanitizePlan guards the bridge; this is the backstop). */
function PlanStepper({ plan, reserve }: { plan: { objective: string | null; steps: PlanStep[]; provisional?: boolean } | null; reserve?: boolean }) {
  const objective = plan ? sanitizeObjective(plan.objective) : "";
  const steps = plan ? plan.steps.map((s, i) => ({ ...s, title: friendlyStepTitle(s.title) || `Step ${i + 1}` })) : [];
  if (!plan || (!objective && !steps.length)) {
    // Reserved slot while the planner is still streaming its JSON: same box (border + min-height) the real stepper will occupy, so the
    // plan arriving does not push the plugin cards / thinking trace / working band down (the 0.10 CLS spike at plan_created on mobile).
    return reserve ? <section className="oiu-plan oiu-plan--reserved" data-testid="plan-stepper" data-state="pending" aria-label="Plan"><p className="oiu-plan__title"><ListChecks className="size-3.5" aria-hidden />Plan</p><div className="oiu-shimmer oiu-shimmer--plan" aria-hidden><span /><span /></div></section> : null;
  }
  return (
    <section className="oiu-plan" data-testid="plan-stepper" data-state={plan.provisional ? "provisional" : "ready"} aria-label="Plan">
      <p className="oiu-plan__title"><ListChecks className="size-3.5" aria-hidden />Plan{plan.provisional && <span className="oiu-plan__prov" title="Steps are still streaming in">drafting…</span>}</p>
      {objective && <p className="oiu-plan__objective" data-testid="plan-objective">{objective}</p>}
      {steps.length > 0 && <ol className="oiu-plan__steps">{steps.map((s, i) => (
        <li key={s.id} className={`oiu-plan__step oiu-plan__step--${s.state}`} data-testid="plan-step" data-state={s.state}>
          <span className={`oiu-plan__dot oiu-plan__dot--${s.state}`} aria-hidden>{s.state === "done" ? <Check className="size-2.5" strokeWidth={3} /> : s.state === "failed" ? <X className="size-2.5" strokeWidth={3} /> : null}</span>
          <span className="oiu-plan__num" aria-hidden>{i + 1}.</span>
          <span className="oiu-plan__label">{s.title}</span>
          {s.plugins?.length ? <span className="oiu-plan__plugins">{s.plugins.map((p) => <span key={p} className="oiu-plan__plugin">{friendlyPlugin(p)}</span>)}</span> : null}
        </li>))}</ol>}
    </section>
  );
}
/** Checkpoint card between steps: shimmer while summarising, then the agentic summary (collapsible, timestamped). */
function StepSummaryCard({ s, live }: { s: StepSummary; live?: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (!live && s.state === "done") setOpen(false); }, [live, s.state]);
  return (
    <section className={`oiu-summary oiu-summary--${s.state}`} data-testid="step-summary" data-index={s.index} data-state={s.state} aria-live="polite">
      {/* a3: the card title is STABLE ("Step N · summary") in both states; the optimistic/pending "Summarising step N…" is a muted line INSIDE the
          card body — never a Working-looking band of its own. The only "Working…" surface is the anchored run-status header. */}
      <button type="button" className="oiu-summary__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {s.state === "pending" ? <Loader2 className="size-3.5 oiu-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
        <span>{`Step ${s.index} · summary`}</span>
        {s.doneAt && <time className="oiu-summary__time" dateTime={s.doneAt}>{new Date(s.doneAt).toISOString().slice(11, 19)} UTC</time>}
        <Chevron open={open} />
      </button>
      <div className={`oiu-summary__panel${open ? " oiu-summary__panel--open" : ""}`}><div className="oiu-summary__inner">{s.state === "pending" ? (<>
        <p data-testid="step-summary-pending" data-optimistic={s.optimistic ? "true" : "false"} style={{ color: "#6e7277", fontWeight: 400 }}>{LABEL.summarising(s.index)}…</p>
        <div className="oiu-shimmer" aria-hidden><span /><span /><span /></div>
      </>) : <p>{s.text || "No summary text was emitted for this step."}</p>}</div></div>
    </section>
  );
}
/** Interactive prompts: clarification / awaiting_input (quick-reply chips), require_creds (secure inline form), awaiting_browser_action (approval). */
function PromptCard({ prompt, sessionId, onAnswer }: { prompt: Prompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  if (done) return <div className="oiu-prompt oiu-prompt--done" data-testid="prompt-done"><Check className="size-4" aria-hidden /> {done}</div>;
  if (prompt.kind === "require_creds") {
    const submit = async (cancelled: boolean) => {
      setBusy(true);
      try {
        const r = await fetch("/api/chat/creds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, pluginId: prompt.pluginId, cancelled, fields: cancelled ? [] : prompt.fields.map((f) => ({ key: f.key, value: vals[f.key] ?? "" })) }) });
        setDone(r.ok ? (cancelled ? "Credential request cancelled." : "Credentials sent to the agent (never stored in the browser).") : `Could not send credentials (HTTP ${r.status}).`);
      } catch (e) { setDone(`Could not send credentials: ${(e as Error).message}`); } finally { setBusy(false); setVals({}); }
    };
    return (
      <form className="oiu-prompt oiu-prompt--creds" data-testid="creds-form" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
        <p className="oiu-prompt__title"><KeyRound className="size-4" aria-hidden /> {prompt.service || catalogueName(prompt.pluginId ?? "")} needs a credential to continue</p>
        {prompt.fields.map((f) => <label key={f.key} className="oiu-prompt__field"><span>{f.label ?? f.key}</span><input type={f.type === "password" || /secret|token|key|password/i.test(f.key) ? "password" : "text"} autoComplete="off" value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} required /></label>)}
        <div className="oiu-prompt__actions"><button type="submit" className="oiu-prompt__btn oiu-prompt__btn--primary" disabled={busy}>Send securely</button><button type="button" className="oiu-prompt__btn" disabled={busy} onClick={() => void submit(true)}>Cancel</button></div>
        <p className="oiu-prompt__hint">Posted server-side to OnDemand's tool-credentials route; the value is never logged or persisted here.</p>
      </form>
    );
  }
  if (prompt.kind === "awaiting_browser_action") {
    return (
      <div className="oiu-prompt oiu-prompt--approve" data-testid="approval-card" role="group" aria-label="Approval needed">
        <p className="oiu-prompt__title"><ShieldCheck className="size-4" aria-hidden /> The agent wants to perform a browser action{prompt.action ? ` (${prompt.action})` : ""}</p>
        {prompt.message && <p className="oiu-prompt__text">{prompt.message}</p>}
        <div className="oiu-prompt__actions">{prompt.url && <a className="oiu-prompt__btn oiu-prompt__btn--primary" href={prompt.url} target="_blank" rel="noopener noreferrer">Open live browser</a>}<button type="button" className="oiu-prompt__btn" data-testid="browser-action-done" onClick={() => { onAnswer("Done — I completed the browser action."); setDone("Approval sent."); }}>I'm done</button><button type="button" className="oiu-prompt__btn" onClick={() => { onAnswer("Cancel the browser action."); setDone("Cancelled."); }}>Cancel</button></div>
      </div>
    );
  }
  const queries = prompt.kind === "clarification" ? prompt.queries : [{ question: prompt.prompt, options: prompt.options }];
  return (
    <form className="oiu-prompt oiu-prompt--clarify" data-testid="clarification-form" onSubmit={(e) => { e.preventDefault(); const answer = queries.map((q, i) => `${q.question}: ${vals[String(i)] ?? ""}`).join("\n"); onAnswer(answer); setDone("Answer sent."); }}>
      <p className="oiu-prompt__title"><MessageSquareMore className="size-4" aria-hidden /> The agent needs your input</p>
      {queries.map((q, i) => (
        <div key={i} className="oiu-prompt__q">
          <p className="oiu-prompt__text">{q.question}</p>
          {q.options?.length ? <div className="oiu-prompt__chips">{q.options.map((o) => <button type="button" key={o} className={`oiu-prompt__chip${vals[String(i)] === o ? " oiu-prompt__chip--on" : ""}`} onClick={() => setVals((v) => ({ ...v, [String(i)]: o }))}>{o}</button>)}</div> : null}
          <input className="oiu-prompt__input" placeholder="Type an answer…" value={vals[String(i)] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [String(i)]: e.target.value }))} />
        </div>
      ))}
      <div className="oiu-prompt__actions"><button type="submit" className="oiu-prompt__btn oiu-prompt__btn--primary">Reply</button></div>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * ONE run view per assistant turn (UX doc step 1: "one reducer for the stream, the new run view, the Outputs card, the Agent panel").
 * Fixed block order, identical live and settled so the live→final swap moves nothing:
 *   1. Thinking (pinned at the top; streams live, auto-collapses when the answer starts)
 *   2. Plan checklist (objective sentence + steps)
 *   3. Working rows — one per plugin/agent action, rendered BEFORE the action resolves (favicon chips, never an empty {} box) → done (N sources · s)
 *   4. Between-step summary cards (summarize_history / derived from the step boundary)
 *   5. Outputs card (step_output: which plugin ran with which parameters)
 *   6. Interactive prompts (awaiting_input / require_creds / awaiting_browser_action / clarification)
 *   7. Answer (fulfillment) with publisher-first inline citation chips (+N overflow)
 *   8. Inline media (image grid + lightbox, video player) and artifact cards (file_written / artifact_ready / report PDF)
 *   9. Sources — numbered, COLLAPSED list under the answer
 *  10. One "Data gap" sentence when a call failed (honest red state)
 * ---------------------------------------------------------------------------------------------------------------- */
type RunData = {
  live: boolean; answerDone?: boolean; phase: StreamPhase; detail: string; thinking: string; thinkingKinds: string[]; answerStarted: boolean;
  plan: { objective: string | null; steps: PlanStep[]; provisional?: boolean } | null; tools: ToolRow[]; summaries: StepSummary[]; outputs: StepOutput[]; plannerPayload?: PlannerPayload | null;
  prompt: Prompt | null; sessionId: string | null; text: string; known: Source[]; sources: Source[]; artifacts: LiveArtifact[];
  error: { code: string; message: string; raw?: string } | null; meta: Partial<StoredMeta> | null; filler: boolean; fillerTick: number; elapsedMs: number;
  startedAt: number; totalMs: number | null;
};
const IMG_URL_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/api\/artifacts\/[^\s)]+)\)/g;
const VIDEO_URL_RE = /(https?:\/\/[^\s)"']+\.(?:mp4|webm|mov)(?:\?[^\s)"']*)?)/gi;
function mediaFrom(text: string, arts: Artifact[]) {
  const images: { src: string; alt: string; caption?: string }[] = []; const videos: { src: string; title: string; poster?: string }[] = [];
  for (const m of text.matchAll(IMG_URL_RE)) images.push({ src: m[2], alt: m[1] || "image", caption: m[1] || undefined });
  for (const m of text.matchAll(VIDEO_URL_RE)) if (!videos.some((v) => v.src === m[1])) videos.push({ src: m[1], title: m[1].split("?")[0].split("/").pop() ?? "video" });
  for (const a of arts) { if (a.kind === "image") images.push({ src: a.contentUrl, alt: a.name, caption: a.name }); else if (a.kind === "video") videos.push({ src: a.contentUrl, title: a.name }); }
  return { images, videos };
}
/** OnDemand-playground status glyph: 14px neutral ring spinner (rotation comes from .oiu-spin, so reduced-motion rules still apply). */
const StatusSpinner = () => <span className="oiu-ring oiu-spin" aria-hidden />;
/** Working row for one plugin/agent action — a4: uniform 56px grid [ring][chip][label+query][timing]. */
function WorkingRing({ state }: { state: "running" | "done" | "failed" | "queued" }) {
  return (
    <span className={`oiu-work__ring oiu-work__ring--${state}`} aria-hidden>
      {state === "done" ? <Check className="oiu-work__ring-ico" strokeWidth={3} /> : state === "failed" ? <X className="oiu-work__ring-ico" strokeWidth={3} /> : null}
    </span>
  );
}
function useElapsed(on: boolean, startedAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on || !startedAt) return; setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, [on, startedAt]);
  return on && startedAt ? Math.max(0, now - startedAt) : null;
}
function WorkingRow({ t, live }: { t: ToolRow; live: boolean }) {
  const name = friendlyPlugin(t.name || t.pluginId);
  const state = t.status === "failed" ? "failed" : t.status === "running" && live ? "running" : "done";
  const elapsed = useElapsed(state === "running", t.startedAt);
  const timing = state === "running" ? (elapsed != null ? `+${(elapsed / 1000).toFixed(1)} s` : "") : state === "failed" ? "failed" : LABEL.done(t.sources, t.durationMs);
  const second = state === "failed" && t.message ? t.message : t.query;
  return (
    <li className={`oiu-work oiu-work--${state}`} data-testid="working-row" data-state={state} data-plugin={t.pluginId}>
      <WorkingRing state={state} />
      <span className="oiu-work__chips" data-testid="working-chips" title={t.pluginId} data-plugin-id={t.pluginId}><PluginFavicon id={t.pluginId} size={20} /></span>
      <span className="oiu-work__text">
        <span className="oiu-work__label" title={name}>{state === "failed" ? LABEL.failed(name) : LABEL.action(name)}<span className="oiu-work__via" title={t.pluginId} data-plugin-id={t.pluginId}> · {name}</span></span>
        {second ? <span className={state === "failed" && t.message ? "oiu-work__query oiu-work__err" : "oiu-work__query"} title={second}>{second}</span> : null}
      </span>
      <span className="oiu-work__timing" data-testid="working-timing">{timing}</span>
    </li>
  );
}
const hasParams = (p: Record<string, unknown> | null | undefined): p is Record<string, unknown> => !!p && typeof p === "object" && Object.keys(p).length > 0;
/** a1: Outputs body — summary chip lives in RunStatusHeader; this renders only when the chip is open (never an interleaved row). */
const outputStats = (raw: StepOutput[], plannerPayload?: PlannerPayload | null) => {
  const outputs = raw.map((o) => ({ ...o, plugins: o.plugins.filter((pl) => hasParams(pl.params)) })).filter((o) => o.plugins.length > 0);
  const payload = hasPayload(plannerPayload) ? plannerPayload : null;
  // a6: the planner payload lives only behind the developer reveal, so the Outputs chip counts real step calls only.
  return { outputs, payload, calls: outputs.reduce((n, o) => n + o.plugins.length, 0), has: outputs.length > 0 };
};
function OutputsCard({ outputs: raw, plannerPayload }: { outputs: StepOutput[]; plannerPayload?: PlannerPayload | null }) {
  // Skip plugin entries with null/empty params and hide the card when no step has a real call — never an empty `{}` box.
  const { outputs, payload, calls } = outputStats(raw, plannerPayload);
  if (!outputs.length) return null; // a6: planner payload lives only behind the developer reveal (run-rail dev-disclosure)
  const head = `Outputs · ${outputs.length} step${outputs.length === 1 ? "" : "s"} · ${calls} call${calls === 1 ? "" : "s"}`;
  return (
    <section className="oiu-outputs" data-testid="outputs-card" data-count={outputs.length} data-has-payload="false">
      <p className="oiu-outputs__head" aria-label={head}><Wrench className="size-3.5" aria-hidden /><span>{head}</span></p>
      {outputs.length > 0 && <ol className="oiu-outputs__list">{outputs.map((o) => <li key={o.stepId} data-testid="output-step"><strong>{o.title}</strong>{o.plugins.map((pl, i) => <span key={i} className="oiu-outputs__call" data-operation-id={pl.operationId ?? undefined}><PluginFavicon id={pl.pluginId} size={14} />{brandIconForOperation(pl.operationId) && <BrandIcon name={brandIconForOperation(pl.operationId)!} size={14} slot="outputs-step" title={pl.operationId ?? undefined} />} <span title={pl.pluginId} data-plugin-id={pl.pluginId}>{friendlyPlugin(pl.name || pl.pluginId)}</span><code>{JSON.stringify(pl.params).slice(0, 160)}</code></span>)}</li>)}</ol>}
    </section>
  );
}
/** unit1: pretty-print a planner/tool-definition payload when it parses as JSON (first balanced object), else show the raw text. */
function prettyPayload(text: string): string {
  const t = text.trim().replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  try { return JSON.stringify(JSON.parse(t), null, 2); } catch { /* fall through */ }
  const i = t.indexOf("{"); if (i >= 0) { let depth = 0, inStr = false, esc = false; for (let k = i; k < t.length; k++) { const c = t[k]; if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { try { return `${JSON.stringify(JSON.parse(t.slice(i, k + 1)), null, 2)}${t.slice(k + 1).trim() ? `\n${t.slice(k + 1).trim()}` : ""}`; } catch { break; } } } } }
  return t;
}
export function PlannerPayloadDetails({ payload }: { payload: PlannerPayload }) {
  const steps = Object.entries(payload.steps).filter(([, v]) => v.trim()).sort(([a], [b]) => Number(a) - Number(b));
  const total = payload.planning.length + steps.reduce((n, [, v]) => n + v.length, 0);
  return (
    <details className="oiu-payload" data-testid="planner-payload" data-chars={total}>
      <summary className="oiu-payload__sum"><span>Planner payload</span><span className="oiu-payload__meta">{payload.planning.trim() ? "plan" : ""}{payload.planning.trim() && steps.length ? " · " : ""}{steps.length ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : ""} · {total.toLocaleString()} chars</span></summary>
      <div className="oiu-payload__body">
        {payload.planning.trim() ? <div className="oiu-payload__sec" data-phase="planning"><span className="oiu-payload__label">Plan</span><pre className="oiu-payload__pre">{prettyPayload(payload.planning)}</pre></div> : null}
        {steps.map(([sid, txt]) => <div key={sid} className="oiu-payload__sec" data-phase="step" data-step={sid}><span className="oiu-payload__label">Step {sid}</span><pre className="oiu-payload__pre">{prettyPayload(txt)}</pre></div>)}
      </div>
    </details>
  );
}
function CollapsedSources({ sources, live }: { sources: Source[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null; // never an empty strip
  return (
    <section className={`oiu-srcs${open ? " oiu-srcs--open" : ""}`} data-testid="sources-list" data-count={sources.length} aria-label="Sources">
      <button type="button" className="oiu-srcs__head" aria-expanded={open} data-testid="sources-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="oiu-srcs__favs" aria-hidden>{sources.slice(0, 5).map((s) => <img key={s.url} src={faviconFor(s.url)} alt="" width={14} height={14} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />)}</span>
        <span>Sources ({sources.length})</span><Chevron open={open} />
      </button>
      {open && <SourceList sources={sources} />}
    </section>
  );
}
function ArtifactRow({ a }: { a: LiveArtifact }) {
  if (a.phase === "ready" && a.artifact) return <ArtifactCard artifact={a.artifact} compact />;
  return (
    <div className={`oiu-artrow oiu-artrow--${a.phase}`} data-testid="artifact-pending" data-state={a.phase}>
      <ArtifactIcon kind={/\.(png|jpe?g|webp)$/i.test(a.name) ? "image" : /\.(mp4|webm)$/i.test(a.name) ? "video" : "document"} state={a.phase === "failed" ? "failed" : "uploading"} size={28} />
      <span><strong>{a.name}</strong><span className="oiu-artrow__meta">{a.phase === "failed" ? a.message ?? "Could not save this file" : "Saving to Artifacts and OnDemand media…"}</span></span>
    </div>
  );
}
function RunView({ r, onAnswer }: { r: RunData; onAnswer: (text: string) => void }) {
  const [cites, setCites] = useState<Cite[]>([]);
  const [outputsOpen, setOutputsOpen] = useState(false); // a1: Outputs body closed by default — summary chip sits in RunStatusHeader
  const thinkingShown = useThrottled(r.thinking, 250); // full body — no character cap (throttled re-render only)
  const readyArts = r.artifacts.filter((a) => a.phase === "ready" && a.artifact).map((a) => a.artifact!);
  const media = useMemo(() => mediaFrom(r.text, readyArts), [r.text, readyArts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const railSources = r.error?.code === "plugin_error" ? [] : cites.length ? cites : r.sources;
  const failedTools = r.tools.filter((t) => t.status === "failed");
  const gap = r.error ? r.error.message : failedTools.length ? `${failedTools.map((t) => t.name).join(", ")} failed: ${failedTools[0].message ?? "upstream error"}` : r.artifacts.find((a) => a.phase === "failed") ? `A file could not be saved: ${r.artifacts.find((a) => a.phase === "failed")!.message ?? "storage error"}` : "";
  // a1 — status state machine: thinking (no tool yet) → working (a tool is running / tools done but answer not started) → done | failed.
  const runningTool = r.live ? r.tools.find((t) => t.status === "running") : undefined;
  const runningStep = r.plan?.steps.find((st) => st.state === "running");
  const statusState: "thinking" | "working" | "done" | "failed" =
    r.error || (!r.live && failedTools.length) ? "failed"
    : !r.live || (r.answerStarted && (r.answerDone || !r.live)) ? "done"
    : r.answerStarted ? "working"
    : r.tools.length > 0 || runningStep ? "working"
    : "thinking";
  const statusTask = statusState === "failed" ? gap
    : runningTool ? `${LABEL.action(friendlyPlugin(runningTool.name || runningTool.pluginId))}${runningTool.query ? ` · ${runningTool.query.slice(0, 80)}` : ""}`
    : runningStep ? runningStep.title
    : r.answerStarted && r.live ? "Writing the answer"
    : r.plan?.objective || (r.detail && r.detail !== LABEL.working ? r.detail : r.live ? "Connecting to OnDemand" : "");
  const statusIcon = statusState === "failed" ? null
    : runningTool ? brandIconForPlugin(runningTool.pluginId, runningTool.name)
    : runningStep ? (brandIconForOperation(runningStep.title) ?? brandIconForPlugin(null, runningStep.title))
    : r.answerStarted && r.live ? "writer-compose"
    : null;
  const stepsTotal = r.plan?.steps.length ?? 0; const stepsDone = r.plan?.steps.filter((st) => st.state === "done").length ?? 0;
  const oStats = outputStats(r.outputs, r.plannerPayload);
  const statusElapsed = r.totalMs ?? r.meta?.totalMs ?? r.elapsedMs;
  return (
    <div className="oiu-run" data-testid="run-view" data-live={r.live ? "true" : "false"}>
      {/* 0 — Run header: model · reasoning · plugin chips · live timer */}
      <RunHeader live={r.live} startedAt={r.startedAt} totalMs={r.totalMs} pluginIds={(r.meta?.pluginIds as string[] | undefined) ?? [PLUGIN_ID]} />
      {/* 0b — a1: ONE status header anchored at the top (replaces the interleaved Working band + Outputs row) */}
      <RunStatusHeader state={statusState} task={statusTask} icon={statusIcon} elapsedMs={statusElapsed} live={r.live && !r.answerDone} startedAt={r.startedAt}
        stepsDone={stepsDone} stepsTotal={stepsTotal} outputSteps={oStats.outputs.length} calls={oStats.calls} hasOutputs={oStats.has}
        onToggleOutputs={oStats.has ? () => setOutputsOpen((o) => !o) : undefined} outputsOpen={outputsOpen} />
      {/* 1 — Thinking, pinned at the top (ONE per turn, never moves) */}
      {(r.thinking || r.live) && (
        <ThinkingBlock text={thinkingShown} kinds={r.thinkingKinds} plan={r.plan} answerStarted={r.answerStarted} live={r.live} collapsed={r.answerStarted || !r.live} elapsedMs={r.meta?.firstTokenMs ?? r.elapsedMs} portfolioToolStarted={r.tools.some((t) => t.pluginId === PORTFOLIO_PLUGIN)} />
      )}
      {/* 2 — Plan checklist */}
      {(r.plan || (r.live && !r.answerStarted)) && <PlanStepper plan={r.plan} reserve={r.live} />}
      {/* 3 — Working rows (one per tool call; the "connecting" state is carried by RunStatusHeader, no skeleton row) */}
      {r.tools.length > 0 && (
        <ol className="oiu-work-list" aria-label="Working" data-testid="working-list">
          {r.tools.map((t) => <WorkingRow key={t.id} t={t} live={r.live} />)}
        </ol>
      )}
      {/* 4 — between-step summaries */}
      {r.summaries.map((s) => <StepSummaryCard key={s.index} s={s} live={r.live} />)}
      {/* 5 — outputs body, only when the header chip is open (default closed → no interleaved row) */}
      {outputsOpen && <OutputsCard outputs={r.outputs} plannerPayload={r.plannerPayload} />}
      {/* 6 — interactive controls */}
      {r.live && r.prompt && <PromptCard prompt={r.prompt} sessionId={r.sessionId} onAnswer={onAnswer} />}
      {/* 7 — answer */}
      {(r.text || (r.live && r.answerStarted)) && (
        <div className="oiu-answer" data-testid="answer-block">
          <CitedMarkdown text={r.text} known={r.error?.code === "plugin_error" ? [] : r.known} streaming={r.live} onCites={setCites} />
        </div>
      )}
      {/* 7b — inline media referenced by the answer (images / video) */}
      {media.images.length > 0 && <div className="oiu-media" data-testid="inline-images"><ImageGrid images={media.images} /></div>}
      {media.videos.map((v) => <div key={v.src} className="oiu-media" data-testid="inline-video"><VideoPlayer src={v.src} title={v.title} poster={v.poster} /></div>)}
      {/* 8 — collapsed Sources strip directly under the answer (contract order: sources → Artifacts → footer) */}
      {/* Sources mount once the answer has finished streaming (live text growth would otherwise push this row on every token → CLS). */}
      {(!r.live || r.answerDone) && <CollapsedSources sources={railSources} live={r.live} />}
      {/* 9 — Artifacts card (only when the turn produced at least one artifact — never an empty box) */}
      {r.artifacts.length > 0 && <div className="oiu-artifacts" data-testid="inline-artifacts">{r.artifacts.map((a) => <ArtifactRow key={a.key} a={a} />)}</div>}
      {/* 9b — one Data gap sentence on failure */}
      {/* shown live too — the moment a tool fails or an error frame arrives, never a green check on a failed call */}
      {gap && <p className="oiu-gap" role="alert" data-testid="data-gap"><AlertTriangle className="size-3.5" aria-hidden /> <strong>Data gap:</strong> {gap}</p>}
      {/* 10 — footer timings: settled turns, and live once the answer is done */}
      {((!r.live && r.meta) || (r.live && r.answerDone)) && <AnswerBadge meta={{ ...(r.meta ?? {}), totalMs: r.totalMs ?? r.meta?.totalMs ?? null }} live={r.live} />}
    </div>
  );
}
/** unit1: last non-empty line that does not look like planner JSON (brace/bracket lines, "pluginId", "chars each" markers, fences). */
const PAYLOAD_LINE_RE = /^\s*[\[\]{}"`,]|"pluginId"|api_request_parameters|"operationId"|chars each|^\s*```/;
function lastProseLine(text: string): string {
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) { const l = lines[i].trim(); if (l && !PAYLOAD_LINE_RE.test(l)) return l; }
  return "";
}
/** Phase chips for the Thinking block: planning_* → Planning, step_* → Step 1…n (n = plan steps started so far), fulfillment_* → Answer. */
function thinkingPhases(kinds: string[], plan: RunData["plan"], answerStarted: boolean): string[] {
  const out: string[] = [];
  if (kinds.some((k) => k.startsWith("planning"))) out.push("Planning");
  const started = plan?.steps.filter((st) => st.state !== "pending").length ?? 0;
  const n = Math.max(started, kinds.some((k) => k.startsWith("step")) ? 1 : 0);
  for (let i = 1; i <= n; i++) out.push(`Step ${i}`);
  if (kinds.some((k) => k.startsWith("fulfillment")) || answerStarted) out.push("Answer");
  return out;
}
/** a2: Portfolio Plugin id — the first tool row with this pluginId auto-expands the Thinking block (once per run). */
const PORTFOLIO_PLUGIN = "plugin-1791713636";
/** Thinking block pinned at the top of the turn. Starts COLLAPSED (one-line head: spinner/brain · "Thinking" · phase chips · last prose line) even
 *  while live; auto-expands exactly once when the first Portfolio Plugin tool row appears; a manual click wins for the rest of the run (no further
 *  auto open/close); state resets when a new live turn starts. Open body = fixed-height scrollable (auto-follows the tail); closed body = unmounted (0 px).
 *  Never truncates. */
function ThinkingBlock({ text, kinds, plan, answerStarted, live, collapsed, elapsedMs, portfolioToolStarted }: { text: string; kinds: string[]; plan: RunData["plan"]; answerStarted: boolean; live: boolean; collapsed: boolean; elapsedMs: number; portfolioToolStarted: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null); // manual override (null = automatic)
  const [auto, setAuto] = useState(false); // currently auto-expanded by the Portfolio Plugin start
  const manualRef = useRef(false); // user toggled → automatic changes stop for this run
  const autoDoneRef = useRef(false); // auto-expansion already happened once this run
  const prevLiveRef = useRef(live);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // New turn (live false→true): forget the manual + auto decisions of the previous run.
  useEffect(() => { if (live && !prevLiveRef.current) { manualRef.current = false; autoDoneRef.current = false; setAuto(false); setOpen(null); } prevLiveRef.current = live; }, [live]);
  // Auto-expand exactly once when the first Portfolio Plugin tool row appears — unless the user already toggled manually.
  useEffect(() => { if (live && !collapsed && portfolioToolStarted && !autoDoneRef.current && !manualRef.current) { autoDoneRef.current = true; setAuto(true); } }, [live, collapsed, portfolioToolStarted]);
  // First answer token → collapse again (automatic mode only; a manual toggle is never overridden).
  useEffect(() => { if (collapsed && !manualRef.current) { setAuto(false); setOpen(null); } }, [collapsed]);
  const streaming = live && !collapsed;
  const isOpen = open ?? (auto && streaming);
  // Follow the tail while streaming (scrollTop, not layout — the body height is fixed so nothing below it moves).
  useEffect(() => { const el = bodyRef.current; if (el && streaming && isOpen) el.scrollTop = el.scrollHeight; }, [text, streaming, isOpen]);
  const phases = thinkingPhases(kinds, plan, answerStarted);
  const secs = Math.max(1, Math.round(elapsedMs / 1000));
  // unit1: the header tail shows the last PROSE line only (never a JSON / truncation-marker fragment that slipped through)
  const lastLine = streaming ? lastProseLine(text) : "";
  const toggle = () => { manualRef.current = true; setOpen(!isOpen); };
  return (
    <section className={`oiu-think${isOpen ? " oiu-think--open" : ""}${streaming ? " oiu-think--live" : ""}`} data-testid="thinking-block" data-state={streaming ? "streaming" : isOpen ? "expanded" : "collapsed"} data-auto-expanded={auto && isOpen ? "true" : "false"} data-manual={manualRef.current ? "true" : "false"} data-chars={text.length} data-phases={phases.join(",")}>
      <button type="button" className="oiu-think__head" aria-expanded={isOpen} onClick={toggle}>
        {streaming ? <StatusSpinner /> : <Check className="size-3.5 oiu-think__done" aria-hidden />}
        <span className={`oiu-think__title${streaming ? " oiu-shimmer-text" : ""}`}>{streaming ? "Thinking" : `Thought for ${secs} s`}</span>
        {phases.length > 0 && <span className="oiu-think__phases" data-testid="thinking-phases">{phases.map((p) => <span key={p} className="oiu-think__phase" data-phase={p}>{p}</span>)}</span>}
        {streaming && lastLine && <span className="oiu-think__tail" aria-hidden>{lastLine.slice(-72)}</span>}
        <Chevron open={isOpen} />
      </button>
      {isOpen && <div className="oiu-think__body" ref={bodyRef}>{text ? <pre className="oiu-think__pre">{text}</pre> : <span className="oiu-shimmer" aria-hidden><span /><span /></span>}</div>}
    </section>
  );
}

const AssistantMessage: AssistantMessageComponent = memo(function AssistantMessage({ message, isStreaming }) {
  const content = typeof message.content === "string" ? message.content : "";
  const settled = useStreamSelector((x) => (x.phase === "idle" ? 1 : 0) + (x.answerDone ? 2 : 0));
  const key = sourcesKey(content);
  const meta = useMemo(() => (isStreaming ? null : liveMeta.get(key) ?? metaFor(key)), [key, isStreaming, settled]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => (isStreaming ? [] : liveSources.get(key) ?? sourcesFor(key) ?? []), [key, isStreaming, settled]); // eslint-disable-line react-hooks/exhaustive-deps
  const processMessage = useThread((s) => s.processMessage);
  // The live turn is drawn by PluginTimeline (OpenUI routes it there while tools are on the turn); this view is the settled replay.
  if (isStreaming) return <div className="oiu-assistant" data-testid="assistant-message"><div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div><div className="oiu-assistant__body"><CitedMarkdown text={content || "…"} known={[]} streaming onCites={undefined} /></div></div>;
  const r: RunData = {
    live: false, phase: "idle", detail: "", thinking: meta?.thinking ?? "", thinkingKinds: (meta as { thinkingKinds?: string[] } | null)?.thinkingKinds ?? [], answerStarted: true,
    plan: meta?.plan ? { objective: meta.plan.objective, steps: meta.plan.steps.map((s) => ({ ...s, state: s.state === "running" ? "done" : s.state })) } : null,
    tools: (meta?.tools ?? []).map((t) => ({ ...t, status: t.status === "running" ? "done" : t.status })),
    summaries: (meta?.summaries ?? []).map((s) => ({ index: s.index, stepId: "", state: "done" as const, text: s.text, optimistic: false, startedAt: 0, doneAt: s.doneAt ?? undefined })),
    outputs: meta?.outputs ?? [], plannerPayload: (meta as { plannerPayload?: PlannerPayload } | null)?.plannerPayload ?? null, prompt: null, sessionId: null, text: content, known: meta?.error ? [] : known, sources: meta?.error ? [] : known,
    artifacts: [...(meta?.artifacts ?? []).map((a) => ({ key: a.id, name: a.name, phase: "ready" as const, artifact: a })), ...(meta?.artifactFailures ?? []).map((f, i) => ({ key: `f${i}`, name: f.name, phase: "failed" as const, message: f.message }))],
    error: meta?.error ?? null, meta, filler: false, fillerTick: 0, elapsedMs: meta?.totalMs ?? 0, startedAt: 0, totalMs: meta?.totalMs ?? null,
  };
  return (
    <div className="oiu-assistant" data-testid="assistant-message">
      <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
      <div className="oiu-assistant__body"><RunView r={r} onAnswer={(t) => { void processMessage({ role: "user", content: t }); }} /></div>
    </div>
  );
});

/** User bubble = OpenUI's default markup + the attachment chips sent with that message (attachmentsStore.sentFor(message.id)). */
const UserBubble: React.ComponentType<{ message: UserMessage }> = memo(function UserBubble({ message }) {
  useAttachments(); // re-render when the sent map changes (markSent / hydrate)
  const sent = attachmentsStore.sentFor(message.id) ?? [];
  const c = message.content as unknown;
  const viaVoice = useVoiceOrigin(message.id, typeof c === "string" ? c : "");
  const text = typeof c === "string" ? c.replace(/<context>[\s\S]*?<\/context>/g, "").replace(/<\/?content>/g, "").trim() : Array.isArray(c) ? (c as { type?: string; text?: string }[]).filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n") : "";
  return (
    <div className="openui-agent-thread-message-user oiu-user-msg" data-testid="user-message" data-attachments={sent.length}>
      <div className="openui-agent-thread-message-user__content">{text}</div>
      {viaVoice && <span className="voice-origin" data-testid="voice-origin"><Mic className="size-3" aria-hidden /> via voice</span>}
      {sent.length > 0 && <SentChips items={sent} />}
    </div>
  );
});
const PluginTimeline: ToolCallTimelineComponent = ({ steps, isLast }) => {
  const isRunning = useThread((s) => s.isRunning);
  const processMessage = useThread((s) => s.processMessage);
  const st = useStreamState();
  const live = isLast && isRunning;
  const liveText = live ? steps.filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text").map((s) => s.text).join("\n\n") : "";
  if (!live) return null; // settled turns are drawn by AssistantMessage → RunView from the stored run meta (same order)
  const r: RunData = {
    live: true, answerDone: st.answerDone, phase: st.phase, detail: st.detail, thinking: st.thinking, thinkingKinds: st.thinkingKinds, answerStarted: !!(liveText || st.text),
    plan: st.plan, tools: st.tools, summaries: st.summaries, outputs: st.outputs, plannerPayload: st.plannerPayload, prompt: st.prompt, sessionId: st.sessionId,
    text: liveText || st.text, known: st.error?.code === "plugin_error" ? [] : st.sources, sources: st.sources, artifacts: st.artifacts,
    error: st.error, meta: { pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, toolsMs: st.toolsMs ?? null, answerMs: st.answerMs ?? null, metrics: st.metrics }, filler: st.filler, fillerTick: st.fillerTick, elapsedMs: st.startedAt ? Date.now() - st.startedAt : 0,
    startedAt: st.startedAt, totalMs: st.finishedAt != null && st.startedAt ? st.finishedAt - st.startedAt : null,
  };
  return (
    <div className="oiu-assistant oiu-assistant--streaming" aria-live="polite" aria-busy="true" data-testid="assistant-streaming">
      <LiveRunMarker />
      <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
      <div className="oiu-assistant__body"><RunView r={r} onAnswer={(text) => { setStream({ prompt: null }, true); void processMessage({ role: "user", content: text }); }} /></div>
    </div>
  );
};
function RawFrame({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return <span className="oiu-raw"><button type="button" className="oiu-error__raw-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "hide raw frame" : "show raw frame"}</button>{open && <pre className="oiu-error__raw" data-testid="raw-frame">{raw}</pre>}</span>;
}

/** Scroll anchoring: follow the stream only while the user is at the bottom; otherwise show a "jump to latest" pill. */
function ScrollAnchor() {
  const isRunning = useThread((s) => s.isRunning); const st = useStreamState();
  const [away, setAway] = useState(false); const atBottom = useRef(true); const el = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-scroll-area");
    el.current = find(); if (!el.current) return;
    const node = el.current;
    const onScroll = () => { const gap = node.scrollHeight - node.scrollTop - node.clientHeight; atBottom.current = gap < 120; setAway((a) => (a !== !atBottom.current ? !atBottom.current : a)); };
    node.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => node.removeEventListener("scroll", onScroll);
  }, [isRunning]);
  // Follow-to-bottom with an INSTANT scrollTop write (OpenUI's own smooth scrollTo lags behind fast growth on narrow viewports and leaves a
  // 100–300 px gap). Only while the user has not scrolled away (gap < 120 px); a programmatic scroll never counts as a layout shift.
  useLayoutEffect(() => {
    const node = el.current; if (!node || !isRunning) return;
    const gap = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (atBottom.current && gap > 2) node.scrollTop = node.scrollHeight;
    else atBottom.current = gap < 120;
  }, [st.version, isRunning]);
  // The "Jump to latest" pill is PORTALLED into the scroll container (absolute, out of flow). Rendering it as a sibling of the thread made
  // OpenUI's flex row shrink the whole thread by 128 px on every toggle — the single biggest layout shift in the recordings (CLS 0.23–0.81).
  const host = typeof document !== "undefined" ? el.current?.parentElement ?? null : null;
  const padOn = away && isRunning;
  // unit1: while the pill is shown, pad the scroll area so the last Working row can scroll above the pill (never hidden under it).
  useEffect(() => { const node = el.current; if (!node) return; node.classList.toggle("oiu-jump-pad", padOn); return () => node.classList.remove("oiu-jump-pad"); }, [padOn]);
  if (!padOn || !host) return null;
  return createPortal(<button type="button" className="oiu-jump" data-testid="jump-to-latest" onClick={() => { const node = el.current; if (node) { node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); atBottom.current = true; setAway(false); } }}><ArrowDown className="size-3.5" aria-hidden /> Jump to latest</button>, host);
}

/** Tiny store: is a live RunView mounted? The PendingRow skeleton hides the moment it is, so only ONE [data-testid=thinking-block] exists per turn. */
let liveRunViews = 0; const liveListeners = new Set<() => void>();
const useLiveRunMounted = () => useSyncExternalStore((l) => { liveListeners.add(l); return () => { liveListeners.delete(l); }; }, () => liveRunViews > 0, () => false);
function LiveRunMarker() { useEffect(() => { liveRunViews++; liveListeners.forEach((l) => l()); return () => { liveRunViews--; liveListeners.forEach((l) => l()); }; }, []); return null; }
/**
 * Live-phase row, shown IMMEDIATELY after send (isRunning) until the live RunView mounts (or the first tool row / answer token), with the run
 * header + elapsed timer. Portaled into OpenUI's bottom loader slot.
 */
function PendingRow() {
  const isRunning = useThread((s) => s.isRunning); const st = useStreamState(); const mounted = useLiveRunMounted();
  const [host, setHost] = useState<HTMLElement | null>(null); const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) { setHost(null); return; }
    const find = () => document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-message-loading");
    const h = find(); if (h) { setHost(h); }
    const mo = new MutationObserver(() => { const x = find(); if (x) setHost((prev) => (prev === x ? prev : x)); });
    mo.observe(document.body, { childList: true, subtree: true });
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { mo.disconnect(); clearInterval(tick); };
  }, [isRunning]);
  if (!isRunning || !host || mounted || st.firstTokenMs != null || st.tools.length > 0) return null;
  const secs = st.startedAt ? Math.max(0, (now - st.startedAt) / 1000) : 0;
  const skelPlugins = (st.suggested.length ? st.suggested.map((p) => p.id) : st.pluginIds.length ? st.pluginIds : [PLUGIN_ID]).slice(0, 5);
  const phases = thinkingPhases(st.thinkingKinds, st.plan, false);
  const label = st.detail || PHASE_LABEL.connecting;
  // FIRST-EVENT SKELETON: the moment the user sends, the turn already shows Thinking (pinned top) + one Working row with the plugin chips,
  // so perceived latency is the first status frame (~0.3–0.7 s), not the first answer token (35–82 s observed upstream).
  return createPortal(
    <div className="oiu-run oiu-run--skeleton" data-testid="run-skeleton" data-phase={st.phase || "connecting"} data-first-status-ms={st.firstStatusMs ?? ""}>
      <RunHeader live startedAt={st.startedAt} totalMs={null} pluginIds={st.pluginIds} />
      {/* OnDemand-playground look: a one-line "Thinking" head; the reasoning rail only mounts once reasoning text exists (no empty box). */}
      <section className={`oiu-think oiu-think--live${st.thinking ? " oiu-think--open" : ""}`} data-testid="thinking-block" data-state="streaming" data-chars={st.thinking.length} data-phases={phases.join(",")}>
        <p className="oiu-think__head"><StatusSpinner /><span className="oiu-think__title oiu-shimmer-text">Thinking</span>{phases.length > 0 && <span className="oiu-think__phases">{phases.map((p) => <span key={p} className="oiu-think__phase" data-phase={p}>{p}</span>)}</span>}</p>
        {st.thinking && <div className="oiu-think__body" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}><pre className="oiu-think__pre">{st.thinking}</pre></div>}
      </section>
      <ol className="oiu-work-list" aria-label="Working" data-testid="working-list">
        <li className="oiu-work oiu-work--running oiu-work--skeleton" data-testid="working-row" data-state="queued">
          <span className="oiu-work__icon" aria-hidden><StatusSpinner /></span>
          <span className="oiu-work__chips" data-testid="working-chips">{skelPlugins.map((id) => <PluginFavicon key={id} id={id} size={16} />)}</span>
          <span className="oiu-work__text"><span className="oiu-work__label oiu-shimmer-text">{label}</span><span className="oiu-work__query" data-testid="pending-row" data-first-status-ms={st.firstStatusMs ?? ""}>{secs.toFixed(1)} s{st.firstStatusMs != null ? ` · first event ${st.firstStatusMs} ms` : ""}</span></span>
        </li>
      </ol>
    </div>, host);
}

/** Visible, retryable error state: typed upstream error from the bridge (CUSTOM ondemand.error / RUN_ERROR) or a failed request. */
function ErrorBanner() {
  const threadError = useThread((s) => s.threadError); const isRunning = useThread((s) => s.isRunning);
  const messages = useThread((s) => s.messages); const processMessage = useThread((s) => s.processMessage);
  const st = useStreamState();
  const [showRaw, setShowRaw] = useState(false);
  // Rendered INSIDE the thread list (portal) as the last message row: as a direct child of OpenUI's flex container it became a full-height
  // sibling panel that covered the composer after a failed run and intercepted the next click (found by the step-5 recorder).
  const [host, setHost] = useState<HTMLElement | null>(null);
  const show = !isRunning && !!(threadError || st.error);
  useEffect(() => {
    if (!show) { setHost(null); return; }
    const find = () => document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-messages");
    const h = find(); if (h) setHost(h);
    const mo = new MutationObserver(() => { const x = find(); if (x) setHost((prev) => (prev === x ? prev : x)); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [show]);
  if (!show || !host) return null;
  const lastUser = [...messages].reverse().find((m) => m.role === "user") as UserMessage | undefined;
  const retry = () => { if (lastUser) void processMessage({ role: "user", content: lastUser.content }); };
  const code = st.error?.code ?? "run_error";
  const message = st.error?.message ?? threadError?.message ?? "The run failed";
  return createPortal(
    <div className="oiu-error" role="alert" data-testid="chat-error" data-error-code={code}>
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="oiu-error__text">
        <strong>{code === "plugin_error" ? `${PLUGIN_NAME} returned an upstream error — no other plugin was substituted.` : "The answer could not be completed."}</strong> {message}
        {st.error?.raw && <> <button type="button" className="oiu-error__raw-toggle" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>{showRaw ? "hide raw frame" : "show raw frame"}</button>{showRaw && <pre className="oiu-error__raw" data-testid="chat-error-raw">{st.error.raw}</pre>}</>}
      </span>
      {lastUser && <button type="button" className="oiu-error__retry" onClick={retry}><RotateCcw className="size-3.5" aria-hidden /> Retry</button>}
    </div>, host);
}

/** Persists streamed messages + remembers the OnDemand sessionId per thread (from the x-ondemand-session header / ondemand.session frame). */
function Persistence({ sessionRef }: { sessionRef: React.MutableRefObject<Record<string, string>> }) {
  const messages = useThread((s) => s.messages); const selected = useThreadList((s) => s.selectedThreadId);
  const loadThreads = useThreadList((s) => s.loadThreads);
  // Thread-list hydration after a hard reload. The library only calls `loadThreads()` from its own ThreadList (sidebar) component, which this
  // shell replaces with an empty slot — so without this call `threads` stays [] forever, ChatWelcome's "Recent threads" and the top-bar
  // Threads menu render nothing although localStorage holds `bcap.chat.threads.v2`. Runs once on mount (storage is localStorage → instant).
  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { if (selected && messages.length) saveMessages(selected, messages); }, [messages, selected]);
  useEffect(() => { if (selected && sessionRef.current[selected]) rememberSession(selected, sessionRef.current[selected]); }, [selected, messages, sessionRef]);
  useEffect(() => { currentThreadId = selected ?? null; if (selected) attachmentsStore.hydrate(selected); }, [selected]);
  return null;
}

/** Deep link: /chat?q=<question> sends the question once on load. */
function AutoAsk() {
  const sp = useSearchParams(); const q = sp.get("q")?.trim() ?? "";
  const processMessage = useThread((s) => s.processMessage); const isRunning = useThread((s) => s.isRunning);
  const sent = useRef(false);
  useEffect(() => {
    if (!q || sent.current || isRunning) return; sent.current = true;
    const t = setTimeout(() => { void processMessage({ role: "user", content: q }); }, 400);
    return () => clearTimeout(t);
  }, [q, isRunning, processMessage]);
  return null;
}

/** Deep link: /chat?thread=<id> selects that thread on mount (once the list has hydrated), restoring its messages + attachment chips. */
function ThreadDeepLink() {
  const sp = useSearchParams(); const want = sp.get("thread")?.trim() ?? "";
  const threads = useThreadList((s) => s.threads); const selectThread = useThreadList((s) => s.selectThread); const selectedId = useThreadList((s) => s.selectedThreadId);
  const done = useRef(false);
  useEffect(() => {
    if (!want || done.current || selectedId === want) return;
    if (!threads.some((t) => t.id === want)) return; // wait for loadThreads() → list hydrated
    done.current = true; selectThread(want);
  }, [want, threads, selectedId, selectThread]);
  return null;
}

/** Compact welcome state (replaces the library's blank centre canvas): context chips, three starter prompts, recent threads. Hidden by the library once the first message exists. */
function ChatWelcome({ companies }: { companies: CoCtx[] }) {
  const processMessage = useThread((s) => s.processMessage); const isRunning = useThread((s) => s.isRunning);
  const threads = useThreadList((s) => s.threads); const selectThread = useThreadList((s) => s.selectThread); const selectedId = useThreadList((s) => s.selectedThreadId);
  // Threads come from localStorage (client only): render the recent list only after mount so SSR and the first client render match (React #418).
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const recent = mounted ? threads.filter((t) => !t.isPending && t.id !== selectedId).slice(0, 3) : [];
  return (
    <div className="oiu-welcome" data-testid="chat-welcome">
      <h2 className="oiu-welcome__title">Ask the portfolio</h2>
      {companies.length > 0 && (
        <ul className="oiu-welcome__chips" aria-label="Context companies" data-testid="welcome-context">
          {companies.map((c) => <li key={c.slug} className="oiu-welcome__chip"><span className="oiu-welcome__dot" aria-hidden /> {c.name}<span className="oiu-welcome__chip-score">{fmtScore(c.sentiment.score)}</span></li>)}
        </ul>
      )}
      <div className="oiu-welcome__starters" data-testid="welcome-starters">
        {starters.slice(0, 3).map((st) => (
          <button key={st.prompt} type="button" className="oiu-welcome__starter" disabled={isRunning} onClick={() => { void processMessage({ role: "user", content: st.prompt }); }}>
            <BrandIcon name={brandIconForStarter(st.displayText)} size={18} slot="welcome-starter" /><span><strong>{st.displayText}</strong><span className="oiu-welcome__starter-prompt">{st.prompt}</span></span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <section className="oiu-welcome__recent" aria-label="Recent threads" data-testid="welcome-recent">
          <p className="oiu-welcome__label"><MessageSquareMore className="size-3.5" aria-hidden /> Recent threads</p>
          <ul>{recent.map((t) => <li key={t.id}><button type="button" className="oiu-welcome__thread" data-testid="welcome-thread" data-thread-id={t.id} title={t.title || "Untitled thread"} aria-label={t.title || "Untitled thread"} onClick={() => selectThread(t.id)}><span className="oiu-thread-title" data-testid="thread-title" title={t.title || "Untitled thread"}>{t.title || "Untitled thread"}</span></button></li>)}</ul>
        </section>
      )}
    </div>
  );
}

/** unit2 — "Context: N companies — A, B, C" under the composer, driven by the live settings store so inspector add/remove updates it instantly. */
function ContextLine({ companies }: { companies: CoCtx[] }) {
  const [s] = useSettings();
  const bySlug = new Map(companies.map((c) => [c.slug, c.name] as const));
  const names = s.companies.map((slug) => bySlug.get(slug)).filter((n): n is string => !!n);
  return <p className="oiu-context-line" data-testid="context-line" data-count={names.length} aria-live="polite">{contextSummary(names)}</p>;
}

export function ChatShell({ companies, fetchedAt, topBarRight }: { companies: CoCtx[]; fetchedAt?: string; topBarRight?: ReactNode }) {
  const [s] = useSettings();
  const [selectedPlugins] = usePluginSelection();
  const sessionRef = useRef<Record<string, string>>({});
  const [storage] = useState(() => localThreadStorage());
  const ctxCompanies = companies.filter((c) => s.companies.includes(c.slug));
  useEffect(() => { preloadPluginFavicons(PLUGIN_CATALOGUE.map((p) => p.id)); }, []);
  // Pre-warm: create the OnDemand session for the first turn on page load (TTFT work) — the first /api/chat call reuses it via context.sessionId.
  const prewarm = useRef<{ sessionId: string; pluginIds: string[] } | null>(null);
  const [prewarmState, setPrewarmState] = useState<"idle" | "ready" | "failed">("idle");
  // Attachments upload with the current thread's OnDemand session so the media is bound to the same session the query runs in.
  useEffect(() => { attachmentsStore.setSessionGetter(() => ({ sessionId: getCurrentSessionId(sessionRef.current, currentThreadId) ?? prewarm.current?.sessionId ?? null, externalUserId: s.externalUserId, apikey: s.apikey || undefined, threadId: currentThreadId })); }, [s.externalUserId, s.apikey]);
  useEffect(() => {
    const ids = getSelectedPluginIds(); const ctl = new AbortController();
    fetch(`${CHAT_API_URL}/prewarm?externalUserId=${encodeURIComponent(s.externalUserId)}&pluginIds=${encodeURIComponent(ids.join(","))}`, { signal: ctl.signal, headers: s.apikey ? { "x-ondemand-key": s.apikey } : {} })
      .then((r) => r.json()).then((j: { ok?: boolean; sessionId?: string; pluginIds?: string[] }) => { if (j?.ok && j.sessionId) { prewarm.current = { sessionId: j.sessionId, pluginIds: j.pluginIds ?? ids }; setPrewarmState("ready"); } else setPrewarmState("failed"); })
      .catch(() => setPrewarmState("failed"));
    return () => ctl.abort();
  }, [s.externalUserId, s.apikey]);
  // Built-in portfolio context (no OnDemand plugin id could be registered — see web/proof/plugin-registration.log): real backend values only.
  // unit2 — the payload is built AT SEND TIME from the live settings store (getSettings().companies), never from a memoised closure, so the
  // companies sent always equal the chips shown in the inspector. `companiesRef` keeps the latest server list without widening the memo deps.
  const companiesRef = useRef(companies); companiesRef.current = companies;
  const fetchedAtRef = useRef(fetchedAt); fetchedAtRef.current = fetchedAt;
  const llm = useMemo(() => fetchLLM({
    url: CHAT_API_URL, streamAdapter: agUIAdapter(),
    headers: s.apikey ? { "x-ondemand-key": s.apikey } : {},
    fetch: async (input, init) => {
      // inject the per-thread OnDemand session, the EXPLICIT plugin selection and the portfolio context; capture the session id from the response
      const body = JSON.parse(String(init?.body ?? "{}")) as { threadId?: string; messages?: { id?: string; role?: string; content?: unknown }[]; context?: Record<string, unknown> };
      const tid = body.threadId ?? ""; let sid = sessionRef.current[tid] ?? (tid ? sessionFor(tid) : null);
      const attachments = attachmentsStore.ready().map((a) => ({ mediaId: a.mediaId!, name: a.name, kind: a.kind, extractedChars: a.extractedChars ?? 0 }));
      const lastUserId = [...(body.messages ?? [])].reverse().find((m) => m?.role === "user")?.id ?? "";
      // PitchBook context chips: prepend a compact `Context:` block to THIS turn's user text and add the Investor Finder plugin for this turn only.
      // The thread is untouched (no new thread, the stored message stays as typed); the chips are consumed once the request is on the wire.
      const chips = getContextChips();
      if (chips.length && Array.isArray(body.messages)) {
        const last = [...body.messages].reverse().find((m) => m?.role === "user");
        if (last) { const txt = typeof last.content === "string" ? last.content : Array.isArray(last.content) ? last.content.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : ""; last.content = `${chipsBlock(chips)}

${txt}`; }
      }
      const pluginIds = [...new Set([...getSelectedPluginIds(), ...(chips.length ? [PITCHBOOK_PLUGIN_ID] : [])])];
      // First turn of a new thread: consume the pre-warmed session when its plugin set matches the explicit selection (same ids, same order).
      if (!sid && prewarm.current && prewarm.current.pluginIds.join(",") === pluginIds.join(",")) { sid = prewarm.current.sessionId; prewarm.current = null; if (tid) { sessionRef.current[tid] = sid; rememberSession(tid, sid); } }
      const ctxPayload = buildContextPayload(companiesRef.current, getSettings().companies, { fetchedAt: fetchedAtRef.current }); // live chip state, read now
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, externalUserId: s.externalUserId, pluginIds, systemContext: ctxPayload.systemContext, contextSlugs: ctxPayload.companies.map((c) => c.slug), ...(attachments.length ? { attachments } : {}), sessionContext: ctxPayload.sessionContext };
      setStream({ ...IDLE, phase: "connecting", detail: PHASE_LABEL.connecting, startedAt: Date.now(), sessionId: sid ?? null, lastThreadId: tid, pluginIds, version: streamState.version }, true);
      let res: Response;
      try { res = await fetch(input, { ...init, body: JSON.stringify(body) }); if (chips.length) clearContextChips(); } catch (e) { setStream({ phase: "idle", detail: "", error: { code: "fetch_failed", message: (e as Error).message } }, true); throw e; }
      const remember = (got: string) => { if (tid) { sessionRef.current[tid] = got; rememberSession(tid, got); } };
      const got = res.headers.get("x-ondemand-session"); if (got) remember(got);
      if (!res.ok || !res.body) { setStream({ phase: "idle", detail: "", error: { code: `http_${res.status}`, message: `Chat endpoint answered HTTP ${res.status}` } }, true); return res; }
      if (attachments.length) attachmentsStore.markSent(lastUserId || `${tid}:${Date.now()}`, tid); // sent → chips move under the user bubble, bar clears
      void teeStream(res.clone(), tid, remember);
      return res;
    },
  }), [s.apikey, s.externalUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pluginLabel = selectedPlugins.map((id) => catalogueName(id)).join(", ");
  return (
    <div className="chat-shell" data-testid="chat-shell" data-prewarm={prewarmState}>
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, UserMessage: UserBubble, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        {/* The thread sidebar slot is intentionally EMPTY: one full-width canvas, threads live in the top bar's "Threads" menu. */}
        <AgentInterface.Sidebar><span hidden data-testid="thread-sidebar-off" /></AgentInterface.Sidebar>
        {/* ONE top bar for every viewport (the library's mobile header slot is emptied; shell.css shows the thread header on mobile too). */}
        <AgentInterface.ThreadHeader><ChatTopBar topBarRight={topBarRight} /></AgentInterface.ThreadHeader>
        <AgentInterface.MobileHeader><span hidden data-testid="mobile-header-off" /></AgentInterface.MobileHeader>
        <AgentInterface.Welcome><ChatWelcome companies={ctxCompanies} /></AgentInterface.Welcome>
        <AgentInterface.Composer><AppComposer footer={<ContextLine companies={companies} />} /></AgentInterface.Composer>
        <Persistence sessionRef={sessionRef} />
        <PendingRow />
        <VoiceDock />
        <AttachmentBar />
        <ScrollAnchor />
        <ErrorBanner />
        <ContextChipsBar />
        <Suspense fallback={null}><AutoAsk /><ThreadDeepLink /></Suspense>
      </AgentInterface>
      {/* a49: explainer sentence removed (duplicated the composer hint); keep the testids/data attributes for the plugin label. */}
      <p className="oiu-footer" data-testid="chat-footer" data-model-id={MODEL_ID} data-reasoning={REASONING_MODE}><ShieldCheck className="size-3.5" aria-hidden /> {MODEL_LABEL} · <span data-testid="footer-plugins">{pluginLabel}</span></p>
    </div>
  );
}

/** Slim top bar over the thread: thread title · New chat · Threads menu (recent threads) · the page's right-side controls (inspector toggle). */
function ChatTopBar({ topBarRight }: { topBarRight?: ReactNode }) {
  const threads = useThreadList((s) => s.threads); const selectThread = useThreadList((s) => s.selectThread); const selectedId = useThreadList((s) => s.selectedThreadId);
  const switchToNewThread = useThreadList((s) => s.switchToNewThread);
  const isRunning = useThread((s) => s.isRunning);
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const current = mounted ? threads.find((t) => t.id === selectedId) : undefined;
  const recent = mounted ? threads.filter((t) => !t.isPending).slice(0, 12) : [];
  return (
    <div className="oiu-topbar" data-testid="chat-topbar">
      <div className="oiu-topbar__left">
        <h1 className="oiu-topbar__title" data-testid="chat-title" title={current?.title || "Chat"} aria-label={current?.title || "Chat"}><span className="oiu-thread-title" data-testid="thread-title" title={current?.title || "Chat"}>{current?.title || "Chat"}</span></h1>
      </div>
      <div className="oiu-topbar__right">
        <button type="button" className="oiu-topbar__btn" data-testid="new-thread" onClick={() => { composerStore.clear(); switchToNewThread(); }} disabled={isRunning} title="New chat"><Plus className="size-3.5" aria-hidden /><span>New chat</span></button>
        <details className="oiu-threads" data-testid="threads-menu">
          <summary className="oiu-topbar__btn" aria-label="Threads"><MessageSquareMore className="size-3.5" aria-hidden /><span>Threads{recent.length ? ` (${recent.length})` : ""}</span></summary>
          <ul className="oiu-threads__list" aria-label="Recent threads">
            {recent.length === 0 && <li className="oiu-threads__empty">No threads yet</li>}
            {recent.map((t) => <li key={t.id}><button type="button" className={`oiu-threads__item${t.id === selectedId ? " oiu-threads__item--active" : ""}`} data-testid="threads-menu-item" data-thread-id={t.id} title={t.title || "Untitled thread"} aria-label={t.title || "Untitled thread"} onClick={(e) => { selectThread(t.id); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}><span className="oiu-thread-title" data-testid="thread-title" title={t.title || "Untitled thread"}>{t.title || "Untitled thread"}</span></button></li>)}
          </ul>
        </details>
        <ArtifactsToggle className="oiu-topbar__btn" showLabel />
        <span className="oiu-topbar__slot" data-testid="topbar-right">{topBarRight}</span>
      </div>
    </div>
  );
}
