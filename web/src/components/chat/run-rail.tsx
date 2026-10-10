"use client";
import { ArrowDownToLine, ListChecks, Plug } from "lucide-react";
import { useStreamState } from "@/components/chat/open-intelligent-ui/chat-shell";
import { useUi } from "@/components/chat/open-intelligent-ui/ui-store";
import { MODEL_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { PluginChip } from "@/components/ui/plugin-favicon";
import { pluginName } from "@/lib/plugin-catalogue";

/**
 * "This run" section of the inspector drawer (Agent 24): model row, plugin chips with state, a Plan SUMMARY ("Plan · N steps · k done"
 * + "Show in thread" → scrolls to #run-plan, the in-thread PlanStepper — the plan is never rendered twice), one telemetry line, and
 * ONE <details data-testid="dev-disclosure"> holding everything developer-ish (plugin ids, token counts, first-event / first-token
 * latency, stream integrity, agent events, raw request frame). Order follows the top-bar Plan/Run toggle: tab = "run" puts the plugin
 * summary first, tab = "plan" puts the plan summary first. Fed only by the live store the chat shell tees from the SSE body.
 */
export const RUN_PLAN_ANCHOR = "run-plan";

function jumpToPlan() {
  // Persisted assistant messages also render their plan (same anchor); the live/last one is the one the summary describes.
  const all = document.querySelectorAll<HTMLElement>(`#${RUN_PLAN_ANCHOR}`);
  const el = all[all.length - 1];
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  if (el instanceof HTMLElement) { if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
}

export function RunRail() {
  const st = useStreamState();
  const { tab } = useUi();
  const live = st.phase !== "idle";
  const plugins = st.pluginIds;
  const body = st.request?.body as Record<string, unknown> | undefined;
  const elapsedS = st.startedAt > 0 && live ? Math.max(0, Math.round((Date.now() - st.startedAt) / 1000)) : null;
  const tokens = st.metrics?.totalTokens;
  const planSteps = st.plan?.steps ?? [];
  const planDone = planSteps.filter((s) => s.state === "done").length;
  const hasPlan = !!st.plan && (!!st.plan.objective || planSteps.length > 0);

  const pluginsBlock = plugins.length > 0 && (
    <section className="run-rail__block" aria-label="Plugins in this run" data-testid="run-plugins-section">
      <p className="run-rail__label"><Plug className="size-3.5" aria-hidden /> Plugins</p>
      <ul className="run-rail__chips" data-testid="run-plugins">
        {plugins.map((id) => {
          const failed = st.error?.code === "plugin_error" && id === "plugin-1722260873";
          const done = st.answerDone || st.sources.length > 0;
          const state = failed ? "failed" : done ? "done" : live && (st.phase === "researching" || st.phase === "answering" || st.phase === "planning") ? "running" : "queued";
          return <li key={id}><PluginChip id={id} state={state} input={st.request ? `${pluginName(id)} · ${String(body?.queryChars ?? "")} chars query` : undefined} raw={failed ? st.error?.raw : undefined} /></li>;
        })}
      </ul>
    </section>
  );

  const planBlock = hasPlan && (
    <section className="run-rail__block" aria-label="Plan" data-testid="rail-plan">
      <div className="run-rail__plan">
        <p className="run-rail__label" style={{ margin: 0 }}><ListChecks className="size-3.5" aria-hidden /> Plan <span className="run-rail__plan-count" data-testid="rail-plan-count">· {planSteps.length} step{planSteps.length === 1 ? "" : "s"} · {planDone} done</span></p>
        <button type="button" className="run-rail__jump" data-testid="rail-plan-jump" onClick={jumpToPlan} aria-controls={RUN_PLAN_ANCHOR}><ArrowDownToLine className="size-3" aria-hidden /> Show in thread</button>
      </div>
    </section>
  );

  const telemetry: string[] = [];
  if (elapsedS !== null) telemetry.push(`${elapsedS} s elapsed`);
  if (typeof tokens === "number") telemetry.push(`${tokens.toLocaleString()} tokens`);

  return (
    <div className="run-rail" data-testid="run-rail" data-tab={tab}>
      <p className="run-rail__model" data-testid="run-model" data-model-id={MODEL_ID}><strong>{MODEL_LABEL}</strong> · reasoning {REASONING_MODE}</p>
      {tab === "run" ? <>{pluginsBlock}{planBlock}</> : <>{planBlock}{pluginsBlock}</>}
      {!live && !hasPlan && !st.request && <p className="run-rail__empty">No run yet — send a message to see plugins, plan and telemetry here.</p>}
      {telemetry.length > 0 && <p className="run-rail__telemetry" data-testid="rail-telemetry">{telemetry.join(" · ")}</p>}
      <details className="run-rail__dev" data-testid="dev-disclosure">
        <summary>Details</summary>
        <div className="run-rail__dev-body">
          <p className="font-mono" data-testid="dev-ids">model {MODEL_ID} · plugins {plugins.join(", ") || "—"}{st.attachments ? ` · attachments ${st.attachments.length}` : ""}{st.voice ? ` · voice ${st.voice.phase}` : ""}</p>
          <p data-testid="rail-metrics">{typeof tokens === "number" ? tokens.toLocaleString() : "—"} tokens · first event {st.firstStatusMs ?? "—"} ms · first token {st.firstTokenMs?.toLocaleString() ?? "—"} ms</p>
          {st.integrity && <p data-testid="rail-integrity">stream integrity: {st.integrity.frames} frames · {st.integrity.dupes} duplicate{st.integrity.dupes === 1 ? "" : "s"} dropped · {st.integrity.gaps} gap{st.integrity.gaps === 1 ? "" : "s"}</p>}
          {st.agentLog.length > 0 && (
            <div data-testid="rail-agent-events">
              <p>Agent events ({st.agentLog.length})</p>
              <ul>{st.agentLog.slice(-12).map((a, i) => <li key={i}><code>{a.subtype}</code> · {(a.at / 1000).toFixed(1)} s</li>)}</ul>
            </div>
          )}
          {st.request ? <pre className="run-rail__dev-pre" data-testid="request-body">{JSON.stringify(st.request.body, null, 2)}</pre> : <p>No request frame yet.</p>}
        </div>
      </details>
    </div>
  );
}
