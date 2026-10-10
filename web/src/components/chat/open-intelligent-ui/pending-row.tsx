"use client";
/** Live-phase row, shown IMMEDIATELY after send (isRunning) until the first answer token, with an elapsed counter. Portaled into OpenUI's bottom loader slot. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useThread } from "@openuidev/react-ui";
import { Loader2 } from "lucide-react";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import { PHASE_LABEL, useStreamState } from "./stream-store";

export function PendingRow() {
  const isRunning = useThread((s) => s.isRunning); const st = useStreamState();
  const [host, setHost] = useState<HTMLElement | null>(null); const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) { setHost(null); return; }
    const find = () => document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-message-loading");
    const h = find(); if (h) { setHost(h); }
    const mo = new MutationObserver(() => { const x = find(); if (x) setHost((prev) => (prev === x ? prev : x)); });
    mo.observe(document.body, { childList: true, subtree: true });
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { mo.disconnect(); clearInterval(tick); };
  }, [isRunning]);
  if (!isRunning || !host || st.firstTokenMs != null) return null;
  const secs = st.startedAt ? Math.max(0, (now - st.startedAt) / 1000) : 0;
  const label = st.detail || PHASE_LABEL.connecting;
  return createPortal(
    <p className="oiu-activity oiu-activity--pending" role="status" data-phase={st.phase || "connecting"} data-testid="pending-row" data-first-status-ms={st.firstStatusMs ?? ""}>
      <Loader2 className="size-3.5 oiu-spin" aria-hidden />
      <span className="oiu-activity__phase">{label}</span>
      {st.suggested.length > 0 && <span className="oiu-activity__chips" data-testid="suggested-plugins">{st.suggested.slice(0, 6).map((p) => <PluginFavicon key={p.id} id={p.id} size={16} />)}</span>}
      <span className="oiu-activity__elapsed">{secs.toFixed(1)} s{st.firstStatusMs != null ? ` · first event ${st.firstStatusMs} ms` : ""}</span>
    </p>, host);
}

