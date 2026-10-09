import dynamic from "next/dynamic";
import type { CompanySentiment } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtScore, fmtDelta } from "@/lib/format";
const SentimentLine = dynamic(() => import("@/components/charts/sentiment-line"), { loading: () => <Skeleton className="h-56 w-full" /> });
export function SentimentPanel({ s }: { s: CompanySentiment }) {
  const data = [...s.history].reverse().map((h) => ({ t: h.recorded_at, score: h.score, model: h.model }));
  const ev = s.current.evidence ?? [];
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-display text-3xl font-semibold tabular-nums">{fmtScore(s.current.score)}</span><Badge tone={s.current.score >= 0.2 ? "primary" : s.current.score <= -0.2 ? "danger" : "muted"}>{s.current.label}</Badge><span className="text-muted">Δ vs previous run {fmtDelta(s.delta)}</span></p>
      {data.length > 1 ? <SentimentLine data={data} ariaLabel={`Sentiment timeline for ${s.name} across ${data.length} workflow runs`} /> : <p className="text-sm text-muted">Only one scored run so far — the timeline fills in after tomorrow's 06:00 UTC workflow.</p>}
      <div><h3 className="mb-2 text-sm font-semibold">Evidence (LinkedIn / Reddit / X / news)</h3>
        {ev.length ? <ul className="space-y-2">{ev.slice(0, 6).map((e, i) => <li key={i} className="rounded-lg border border-border bg-surface-2 p-2 text-sm"><q className="text-foreground">{e.quote}</q>{e.url && <> — <a href={e.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary-soft underline-offset-2 hover:underline">{e.url.replace(/^https?:\/\//, "").slice(0, 60)}</a></>}</li>)}</ul> : <p className="text-sm text-muted">No cited evidence yet.</p>}
      </div>
      <details className="text-xs text-muted"><summary className="cursor-pointer">Run history ({s.history.length})</summary><ul className="mt-2 space-y-1">{s.history.map((h, i) => <li key={i} className="tabular-nums">{h.recorded_at} · {fmtScore(h.score)} · Δ {fmtDelta(h.delta)} · {h.model ?? "seed"}{h.workflow_id && ` · wf ${h.workflow_id}`}</li>)}</ul></details>
    </div>
  );
}
