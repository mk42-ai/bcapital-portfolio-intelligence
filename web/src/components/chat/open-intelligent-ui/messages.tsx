"use client";
/**
 * Message renderers handed to <AgentInterface components>: AssistantMessage (final answer), UserBubble, PluginTimeline (live turn:
 * plugin activity cards, plan, summaries, thinking, prompt cards, working band, streaming answer).
 */
import { memo, useEffect, useMemo, useState } from "react";
import { useThread, type AssistantMessageComponent, type ToolCallTimelineComponent } from "@openuidev/react-ui";
import type { UserMessage } from "@openuidev/react-headless";
import { AlertTriangle, Bot, Brain, Check, Loader2, Mic, Search } from "lucide-react";
import { sourcesKey, sourcesFor, metaFor } from "./local-storage";
import type { Cite } from "./citations";
import { PLUGIN_ID, PLUGIN_NAME } from "@/lib/plugins";
import { LABEL } from "@/lib/ondemand/eventMap";
import { pluginName as catalogueName } from "@/lib/plugin-catalogue";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import { useVoiceOrigin } from "@/components/chat/voice/voice-origin";
import { SentChips, attachmentsStore, useAttachments } from "./attachments";
import { liveMeta, liveSources, setStream, useStreamSelector, useStreamState } from "./stream-store";
import { CitedMarkdown, SourceList, useThrottled } from "./citations-ui";
import { AnswerBadge, PlanStepper, RawFrame, StepSummaryCard, ThinkingTrace, WorkingBand } from "./run-cards";
import { PromptCard } from "./prompt-card";

export const AssistantMessage: AssistantMessageComponent = memo(function AssistantMessage({ message, isStreaming }) {
  const content = typeof message.content === "string" ? message.content : "";
  // Only the run boundary matters here (meta/sources are written at finalize) — not every streamed delta.
  const settled = useStreamSelector((x) => (x.phase === "idle" ? 1 : 0) + (x.answerDone ? 2 : 0));
  const key = sourcesKey(content);
  const meta = useMemo(() => (isStreaming ? null : liveMeta.get(key) ?? metaFor(key)), [key, isStreaming, settled]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => (isStreaming ? [] : liveSources.get(key) ?? sourcesFor(key) ?? []), [key, isStreaming, settled]); // eslint-disable-line react-hooks/exhaustive-deps
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
        {/* Same block order as the live streaming block (badge → sources → text) so the live→final swap at stream end moves nothing. */}
        {!isStreaming && <AnswerBadge meta={meta} />}
        {!isStreaming && <SourceList sources={rail} live={meta != null} />}
        <CitedMarkdown text={content || (isStreaming ? "…" : "")} known={meta?.error ? [] : known} streaming={!!isStreaming} onCites={setCites} />
      </div>
    </div>
  );
});

/**
 * Plugin activity timeline (replaces OpenUI's default "Working · Running the N plugins tool" card).
 * One card per plugin (favicon + real input): "Searching with X" (Loader2) → "X searched · N sources" (Check) → "X failed" (AlertTriangle, red, upstream message + raw frame).
 * While the turn is live this component also renders the plan stepper, step-summary checkpoints, the thinking trace, the live markdown with inline
 * citation chips and the reserved Sources rail — OpenUI routes the streaming text through the timeline `steps` until the run finishes.
 */
/** User bubble = OpenUI's default markup + the attachment chips sent with that message (attachmentsStore.sentFor(message.id)). */
export const UserBubble: React.ComponentType<{ message: UserMessage }> = memo(function UserBubble({ message }) {
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
type PluginInput = { plugin?: string; pluginId?: string; query?: string; stepId?: string; endpointLabel?: string; reasoningMode?: string };
export const PluginTimeline: ToolCallTimelineComponent = ({ activities, steps, isLast, awaitingResponse }) => {
  const isRunning = useThread((s) => s.isRunning);
  const processMessage = useThread((s) => s.processMessage);
  const st = useStreamState();
  const [liveCites, setLiveCites] = useState<Cite[]>([]);
  const cards = activities.filter((a) => { const i = (a.input ?? {}) as PluginInput; return typeof i.query === "string" && i.query.trim().length > 0; });
  const liveText = isLast && isRunning ? steps.filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text").map((s) => s.text).join("\n\n") : "";
  const live = isLast && isRunning;
  useEffect(() => { if (!live) setLiveCites([]); }, [live]);
  if (cards.length === 0 && !liveText && !live) { void awaitingResponse; return null; }
  const railSources = live ? (st.error?.code === "plugin_error" ? [] : liveCites.length ? liveCites : st.sources) : [];
  const thinkingTail = useThrottled(st.thinking.length > 4000 ? st.thinking.slice(-4000) : st.thinking, 250);
  return (<>
    {live && cards.length === 0 && <ol className="oiu-activity-list oiu-activity-list--reserved" aria-label="Plugin activity" data-testid="activity-reserved"><li className="oiu-activity oiu-activity--placeholder" aria-hidden><span className="oiu-shimmer oiu-shimmer--row"><span /><span /></span></li></ol>}
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
              <span className="oiu-activity__name"><PluginFavicon id={pid} size={16} className="oiu-activity__favicon" /><Search className="size-3 oiu-activity__plugin-icon" aria-hidden />{running ? LABEL.searching(name) : failed ? LABEL.failed(name) : n != null ? LABEL.searched(name, n) : `${name} searched`}</span>
              <span className="oiu-activity__query">“{i.query!.slice(0, 160)}{i.query!.length > 160 ? "…" : ""}”</span>
              {detail && <span className="oiu-activity__detail">{detail}</span>}
              {failed && (result.raw || st.error?.raw) && <RawFrame raw={result.raw || st.error?.raw || ""} />}
            </span>
          </li>
        );
      })}
    </ol>}
    {live && <PlanStepper plan={st.plan} reserve />}
    {live && st.summaries.map((s) => <StepSummaryCard key={s.index} s={s} live />)}
    {live && (st.thinking ? <ThinkingTrace text={thinkingTail} kinds={st.thinkingKinds} live /> : <div className="oiu-thinking oiu-thinking--reserved" data-testid="thinking-reserved" aria-hidden><span className="oiu-thinking__head"><Brain className="size-3.5" aria-hidden /> {LABEL.thinking}</span></div>)}
    {live && st.prompt && <PromptCard prompt={st.prompt} sessionId={st.sessionId} onAnswer={(text) => { setStream({ prompt: null }, true); void processMessage({ role: "user", content: text }); }} />}
    {live && !liveText && <WorkingBand on={st.filler} tick={st.fillerTick} phase={st.detail} />}
    {(liveText || (live && st.phase === "answering")) && (
      <div className="oiu-assistant oiu-assistant--streaming" aria-live="polite" aria-busy="true" data-testid="assistant-streaming">
        <div className="oiu-assistant__avatar" aria-hidden><Bot className="size-4" strokeWidth={2} /></div>
        <div className="oiu-assistant__body">
          {/* Rail + live badge sit ABOVE the growing text so streaming never pushes a layout box that is already painted (CLS ≈ 0). */}
          <AnswerBadge meta={{ pluginIds: st.pluginIds, firstTokenMs: st.firstTokenMs, firstStatusMs: st.firstStatusMs, totalMs: null, metrics: null }} live />
          <SourceList sources={railSources} live streamingNow />
          <div className="oiu-answer-stage"><CitedMarkdown text={liveText} known={st.error?.code === "plugin_error" ? [] : st.sources} streaming onCites={setLiveCites} /></div>
        </div>
      </div>
    )}
  </>);
};
