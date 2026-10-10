"use client";
import { CheckCircle2, Circle, ListChecks, Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useStreamState } from "@/components/chat/open-intelligent-ui/chat-shell";
import { MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { PluginChip } from "@/components/ui/plugin-favicon";
import { pluginName } from "@/lib/plugin-catalogue";

/**
 * Agent rail for the current run (model row, plugin chips, plan checklist; raw request only inside the "show raw frame" developer disclosure).
 * Everything here is fed by the same live store the chat shell tees from the SSE body; nothing is fetched client-side.
 */
export function RunRail() {
  const st = useStreamState();
  const live = st.phase !== "idle";
  const plugins = st.pluginIds.length ? st.pluginIds : [];
  return (
    <Card className="p-4 lg:min-h-[300px]" data-testid="run-rail">
      <h2 className="mb-2 text-sm font-semibold">This run</h2>
      <p className="text-xs text-muted" data-testid="run-model" data-model-id={MODEL_ID}><span className="font-medium text-foreground">{MODEL_LABEL}</span> · reasoning {REASONING_MODE}</p>
      {plugins.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Plugins in this run" data-testid="run-plugins">
          {plugins.map((id) => { const failed = st.error?.code === "plugin_error" && id === "plugin-1722260873"; const done = st.answerDone || st.sources.length > 0; const state = failed ? "failed" : done ? "done" : live && (st.phase === "researching" || st.phase === "answering" || st.phase === "planning") ? "running" : "queued"; return <li key={id}><PluginChip id={id} state={state} input={st.request ? `${pluginName(id)} · ${String((st.request.body as Record<string, unknown> | undefined)?.queryChars ?? "")} chars query` : undefined} raw={failed ? st.error?.raw : undefined} /></li>; })}
        </ul>
      )}
      {st.plan && (st.plan.objective || st.plan.steps.length > 0) && (
        <section className="mt-3" data-testid="rail-plan" aria-label="Plan">
          <p className="flex items-center gap-1.5 text-xs font-semibold"><ListChecks className="size-3.5" aria-hidden /> Plan</p>
          {st.plan.objective && <p className="mt-1 text-xs text-muted">{st.plan.objective}</p>}
          <ol className="mt-1 space-y-1 text-xs">{st.plan.steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-1.5" data-testid="rail-plan-step" data-state={s.state}>
              <span className={s.state === "done" ? "text-[var(--brand-green-ink)]" : s.state === "failed" ? "text-danger" : "text-muted"} aria-hidden>{s.state === "done" ? <CheckCircle2 className="size-3.5" /> : s.state === "failed" ? <XCircle className="size-3.5" /> : s.state === "running" ? <Loader2 className="size-3.5 oiu-spin" /> : <Circle className="size-3.5" />}</span>
              <span className={s.state === "running" ? "font-medium" : ""}>{i + 1}. {s.title}</span>
            </li>))}</ol>
        </section>
      )}
      {st.agentLog.length > 0 && (
        <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Agent events ({st.agentLog.length})</summary>
          <ul className="mt-1 space-y-0.5 text-muted">{st.agentLog.slice(-12).map((a, i) => <li key={i}><code>{a.subtype}</code> · {(a.at / 1000).toFixed(1)} s</li>)}</ul>
        </details>
      )}
      {st.integrity && (st.integrity.dupes > 0 || st.integrity.gaps > 0) && <p className="mt-2 text-[10px] text-muted" data-testid="rail-integrity">stream integrity: {st.integrity.dupes} duplicate frame{st.integrity.dupes === 1 ? "" : "s"} dropped · {st.integrity.gaps} gap{st.integrity.gaps === 1 ? "" : "s"}</p>}
      {st.metrics && (
        <p className="mt-3 text-[11px] text-muted" data-testid="rail-metrics">{st.metrics.totalTokens?.toLocaleString()} tokens · first event {st.firstStatusMs ?? "—"} ms · first token {st.firstTokenMs?.toLocaleString() ?? "—"} ms</p>
      )}
      {st.request && (
        <details className="mt-2" data-testid="dev-disclosure">
          <summary className="cursor-pointer select-none text-[10px] text-muted">show raw frame</summary>
          <p className="mt-1 font-mono text-[10px] text-muted" data-testid="dev-ids">model {MODEL_ID} · plugins {plugins.join(", ") || "—"}{st.attachments ? ` · attachments ${st.attachments.length}` : ""}{st.voice ? ` · voice ${st.voice.phase}` : ""}</p>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-surface-2 p-2 text-[10.5px] leading-snug" data-testid="request-body">{JSON.stringify(st.request.body, null, 2)}</pre>
        </details>
      )}
    </Card>
  );
}
