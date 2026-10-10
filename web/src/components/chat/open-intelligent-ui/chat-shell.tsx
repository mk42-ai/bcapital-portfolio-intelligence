"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { Suspense, memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentInterface, fetchLLM, agUIAdapter, useThread, useThreadList, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { Message, UserMessage } from "@openuidev/react-headless";
import { AlertTriangle, ArrowDown, Bot, Brain, Check, CheckCircle2, ChevronDown, Circle, Cpu, ExternalLink, KeyRound, ListChecks, Loader2, MessageSquareMore, RotateCcw, Search, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { responseTheme } from "./response-theme";
import { localThreadStorage, saveMessages, sessionFor, rememberSession, rememberSources, sourcesFor, sourcesKey, rememberMeta, metaFor, type StoredSource, type StoredMeta } from "./local-storage";
import { extractCitations, isCiteLabel, hostOf, type Cite } from "./citations";
import { useSettings } from "@/lib/settings";
import { PLUGIN_ID, PLUGIN_NAME, MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { getSelectedPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { pluginName as catalogueName, PLUGIN_CATALOGUE } from "@/lib/plugin-catalogue";
import { PluginFavicon, preloadPluginFavicons } from "@/components/ui/plugin-favicon";
import { fmtScore } from "@/lib/format";

export type CoCtx = { slug: string; name: string; sector: string; status: string; stage: string | null; sentiment: { score: number; label: string; delta?: number | null; updated_at?: string | null; basis?: string | null }; news_count?: number; latest_news: { title: string; url: string | null; published_at: string | null; source?: string | null }[]; estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; b_capital_role: string };
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
export const faviconFor = (url: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=32`;

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
  phase: StreamPhase; detail: string; startedAt: number; sessionId: string | null; version: number;
  firstStatusMs: number | null; firstTokenMs: number | null; firstCitationMs: number | null; chunks: number; thinking: string; thinkingKinds: string[]; error: StreamError;
  sources: Source[]; metrics: Record<string, number> | null; lastThreadId: string | null;
  pluginIds: string[]; suggested: { id: string; name: string; logoUrl?: string }[]; plan: { objective: string | null; steps: PlanStep[] } | null;
  summaries: StepSummary[]; prompt: Prompt | null; filler: boolean; text: string; answerDone: boolean;
};
const IDLE: StreamState = { phase: "idle", detail: "", startedAt: 0, sessionId: null, version: 0, firstStatusMs: null, firstTokenMs: null, firstCitationMs: null, chunks: 0, thinking: "", thinkingKinds: [], error: null, sources: [], metrics: null, lastThreadId: null, pluginIds: [PLUGIN_ID], suggested: [], plan: null, summaries: [], prompt: null, filler: false, text: "", answerDone: false };
let streamState: StreamState = IDLE;
let pending: Partial<StreamState> | null = null; let rafId = 0;
const liveSources = new Map<string, Source[]>();
const liveMeta = new Map<string, StoredMeta>();
const listeners = new Set<() => void>();
const flush = () => { rafId = 0; if (!pending) return; const p = pending; pending = null; streamState = { ...streamState, ...p, version: streamState.version + 1 }; listeners.forEach((l) => l()); };
const setStream = (patch: Partial<StreamState>, immediate = false) => {
  pending = { ...(pending ?? {}), ...patch };
  if (immediate || typeof requestAnimationFrame === "undefined") { if (rafId && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafId); flush(); return; }
  if (!rafId) rafId = requestAnimationFrame(flush);
};
/** Reads the latest value including not-yet-flushed patches (for tee-side accumulation). */
const peek = (): StreamState => ({ ...streamState, ...(pending ?? {}) });
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getStream = () => streamState;
export const useStreamState = () => useSyncExternalStore(subscribe, getStream, () => IDLE);
export const getStreamPhase = () => streamState.phase;
const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting to OnDemand…", "creating-session": "Creating OnDemand session…", querying: `Submitting to ${MODEL_LABEL}…`,
  streaming: `${MODEL_LABEL} is planning…`, planning: `${MODEL_LABEL} is planning…`, researching: `Searching with ${PLUGIN_NAME}…`, answering: "Writing the answer…", "awaiting-input": "Waiting for your input…", done: "Done",
};

type AgUiFrame = { type?: string; name?: string; value?: Record<string, unknown>; delta?: string; toolCallName?: string; message?: string; code?: string };
/** Reads the cloned SSE body line-by-line (data: …) and updates the live store + localStorage; never throws into the UI path. */
async function teeStream(res: Response, threadId: string, onSession: (sid: string) => void) {
  const body = res.body; if (!body) return;
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
  const t0 = peek().startedAt || Date.now();
  const finalize = () => {
    const st = peek(); const key = sourcesKey(st.text);
    const meta: StoredMeta = { model: MODEL_LABEL, modelId: MODEL_ID, reasoningMode: REASONING_MODE, pluginId: PLUGIN_ID, pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, firstCitationMs: st.firstCitationMs, totalMs: Date.now() - t0, chunks: st.chunks, metrics: st.metrics, thinking: st.thinking.slice(0, 6000), error: st.error ? { code: st.error.code, message: st.error.message } : null, at: new Date().toISOString(), summaries: st.summaries.map((s) => ({ index: s.index, text: s.text, doneAt: s.doneAt ?? null })), plan: st.plan };
    liveMeta.set(key, meta); rememberMeta(key, meta);
    if (st.sources.length) { liveSources.set(key, st.sources); rememberSources(key, st.sources); }
  };
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return; const data = line.slice(5).trim(); if (!data) return;
    if (data === "[DONE]") { finalize(); setStream({ phase: "idle", detail: "", answerDone: true }, true); return; }
    let f: AgUiFrame; try { f = JSON.parse(data) as AgUiFrame; } catch { return; }
    const now = Date.now(); const st = peek();
    switch (f.type) {
      case "RUN_STARTED": setStream({ firstStatusMs: st.firstStatusMs ?? now - t0, ...(st.phase === "idle" ? { phase: "connecting", detail: PHASE_LABEL.connecting } : {}) }, true); break;
      case "CUSTOM": {
        const v = f.value ?? {};
        switch (f.name) {
          case "ondemand.session": if (typeof v.sessionId === "string" && v.sessionId) { onSession(v.sessionId); setStream({ sessionId: v.sessionId }); } break;
          case "ondemand.status": {
            if (typeof v.phase !== "string") break;
            const p = v.phase; const phase: StreamPhase = p === "researching" ? "researching" : p === "answering" ? "answering" : p === "awaiting-input" ? "awaiting-input" : p === "streaming" || p === "planning" ? "planning" : p === "done" ? "answering" : "connecting";
            const extra: Partial<StreamState> = { firstStatusMs: st.firstStatusMs ?? now - t0 };
            if (Array.isArray(v.pluginIds)) extra.pluginIds = v.pluginIds.map(String);
            if (typeof v.statusMessage === "string" && v.statusMessage && p === "planning") extra.detail = v.statusMessage;
            if (st.phase !== "answering" || phase === "answering" || phase === "awaiting-input") setStream({ phase, detail: extra.detail ?? PHASE_LABEL[p] ?? PHASE_LABEL[phase] ?? "Working…", ...extra }, st.firstStatusMs == null);
            else setStream(extra);
            break;
          }
          case "ondemand.thinking": if (typeof v.delta === "string") { const kind = String(v.kind ?? "thinking"); setStream({ thinking: (st.thinking + v.delta).slice(-12000), thinkingKinds: st.thinkingKinds.includes(kind) ? st.thinkingKinds : [...st.thinkingKinds, kind], ...(st.phase === "connecting" ? { phase: "planning", detail: PHASE_LABEL.planning } : {}) }); } break;
          case "ondemand.sources": if (Array.isArray(v.sources)) { const items = (v.sources as Partial<Source>[]).filter((x): x is Source => typeof x.url === "string" && !!x.url).map((x) => ({ url: x.url, title: x.title || x.sourceName || x.url, sourceName: x.sourceName || x.title || x.url, ...(typeof x.imageUrl === "string" && /^https?:\/\//.test(x.imageUrl) ? { imageUrl: x.imageUrl } : {}) })); setStream({ sources: items, firstCitationMs: st.firstCitationMs ?? (items.length ? now - t0 : null) }); } break;
          case "ondemand.metrics": if (v.publicMetrics && typeof v.publicMetrics === "object") setStream({ metrics: v.publicMetrics as Record<string, number> }); break;
          case "ondemand.error": setStream({ error: { code: String(v.code ?? "error"), message: String(v.message ?? "Upstream error"), raw: typeof v.raw === "string" ? v.raw : undefined } }, true); break;
          case "ondemand.plugins": if (Array.isArray(v.plugins) && v.plugins.length) setStream({ suggested: (v.plugins as { id: string; name: string; logoUrl?: string }[]) }); break;
          case "ondemand.plan": { const steps = Array.isArray(v.steps) ? (v.steps as Omit<PlanStep, "state">[]).map((s, i) => ({ ...s, id: String(s.id ?? i + 1), state: "pending" as const })) : []; setStream({ plan: { objective: typeof v.objective === "string" ? v.objective : null, steps }, ...(typeof v.objective === "string" && v.objective ? { detail: v.objective } : {}) }); break; }
          case "ondemand.step": {
            const phase = String(v.phase); const stepId = String(v.stepId ?? ""); const index = Number(v.index ?? 0);
            const next: PlanStep["state"] = phase === "start" ? "running" : phase === "failed" ? "failed" : "done";
            const plan: { objective: string | null; steps: PlanStep[] } | null = st.plan ? { ...st.plan, steps: st.plan.steps.map((s, i): PlanStep => (s.id === stepId || i + 1 === index ? { ...s, state: next } : phase === "start" && s.state === "running" ? { ...s, state: "done" } : s)) } : (phase === "start" ? { objective: null, steps: [{ id: stepId || String(index), title: String(v.label ?? `Step ${index}`), query: typeof v.query === "string" ? v.query : undefined, state: "running" }] } : st.plan);
            if (phase === "start" && st.plan && !st.plan.steps.some((s, i) => s.id === stepId || i + 1 === index)) plan!.steps.push({ id: stepId || String(index), title: String(v.label ?? `Step ${index}`), query: typeof v.query === "string" ? v.query : undefined, state: "running" });
            setStream({ plan, ...(phase === "start" && typeof v.label === "string" ? { detail: v.label } : {}) });
            break;
          }
          case "ondemand.summary": {
            const index = Number(v.index ?? 0); const stepId = String(v.stepId ?? "");
            const existing = st.summaries.find((s) => s.index === index);
            let summaries: StepSummary[];
            if (v.phase === "start") summaries = existing ? st.summaries : [...st.summaries, { index, stepId, state: "pending", text: "", optimistic: !!v.optimistic, startedAt: now - t0 }];
            else summaries = existing ? st.summaries.map((s) => (s.index === index ? { ...s, state: "done", text: String(v.text ?? ""), doneAt: String(v.at ?? new Date().toISOString()) } : s)) : [...st.summaries, { index, stepId, state: "done", text: String(v.text ?? ""), optimistic: false, startedAt: now - t0, doneAt: String(v.at ?? new Date().toISOString()) }];
            setStream({ summaries });
            break;
          }
          case "ondemand.clarification": setStream({ prompt: { kind: "clarification", queries: (v.queries as { question: string; options?: string[] }[]) ?? [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case "ondemand.awaiting_input": setStream({ prompt: { kind: "awaiting_input", prompt: String(v.prompt ?? ""), options: Array.isArray(v.options) ? v.options.map(String) : [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case "ondemand.require_creds": setStream({ prompt: { kind: "require_creds", pluginId: (v.pluginId as string) ?? null, service: (v.service as string) ?? null, fields: (v.fields as { key: string; label?: string; type?: string }[]) ?? [] }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case "ondemand.awaiting_browser_action": setStream({ prompt: { kind: "awaiting_browser_action", action: (v.action as string) ?? null, message: (v.message as string) ?? null, url: (v.url as string) ?? null }, phase: "awaiting-input", detail: PHASE_LABEL["awaiting-input"] }, true); break;
          case "ondemand.filler": setStream({ filler: !!v.on }); break;
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

/* ------------------------------------------------------------------------------------------------------------------
 * Markdown with inline numbered citation chips (streamed) + reserved Sources rail
 * ---------------------------------------------------------------------------------------------------------------- */
const CiteChip = memo(function CiteChip({ n, cite }: { n: number; cite?: Cite }) {
  const url = cite?.url ?? "#"; const host = cite?.sourceName ?? hostOf(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="oiu-cite" data-testid="citation-chip" data-n={n} aria-label={`Source ${n}: ${cite?.title ?? host}`}>
      <span className="oiu-cite__n">{n}</span>
      <span className="oiu-cite__preview" role="tooltip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faviconFor(url)} alt="" width={14} height={14} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        <span className="oiu-cite__title">{cite?.title ?? host}</span><span className="oiu-cite__host">{host}</span>
      </span>
    </a>
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
  const throttled = useThrottled(text, streaming ? 60 : 0);
  const { md, cites } = useMemo(() => extractCitations(throttled, known, streaming), [throttled, known, streaming]);
  useEffect(() => { onCites?.(cites); }, [cites, onCites]);
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const n = isCiteLabel(Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : children);
      if (n) return <CiteChip n={n} cite={cites[n - 1]} />;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  }), [cites]);
  return <div className="oiu-md" data-testid="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{md}</ReactMarkdown>{streaming && <span className="oiu-caret" aria-hidden />}</div>;
});

function SourceList({ sources, compact, live }: { sources: Source[]; compact?: boolean; live?: boolean }) {
  // Reserved space: the rail always renders (min-height) during a live run so chips appearing never shift the answer below.
  if (!sources.length && !live) return null;
  return (
    <nav className={`oiu-sources${compact ? " oiu-sources--compact" : ""}${live ? " oiu-sources--live" : ""}`} aria-label="Sources" data-testid="sources-rail" data-count={sources.length}>
      <p className="oiu-sources__title">Sources ({sources.length}){live && !sources.length ? " · waiting for the first citation…" : ""}</p>
      <ol className="oiu-sources__list">
        {sources.map((src, i) => (
          <li key={src.url} className="oiu-sources__item oiu-sources__item--in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
            <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link" data-testid="source-link">
              <span className="oiu-sources__num">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconFor(src.url)} alt="" width={16} height={16} className="oiu-sources__favicon" loading="lazy" referrerPolicy="no-referrer" data-testid="source-favicon" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
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
/** Per-answer provenance badge: model · reasoning mode · plugins · first-event / first-token / total ms · tokens. */
function AnswerBadge({ meta, live }: { meta: Partial<StoredMeta> | null; live?: boolean }) {
  const ftt = meta?.firstTokenMs ?? null; const fe = meta?.firstStatusMs ?? null; const total = meta?.totalMs ?? null;
  const plugins = meta?.pluginIds?.length ? meta.pluginIds : [PLUGIN_ID];
  return (
    <p className="oiu-badge" data-testid="answer-badge" data-first-token-ms={ftt ?? ""} data-first-event-ms={fe ?? ""} data-total-ms={total ?? ""} aria-label="Answer provenance">
      <Cpu className="size-3" aria-hidden /><span>{MODEL_LABEL}</span><span className="oiu-badge__sep">·</span><span>{REASONING_MODE}</span>
      <span className="oiu-badge__sep">·</span><span className="oiu-badge__plugins">{plugins.map((id) => <span key={id} className="oiu-badge__plugin" title={catalogueName(id)}><PluginFavicon id={id} size={16} /><code>{id}</code></span>)}</span>
      <span className="oiu-badge__sep">·</span><span>{fe != null ? `first event ${fe} ms` : "first event …"}</span>
      <span className="oiu-badge__sep">·</span><span>{ftt != null ? `first token ${ftt.toLocaleString()} ms` : live ? "first token …" : "first token n/a"}</span>
      {total != null && <><span className="oiu-badge__sep">·</span><span>total {(total / 1000).toFixed(1)} s</span></>}
      {meta?.metrics?.totalTokens != null && <><span className="oiu-badge__sep">·</span><span>{meta.metrics.totalTokens.toLocaleString()} tokens</span></>}
    </p>
  );
}
/** Collapsible reasoning trace — virtualised: only the last ~40 lines are in the DOM while collapsed/streaming; full text on demand. */
function ThinkingTrace({ text, kinds, live }: { text: string; kinds?: string[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useMemo(() => `oiu-think-${Math.random().toString(36).slice(2, 8)}`, []);
  if (!text.trim()) return null;
  const lines = text.split("\n"); const shown = open ? lines.slice(-400) : lines.slice(-40);
  return (
    <div className={`oiu-thinking${open ? " oiu-thinking--open" : ""}`} data-testid="thinking-trace" data-lines={lines.length}>
      <button type="button" className="oiu-thinking__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Brain className="size-3.5" aria-hidden /><span>{live ? "Thinking…" : "Thinking trace"}{kinds?.length ? ` · ${kinds.join(" → ")}` : ""}</span><span className="oiu-thinking__len">{text.length.toLocaleString()} chars</span><ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div id={id} className="oiu-thinking__panel" aria-hidden={!open}><div className="oiu-thinking__inner"><pre className="oiu-thinking__pre">{open ? shown.join("\n") : shown.slice(-6).join("\n")}</pre></div></div>
    </div>
  );
}
/** Plan stepper (plan_created / step start / done / failed). */
function PlanStepper({ plan }: { plan: { objective: string | null; steps: PlanStep[] } | null }) {
  if (!plan || (!plan.objective && !plan.steps.length)) return null;
  return (
    <section className="oiu-plan" data-testid="plan-stepper" aria-label="Execution plan">
      <p className="oiu-plan__title"><ListChecks className="size-3.5" aria-hidden />{plan.objective || "Execution plan"}</p>
      {plan.steps.length > 0 && <ol className="oiu-plan__steps">{plan.steps.map((s, i) => (
        <li key={s.id} className={`oiu-plan__step oiu-plan__step--${s.state}`} data-testid="plan-step" data-state={s.state}>
          <span className="oiu-plan__icon" aria-hidden>{s.state === "done" ? <CheckCircle2 className="size-3.5" /> : s.state === "failed" ? <XCircle className="size-3.5" /> : s.state === "running" ? <Loader2 className="size-3.5 oiu-spin" /> : <Circle className="size-3.5" />}</span>
          <span className="oiu-plan__label">{i + 1}. {s.title}</span>
          {s.plugins?.length ? <span className="oiu-plan__plugins">{s.plugins.map((p) => <span key={p} className="oiu-plan__plugin">{p}</span>)}</span> : null}
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
      <button type="button" className="oiu-summary__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {s.state === "pending" ? <Loader2 className="size-3.5 oiu-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
        <span>{s.state === "pending" ? `Summarizing step ${s.index}…` : `Step ${s.index} checkpoint`}</span>
        {s.doneAt && <time className="oiu-summary__time" dateTime={s.doneAt}>{new Date(s.doneAt).toISOString().slice(11, 19)} UTC</time>}
        <ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div className={`oiu-summary__panel${open ? " oiu-summary__panel--open" : ""}`}><div className="oiu-summary__inner">{s.state === "pending" ? <div className="oiu-shimmer" aria-hidden><span /><span /><span /></div> : <p>{s.text || "No summary text was emitted for this step."}</p>}</div></div>
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
        <div className="oiu-prompt__actions">{prompt.url && <a className="oiu-prompt__btn oiu-prompt__btn--primary" href={prompt.url} target="_blank" rel="noopener noreferrer">Open live browser</a>}<button type="button" className="oiu-prompt__btn" onClick={() => { onAnswer("Done — I completed the browser action."); setDone("Approval sent."); }}>Done</button><button type="button" className="oiu-prompt__btn" onClick={() => { onAnswer("Cancel the browser action."); setDone("Cancelled."); }}>Cancel</button></div>
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

const AssistantMessage: AssistantMessageComponent = ({ message, isStreaming }) => {
  const content = typeof message.content === "string" ? message.content : "";
  const { version } = useStreamState();
  const key = sourcesKey(content);
  const meta = useMemo(() => (isStreaming ? null : liveMeta.get(key) ?? metaFor(key)), [key, isStreaming, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => (isStreaming ? [] : liveSources.get(key) ?? sourcesFor(key) ?? []), [key, isStreaming, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cites, setCites] = useState<Cite[]>([]);
  // After a plugin failure the model's prose is not research: only real plugin citations (none) are listed — never URLs mined from a disclaimer.
  const rail = meta?.error ? known : cites;
  return (
    <div className="oiu-assistant" data-testid="assistant-message">
      <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
      <div className="oiu-assistant__body">
        {meta?.plan && <PlanStepper plan={{ objective: meta.plan.objective, steps: meta.plan.steps.map((s) => ({ ...s, state: s.state === "running" ? "done" : s.state })) }} />}
        {meta?.summaries?.map((s) => <StepSummaryCard key={s.index} s={{ index: s.index, stepId: "", state: "done", text: s.text, optimistic: false, startedAt: 0, doneAt: s.doneAt ?? undefined }} />)}
        {meta?.thinking && <ThinkingTrace text={meta.thinking} />}
        {meta?.error && (
          <div className="oiu-plugin-error" role="alert" data-testid="plugin-error-card">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span><strong>{PLUGIN_NAME} failed</strong> — {meta.error.message}</span>
          </div>
        )}
        <CitedMarkdown text={content || (isStreaming ? "…" : "")} known={meta?.error ? [] : known} streaming={!!isStreaming} onCites={setCites} />
        {!isStreaming && <SourceList sources={rail} />}
        {!isStreaming && <AnswerBadge meta={meta} />}
      </div>
    </div>
  );
};

/**
 * Plugin activity timeline (replaces OpenUI's default "Working · Running the N plugins tool" card).
 * One card per plugin (favicon + real input): "Searching with X" (Loader2) → "X searched · N sources" (Check) → "X failed" (AlertTriangle, red, upstream message + raw frame).
 * While the turn is live this component also renders the plan stepper, step-summary checkpoints, the thinking trace, the live markdown with inline
 * citation chips and the reserved Sources rail — OpenUI routes the streaming text through the timeline `steps` until the run finishes.
 */
type PluginInput = { plugin?: string; pluginId?: string; query?: string; stepId?: string; endpointLabel?: string; reasoningMode?: string };
const PluginTimeline: ToolCallTimelineComponent = ({ activities, steps, isLast, awaitingResponse }) => {
  const isRunning = useThread((s) => s.isRunning);
  const processMessage = useThread((s) => s.processMessage);
  const st = useStreamState();
  const [liveCites, setLiveCites] = useState<Cite[]>([]);
  const cards = activities.filter((a) => { const i = (a.input ?? {}) as PluginInput; return typeof i.query === "string" && i.query.trim().length > 0; });
  const liveText = isLast && isRunning ? steps.filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text").map((s) => s.text).join("\n\n") : "";
  const live = isLast && isRunning;
  useEffect(() => { if (!live) setLiveCites([]); }, [live]);
  if (cards.length === 0 && !liveText && !(live && (st.plan || st.summaries.length || st.prompt))) { void awaitingResponse; return null; }
  const railSources = live ? (st.error?.code === "plugin_error" ? [] : liveCites.length ? liveCites : st.sources) : [];
  return (<>
    {live && <PlanStepper plan={st.plan} />}
    {cards.length > 0 && <ol className="oiu-activity-list" aria-label="Plugin activity">
      {cards.map((a) => {
        const i = a.input as PluginInput; const pid = i.pluginId ?? PLUGIN_ID; const name = i.plugin || a.toolName || catalogueName(pid);
        let result: { status?: string; sources?: number; message?: string; raw?: string; durationMs?: number } = {};
        if (typeof a.result === "string") { try { result = JSON.parse(a.result) as typeof result; } catch { /* raw */ } }
        const failed = a.isError === true || result.status === "error" || (live && st.error?.code === "plugin_error" && pid === PLUGIN_ID);
        const running = !failed && live && (a.status === "streaming" || a.status === "executing");
        const n = result.sources ?? (live ? st.sources.length : undefined);
        const state = failed ? "failed" : running ? "searching" : "searched";
        const detail = failed ? (result.message || st.error?.message || "upstream error") : running ? (st.detail || "") : `${n != null ? `${n} source${n === 1 ? "" : "s"}` : "done"}${result.durationMs ? ` · ${(result.durationMs / 1000).toFixed(1)} s` : ""}`;
        return (
          <li key={a.id} className={`oiu-activity ${failed ? "oiu-activity--error" : running ? "oiu-activity--running" : "oiu-activity--done"}`} data-testid="plugin-activity" data-plugin={pid} data-state={state}>
            <span className="oiu-activity__icon" aria-hidden>{failed ? <AlertTriangle className="size-3.5" /> : running ? <Loader2 className="size-3.5 oiu-spin" /> : <Check className="size-3.5" />}</span>
            <span className="oiu-activity__text">
              <span className="oiu-activity__name"><PluginFavicon id={pid} size={16} className="oiu-activity__favicon" /><Search className="size-3 oiu-activity__plugin-icon" aria-hidden />{running ? `Searching with ${name}` : failed ? `${name} failed` : `${name} searched`}</span>
              <span className="oiu-activity__query">“{i.query!.slice(0, 160)}{i.query!.length > 160 ? "…" : ""}”</span>
              {detail && <span className="oiu-activity__detail">{detail}</span>}
              {failed && (result.raw || st.error?.raw) && <RawFrame raw={result.raw || st.error?.raw || ""} />}
            </span>
          </li>
        );
      })}
    </ol>}
    {live && st.summaries.map((s) => <StepSummaryCard key={s.index} s={s} live />)}
    {live && st.thinking && <ThinkingTrace text={st.thinking} kinds={st.thinkingKinds} live />}
    {live && st.prompt && <PromptCard prompt={st.prompt} sessionId={st.sessionId} onAnswer={(text) => { setStream({ prompt: null }, true); void processMessage({ role: "user", content: text }); }} />}
    {live && st.filler && !liveText && <p className="oiu-filler" data-testid="filler" aria-hidden><span /><span /><span /></p>}
    {(liveText || (live && st.phase === "answering")) && (
      <div className="oiu-assistant oiu-assistant--streaming" aria-live="polite" aria-busy="true" data-testid="assistant-streaming">
        <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
        <div className="oiu-assistant__body">
          {/* Rail + live badge sit ABOVE the growing text so streaming never pushes a layout box that is already painted (CLS ≈ 0). */}
          <AnswerBadge meta={{ pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, totalMs: null, metrics: null }} live />
          <SourceList sources={railSources} live />
          <CitedMarkdown text={liveText} known={st.error?.code === "plugin_error" ? [] : st.sources} streaming onCites={setLiveCites} />
        </div>
      </div>
    )}
  </>);
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
    const onScroll = () => { const gap = node.scrollHeight - node.scrollTop - node.clientHeight; atBottom.current = gap < 80; setAway((a) => (a !== !atBottom.current ? !atBottom.current : a)); };
    node.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => node.removeEventListener("scroll", onScroll);
  }, [isRunning]);
  useEffect(() => { const node = el.current; if (!node || !isRunning || !atBottom.current) return; node.scrollTop = node.scrollHeight; }, [st.version, isRunning]);
  if (!away || !isRunning) return null;
  return <button type="button" className="oiu-jump" data-testid="jump-to-latest" onClick={() => { const node = el.current; if (node) { node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); atBottom.current = true; setAway(false); } }}><ArrowDown className="size-3.5" aria-hidden /> Jump to latest</button>;
}

/**
 * Live-phase row, shown IMMEDIATELY after send (isRunning) until the first answer token, with an elapsed counter. Portaled into OpenUI's bottom loader slot.
 */
function PendingRow() {
  const isRunning = useThread((s) => s.isRunning); const st = useStreamState();
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
  if (!isRunning || !host || st.phase === "answering") return null;
  const secs = st.startedAt ? Math.max(0, (now - st.startedAt) / 1000) : 0;
  const label = st.filler ? "…" : st.detail || PHASE_LABEL.connecting;
  return createPortal(
    <p className="oiu-activity oiu-activity--pending" role="status" data-phase={st.phase || "connecting"} data-testid="pending-row" data-first-status-ms={st.firstStatusMs ?? ""}>
      <Loader2 className="size-3.5 oiu-spin" aria-hidden />
      <span className="oiu-activity__phase">{label}</span>
      {st.suggested.length > 0 && <span className="oiu-activity__chips" data-testid="suggested-plugins">{st.suggested.slice(0, 6).map((p) => <PluginFavicon key={p.id} id={p.id} size={16} />)}</span>}
      <span className="oiu-activity__elapsed">{secs.toFixed(1)} s{st.firstStatusMs != null ? ` · first event ${st.firstStatusMs} ms` : ""}</span>
    </p>, host);
}

/** Visible, retryable error state: typed upstream error from the bridge (CUSTOM ondemand.error / RUN_ERROR) or a failed request. */
function ErrorBanner() {
  const threadError = useThread((s) => s.threadError); const isRunning = useThread((s) => s.isRunning);
  const messages = useThread((s) => s.messages); const processMessage = useThread((s) => s.processMessage);
  const st = useStreamState();
  const [showRaw, setShowRaw] = useState(false);
  if (isRunning || (!threadError && !st.error)) return null;
  const lastUser = [...messages].reverse().find((m) => m.role === "user") as UserMessage | undefined;
  const retry = () => { if (lastUser) void processMessage({ role: "user", content: lastUser.content }); };
  const code = st.error?.code ?? "run_error";
  const message = st.error?.message ?? threadError?.message ?? "The run failed";
  return (
    <div className="oiu-error" role="alert" data-testid="chat-error" data-error-code={code}>
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="oiu-error__text">
        <strong>{code === "plugin_error" ? `${PLUGIN_NAME} returned an upstream error — no other plugin was substituted.` : "The answer could not be completed."}</strong> {message}
        {st.error?.raw && <> <button type="button" className="oiu-error__raw-toggle" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>{showRaw ? "hide raw frame" : "show raw frame"}</button>{showRaw && <pre className="oiu-error__raw" data-testid="chat-error-raw">{st.error.raw}</pre>}</>}
      </span>
      {lastUser && <button type="button" className="oiu-error__retry" onClick={retry}><RotateCcw className="size-3.5" aria-hidden /> Retry</button>}
    </div>
  );
}

/** Persists streamed messages + remembers the OnDemand sessionId per thread (from the x-ondemand-session header / ondemand.session frame). */
function Persistence({ sessionRef }: { sessionRef: React.MutableRefObject<Record<string, string>> }) {
  const messages = useThread((s) => s.messages); const selected = useThreadList((s) => s.selectedThreadId);
  useEffect(() => { if (selected && messages.length) saveMessages(selected, messages); }, [messages, selected]);
  useEffect(() => { if (selected && sessionRef.current[selected]) rememberSession(selected, sessionRef.current[selected]); }, [selected, messages, sessionRef]);
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

export function ChatShell({ companies, fetchedAt }: { companies: CoCtx[]; fetchedAt?: string }) {
  const [s] = useSettings();
  const [selectedPlugins] = usePluginSelection();
  const sessionRef = useRef<Record<string, string>>({});
  const [storage] = useState(() => localThreadStorage());
  const ctxCompanies = companies.filter((c) => s.companies.includes(c.slug));
  useEffect(() => { preloadPluginFavicons(PLUGIN_CATALOGUE.map((p) => p.id)); }, []);
  // Built-in portfolio context (no OnDemand plugin id could be registered — see web/proof/plugin-registration.log): real backend values only, delta/basis verbatim from company.sentiment, capped at 6000 chars by the proxy.
  const systemContext = ctxCompanies.length ? `Portfolio data below comes from the B Capital portfolio API (live backend, fetched ${fetchedAt ?? new Date().toISOString()}). Use it ONLY for portfolio-internal questions (sentiment scores, deltas, which context companies moved, headline counts). For anything about external facts — recent announcements, funding rounds, valuations, IPOs, products, people, comparisons with earlier events — ALWAYS run the Perplexity web search and answer from fresh sources with citations; never say the feed lacks information when the web can answer it. Sentiment delta is null until a second scoring run exists — do not invent movement; a basis of "seed placeholder" means the score has not been scored by the workflow yet.\n${ctxCompanies.map((c) => `• ${c.name} — sector: ${c.sector}; status: ${c.status}; stage: ${c.stage ?? "n/a"}; sentiment: ${fmtScore(c.sentiment.score)} (${c.sentiment.label}), delta ${c.sentiment.delta == null ? "null (no prior run)" : fmtScore(c.sentiment.delta)}, updated ${c.sentiment.updated_at ?? "n/a"}, basis: ${c.sentiment.basis ?? "n/a"}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news items: ${c.news_count ?? c.latest_news.length}; latest headlines: ${c.latest_news.length ? c.latest_news.slice(0, 3).map((n) => `"${n.title}" (${n.published_at ?? "undated"}, ${n.source ?? "source n/a"})`).join("; ") : "none"}`).join("\n")}`.slice(0, 6000) : "";
  const llm = useMemo(() => fetchLLM({
    url: CHAT_API_URL, streamAdapter: agUIAdapter(),
    headers: s.apikey ? { "x-ondemand-key": s.apikey } : {},
    fetch: async (input, init) => {
      // inject the per-thread OnDemand session, the EXPLICIT plugin selection and the portfolio context; capture the session id from the response
      const body = JSON.parse(String(init?.body ?? "{}")) as { threadId?: string; context?: Record<string, unknown> };
      const tid = body.threadId ?? ""; const sid = sessionRef.current[tid] ?? (tid ? sessionFor(tid) : null);
      const pluginIds = getSelectedPluginIds();
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, externalUserId: s.externalUserId, pluginIds, systemContext, sessionContext: ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment: c.sentiment, news: c.latest_news.slice(0, 3) }).slice(0, 1800) })) };
      setStream({ ...IDLE, phase: "connecting", detail: PHASE_LABEL.connecting, startedAt: Date.now(), sessionId: sid ?? null, lastThreadId: tid, pluginIds, version: streamState.version }, true);
      let res: Response;
      try { res = await fetch(input, { ...init, body: JSON.stringify(body) }); } catch (e) { setStream({ phase: "idle", detail: "", error: { code: "fetch_failed", message: (e as Error).message } }, true); throw e; }
      const remember = (got: string) => { if (tid) { sessionRef.current[tid] = got; rememberSession(tid, got); } };
      const got = res.headers.get("x-ondemand-session"); if (got) remember(got);
      if (!res.ok || !res.body) { setStream({ phase: "idle", detail: "", error: { code: `http_${res.status}`, message: `Chat endpoint answered HTTP ${res.status}` } }, true); return res; }
      void teeStream(res.clone(), tid, remember);
      return res;
    },
  }), [s.apikey, s.externalUserId, systemContext]); // eslint-disable-line react-hooks/exhaustive-deps
  const pluginLabel = selectedPlugins.map((id) => catalogueName(id)).join(", ");
  return (
    <div className="chat-shell" data-testid="chat-shell">
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        <AgentInterface.Welcome title="Ask the portfolio" />
        <Persistence sessionRef={sessionRef} />
        <PendingRow />
        <ScrollAnchor />
        <ErrorBanner />
        <Suspense fallback={null}><AutoAsk /></Suspense>
      </AgentInterface>
      <p className="oiu-footer" data-testid="chat-footer"><ShieldCheck className="size-3.5" aria-hidden /> Streams via OnDemand — model <code>{MODEL_LABEL}</code> (<code>{MODEL_ID}</code>), reasoning <code>{REASONING_MODE}</code>, plugins sent explicitly: <code data-testid="footer-plugins">{pluginLabel}</code> — through the server proxy; the API key never leaves the server.</p>
    </div>
  );
}
