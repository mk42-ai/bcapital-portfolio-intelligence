"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentInterface, fetchLLM, agUIAdapter, useThread, useThreadList, MarkDownRenderer, getFaviconUrl, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { Message, UserMessage } from "@openuidev/react-headless";
import { AlertCircle, Bot, Check, ExternalLink, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { responseTheme } from "./response-theme";
import { localThreadStorage, saveMessages, sessionFor, rememberSession } from "./local-storage";
import { useSettings } from "@/lib/settings";
import { PLUGINS, DEFERRED_PLUGIN_IDS } from "@/lib/plugins";
import { fmtScore } from "@/lib/format";

export type CoCtx = { slug: string; name: string; sector: string; status: string; stage: string | null; sentiment: { score: number; label: string; delta?: number | null }; latest_news: { title: string; url: string | null; published_at: string | null }[]; estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; b_capital_role: string };
type Source = { url: string; title: string; sourceName: string };
const starters = [
  { displayText: "Latest Fervo news", prompt: "What is the latest news about Fervo Energy? Cite sources.", icon: null },
  { displayText: "Biggest movers", prompt: "Which of my context companies moved most since the last sentiment run, and why?", icon: null },
  { displayText: "Compare two", prompt: "Compare Apptronik and WRITER on funding momentum and recent sentiment.", icon: null },
  { displayText: "LP update draft", prompt: "Draft a one-paragraph LP update on the portfolio's sentiment this week.", icon: null },
];

/** Source chips: the bridge emits `CUSTOM ondemand.sources` after the answer; we also extract URLs from the markdown as a fallback. */
function sourcesOf(content: string, extra?: Source[]): Source[] {
  const urls = [...new Set((content.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
  const fromText = urls.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ""); } catch {} return { url: u, title: h, sourceName: h }; });
  const seen = new Set<string>(); return [...(extra ?? []), ...fromText].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 12);
}
const AssistantMessage: AssistantMessageComponent = ({ message, isStreaming }) => {
  const content = typeof message.content === "string" ? message.content : "";
  const sources = useMemo(() => (isStreaming ? [] : sourcesOf(content)), [content, isStreaming]);
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
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getFaviconUrl(src.url)} alt="" width={14} height={14} className="oiu-sources__favicon" loading="lazy" />
                    <span className="oiu-sources__host">{src.sourceName}</span>
                    <span className="oiu-sources__path">{src.url.replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 72) || "/"}</span>
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
  if (cards.length === 0 && !liveText) {
    if (!(isLast && isRunning && awaitingResponse)) return null;
    return <p className="oiu-activity oiu-activity--pending" role="status"><Loader2 className="size-3.5 oiu-spin" aria-hidden /> Working — contacting OnDemand…</p>;
  }
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

export function ChatShell({ companies }: { companies: CoCtx[] }) {
  const [s] = useSettings();
  const sessionRef = useRef<Record<string, string>>({});
  const [storage] = useState(() => localThreadStorage());
  const ctxCompanies = companies.filter((c) => s.companies.includes(c.slug));
  const activePlugins = PLUGINS.filter((p) => p.id && p.status === "active" && s.plugins[p.id] && !DEFERRED_PLUGIN_IDS.has(p.id)).map((p) => p.id as string);
  const systemContext = ctxCompanies.length ? `Context (portfolio DB records, latest news, sentiment): ${ctxCompanies.map((c) => `${c.name} [${c.sector}; ${c.status}; sentiment ${fmtScore(c.sentiment.score)} ${c.sentiment.label}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news: ${c.latest_news.slice(0, 3).map((n) => n.title).join(" | ")}]`).join("\n")}` : "";
  const llm = useMemo(() => fetchLLM({
    url: "/api/chat", streamAdapter: agUIAdapter(),
    headers: s.apikey ? { "x-ondemand-key": s.apikey } : {},
    fetch: async (input, init) => {
      // inject per-thread OnDemand session + plugin config into the body; capture the session id from the response header
      const body = JSON.parse(String(init?.body ?? "{}")) as { threadId?: string; context?: Record<string, unknown> };
      const tid = body.threadId ?? ""; const sid = sessionRef.current[tid] ?? (tid ? sessionFor(tid) : null);
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, pluginIds: activePlugins, endpointId: s.model, externalUserId: s.externalUserId, systemContext, sessionContext: ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment: c.sentiment, news: c.latest_news.slice(0, 3) }).slice(0, 1800) })) };
      const res = await fetch(input, { ...init, body: JSON.stringify(body) });
      const got = res.headers.get("x-ondemand-session"); if (got && tid) { sessionRef.current[tid] = got; rememberSession(tid, got); }
      return res;
    },
  }), [s.apikey, s.model, s.externalUserId, activePlugins.join(","), systemContext]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-shell" data-testid="chat-shell">
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        <AgentInterface.Welcome title="Ask the portfolio" />
        <Persistence sessionRef={sessionRef} />
        <ErrorBanner />
        <Suspense fallback={null}><AutoAsk /></Suspense>
      </AgentInterface>
      <p className="oiu-footer"><ShieldCheck className="size-3.5" aria-hidden /> Streams via OnDemand (model <code>{s.model}</code>; plugins: {activePlugins.length ? PLUGINS.filter((p) => p.id && activePlugins.includes(p.id)).map((p) => p.name).join(", ") : "none"}) through the server proxy — the API key never leaves the server.</p>
    </div>
  );
}
