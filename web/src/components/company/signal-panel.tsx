import type { SignalBands, SignalScore, SignalFactorKey } from "@/lib/types";
import { SignalBullet, PercentileBadge } from "@/components/charts/signal-bullet";
/** Company-page Signal Score panel: lg bullet + percentile pill, <details> factor breakdown (keyboard accessible, no popover lib),
 *  'Why this score' top-3 sources and a one-line evidence summary. Server component. */
const FACTORS: { key: SignalFactorKey; label: string; hint: string }[] = [
  { key: "level", label: "Level", hint: "shrunk mean sentiment, 45%" }, { key: "momentum", label: "Momentum", hint: "7d − 30d, 25%" },
  { key: "volume", label: "Volume", hint: "log evidence volume, 15%" }, { key: "confidence", label: "Confidence", hint: "Wilson lower bound, 15%" },
];
const NEG = "#b91c1c", POS = "rgb(10,201,133)";
const f2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const domain = (u: string | null, fallback: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : (fallback ?? "—"); } catch { return fallback ?? "—"; } };
export function SignalPanel({ s, bands, name }: { s: SignalScore; bands: SignalBands; name: string }) {
  const maxAbs = Math.max(0.05, ...FACTORS.map((f) => Math.abs(s.contributions[f.key] ?? 0)));
  const top = [...(s.top_sources ?? [])].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const ev = s.evidence;
  return (
    <section aria-labelledby="signal-score-h" className="space-y-3" data-testid="signal-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="signal-score-h" className="text-sm font-semibold">Signal Score</h3>
        <PercentileBadge percentile={s.percentile} label={s.label} />
      </div>
      <SignalBullet score={s.score} confidence={s.confidence} percentile={s.percentile} label={s.label} bands={bands} sparkline={s.sparkline} size="lg" name={name} />
      <p className="text-xs text-muted tabular-nums">Sector median {Math.round(bands.sector.median)} (p25–p75 {Math.round(bands.sector.p25)}–{Math.round(bands.sector.p75)}) · portfolio median {Math.round(bands.portfolio.median)} · momentum 7d {signed(s.momentum.d7)} / 30d {signed(s.momentum.d30)} · confidence {f2(s.confidence)}</p>
      <details className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <summary className="cursor-pointer font-medium focus-visible:outline-3 focus-visible:outline-ring">How this score is built</summary>
        <ul className="mt-3 space-y-2" aria-label="Factor contributions (weight × z)">
          {FACTORS.map((f) => { const v = s.contributions[f.key] ?? 0; const w = Math.min(50, (Math.abs(v) / maxAbs) * 50); return (
            <li key={f.key} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2">
              <span><span className="font-medium">{f.label}</span><span className="block text-[11px] leading-tight text-muted">{f.hint}</span></span>
              <svg viewBox="0 0 100 10" width="100%" height={10} role="img" aria-label={`${f.label} contribution ${signed(v)}, factor ${f2(s.factors[f.key], 3)}`} style={{ display: "block" }}>
                <rect x={0} y={0} width={100} height={10} fill="#f3f4f5" />
                <line x1={50} x2={50} y1={0} y2={10} stroke="#9a9ea4" strokeWidth={0.75} />
                <rect x={v >= 0 ? 50 : 50 - w} y={2} width={Math.max(0.5, w)} height={6} fill={v >= 0 ? POS : NEG} />
              </svg>
              <span className="text-right tabular-nums" style={{ color: v < 0 ? NEG : "var(--brand-green-ink)" }}>{signed(v)}</span>
            </li>); })}
        </ul>
        <p className="mt-3 text-xs text-muted">Composite z {f2(s.z?.composite)} → score {Math.round(s.score)}. Method: <code className="break-words">{s.method ?? "—"}</code>{s.computed_at && <> · computed <time dateTime={s.computed_at}>{s.computed_at}</time></>}</p>
      </details>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Why this score</h4>
        {top.length ? (
          <ol className="space-y-1.5 text-sm">
            {top.map((t, i) => (
              <li key={`${t.url ?? t.title}-${i}`} className="rounded-lg border border-border bg-surface p-2">
                {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-soft underline-offset-2 hover:underline">{t.title}</a> : <span className="font-medium">{t.title}</span>}
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted tabular-nums"><span>{domain(t.url, t.source)}</span>{t.published_at && <span>· <time dateTime={t.published_at}>{t.published_at}</time></span>}<span>· {t.tier}</span><span>· weight {f2(t.weight)}</span><span style={{ color: t.sentiment < 0 ? NEG : "var(--brand-green-ink)" }}>· sentiment {signed(t.sentiment)}</span></p>
              </li>))}
          </ol>
        ) : <p className="text-sm text-muted">No weighted sources yet — contributions appear once dated evidence lands.</p>}
      </div>
      <p className="text-xs text-muted tabular-nums" data-testid="signal-evidence">{ev.items} items · {ev.dated_items} dated · decayed mass {f2(ev.decayed_mass)} · positive share {f2(ev.positive_share)} (Wilson lower {f2(ev.wilson_lower)})</p>
    </section>
  );
}
