import { sentimentColor } from "@/lib/format";
/** SVG semicircle gauge for a sentiment score in [-1, 1]. Pure server component (no JS). */
export function Gauge({ score, label, size = 150 }: { score: number; label: string; size?: number }) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const pct = (score + 1) / 2; const ang = Math.PI * (1 - pct);
  const x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  const arc = (from: number, to: number, color: string, w = 10) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    return <path d={`M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="butt" />;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size / 2 + 14}`} width="100%" role="img" aria-label={`${label}: sentiment ${score > 0 ? "+" : ""}${score.toFixed(2)} on a scale from −1 to +1`}>
      {arc(0, 0.4, "var(--sentiment-neg)")}{arc(0.4, 0.6, "var(--sentiment-neu)")}{arc(0.6, 1, "var(--sentiment-pos)")}
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill={sentimentColor(score)} stroke="#ffffff" strokeWidth={2} />
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize={size / 7} fontWeight={700} fill="var(--foreground)" fontFamily="var(--font-display)">{score > 0 ? "+" : ""}{score.toFixed(2)}</text>
      <text x={10} y={cy + 12} fontSize={10} fill="var(--muted)">−1</text><text x={size - 10} y={cy + 12} textAnchor="end" fontSize={10} fill="var(--muted)">+1</text>
    </svg>
  );
}
