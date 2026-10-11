"use client";
import { Card } from "@/components/ui/card";
import { WhyInteractive } from "@/components/chat/why-interactive";
import { useStreamState } from "@/components/chat/open-intelligent-ui/chat-shell";
import { MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { PluginChip } from "@/components/ui/plugin-favicon";
import { pluginName } from "@/lib/plugin-catalogue";

/**
 * "This run" card inside the inspector drawer (model row, plugin chips, agent events). Telemetry and the raw SSE request frame
 * live behind ONE reveal (<details data-testid=dev-disclosure>) — the only developer disclosure in the chat UI.
 * Everything here is fed by the same live store the chat shell tees from the SSE body; nothing is fetched client-side.
 */
export function RunRail() {
  const st = useStreamState();
  const live = st.phase !== "idle";
  const plugins = st.pluginIds.length ? st.pluginIds : [];
  return (
    <Card className="p-3" data-testid="run-rail">
      <h2 className="mb-2 text-sm font-semibold">This run</h2>
      <p className="text-xs text-muted" data-testid="run-model" data-model-id={MODEL_ID}><span className="font-medium text-foreground">{MODEL_LABEL}</span> · reasoning {REASONING_MODE}</p>
      {plugins.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Plugins in this run" data-testid="run-plugins">
          {plugins.map((id) => { const failed = st.error?.code === "plugin_error" && id === "plugin-1722260873"; const done = st.answerDone || st.sources.length > 0; const state = failed ? "failed" : done ? "done" : live && (st.phase === "researching" || st.phase === "answering" || st.phase === "planning") ? "running" : "queued"; return <li key={id}><PluginChip id={id} state={state} input={st.request ? `${pluginName(id)} · ${String((st.request.body as Record<string, unknown> | undefined)?.queryChars ?? "")} chars query` : undefined} raw={failed ? st.error?.raw : undefined} /></li>; })}
        </ul>
      )}
      {/* Plan checklist intentionally NOT here: it lives only in the run view (data-testid=run-view, plan-stepper). */}
      {st.agentLog.length > 0 && (
        <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Agent events ({st.agentLog.length})</summary>
          <ul className="mt-1 space-y-0.5 text-muted">{st.agentLog.slice(-12).map((a, i) => <li key={i}><code>{a.subtype}</code> · {(a.at / 1000).toFixed(1)} s</li>)}</ul>
        </details>
      )}
      {/* ONE reveal for everything developer-facing: telemetry (first event / first token / tokens / stream integrity) + the raw SSE request frame. */}
      <details className="mt-3" data-testid="dev-disclosure">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-muted hover:text-foreground">Telemetry &amp; raw SSE frame</summary>
        <p className="mt-1 text-[11px] text-muted" data-testid="rail-metrics">
          {st.metrics?.totalTokens != null ? `${st.metrics.totalTokens.toLocaleString()} tokens` : "tokens —"} · first event {st.firstStatusMs ?? "—"} ms · tools {st.toolsMs != null ? `${(st.toolsMs / 1000).toFixed(1)} s` : "—"} · first token {st.firstTokenMs?.toLocaleString() ?? "—"} ms · answer {st.answerMs != null ? `${(st.answerMs / 1000).toFixed(1)} s` : "—"}
          {st.integrity ? ` · ${st.integrity.frames} frames` : ""}
        </p>
        {st.integrity && (st.integrity.dupes > 0 || st.integrity.gaps > 0) && <p className="mt-1 text-[10px] text-muted" data-testid="rail-integrity">stream integrity: {st.integrity.dupes} duplicate frame{st.integrity.dupes === 1 ? "" : "s"} dropped · {st.integrity.gaps} gap{st.integrity.gaps === 1 ? "" : "s"}</p>}
        <p className="mt-1 font-mono text-[10px] text-muted" data-testid="dev-ids">model {MODEL_ID} · plugins {plugins.join(", ") || "—"}{st.attachments ? ` · attachments ${st.attachments.length}` : ""}{st.voice ? ` · voice ${st.voice.phase}` : ""}</p>
        <WhyInteractive className="mt-2" />{/* a49: developer explainer lives only behind this reveal */}
        <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-surface-2 p-2 text-[10.5px] leading-snug" data-testid="request-body">{st.request ? JSON.stringify(st.request.body, null, 2) : "No run yet — the raw SSE request frame appears here after the first message."}</pre>
      </details>
    </Card>
  );
}
