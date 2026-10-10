"use client";
/**
 * Single renderer for interactive prompt cards (awaiting_input / clarification / require_creds / awaiting_browser_action).
 * A prompt can arrive BEFORE any plugin tool call (so the PluginTimeline — which OpenUI only mounts once a tool activity exists — may not
 * be on screen). The card is therefore portalled into OpenUI's live loader slot at the bottom of the thread, which exists for the whole
 * running turn. Answers resume the SAME OnDemand session via resumeSession → POST /chat/v1/sessions/{id}/query.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useThread } from "@openuidev/react-ui";
import { PromptCard } from "./prompt-card";
import { resumeSession } from "./resume";
import { setStream, useStreamState } from "./stream-store";

export function PromptHost() {
  const isRunning = useThread((s) => s.isRunning); const processMessage = useThread((s) => s.processMessage); const cancelMessage = useThread((s) => s.cancelMessage);
  const st = useStreamState();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const show = !!st.prompt; // the prompt outlives the paused stream (upstream may close the SSE while waiting)
  useEffect(() => {
    if (!show) { setHost(null); return; }
    const find = () => (isRunning ? document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-message-loading") : null) ?? document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-messages");
    const h = find(); if (h) setHost(h);
    const mo = new MutationObserver(() => { const x = find(); if (x) setHost((prev) => (prev === x ? prev : x)); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [show, isRunning]);
  if (!show || !host || !st.prompt) return null;
  const prompt = st.prompt;
  return createPortal(
    <div className="oiu-prompt-host" data-testid="prompt-host" data-kind={prompt.kind}>
      <PromptCard prompt={prompt} sessionId={st.sessionId} onAnswer={(text) => { setStream({ prompt: null }, true); void resumeSession(text, { sessionId: st.sessionId, kind: prompt.kind, send: processMessage, cancel: cancelMessage, isRunning }); }} />
    </div>, host);
}
