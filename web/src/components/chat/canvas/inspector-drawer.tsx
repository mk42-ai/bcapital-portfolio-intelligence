"use client";
/**
 * Right inspector as a slide-over drawer ≤360 px (Agent 24), toggled from the top bar; closed by default on mobile. Holds "This run"
 * (model, plugin chips, Plan — REFERENCING the in-thread plan via a jump link, never a second rendering), telemetry, and the PitchBook
 * panel for the first context company. Plugin ids / token counts / first-event & first-token latency / raw frame sit behind ONE
 * <details data-testid="dev-disclosure"> reveal. SKELETON — Agent 24 implements; Agent 25/26 own the PitchBook body it embeds.
 */
import { X } from "lucide-react";
import { setUi, useUi } from "@/components/chat/open-intelligent-ui/ui-store";
import { RunRail } from "@/components/chat/run-rail";
import { PitchbookRail } from "@/components/chat/pitchbook-rail";
import type { PitchbookResponse } from "@/lib/types";

export function InspectorDrawer({ companies, pitchbook }: { companies: { slug: string; name: string }[]; pitchbook?: Record<string, PitchbookResponse | null> }) {
  const ui = useUi();
  return (
    <aside id="chat-inspector" className="chat-inspector" data-testid="chat-inspector" data-open={ui.inspectorOpen ? "true" : "false"} aria-label="This run" aria-hidden={!ui.inspectorOpen}>
      <div className="chat-inspector__head"><span className="chat-inspector__title">This run</span><button type="button" className="chat-inspector__close" data-testid="inspector-close" aria-label="Close inspector" onClick={() => setUi({ inspectorOpen: false })}><X className="size-4" aria-hidden /></button></div>
      <div className="chat-inspector__body">
        <RunRail />
        <PitchbookRail companies={companies} initial={pitchbook} />
      </div>
    </aside>
  );
}
