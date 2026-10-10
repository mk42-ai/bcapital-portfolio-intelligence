"use client";
import "@openuidev/react-ui/styles/index.css";
import "./response-theme.css";
import "./shell.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentInterface, fetchLLM, agUIAdapter } from "@openuidev/react-ui";
import { responseTheme } from "./response-theme";
import { localThreadStorage, sessionFor, rememberSession } from "./local-storage";
import { useSettings } from "@/lib/settings";
import { PLUGIN_ID, MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { getSelectedPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { pluginName as catalogueName, PLUGIN_CATALOGUE } from "@/lib/plugin-catalogue";
import { preloadPluginFavicons } from "@/components/ui/plugin-favicon";
import { fmtScore } from "@/lib/format";
import { VoiceDock } from "@/components/chat/voice/voice-dock";
import { AttachmentBar, attachmentsStore } from "./attachments";
import { ContextChipsBar } from "./context-chips-bar";
import { chipsBlock, clearContextChips, getContextChips, PITCHBOOK_PLUGIN_ID } from "./context-chips";
import { CHAT_API_URL, IDLE, PHASE_LABEL, currentStream, getCurrentSessionId, getCurrentThreadId, setStream, teeStream, type CoCtx } from "./stream-store";
import { AssistantMessage, PluginTimeline, UserBubble } from "./messages";
import { AutoAsk, ErrorBanner, PendingRow, Persistence, ScrollAnchor, Suspense } from "./thread-helpers";
import { ChatWelcome, starters } from "./chat-welcome";
import { Composer } from "./composer";
import { ThreadBusBridge } from "./thread-bus";

/* Public surface kept stable for run-rail / tts-queue / drawer / tests. */
export { useStreamState, useStreamSelector, subscribeStream, getStreamSnapshot, getStreamPhase, getCurrentSessionId, faviconFor } from "./stream-store";
export type { CoCtx, StreamPhase, PlanStep, StepSummary, Prompt } from "./stream-store";
void PLUGIN_ID;

export function ChatShell({ companies, fetchedAt }: { companies: CoCtx[]; fetchedAt?: string }) {
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
  useEffect(() => { attachmentsStore.setSessionGetter(() => ({ sessionId: getCurrentSessionId(sessionRef.current, getCurrentThreadId()) ?? prewarm.current?.sessionId ?? null, externalUserId: s.externalUserId, apikey: s.apikey || undefined })); }, [s.externalUserId, s.apikey]);
  useEffect(() => {
    const ids = getSelectedPluginIds(); const ctl = new AbortController();
    fetch(`${CHAT_API_URL}/prewarm?externalUserId=${encodeURIComponent(s.externalUserId)}&pluginIds=${encodeURIComponent(ids.join(","))}`, { signal: ctl.signal, headers: s.apikey ? { "x-ondemand-key": s.apikey } : {} })
      .then((r) => r.json()).then((j: { ok?: boolean; sessionId?: string; pluginIds?: string[] }) => { if (j?.ok && j.sessionId) { prewarm.current = { sessionId: j.sessionId, pluginIds: j.pluginIds ?? ids }; setPrewarmState("ready"); } else setPrewarmState("failed"); })
      .catch(() => setPrewarmState("failed"));
    return () => ctl.abort();
  }, [s.externalUserId, s.apikey]);
  // Built-in portfolio context (no OnDemand plugin id could be registered — see web/proof/plugin-registration.log): real backend values only, delta/basis verbatim from company.sentiment, capped at 6000 chars by the proxy.
  const systemContext = ctxCompanies.length ? `Portfolio data below comes from the B Capital portfolio API (live backend, fetched ${fetchedAt ?? new Date().toISOString()}). Use it ONLY for portfolio-internal questions (sentiment scores, deltas, which context companies moved, headline counts). For anything about external facts — recent announcements, funding rounds, valuations, IPOs, products, people, comparisons with earlier events — ALWAYS run the Perplexity web search and answer from fresh sources with citations; never say the feed lacks information when the web can answer it. Sentiment delta is null until a second scoring run exists — do not invent movement; a basis of "seed placeholder" means the score has not been scored by the workflow yet.\n${ctxCompanies.map((c) => `• ${c.name} — sector: ${c.sector}; status: ${c.status}; stage: ${c.stage ?? "n/a"}; sentiment: ${fmtScore(c.sentiment.score)} (${c.sentiment.label}), delta ${c.sentiment.delta == null ? "null (no prior run)" : fmtScore(c.sentiment.delta)}, updated ${c.sentiment.updated_at ?? "n/a"}, basis: ${c.sentiment.basis ?? "n/a"}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news items: ${c.news_count ?? c.latest_news.length}; latest headlines: ${c.latest_news.length ? c.latest_news.slice(0, 3).map((n) => `"${n.title}" (${n.published_at ?? "undated"}, ${n.source ?? "source n/a"})`).join("; ") : "none"}`).join("\n")}`.slice(0, 6000) : "";
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
      body.context = { ...(body.context ?? {}), sessionId: sid ?? undefined, externalUserId: s.externalUserId, pluginIds, systemContext, ...(attachments.length ? { attachments } : {}), sessionContext: ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment: c.sentiment, news: c.latest_news.slice(0, 3) }).slice(0, 1800) })) };
      setStream({ ...IDLE, phase: "connecting", detail: PHASE_LABEL.connecting, startedAt: Date.now(), sessionId: sid ?? null, lastThreadId: tid, pluginIds, version: currentStream().version }, true);
      let res: Response;
      try { res = await fetch(input, { ...init, body: JSON.stringify(body) }); if (chips.length) clearContextChips(); } catch (e) { setStream({ phase: "idle", detail: "", error: { code: "fetch_failed", message: (e as Error).message } }, true); throw e; }
      const remember = (got: string) => { if (tid) { sessionRef.current[tid] = got; rememberSession(tid, got); } };
      const got = res.headers.get("x-ondemand-session"); if (got) remember(got);
      if (!res.ok || !res.body) { setStream({ phase: "idle", detail: "", error: { code: `http_${res.status}`, message: `Chat endpoint answered HTTP ${res.status}` } }, true); return res; }
      if (attachments.length) attachmentsStore.markSent(lastUserId || `${tid}:${Date.now()}`, tid); // sent → chips move under the user bubble, bar clears
      void teeStream(res.clone(), tid, remember);
      return res;
    },
  }), [s.apikey, s.externalUserId, systemContext]); // eslint-disable-line react-hooks/exhaustive-deps
  void selectedPlugins; void catalogueName; void MODEL_ID; void MODEL_LABEL; void REASONING_MODE;
  return (
    <div className="chat-shell" data-testid="chat-shell" data-prewarm={prewarmState} data-model-id={MODEL_ID} data-reasoning={REASONING_MODE}>
      <AgentInterface llm={llm} storage={storage} agentName="Portfolio analyst" theme={{ mode: "light", lightTheme: responseTheme }} starters={starters} starterVariant="short" components={{ AssistantMessage, UserMessage: UserBubble, ToolCallTimeline: PluginTimeline }} scrollVariant="always">
        {/* Mode C sidebar with no children: OpenUI's "Portfolio analyst" thread column is DELETED — threads live in the global nav rail. */}
        <AgentInterface.Sidebar>{null}</AgentInterface.Sidebar>
        <AgentInterface.Welcome><ChatWelcome companies={ctxCompanies} /></AgentInterface.Welcome>
        <ThreadBusBridge />
        <Persistence sessionRef={sessionRef} />
        <PendingRow />
        <VoiceDock />
        <AttachmentBar />
        <Composer />
        <ScrollAnchor />
        <ErrorBanner />
        <ContextChipsBar />
        <Suspense fallback={null}><AutoAsk /></Suspense>
      </AgentInterface>
    </div>
  );
}
