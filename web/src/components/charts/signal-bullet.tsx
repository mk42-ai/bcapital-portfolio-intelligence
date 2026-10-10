import type { SignalBands, SignalLabel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
/** Signal Score bullet chart (0–100). Pure SVG server component — no client JS, no images.
 *  Encoding: qualitative background bands (0–42 muted · 42–58 neutral · 58–100 light green), sector p25–p75 as a light inner bar,
 *  sector median as a thin dark tick, the score as a bold brand-green measure bar whose opacity encodes confidence (≥0.45),
 *  plus an explicit confidence band = score ± (1−confidence)×12 as a translucent rectangle, and the numeric score at the end.
 *  md/lg add a 30-day sentiment sparkline (−1…+1) below the bar. */
const GREEN = "rgb(10,201,133)", GREEN_INK = "#047857", GREEN_SOFT = "#E6FAF3", MUTED_BAND = "#e6e8eb", NEUTRAL_BAND = "#f3f4f5", INK = "#3b3f45", GRID = "#9a9ea4";
const SIZES = { sm: { w: 180, barH: 10, spark: 0, font: 11, gap: 0 }, md: { w: 280, barH: 14, spark: 22, font: 13, gap: 6 }, lg: { w: 480, barH: 18, spark: 34, font: 17, gap: 8 } } as const;
export type SignalBulletProps = {
  score: number; confidence: number; percentile?: number | null; label?: SignalLabel | string | null; bands?: SignalBands | null;
  sparkline?: { date: string; score: number }[] | null; size?: keyof typeof SIZES; name?: string; className?: string;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function ordinal(n: number) { const r = Math.round(n), m100 = r % 100, m10 = r % 10; const suf = m100 >= 11 && m100 <= 13 ? "th" : m10 === 1 ? "st" : m10 === 2 ? "nd" : m10 === 3 ? "rd" : "th"; return `${r}${suf}`; }
export function signalAriaLabel({ score, confidence, percentile, label, bands, name }: Pick<SignalBulletProps, "score" | "confidence" | "percentile" | "label" | "bands" | "name">) {
  const parts = [`Signal Score ${Math.round(score)} of 100`]; if (label) parts.push(String(label)); parts.push(`confidence ${confidence.toFixed(2)}`); if (percentile != null) parts.push(`${ordinal(percentile)} percentile`);
  const tail = bands ? `; sector median ${Math.round(bands.sector.median)}` : "";
  return `${name ? `${name}: ` : ""}${parts.join(", ")}${tail}`;
}
export function SignalBullet({ score, confidence, percentile = null, label = null, bands = null, sparkline = null, size = "md", name, className }: SignalBulletProps) {
  const S = SIZES[size]; const numW = Math.round(S.font * 2.3); const trackW = S.w - numW - 6; const x = (v: number) => (clamp(v, 0, 100) / 100) * trackW;
  const half = clamp((1 - confidence) * 12, 0, 50); const lo = clamp(score - half, 0, 100), hi = clamp(score + half, 0, 100);
  const opacity = Math.max(0.45, clamp(confidence, 0, 1)); const barY = 0; const measureH = S.barH * 0.46; const measureY = barY + (S.barH - measureH) / 2;
  const sparkY = S.barH + S.gap; const H = S.spark ? sparkY + S.spark : S.barH;
  const pts = (sparkline ?? []).filter((p) => Number.isFinite(p.score)); const showSpark = S.spark > 0;
  const sy = (v: number) => sparkY + 2 + ((1 - clamp(v, -1, 1)) / 2) * (S.spark - 4);
  const poly = pts.length > 1 ? pts.map((p, i) => `${(i / (pts.length - 1)) * trackW},${sy(p.score)}`).join(" ") : "";
  return (
    <svg viewBox={`0 0 ${S.w} ${H}`} width="100%" style={{ maxWidth: S.w, height: "auto", display: "block" }} className={className} role="img" aria-label={signalAriaLabel({ score, confidence, percentile, label, bands, name })}>
      {/* qualitative bands */}
      <rect x={0} y={barY} width={x(42)} height={S.barH} fill={MUTED_BAND} />
      <rect x={x(42)} y={barY} width={x(58) - x(42)} height={S.barH} fill={NEUTRAL_BAND} />
      <rect x={x(58)} y={barY} width={trackW - x(58)} height={S.barH} fill={GREEN_SOFT} />
      {/* sector p25–p75 band + median tick */}
      {bands && <rect x={x(bands.sector.p25)} y={barY + S.barH * 0.2} width={Math.max(1, x(bands.sector.p75) - x(bands.sector.p25))} height={S.barH * 0.6} fill={GRID} opacity={0.35} />}
      {/* confidence band */}
      <rect x={x(lo)} y={barY - 1} width={Math.max(1, x(hi) - x(lo))} height={S.barH + 2} fill={GREEN} opacity={0.18} />
      {/* score measure bar */}
      <rect x={0} y={measureY} width={Math.max(1, x(score))} height={measureH} fill={GREEN} opacity={opacity} />
      {bands && <line x1={x(bands.sector.median)} x2={x(bands.sector.median)} y1={barY - 2} y2={barY + S.barH + 2} stroke={INK} strokeWidth={1.5} />}
      <rect x={0} y={barY} width={trackW} height={S.barH} fill="none" stroke="#cfd2d6" strokeWidth={0.5} />
      <text x={trackW + 6} y={barY + S.barH / 2} dominantBaseline="central" fontSize={S.font} fontWeight={700} fill="var(--foreground)" fontFamily="var(--font-display)" style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(score)}</text>
      {showSpark && (
        <g>
          <line x1={0} x2={trackW} y1={sy(0)} y2={sy(0)} stroke="#cfd2d6" strokeWidth={0.75} strokeDasharray="2 3" />
          {pts.length > 1 ? (
            <>
              <polyline points={poly} fill="none" stroke={GREEN_INK} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={trackW} cy={sy(pts[pts.length - 1].score)} r={2} fill={GREEN_INK} />
              <text x={trackW + 6} y={sparkY + S.spark / 2} dominantBaseline="central" fontSize={Math.max(8, S.font * 0.6)} fill="var(--muted)">30d</text>
            </>
          ) : (
            <>
              <line x1={0} x2={trackW} y1={sy(pts[0]?.score ?? 0)} y2={sy(pts[0]?.score ?? 0)} stroke={GREEN_INK} strokeWidth={1.25} strokeDasharray="1.5 3" />
              <text x={0} y={sparkY + S.spark - 1} fontSize={Math.max(8, S.font * 0.62)} fill="var(--muted)">history builds daily</text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}
/** 72×10 compact bullet for table cells / lists: bands + confidence band + measure bar; detail in the title attribute. */
export function SignalMini({ score, confidence, percentile = null, label = null, name, className }: { score: number; confidence: number; percentile?: number | null; label?: SignalLabel | string | null; name?: string; className?: string }) {
  const W = 72, H = 10; const x = (v: number) => (clamp(v, 0, 100) / 100) * W;
  const half = clamp((1 - confidence) * 12, 0, 50); const lo = clamp(score - half, 0, 100), hi = clamp(score + half, 0, 100);
  const title = signalAriaLabel({ score, confidence, percentile, label, name });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} style={{ display: "inline-block", verticalAlign: "middle" }} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x={0} y={0} width={x(42)} height={H} fill={MUTED_BAND} /><rect x={x(42)} y={0} width={x(58) - x(42)} height={H} fill={NEUTRAL_BAND} /><rect x={x(58)} y={0} width={W - x(58)} height={H} fill={GREEN_SOFT} />
      <rect x={x(lo)} y={0} width={Math.max(1, x(hi) - x(lo))} height={H} fill={GREEN} opacity={0.2} />
      <rect x={0} y={3} width={Math.max(1, x(score))} height={4} fill={GREEN} opacity={Math.max(0.45, clamp(confidence, 0, 1))} />
      <line x1={x(50)} x2={x(50)} y1={0} y2={H} stroke={INK} strokeWidth={0.75} opacity={0.5} />
    </svg>
  );
}
const LABEL_CLASS: Record<string, string> = {
  strong: "border-[#a7f3d0] bg-[#E6FAF3] text-[#047857]", constructive: "border-[#a7f3d0] bg-[#E6FAF3] text-[#047857]",
  balanced: "border-border bg-surface-2 text-muted-2", soft: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]", weak: "border-[#fecaca] bg-[#fef2f2] text-danger-soft",
};
/** Pill: '{label} · {percentile}th pct' using the shared Badge. */
export function PercentileBadge({ percentile, label, className }: { percentile: number; label: SignalLabel | string; className?: string }) {
  return <Badge className={`${LABEL_CLASS[label] ?? ""} ${className ?? ""}`} title={`Signal label ${label}; ${ordinal(percentile)} percentile within the portfolio`}>{label} · {ordinal(percentile)} pct</Badge>;
}
