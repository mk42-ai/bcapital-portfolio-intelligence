"use client";
/**
 * 52 px chat top bar (Agent 20): thread title · model pill · Plan/Run toggle · inspector toggle · freshness dot. Replaces the serif
 * "Analyst chat" page header, the subtitle and the data-source line. Reads the thread title from the thread bus and the tab / drawer
 * state from ui-store. SKELETON — Agent 20 implements the final layout and styles (8 px grid, brand green only).
 */
import { PanelRight } from "lucide-react";
import { MODEL_LABEL, MODEL_ID } from "@/lib/plugins";
import { useThreadBus } from "@/components/chat/open-intelligent-ui/thread-bus";
import { setUi, useUi } from "@/components/chat/open-intelligent-ui/ui-store";

export function ChatTopBar({ fetchedAt, source }: { fetchedAt?: string; source?: "live" | "snapshot" }) {
  const bus = useThreadBus(); const ui = useUi();
  const title = bus.threads.find((t) => t.id === bus.selectedId)?.title ?? "New chat";
  return (
    <header className="chat-topbar" data-testid="chat-topbar" role="toolbar" aria-label="Chat">
      <h1 className="chat-topbar__title" data-testid="thread-title">{title}</h1>
      <span className="chat-topbar__model" data-testid="model-pill" data-model-id={MODEL_ID}>{MODEL_LABEL}</span>
      <div className="chat-topbar__tabs" role="tablist" aria-label="Run view" data-testid="plan-run-toggle">
        <button type="button" role="tab" aria-selected={ui.tab === "plan"} onClick={() => setUi({ tab: "plan" })}>Plan</button>
        <button type="button" role="tab" aria-selected={ui.tab === "run"} onClick={() => setUi({ tab: "run" })}>Run</button>
      </div>
      <span className="chat-topbar__fresh" data-testid="freshness-dot" data-source={source ?? "live"} title={fetchedAt ? `backend fetched ${fetchedAt}` : "backend"} aria-label={source === "snapshot" ? "cached snapshot" : "live backend"} />
      <button type="button" className="chat-topbar__inspector" data-testid="inspector-toggle" aria-expanded={ui.inspectorOpen} aria-controls="chat-inspector" onClick={() => setUi({ inspectorOpen: !ui.inspectorOpen })} title="This run"><PanelRight className="size-4" aria-hidden /><span className="sr-only">Toggle inspector</span></button>
    </header>
  );
}
