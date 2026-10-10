"use client";
/**
 * 52 px chat top bar (Agent 20). Left→right: thread title (thread bus) · model pill · Plan/Run segmented toggle (ui-store `tab`,
 * Run shows the live phase while a run streams) · freshness dot · live run readout (elapsed · tokens, mount-gated, ≤2×/s) · inspector
 * toggle (ui-store `inspectorOpen`). Styles live in top-bar.css (8 px grid, brand green for active states only).
 */
import { useEffect, useState } from "react";
import { PanelRight, Sparkles } from "lucide-react";
import "./top-bar.css";
import { MODEL_LABEL, MODEL_ID, REASONING_MODE } from "@/lib/plugins";
import { useThreadBus } from "@/components/chat/open-intelligent-ui/thread-bus";
import { setUi, useUi } from "@/components/chat/open-intelligent-ui/ui-store";
import { useStreamSelector, type StreamPhase } from "@/components/chat/open-intelligent-ui/stream-store";

const PHASE_SHORT: Record<StreamPhase, string> = { idle: "", connecting: "connecting…", planning: "planning…", researching: "searching…", answering: "writing…", "awaiting-input": "waiting…" };
const TICK_MS = 500; // ≤ 2 updates / s

const tokensOf = (m: Record<string, number> | null) => {
  if (!m) return null;
  const v = m.totalTokens ?? m.total_tokens ?? m.tokens ?? (m.inputTokens != null || m.outputTokens != null ? (m.inputTokens ?? 0) + (m.outputTokens ?? 0) : undefined);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

function formatFetched(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** "12.3 s · 1,204 tokens" while a run is live. Mount-gated (Date.now()) and ticked at 2 Hz. */
function RunReadout() {
  const phase = useStreamSelector((s) => s.phase);
  const startedAt = useStreamSelector((s) => s.startedAt);
  const metrics = useStreamSelector((s) => s.metrics);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const live = phase !== "idle";
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [live]);
  if (!mounted || !live) return null;
  const secs = startedAt > 0 && now > 0 ? Math.max(0, (now - startedAt) / 1000) : 0;
  const tokens = tokensOf(metrics);
  return (
    <span className="chat-topbar__readout" data-testid="run-readout" aria-live="off" aria-label="Run elapsed time and tokens">
      {secs.toFixed(1)} s{tokens != null && <> · {tokens.toLocaleString("en-US")} tokens</>}
    </span>
  );
}

export function ChatTopBar({ fetchedAt, source }: { fetchedAt?: string; source?: "live" | "snapshot" }) {
  const bus = useThreadBus();
  const ui = useUi();
  const phase = useStreamSelector((s) => s.phase);
  const title = (bus.selectedId && bus.threads.find((t) => t.id === bus.selectedId)?.title) || "New chat";
  const phaseText = PHASE_SHORT[phase];
  const fetched = formatFetched(fetchedAt);
  const src = source ?? "live";
  return (
    <header className="chat-topbar" data-testid="chat-topbar" role="toolbar" aria-label="Chat">
      <h1 className="chat-topbar__title" data-testid="thread-title" title={title}>{title}</h1>

      <span className="chat-topbar__model" data-testid="model-pill" data-model-id={MODEL_ID} title={`${MODEL_LABEL} · reasoning ${REASONING_MODE}`} aria-label={`Model ${MODEL_LABEL}, reasoning ${REASONING_MODE}`}>
        <Sparkles className="chat-topbar__model-icon" aria-hidden />
        <span className="chat-topbar__model-text">{MODEL_LABEL} · reasoning {REASONING_MODE}</span>
      </span>

      <div className="chat-topbar__tabs" role="tablist" aria-label="Run view" data-testid="plan-run-toggle">
        <button type="button" role="tab" id="chat-tab-plan" data-testid="tab-plan" aria-selected={ui.tab === "plan"} onClick={() => setUi({ tab: "plan" })}>Plan</button>
        <button type="button" role="tab" id="chat-tab-run" data-testid="tab-run" aria-selected={ui.tab === "run"} onClick={() => setUi({ tab: "run" })}>
          Run{phaseText && <span className="chat-topbar__phase" data-testid="run-phase">{phaseText}</span>}
        </button>
      </div>

      <RunReadout />

      <span className="chat-topbar__fresh" data-testid="freshness-dot" data-source={src} role="img" title={fetched ? `${src === "snapshot" ? "Cached snapshot" : "Live backend"} · fetched ${fetched}` : src === "snapshot" ? "Cached snapshot" : "Live backend"} aria-label={src === "snapshot" ? "cached snapshot" : "live backend"} />

      <button type="button" className="chat-topbar__inspector" data-testid="inspector-toggle" aria-expanded={ui.inspectorOpen} aria-controls="chat-inspector" onClick={() => setUi({ inspectorOpen: !ui.inspectorOpen })} title="This run">
        <PanelRight className="size-4" aria-hidden />
        <span className="sr-only">Toggle inspector</span>
      </button>
    </header>
  );
}
