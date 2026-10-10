"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AgentInterface, fetchLLM, agUIAdapter, useThread, useThreadList, MarkDownRenderer, getFaviconUrl, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { Message, UserMessage } from "@openuidev/react-headless";
import { AlertCircle, Bot, Check, ExternalLink, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { responseTheme } from "./response-theme";
import { localThreadStorage, saveMessages, sessionFor, rememberSession, rememberSources, sourcesFor, sourcesKey, type StoredSource } from "./local-storage";
import { useSettings } from "@/lib/settings";
import { PLUGINS, DEFERRED_PLUGIN_IDS } from "@/lib/plugins";
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

/**
 * Module-level live-stream store, fed by a tee of the SSE body (res.clone()) in the fetch wrapper below — independent of OpenUI's own parser.
 * phase: "connecting" (RUN_STARTED / status connecting|creating-session|querying) → "researching" (status streaming / TOOL_CALL_*) → "answering" (first text delta) → "idle".
 */
export type StreamPhase = "idle" | "connecting" | "researching" | "answering";
type StreamState = { phase: StreamPhase; detail: string; startedAt: number; sessionId: string | null; version: number };
let streamState: StreamState = { phase: "idle", detail: "", startedAt: 0, sessionId: null, version: 0 };
const liveSources = new Map<string, Source[]>();
const listeners = new Set<() => void>();
const setStream = (patch: Partial<StreamState>) => { streamState = { ...streamState, ...patch, version: streamState.version + 1 }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getStream = () => streamState;
const SERVER_STREAM: StreamState = { phase: "idle", detail: "", startedAt: 0, sessionId: null, version: 0 };
export const useStreamState = () => useSyncExternalStore(subscribe, getStream, () => SERVER_STREAM);
export const getStreamPhase = () => streamState.phase;
const PHASE_LABEL: Record<string, string> = { connecting: "Connecting to OnDemand…", "creating-session": "Creating OnDemand session…", querying: "Submitting the query to OnDemand…", streaming: "Perplexity is researching…", researching: "Perplexity is researching…", answering: "Writing the answer…" };

type AgUiFrame = { type?: string; name?: string; value?: Record<string, unknown>; delta?: string; toolCallName?: string; message?: string };
/** Reads the cloned SSE body line-by-line (data: …) and updates the live store + localStorage; never throws into the UI path. */
async function teeStream(res: Response, threadId: string, onSession: (sid: string) => void) {
  const body = res.body; if (!body) return;
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = ""; let text = "";
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return; const data = line.slice(5).trim(); if (!data) return;
    if (data === "[DONE]") { setStream({ phase: "idle", detail: "" }); return; }
    let f: AgUiFrame; try { f = JSON.parse(data) as AgUiFrame; } catch { return; }
    switch (f.type) {
      case "RUN_STARTED": if (streamState.phase === "idle") setStream({ phase: "connecting", detail: PHASE_LABEL.connecting }); break;
      case "CUSTOM": {
        const v = f.value ?? {};
        if (f.name === "ondemand.session" && typeof v.sessionId === "string" && v.sessionId) { onSession(v.sessionId); setStream({ sessionId: v.sessionId }); }
        else if (f.name === "ondemand.status" && typeof v.phase === "string") {
          const p = v.phase; const phase: StreamPhase = p === "streaming" || p === "researching" ? "researching" : p === "answering" ? "answering" : "connecting";
          if (streamState.phase !== "answering") setStream({ phase, detail: PHASE_LABEL[p] ?? PHASE_LABEL[phase] ?? "Working…" });
        } else if (f.name === "ondemand.sources" && Array.isArray(v.sources)) {
          const items = (v.sources as Partial<Source>[]).filter((x): x is Source => typeof x.url === "string" && !!x.url).map((x) => ({ url: x.url, title: x.title || x.sourceName || x.url, sourceName: x.sourceName || x.title || x.url, ...(typeof x.imageUrl === "string" && /^https?:\/\//.test(x.imageUrl) ? { imageUrl: x.imageUrl } : {}) }));
          const key = sourcesKey(text); liveSources.set(key, items); rememberSources(key, items); setStream({});
        }
        break;
      }
      case "TOOL_CALL_START": if (streamState.phase === "connecting") setStream({ phase: "researching", detail: `Searching with ${f.toolCallName || "Perplexity"}…` }); break;
      case "TEXT_MESSAGE_CONTENT": case "TEXT_MESSAGE_CHUNK": if (f.delta) { text += f.delta; if (streamState.phase !== "answering") setStream({ phase: "answering", detail: PHASE_LABEL.answering }); } break;
      case "RUN_ERROR": case "RUN_FINISHED": setStream({ phase: "idle", detail: "" }); break;
    }
  };
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? ""; for (const l of lines) handle(l); }
    if (buf.trim()) handle(buf);
  } catch { /* aborted (Stop) or network — the UI path reports it */ }
  finally { if (streamState.phase !== "idle") setStream({ phase: "idle", detail: "" }); void threadId; }
}

/** Source chips: the bridge emits `CUSTOM ondemand.sources` after the answer; we also extract URLs from the markdown as a fallback. */
function sourcesOf(content: string, extra?: Source[]): Source[] {
  const urls = [...new Set((content.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
  const fromText = urls.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ""); } catch {} return { url: u, title: h, sourceName: h }; });
  const seen = new Set<string>(); return [...(extra ?? []), ...fromText].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 12);
}
const AssistantMessage: AssistantMessageComponent = ({ message, isStreaming }) => {
  const content = typeof message.content === "string" ? message.content : "";
  const { version } = useStreamState();
  const sources = useMemo(() => { if (isStreaming) return []; const key = sourcesKey(content); return sourcesOf(content, liveSources.get(key) ?? sourcesFor(key) ?? undefined); }, [content, isStreaming, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="oiu-assistant">
      <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
      <div className="oiu-assistant__body">
        <MarkDownRenderer variant="clear" textMarkdown={content || (isStreaming ? "…" : "")} />
        {sources.length > 0 && (
          <nav className="oiu-sources" aria-label="Sources">
            <p className="oiu-sources__title">Sources ({sources.length})</p>
            <ol className="oiu-sources__list">
              {sources.map((src, i) => (
                <li key={src.url} className="oiu-sources__item">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link" data-testid="source-link">
                    {src.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src.imageUrl} alt="" width={40} height={40} className="oiu-sources__thumb" loading="lazy" referrerPolicy="no-referrer" data-testid="source-thumb" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <span className="oiu-sources__text">
                      <span className="oiu-sources__name">{src.title && src.title !== src.sourceName ? src.title : src.sourceName}</span>
                      <span className="oiu-sources__meta">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getFaviconUrl(src.url)} alt="" width={14} height={14} className="oiu-sources__favicon" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        <span className="oiu-sources__host">{src.sourceName}</span>
                        <span className="oiu-sources__path">{src.url.replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 72) || "/"}</span>
                      </span>
                    </span>
                    <ExternalLink className="oiu-sources__ext" aria-hidden />
                    <span className="sr-only"> (source {i + 1}, opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
};

/**
 * Plugin activity timeline (replaces OpenUI's default "Working · Running the N plugins tool" card).
 * A card is shown ONLY once the bridge has sent the plugin's real input (TOOL_CALL_ARGS → activity.input.query) — never an empty `{}`.
 */
type PluginInput = { plugin?: string; pluginId?: string; query?: string };
const PluginTimeline: ToolCallTimelineComponent = ({ activities, steps, isLast, awaitingResponse }) => {
  const isRunning = useThread((s) => s.isRunning);
  const cards = activities.filter((a) => { const i = (a.input ?? {}) as PluginInput; return typeof i.query === "string" && i.query.trim().length > 0; });
  // While the turn is live, OpenUI routes the streaming answer text through the timeline `steps` (not AssistantMessage) — render it
  // progressively here so every delta is visible as it arrives; once the run finishes AssistantMessage takes over (with the sources list).
  const liveText = isLast && isRunning ? steps.filter((st): st is Extract<typeof st, { type: "text" }> => st.type === "text").map((st) => st.text).join("\n\n") : "";
  // No card yet (TOOL_CALL_ARGS not arrived) → nothing here; the live-phase <PendingRow/> below the thread covers that window (never an empty `{}` card).
  if (cards.length === 0 && !liveText) { void awaitingResponse; return null; }
  return (<>
    {cards.length > 0 && <ol className="oiu-activity-list" aria-label="Plugin activity">
      {cards.map((a) => {
        const i = a.input as PluginInput; const name = i.plugin || a.toolName || "plugin";
        const running = isLast && isRunning && (a.status === "streaming" || a.status === "executing");
        const failed = a.isError === true;
        let detail = "";
        if (a.status === "complete" && typeof a.result === "string") { try { const r = JSON.parse(a.result) as { sources?: number; chars?: number; message?: string }; detail = r.message ? r.message : r.sources != null ? `${r.sources} source${r.sources === 1 ? "" : "s"}` : ""; } catch { /* raw result */ } }
        return (
          <li key={a.id} className={`oiu-activity ${failed ? "oiu-activity--error" : running ? "oiu-activity--running" : "oiu-activity--done"}`} data-testid="plugin-activity" data-plugin={i.pluginId ?? ""}>
            <span className="oiu-activity__icon" aria-hidden>{failed ? <AlertCircle className="size-3.5" /> : running ? <Loader2 className="size-3.5 oiu-spin" /> : <Check className="size-3.5" />}</span>
            <span className="oiu-activity__text">
              <span className="oiu-activity__name"><Search className="size-3 oiu-activity__plugin-icon" aria-hidden />{running ? `Searching with ${name}` : failed ? `${name} failed` : `${name} searched`}</span>
              <span className="oiu-activity__query">“{i.query!.slice(0, 160)}{i.query!.length > 160 ? "…" : ""}”</span>
              {detail && <span className="oiu-activity__detail">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>}
    {liveText && (
      <div className="oiu-assistant oiu-assistant--streaming" aria-live="polite" aria-busy="true" data-testid="assistant-streaming">
        <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
        <div className="oiu-assistant__body"><MarkDownRenderer variant="clear" textMarkdown={liveText} /></div>
      </div>
    )}
  </>);
};

/**
 * Live-phase row, shown IMMEDIATELY after send (isRunning) until the first answer token: "Connecting to OnDemand…" → "Perplexity is researching…",
 * with an elapsed-seconds counter so the user never sees an empty spinner. Portaled into OpenUI's bottom loader slot (its dot loader is hidden in shell.css).
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
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { mo.disconnect(); clearInterval(tick); };
  }, [isRunning]);
  if (!isRunning || !host || st.phase === "answering") return null;
  const secs = st.startedAt ? Math.max(0, Math.round((now - st.startedAt) / 1000)) : 0;
  const label = st.detail || PHASE_LABEL.connecting;
  return createPortal(
    <p className="oiu-activity oiu-activity--pending" role="status" data-phase={st.phase || "connecting"} data-testid="pending-row">
      <Loader2 className="size-3.5 oiu-spin" aria-hidden />
      <span className="oiu-activity__phase">{label}</span>
      <span className="oiu-activity__elapsed">{secs} s · Perplexity research usually takes 40–70 s</span>
    </p>, host);
}

/** Visible, retryable error state (OpenUI sets threadError when the bridge emits RUN_ERROR or the request fails). */
function ErrorBanner() {
  const threadError = useThread((s) => s.threadError); const isRunning = useThread((s) => s.isRunning);
  const messages = useThread((s) => s.messages); const processMessage = useThread((s) => s.processMessage);
  if (!threadError || isRunning) return null;
  const lastUser = [...messages].reverse().find((m) => m.role === "user") as UserMessage | undefined;
  const retry = () => { if (lastUser) void processMessage({ role: "user", content: lastUser.content }); };
  return (
    <div className="oiu-error" role="alert" data-testid="chat-error">
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span className="oiu-error__text"><strong>The answer could not be completed.</strong> {threadError.message}</span>
      {lastUser && <button type="button" className="oiu-error__retry" onClick={retry}><RotateCcw className="size-3.5" aria-hidden /> Retry</button>}
    </div>
  );
}

/** Persists streamed messages + remembers the OnDemand sessionId per thread (read back from the bridge's x-ondemand-session header). */
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
  const activePlugins = PLUGINS.filter((p) => p.id && p.status === "active" && s.plugins[p.id] && !DEFERRED_PLUGIN_IDS.has(p.id)).map((p) => p.id as string);
  // Built-in portfolio context (no OnDemand plugin id could be registered — see web/proof/plugin-registration.log): real backend values only, delta/basis verbatim from company.sentiment, capped at 6000 chars by the proxy.
  const systemContext = ctxCompanies.length ? `Portfolio data below comes from the B Capital portfolio API (live backend, fetched ${fetchedAt ?? new Date().toISOString()}). Use it ONLY for portfolio-internal questions (sentiment scores, deltas, which context companies moved, headline counts). For anything about external facts — recent announcements, funding rounds, valuations, IPOs, products, people, comparisons with earlier events — ALWAYS run the Perplexity web search and answer from fresh sources with citations; never say the feed lacks information when the web can answer it. Sentiment delta is null until a second scoring run exists — do not invent movement; a basis of "seed placeholder" means the score has not been scored by the workflow yet.\n${ctxCompanies.map((c) => `• ${c.name} — sector: ${c.sector}; status: ${c.status}; stage: ${c.stage ?? "n/a"}; sentiment: ${fmtScore(c.sentiment.score)} (${c.sentiment.label}), delta ${c.sentiment.delta == null ? "null (no prior run)" : fmtScore(c.sentiment.delta)}, updated ${c.sentiment.updated_at ?? "n/a"}, basis: ${c.sentiment.basis ?? "n/a"}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news items: ${c.news_count ?? c.latest_news.length}; latest headlines: ${c.latest_news.length ? c.latest_news.slice(0, 3).map((n) => `"${n.title}" (${n.published_at ?? "undated"}, ${n.source ?? "source n/a"})`).join("; ") : "none"}`).join("\n")}`.slice(0, 6000) : "";
  const llm = useMemo(() => fetchLLM({
    url: CHAT_API_URL, streamAdapter: agUIAdapter(),
    headers: s.apikey ? { "x-ondemand-key": s.apikey } : {},
    fetch: async (input, init) => {
      // inject per-thread OnDemand session + plugin config into the body; capture the session id from the response header
      const body = JSON.parse(String(init?.body ?? "{}")) as { threadId?: string; context?: Record<string, unknown> };
      const tid = body.threadId ?? ""; const sid = sessionRef.current[tid] ?? (tid ? sessionFor(tid) : null);
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, pluginIds: activePlugins, endpointId: s.model, externalUserId: s.externalUserId, systemContext, sessionContext: ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment: c.sentiment, news: c.latest_news.slice(0, 3) }).slice(0, 1800) })) };
      setStream({ phase: "connecting", detail: PHASE_LABEL.connecting, startedAt: Date.now(), sessionId: sid ?? null });
      let res: Response;
      try { res = await fetch(input, { ...init, body: JSON.stringify(body) }); } catch (e) { setStream({ phase: "idle", detail: "" }); throw e; }
      const remember = (got: string) => { if (tid) { sessionRef.current[tid] = got; rememberSession(tid, got); } };
      const got = res.headers.get("x-ondemand-session"); if (got) remember(got);
      if (!res.ok || !res.body) { setStream({ phase: "idle", detail: "" }); return res; }
      // Tee: OpenUI consumes `res` progressively (getReader + TextDecoder); the clone feeds the live store (session id / phase / sources with imageUrl).
      void teeStream(res.clone(), tid, remember);
      return res;
    },
  }), [s.apikey, s.model, s.externalUserId, activePlugins.join(","), systemContext]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-shell" data-testid="chat-shell">
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        <AgentInterface.Welcome title="Ask the portfolio" />
        <Persistence sessionRef={sessionRef} />
        <PendingRow />
        <ErrorBanner />
        <Suspense fallback={null}><AutoAsk /></Suspense>
      </AgentInterface>
      <p className="oiu-footer"><ShieldCheck className="size-3.5" aria-hidden /> Streams via OnDemand (model <code>{s.model}</code>; plugins: {activePlugins.length ? PLUGINS.filter((p) => p.id && activePlugins.includes(p.id)).map((p) => p.name).join(", ") : "none"}) through the server proxy — the API key never leaves the server.</p>
    </div>
  );
}
