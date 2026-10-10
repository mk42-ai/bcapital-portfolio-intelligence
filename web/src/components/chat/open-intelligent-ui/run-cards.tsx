"use client";
/**
 * Per-run cards rendered inside the thread: provenance badge, thinking trace, plan stepper, step-summary checkpoint, working band, raw frame.
 * The inspector drawer (Agent 24) REFERENCES the plan rendered here — it never renders a second copy.
 */
import { useEffect, useMemo, useState } from "react";
import { Brain, CheckCircle2, ChevronDown, Circle, Cpu, ListChecks, Loader2, Sparkles, XCircle } from "lucide-react";
import type { StoredMeta } from "./local-storage";
import { PLUGIN_ID, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { LABEL } from "@/lib/ondemand/eventMap";
import { pluginName as catalogueName } from "@/lib/plugin-catalogue";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import type { PlanStep, StepSummary } from "./stream-store";

/** Per-answer provenance badge: model · reasoning mode · plugins · first-event / first-token / total ms · tokens. */
export function AnswerBadge({ meta, live }: { meta: Partial<StoredMeta> | null; live?: boolean }) {
  const ftt = meta?.firstTokenMs ?? null; const fe = meta?.firstStatusMs ?? null; const total = meta?.totalMs ?? null;
  const plugins = meta?.pluginIds?.length ? meta.pluginIds : [PLUGIN_ID];
  return (
    <p className="oiu-badge" data-testid="answer-badge" data-first-token-ms={ftt ?? ""} data-first-event-ms={fe ?? ""} data-total-ms={total ?? ""} aria-label="Answer provenance">
      <Cpu className="size-3" aria-hidden /><span>{MODEL_LABEL}</span><span className="oiu-badge__sep">·</span><span>{REASONING_MODE}</span>
      <span className="oiu-badge__sep">·</span><span className="oiu-badge__plugins">{plugins.map((id) => <span key={id} className="oiu-badge__plugin" title={catalogueName(id)}><PluginFavicon id={id} size={16} /><code>{id}</code></span>)}</span>
      <span className="oiu-badge__sep">·</span><span>{fe != null ? `first event ${fe} ms` : "first event …"}</span>
      <span className="oiu-badge__sep">·</span><span>{ftt != null ? `first token ${ftt.toLocaleString()} ms` : live ? "first token …" : "first token n/a"}</span>
      {total != null && <><span className="oiu-badge__sep">·</span><span>total {(total / 1000).toFixed(1)} s</span></>}
      {meta?.metrics?.totalTokens != null && <><span className="oiu-badge__sep">·</span><span>{meta.metrics.totalTokens.toLocaleString()} tokens</span></>}
    </p>
  );
}
/** Collapsible reasoning trace — virtualised: only the last ~40 lines are in the DOM while collapsed/streaming; full text on demand. */
export function ThinkingTrace({ text, kinds, live }: { text: string; kinds?: string[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useMemo(() => `oiu-think-${Math.random().toString(36).slice(2, 8)}`, []);
  const lines = useMemo(() => text.split("\n"), [text]);
  if (!text.trim()) return null;
  const shown = open ? lines.slice(-400) : lines.slice(-40);
  return (
    <div className={`oiu-thinking${open ? " oiu-thinking--open" : ""}`} data-testid="thinking-trace" data-lines={lines.length}>
      <button type="button" className="oiu-thinking__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Brain className="size-3.5" aria-hidden /><span>{LABEL.thinking}</span>{kinds?.length ? <span className="sr-only">{kinds.join(", ")}</span> : null}<span className="oiu-thinking__len">{text.length.toLocaleString()} chars</span><ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div id={id} className="oiu-thinking__panel" aria-hidden={!open}><div className="oiu-thinking__inner"><pre className="oiu-thinking__pre">{open ? shown.join("\n") : shown.slice(-6).join("\n")}</pre></div></div>
    </div>
  );
}
/** Plan stepper (plan_created / step start / done / failed). */
export function PlanStepper({ plan, reserve }: { plan: { objective: string | null; steps: PlanStep[]; provisional?: boolean } | null; reserve?: boolean }) {
  if (!plan || (!plan.objective && !plan.steps.length)) {
    // Reserved slot while the planner is still streaming its JSON: same box (border + min-height) the real stepper will occupy, so the
    // plan arriving does not push the plugin cards / thinking trace / working band down (the 0.10 CLS spike at plan_created on mobile).
    return reserve ? <section className="oiu-plan oiu-plan--reserved" data-testid="plan-stepper" data-state="pending" aria-label="Execution plan"><p className="oiu-plan__title"><ListChecks className="size-3.5" aria-hidden />Planning…</p><div className="oiu-shimmer oiu-shimmer--plan" aria-hidden><span /><span /></div></section> : null;
  }
  return (
    <section className="oiu-plan" data-testid="plan-stepper" data-state={plan.provisional ? "provisional" : "ready"} aria-label="Execution plan">
      <p className="oiu-plan__title"><ListChecks className="size-3.5" aria-hidden />{plan.objective || "Execution plan"}{plan.provisional && <span className="oiu-plan__prov" title="Steps are still streaming in">drafting…</span>}</p>
      {plan.steps.length > 0 && <ol className="oiu-plan__steps">{plan.steps.map((s, i) => (
        <li key={s.id} className={`oiu-plan__step oiu-plan__step--${s.state}`} data-testid="plan-step" data-state={s.state}>
          <span className="oiu-plan__icon" aria-hidden>{s.state === "done" ? <CheckCircle2 className="size-3.5" /> : s.state === "failed" ? <XCircle className="size-3.5" /> : s.state === "running" ? <Loader2 className="size-3.5 oiu-spin" /> : <Circle className="size-3.5" />}</span>
          <span className="oiu-plan__label">{i + 1}. {s.title}</span>
          {s.plugins?.length ? <span className="oiu-plan__plugins">{s.plugins.map((p) => <span key={p} className="oiu-plan__plugin">{p}</span>)}</span> : null}
        </li>))}</ol>}
    </section>
  );
}
/** Checkpoint card between steps: shimmer while summarising, then the agentic summary (collapsible, timestamped). */
export function StepSummaryCard({ s, live }: { s: StepSummary; live?: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (!live && s.state === "done") setOpen(false); }, [live, s.state]);
  return (
    <section className={`oiu-summary oiu-summary--${s.state}`} data-testid="step-summary" data-index={s.index} data-state={s.state} aria-live="polite">
      <button type="button" className="oiu-summary__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {s.state === "pending" ? <Loader2 className="size-3.5 oiu-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
        <span>{s.state === "pending" ? LABEL.summarising(s.index) : `Step ${s.index} · summary`}</span>
        {s.doneAt && <time className="oiu-summary__time" dateTime={s.doneAt}>{new Date(s.doneAt).toISOString().slice(11, 19)} UTC</time>}
        <ChevronDown className="size-3.5 oiu-thinking__chev" aria-hidden />
      </button>
      <div className={`oiu-summary__panel${open ? " oiu-summary__panel--open" : ""}`}><div className="oiu-summary__inner">{s.state === "pending" ? <div className="oiu-shimmer" aria-hidden><span /><span /><span /></div> : <p>{s.text || "No summary text was emitted for this step."}</p>}</div></div>
    </section>
  );
}
/** Reserved-height stage slot under the activity cards. While the bridge's stall watchdog reports >600 ms of silence it shows the animated
 *  "Working…" band (shimmer + elapsed ticker); otherwise the slot stays empty but keeps its height, so toggling it never shifts layout. */
export function WorkingBand({ on, tick, phase }: { on: boolean; tick: number; phase: string }) {
  const [dots, setDots] = useState(0);
  useEffect(() => { if (!on) return; const id = setInterval(() => setDots((d) => (d + 1) % 4), 400); return () => clearInterval(id); }, [on]);
  return (
    <div className={`oiu-slot oiu-slot--working${on ? " oiu-slot--on" : ""}`} data-testid="working-band" data-on={on ? "true" : "false"} data-tick={tick} role="status" aria-live="polite">
      {on && (<>
        <span className="oiu-working__pulse" aria-hidden><span /><span /><span /></span>
        <span className="oiu-working__label">{LABEL.working.replace(/…$/, "")}{".".repeat(dots)}</span>
        <span className="oiu-working__phase">{phase && phase !== LABEL.working ? phase : "still waiting on OnDemand"}</span>
        <span className="oiu-working__tick" data-testid="stall-tick" aria-hidden>{tick > 0 ? `+${(tick * 0.3).toFixed(1)} s` : ""}</span>
      </>)}
    </div>
  );
}
export function RawFrame({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return <span className="oiu-raw"><button type="button" className="oiu-error__raw-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "hide raw frame" : "show raw frame"}</button>{open && <pre className="oiu-error__raw" data-testid="raw-frame">{raw}</pre>}</span>;
}
