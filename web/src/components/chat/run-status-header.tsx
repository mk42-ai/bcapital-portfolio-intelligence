"use client";
/**
 * a1 — RunStatusHeader: ONE state-machine header anchored at the TOP of the run panel (directly under RunHeader).
 * Replaces the floating "Working · … · +17.4 s" band that used to sit between tool rows and the Outputs row
 * (owner evidence: docs/owner-evidence/pass-3/interleaved-working-row-895x89.png, gray-P-plugin-icon-751x183.png).
 *
 * states: thinking → working → done | failed. Fixed 56px height (zero CLS); brand green only; reduced-motion → static dots.
 * The Outputs summary ("1 step · 1 call") lives here as a trailing chip that toggles the OutputsCard body rendered below.
 */
import { BrandIcon } from "@/components/ui/brand-icon";
import type { BrandIconName } from "@/lib/brand-icons";
import "./run-status-header.css";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Wrench } from "lucide-react";

export type RunStatusState = "thinking" | "working" | "done" | "failed";

export type RunStatusHeaderProps = {
  state: RunStatusState;
  /** Bold label; defaults per state ("Thinking" / "Working" / "Done" / "Needs attention"). */
  label?: string;
  /** Muted task text — current step title, running tool label or plan objective (ellipsised). */
  task?: string;
  /** Frozen elapsed (ms). Used when not live, or when `startedAt` is absent. */
  elapsedMs: number;
  /** Ticks from `startedAt` every 250 ms while true; frozen at `elapsedMs` after. */
  live: boolean;
  /** Epoch ms the run started — enables the live ticker. */
  startedAt?: number;
  /** Plan progress (optional) — shown as "2/4" next to the label when stepsTotal > 0. */
  stepsDone?: number;
  stepsTotal?: number;
  /** Outputs summary chip: number of steps that made at least one call, and the call count. */
  outputSteps?: number;
  calls?: number;
  /** When provided (and there is something to show) the trailing Outputs chip is rendered and toggles the OutputsCard body. */
  onToggleOutputs?: () => void;
  outputsOpen?: boolean;
  /** Force the chip even when calls === 0 (e.g. only a planner payload exists). */
  hasOutputs?: boolean;
  /** Brand icon (2026-10-11 flat-line set) for the running tool/operation — the mini icon left of the task text. */
  icon?: BrandIconName | null;
};

const DEFAULT_LABEL: Record<RunStatusState, string> = { thinking: "Thinking", working: "Working", done: "Done", failed: "Needs attention" };

const fmtElapsed = (ms: number) => (ms < 60_000 ? `+${(ms / 1000).toFixed(1)} s` : `+${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)} s`);

export function RunStatusHeader(p: RunStatusHeaderProps) {
  const { state, live, startedAt, elapsedMs } = p;
  const ticking = live && !!startedAt && (state === "thinking" || state === "working");
  const [now, setNow] = useState(() => Date.now());
  // Interval-driven (not frame-driven) so the ticker keeps moving on heartbeat-only stretches; stops the moment the run settles.
  useEffect(() => { if (!ticking) return; setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, [ticking]);
  const ms = ticking ? Math.max(0, now - (startedAt as number)) : Math.max(0, elapsedMs);
  const label = p.label ?? DEFAULT_LABEL[state];
  const pulsing = live && (state === "thinking" || state === "working");
  const outputSteps = p.outputSteps ?? 0; const calls = p.calls ?? 0;
  const showChip = !!p.onToggleOutputs && (p.hasOutputs || calls > 0);
  const chipText = calls > 0 ? `${outputSteps} step${outputSteps === 1 ? "" : "s"} · ${calls} call${calls === 1 ? "" : "s"}` : "payload";
  const progress = p.stepsTotal && p.stepsTotal > 0 ? `${Math.min(p.stepsDone ?? 0, p.stepsTotal)}/${p.stepsTotal}` : null;
  return (
    <div className={`rsh rsh--${state}${pulsing ? " rsh--live" : ""}`} role="status" aria-live="polite" aria-atomic="true"
      data-testid="run-status-header" data-state={state} data-live={pulsing ? "true" : "false"} data-ms={Math.round(ms)}>
      <span className="rsh__ind" aria-hidden>
        {state === "done" ? <Check className="size-3.5" /> : state === "failed" ? <AlertTriangle className="size-3.5" /> : <span className="rsh__dots"><span /><span /><span /></span>}
      </span>
      <span className="rsh__main">
        <span className="rsh__label" data-testid="run-status-label">{label}{progress && <span className="rsh__progress" title="Plan steps done"> {progress}</span>}</span>
        {p.task ? <span className="rsh__task" data-testid="run-status-task" title={p.task}>{p.icon && <BrandIcon name={p.icon} size={14} slot="run-status" className="rsh__icon" />}{p.task}</span> : null}
      </span>
      {showChip && (
        <button type="button" className="rsh__chip" data-testid="run-status-outputs" aria-expanded={!!p.outputsOpen} aria-label={`Outputs · ${chipText}`} onClick={p.onToggleOutputs}>
          <Wrench className="size-3" aria-hidden /><span>{chipText}</span><ChevronDown className={`size-3 rsh__chev${p.outputsOpen ? " rsh__chev--open" : ""}`} aria-hidden />
        </button>
      )}
      <span className="rsh__elapsed" data-testid="run-status-elapsed" data-state={ticking ? "running" : "frozen"}>{fmtElapsed(ms)}</span>
    </div>
  );
}
