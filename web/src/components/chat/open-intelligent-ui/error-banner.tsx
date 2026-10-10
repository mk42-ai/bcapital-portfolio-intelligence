"use client";
/**
 * Inline failure state (Agent 18). A Perplexity credit shortage ("not enough credits") must NOT be a red card here — it is reported ONCE as the
 * Settings status banner (components/shell/perplexity-status.tsx); this banner keeps the neutral, retryable copy for genuine run failures.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useThread } from "@openuidev/react-ui";
import type { UserMessage } from "@openuidev/react-headless";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { PLUGIN_NAME } from "@/lib/plugins";
import { useStreamState } from "./stream-store";

/** Perplexity credit shortage on the OnDemand account — reported once in Settings, only a compact pointer here. */
export const NO_CREDITS_RE = /not enough credits|insufficient credits|quota/i;

/** Visible, retryable error state: typed upstream error from the bridge (CUSTOM ondemand.error / RUN_ERROR) or a failed request. */
export function ErrorBanner() {
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
  if (code === "plugin_error" && NO_CREDITS_RE.test(message)) {
    return createPortal(
      <p className="oiu-plugin-status" data-testid="plugin-status-line" data-reason="no_credits" data-error-code={code}>
        {PLUGIN_NAME} is out of credits — see <a href="/settings">Settings → Plugins</a>
        {lastUser && <button type="button" className="oiu-plugin-status__retry" onClick={retry}><RotateCcw className="size-3" aria-hidden /> Retry</button>}
      </p>, host);
  }
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

