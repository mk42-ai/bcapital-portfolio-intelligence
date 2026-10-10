"use client";
/**
 * Right inspector as a slide-over drawer ≤360 px (Agent 24), toggled from the top bar (ui-store `inspectorOpen`); closed by default on
 * mobile (<1024) and on first desktop visit. Escape closes; focus moves into the drawer on open and back to the toggle on close;
 * aria-modal only on mobile (mount-gated so SSR/hydration match). Holds "This run" (model, plugin chips, Plan SUMMARY that jumps to the
 * in-thread #run-plan — never a second rendering of the steps), one telemetry line, ONE <details data-testid="dev-disclosure">, and the
 * PitchBook panel (PitchbookRail with server `initial` records; Agent 25 owns its body).
 */
import "./inspector.css";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { setUi, useUi } from "@/components/chat/open-intelligent-ui/ui-store";
import { RunRail } from "@/components/chat/run-rail";
import { PitchbookRail } from "@/components/chat/pitchbook-rail";
import type { PitchbookResponse } from "@/lib/types";

const MOBILE_MQ = "(max-width: 1023px)";

export function InspectorDrawer({ companies, pitchbook }: { companies: { slug: string; name: string }[]; pitchbook?: Record<string, PitchbookResponse | null> }) {
  const ui = useUi();
  const open = ui.inspectorOpen;
  const ref = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const [mobile, setMobile] = useState(false);

  // Mount-gated viewport check (hydration safety) — drives aria-modal only.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Focus in on open, back to the top-bar toggle on close; Escape closes while open.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const t = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 0);
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); setUi({ inspectorOpen: false }); } };
      document.addEventListener("keydown", onKey);
      return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey); };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      const toggle = document.querySelector<HTMLElement>('[data-testid="inspector-toggle"]');
      toggle?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <aside
      ref={ref}
      id="chat-inspector"
      className="chat-inspector"
      data-testid="chat-inspector"
      data-open={open ? "true" : "false"}
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile && open ? true : undefined}
      aria-label="This run"
      aria-hidden={!open}
      tabIndex={-1}
      inert={!open ? true : undefined}
    >
      <div className="chat-inspector__head">
        <span className="chat-inspector__title">This run</span>
        <button type="button" className="chat-inspector__close" data-testid="inspector-close" aria-label="Close inspector" onClick={() => setUi({ inspectorOpen: false })}><X className="size-4" aria-hidden /></button>
      </div>
      <div className="chat-inspector__body">
        <RunRail />
        <PitchbookRail companies={companies} initial={pitchbook} />
      </div>
    </aside>
  );
}
