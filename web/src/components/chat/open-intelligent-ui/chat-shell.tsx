"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AgentInterface, fetchLLM, agUIAdapter, useThread, useThreadList, MarkDownRenderer, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { Message, UserMessage } from "@openuidev/react-headless";
import { AlertTriangle, Bot, Brain, Check, ChevronDown, Cpu, ExternalLink, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { responseTheme } from "./response-theme";
import { localThreadStorage, saveMessages, sessionFor, rememberSession, rememberSources, sourcesFor, sourcesKey, rememberMeta, metaFor, type StoredSource, type StoredMeta } from "./local-storage";
import { useSettings } from "@/lib/settings";
import { PLUGIN_ID, PLUGIN_NAME, MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
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
export const faviconFor = (url: string) => { let h = ""; try { h = new URL(url).hostname; } catch { h = url; } return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=32`; };

/**
 * Module-level live-stream store, fed by a tee of the SSE body (res.clone()) in the fetch wrapper below — independent of OpenUI's own parser.
 * phase: connecting → planning → researching (Perplexity running) → answering (first text delta) → idle. `error` carries the typed upstream error.
 */
export type StreamPhase = "idle" | "connecting" | "planning" | "researching" | "answering";
type StreamError = { code: string; message: string; raw?: string } | null;
type StreamState = {
  phase: StreamPhase; detail: string; startedAt: number; sessionId: string | null; version: number;
  firstStatusMs: number | null; firstTokenMs: number | null; chunks: number; thinking: string; thinkingKinds: string[]; error: StreamError;
  sources: Source[]; metrics: Record<string, number> | null; lastThreadId: string | null;
};
const IDLE: StreamState = { phase: "idle", detail: "", startedAt: 0, sessionId: null, version: 0, firstStatusMs: null, firstTokenMs: null, chunks: 0, thinking: "", thinkingKinds: [], error: null, sources: [], metrics: null, lastThreadId: null };
let streamState: StreamState = IDLE;
const liveSources = new Map<string, Source[]>();
const liveMeta = new Map<string, StoredMeta>();
const listeners = new Set<() => void>();
const setStream = (patch: Partial<StreamState>) => { streamState = { ...streamState, ...patch, version: streamState.version + 1 }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getStream = () => streamState;
export const useStreamState = () => useSyncExternalStore(subscribe, getStream, () => IDLE);
export const getStreamPhase = () => streamState.phase;
const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting to OnDemand…", "creating-session": "Creating OnDemand session…", querying: `Submitting to ${MODEL_LABEL}…`,
  streaming: `${MODEL_LABEL} is planning…`, planning: `${MODEL_LABEL} is planning…`, researching: `Searching with ${PLUGIN_NAME}…`, answering: "Writing the answer…", done: "Done",
};

type AgUiFrame = { type?: string; name?: string; value?: Record<string, unknown>; delta?: string; toolCallName?: string; message?: string; code?: string };
/** Reads the cloned SSE body line-by-line (data: …) and updates the live store + localStorage; never throws into the UI path. */
async function teeStream(res: Response, threadId: string, onSession: (sid: string) => void) {
  const body = res.body; if (!body) return;
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = ""; let text = "";
  const t0 = streamState.startedAt || Date.now();
  const finalize = () => {
    const key = sourcesKey(text);
    const meta: StoredMeta = { model: MODEL_LABEL, modelId: MODEL_ID, reasoningMode: REASONING_MODE, pluginId: PLUGIN_ID, firstTokenMs: streamState.firstTokenMs, firstStatusMs: streamState.firstStatusMs, chunks: streamState.chunks, metrics: streamState.metrics, thinking: streamState.thinking.slice(0, 6000), error: streamState.error ? { code: streamState.error.code, message: streamState.error.message } : null, at: new Date().toISOString() };
    liveMeta.set(key, meta); rememberMeta(key, meta);
    if (streamState.sources.length) { liveSources.set(key, streamState.sources); rememberSources(key, streamState.sources); }
  };
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return; const data = line.slice(5).trim(); if (!data) return;
    if (data === "[DONE]") { finalize(); setStream({ phase: "idle", detail: "" }); return; }
    let f: AgUiFrame; try { f = JSON.parse(data) as AgUiFrame; } catch { return; }
    const now = Date.now();
    switch (f.type) {
      case "RUN_STARTED": setStream({ firstStatusMs: streamState.firstStatusMs ?? now - t0, ...(streamState.phase === "idle" ? { phase: "connecting", detail: PHASE_LABEL.connecting } : {}) }); break;
      case "CUSTOM": {
        const v = f.value ?? {};
        if (f.name === "ondemand.session" && typeof v.sessionId === "string" && v.sessionId) { onSession(v.sessionId); setStream({ sessionId: v.sessionId }); }
        else if (f.name === "ondemand.status" && typeof v.phase === "string") {
          const p = v.phase; const phase: StreamPhase = p === "researching" ? "researching" : p === "answering" ? "answering" : p === "streaming" || p === "planning" ? "planning" : p === "done" ? "answering" : "connecting";
          if (streamState.phase !== "answering" || phase === "answering") setStream({ phase, detail: PHASE_LABEL[p] ?? PHASE_LABEL[phase] ?? "Working…", firstStatusMs: streamState.firstStatusMs ?? now - t0 });
        } else if (f.name === "ondemand.thinking" && typeof v.delta === "string") {
          const kind = String(v.kind ?? "thinking");
          setStream({ thinking: (streamState.thinking + v.delta).slice(-12000), thinkingKinds: streamState.thinkingKinds.includes(kind) ? streamState.thinkingKinds : [...streamState.thinkingKinds, kind], ...(streamState.phase === "connecting" ? { phase: "planning", detail: PHASE_LABEL.planning } : {}) });
        } else if (f.name === "ondemand.sources" && Array.isArray(v.sources)) {
          const items = (v.sources as Partial<Source>[]).filter((x): x is Source => typeof x.url === "string" && !!x.url).map((x) => ({ url: x.url, title: x.title || x.sourceName || x.url, sourceName: x.sourceName || x.title || x.url, ...(typeof x.imageUrl === "string" && /^https?:\/\//.test(x.imageUrl) ? { imageUrl: x.imageUrl } : {}) }));
          setStream({ sources: items });
        } else if (f.name === "ondemand.metrics" && v.publicMetrics && typeof v.publicMetrics === "object") {
          setStream({ metrics: v.publicMetrics as Record<string, number> });
        } else if (f.name === "ondemand.error") {
          setStream({ error: { code: String(v.code ?? "error"), message: String(v.message ?? "Upstream error"), raw: typeof v.raw === "string" ? v.raw : undefined } });
        }
        break;
      }
      case "TOOL_CALL_START": if (streamState.phase === "connecting" || streamState.phase === "planning") setStream({ phase: "researching", detail: `Searching with ${f.toolCallName || PLUGIN_NAME}…` }); break;
      case "TEXT_MESSAGE_CONTENT": case "TEXT_MESSAGE_CHUNK":
        if (f.delta) { text += f.delta; setStream({ chunks: streamState.chunks + 1, firstTokenMs: streamState.firstTokenMs ?? now - t0, ...(streamState.phase !== "answering" ? { phase: "answering", detail: PHASE_LABEL.answering } : {}) }); }
        break;
      case "RUN_ERROR": setStream({ error: streamState.error ?? { code: f.code ?? "run_error", message: f.message ?? "The run failed" } }); finalize(); setStream({ phase: "idle", detail: "" }); break;
      case "RUN_FINISHED": finalize(); setStream({ phase: "idle", detail: "" }); break;
    }
  };
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? ""; for (const l of lines) handle(l); }
    if (buf.trim()) handle(buf);
  } catch { /* aborted (Stop) or network — the UI path reports it */ }
  finally { if (streamState.phase !== "idle") { finalize(); setStream({ phase: "idle", detail: "" }); } void threadId; }
}

/** Source chips: the bridge emits `CUSTOM ondemand.sources` (real plugin citations); markdown URLs are appended as a labelled fallback. */
function sourcesOf(content: string, extra?: Source[]): Source[] {
  const urls = [...new Set((content.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
  const fromText = urls.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ""); } catch {} return { url: u, title: h, sourceName: h }; });
  const seen = new Set<string>(); return [...(extra ?? []), ...fromText].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 15);
}
function SourceList({ sources, compact }: { sources: Source[]; compact?: boolean }) {
  if (!sources.length) return null;
  return (
    <nav className={`oiu-sources${compact ? " oiu-sources--compact" : ""}`} aria-label="Sources">
      <p className="oiu-sources__title">Sources ({sources.length})</p>
      <ol className="oiu-sources__list">
        {sources.map((src, i) => (
          <li key={src.url} className="oiu-sources__item">
            <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link" data-testid="source-link">
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
/** Per-answer provenance badge: model · reasoning mode · plugin id · first token (measured client-side from send to first TEXT_MESSAGE_CONTENT). */
function AnswerBadge({ meta, live }: { meta: StoredMeta | null; live?: boolean }) {
  const ftt = meta?.firstTokenMs ?? null;
  return (
    <p className="oiu-badge" data-testid="answer-badge" data-first-token-ms={ftt ?? ""} aria-label="Answer provenance">
      <Cpu className="size-3" aria-hidden /><span>{MODEL_LABEL}</span><span className="oiu-badge__sep">·</span><span>{REASONING_MODE}</span><span className="oiu-badge__sep">·</span><code>{PLUGIN_ID}</code>
      <span className="oiu-badge__sep">·</span><span>{ftt != null ? `first token ${ftt.toLocaleString()} ms` : live ? "first token …" : "first token n/a"}</span>
      {meta?.metrics?.totalTokens != null && <><span className="oiu-badge__sep">·</span><span>{meta.metrics.totalTokens.toLocaleString()} tokens</span></>}
    </p>
  );
}
/** Collapsible reasoning trace (planning / step / fulfillment thinking deltas from the bridge). */
function ThinkingTrace({ text, kinds, live }: { text: string; kinds?: string[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const id = useMemo(() => `oiu-think-${Math.random().toString(36).slice(2, 8)}`, []); // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <div className={`oiu-thinking${open ? " oiu-thinking--open" : ""}`} data-testid="thinking-trace">
      <button type="button" className="oiu-thinking__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Brain className="size-3.5" aria-hidden /><span>{live ? "Thinking…" : "Thinking trace"}{kinds?.length ? ` · ${kinds.join(" → ")}` : ""}</span><span className="oiu-thinking__len">{text.length.toLocaleString()} chars</span><ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div id={id} className="oiu-thinking__panel" aria-hidden={!open}><div className="oiu-thinking__inner"><pre className="oiu-thinking__pre">{open ? text : text.slice(-400)}</pre></div></div>
    </div>
  );
}
const AssistantMessage: AssistantMessageComponent = ({ message, isStreaming }) => {
  const content = typeof message.content === "string" ? message.content : "";
  const { version } = useStreamState();
  const key = sourcesKey(content);
  const meta = useMemo(() => (isStreaming ? null : liveMeta.get(key) ?? metaFor(key)), [key, isStreaming, version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Real plugin citations first; markdown URLs are appended only when the plugin actually ran — after a plugin failure the model's prose is not research, so no "Sources" list is shown.
  const sources = useMemo(() => { if (isStreaming) return []; const real = liveSources.get(key) ?? sourcesFor(key) ?? undefined; return meta?.error ? (real ?? []) : sourcesOf(content, real); }, [content, key, isStreaming, version, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="oiu-assistant" data-testid="assistant-message">
      <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
      <div className="oiu-assistant__body">
        {meta?.thinking && <ThinkingTrace text={meta.thinking} />}
        {meta?.error && (
          <div className="oiu-plugin-error" role="alert" data-testid="plugin-error-card">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span><strong>{PLUGIN_NAME} failed</strong> — {meta.error.message}</span>
          </div>
        )}
        <MarkDownRenderer variant="clear" textMarkdown={content || (isStreaming ? "…" : "")} />
        {!isStreaming && <SourceList sources={sources} />}
        {!isStreaming && <AnswerBadge meta={meta} />}
      </div>
    </div>
  );
};

/**
 * Plugin activity timeline (replaces OpenUI's default "Working · Running the N plugins tool" card).
 * One card for Perplexity: "Searching with Perplexity" (Loader2) → "Perplexity searched · N sources" (Check) → "Perplexity failed" (AlertTriangle, red, upstream message).
 * A card is shown ONLY once the bridge has sent the plugin's real input (TOOL_CALL_ARGS → activity.input.query) — never an empty `{}`.
 */
type PluginInput = { plugin?: string; pluginId?: string; query?: string; endpointLabel?: string; reasoningMode?: string };
const PluginTimeline: ToolCallTimelineComponent = ({ activities, steps, isLast, awaitingResponse }) => {
  const isRunning = useThread((s) => s.isRunning);
  const st = useStreamState();
  const cards = activities.filter((a) => { const i = (a.input ?? {}) as PluginInput; return typeof i.query === "string" && i.query.trim().length > 0; });
  // While the turn is live, OpenUI routes the streaming answer text through the timeline `steps` (not AssistantMessage) — render it
  // progressively here so every delta is visible as it arrives; once the run finishes AssistantMessage takes over (with the sources list).
  const liveText = isLast && isRunning ? steps.filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text").map((s) => s.text).join("\n\n") : "";
  if (cards.length === 0 && !liveText) { void awaitingResponse; return null; }
  const live = isLast && isRunning;
  return (<>
    {cards.length > 0 && <ol className="oiu-activity-list" aria-label="Plugin activity">
      {cards.map((a) => {
        const i = a.input as PluginInput; const name = i.plugin || a.toolName || PLUGIN_NAME;
        let result: { status?: string; sources?: number; message?: string } = {};
        if (typeof a.result === "string") { try { result = JSON.parse(a.result) as typeof result; } catch { /* raw */ } }
        const failed = a.isError === true || result.status === "error" || (live && st.error?.code === "plugin_error");
        const running = !failed && live && (a.status === "streaming" || a.status === "executing");
        const n = result.sources ?? (live ? st.sources.length : undefined);
        const state = failed ? "failed" : running ? "searching" : "searched";
        const detail = failed ? (result.message || st.error?.message || "upstream error") : running ? (st.detail || "") : n != null ? `${n} source${n === 1 ? "" : "s"}` : "";
        return (
          <li key={a.id} className={`oiu-activity ${failed ? "oiu-activity--error" : running ? "oiu-activity--running" : "oiu-activity--done"}`} data-testid="plugin-activity" data-plugin={i.pluginId ?? PLUGIN_ID} data-state={state}>
            <span className="oiu-activity__icon" aria-hidden>{failed ? <AlertTriangle className="size-3.5" /> : running ? <Loader2 className="size-3.5 oiu-spin" /> : <Check className="size-3.5" />}</span>
            <span className="oiu-activity__text">
              <span className="oiu-activity__name"><Search className="size-3 oiu-activity__plugin-icon" aria-hidden />{running ? `Searching with ${name}` : failed ? `${name} failed` : `${name} searched`}</span>
              <span className="oiu-activity__query">“{i.query!.slice(0, 160)}{i.query!.length > 160 ? "…" : ""}”</span>
              {detail && <span className="oiu-activity__detail">{detail}</span>}
              {!failed && !running && live && st.sources.length > 0 && <SourceList sources={st.sources} compact />}
            </span>
          </li>
        );
      })}
    </ol>}
    {live && st.thinking && <ThinkingTrace text={st.thinking} kinds={st.thinkingKinds} live />}
    {liveText && (
      <div className="oiu-assistant oiu-assistant--streaming" aria-live="polite" aria-busy="true" data-testid="assistant-streaming">
        <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
        <div className="oiu-assistant__body"><MarkDownRenderer variant="clear" textMarkdown={liveText} /><AnswerBadge meta={{ model: MODEL_LABEL, modelId: MODEL_ID, reasoningMode: REASONING_MODE, pluginId: PLUGIN_ID, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, chunks: st.chunks, metrics: null, thinking: "", error: null, at: "" }} live /></div>
      </div>
    )}
  </>);
};

/**
 * Live-phase row, shown IMMEDIATELY after send (isRunning) until the first answer token: "Connecting to OnDemand…" → "DeepSeek Flash v4.1 is planning…" →
 * "Searching with Perplexity…", with an elapsed counter so the user never sees an empty spinner. Portaled into OpenUI's bottom loader slot.
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
  const label = st.detail || PHASE_LABEL.connecting;
  return createPortal(
    <p className="oiu-activity oiu-activity--pending" role="status" data-phase={st.phase || "connecting"} data-testid="pending-row" data-first-status-ms={st.firstStatusMs ?? ""}>
      <Loader2 className="size-3.5 oiu-spin" aria-hidden />
      <span className="oiu-activity__phase">{label}</span>
      <span className="oiu-activity__elapsed">{secs.toFixed(1)} s{st.firstStatusMs != null ? ` · first status ${st.firstStatusMs} ms` : ""}</span>
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

/** Persists streamed messages + remembers the OnDemand sessionId per thread (read back from the bridge's x-ondemand-session header / ondemand.session frame). */
function Persistence({ sessionRef }: { sessionRef: React.MutableRefObject<Record<string, string>> }) {
  const messages = useThread((s) => s.messages); const selected = useThreadList((s) => s.selectedThreadId);
  useEffect(() => { if (selected && messages.length) saveMessages(selected, messages); }, [messages, selected]);
  useEffect(() => { if (selected && sessionRef.current[selected]) rememberSession(selected, sessionRef.current[selected]); }, [selected, messages, sessionRef]);
  return null;
}

/** Deep link: /chat?q=<question> sends the question once on load (used by the company pages' "Ask about …" links and the e2e proof). */
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
  const sessionRef = useRef<Record<string, string>>({});
  const [storage] = useState(() => localThreadStorage());
  const ctxCompanies = companies.filter((c) => s.companies.includes(c.slug));
  // Built-in portfolio context (no OnDemand plugin id could be registered — see web/proof/plugin-registration.log): real backend values only, delta/basis verbatim from company.sentiment, capped at 6000 chars by the proxy.
  const systemContext = ctxCompanies.length ? `Portfolio data below comes from the B Capital portfolio API (live backend, fetched ${fetchedAt ?? new Date().toISOString()}). Use it ONLY for portfolio-internal questions (sentiment scores, deltas, which context companies moved, headline counts). For anything about external facts — recent announcements, funding rounds, valuations, IPOs, products, people, comparisons with earlier events — ALWAYS run the Perplexity web search and answer from fresh sources with citations; never say the feed lacks information when the web can answer it. Sentiment delta is null until a second scoring run exists — do not invent movement; a basis of "seed placeholder" means the score has not been scored by the workflow yet.\n${ctxCompanies.map((c) => `• ${c.name} — sector: ${c.sector}; status: ${c.status}; stage: ${c.stage ?? "n/a"}; sentiment: ${fmtScore(c.sentiment.score)} (${c.sentiment.label}), delta ${c.sentiment.delta == null ? "null (no prior run)" : fmtScore(c.sentiment.delta)}, updated ${c.sentiment.updated_at ?? "n/a"}, basis: ${c.sentiment.basis ?? "n/a"}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news items: ${c.news_count ?? c.latest_news.length}; latest headlines: ${c.latest_news.length ? c.latest_news.slice(0, 3).map((n) => `"${n.title}" (${n.published_at ?? "undated"}, ${n.source ?? "source n/a"})`).join("; ") : "none"}`).join("\n")}`.slice(0, 6000) : "";
  const llm = useMemo(() => fetchLLM({
    url: CHAT_API_URL, streamAdapter: agUIAdapter(),
    headers: s.apikey ? { "x-ondemand-key": s.apikey } : {},
    fetch: async (input, init) => {
      // inject the per-thread OnDemand session + portfolio context into the body; capture the session id from the response header / session frame
      const body = JSON.parse(String(init?.body ?? "{}")) as { threadId?: string; context?: Record<string, unknown> };
      const tid = body.threadId ?? ""; const sid = sessionRef.current[tid] ?? (tid ? sessionFor(tid) : null);
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, externalUserId: s.externalUserId, systemContext, sessionContext: ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment: c.sentiment, news: c.latest_news.slice(0, 3) }).slice(0, 1800) })) };
      setStream({ ...IDLE, phase: "connecting", detail: PHASE_LABEL.connecting, startedAt: Date.now(), sessionId: sid ?? null, lastThreadId: tid, version: streamState.version });
      let res: Response;
      try { res = await fetch(input, { ...init, body: JSON.stringify(body) }); } catch (e) { setStream({ phase: "idle", detail: "", error: { code: "fetch_failed", message: (e as Error).message } }); throw e; }
      const remember = (got: string) => { if (tid) { sessionRef.current[tid] = got; rememberSession(tid, got); } };
      const got = res.headers.get("x-ondemand-session"); if (got) remember(got);
      if (!res.ok || !res.body) { setStream({ phase: "idle", detail: "", error: { code: `http_${res.status}`, message: `Chat endpoint answered HTTP ${res.status}` } }); return res; }
      // Tee: OpenUI consumes `res` progressively (getReader + TextDecoder); the clone feeds the live store (session id / phase / thinking / sources / metrics / error).
      void teeStream(res.clone(), tid, remember);
      return res;
    },
  }), [s.apikey, s.externalUserId, systemContext]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-shell" data-testid="chat-shell">
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        <AgentInterface.Welcome title="Ask the portfolio" />
        <Persistence sessionRef={sessionRef} />
        <PendingRow />
        <ErrorBanner />
        <Suspense fallback={null}><AutoAsk /></Suspense>
      </AgentInterface>
      <p className="oiu-footer" data-testid="chat-footer"><ShieldCheck className="size-3.5" aria-hidden /> Streams via OnDemand — model <code>{MODEL_LABEL}</code> (<code>{MODEL_ID}</code>), reasoning <code>{REASONING_MODE}</code>, plugin <code>{PLUGIN_NAME} · {PLUGIN_ID}</code> only — through the server proxy; the API key never leaves the server.</p>
    </div>
  );
}
