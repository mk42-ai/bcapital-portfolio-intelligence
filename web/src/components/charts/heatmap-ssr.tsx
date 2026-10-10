import Link from "next/link";
export type HeatRow = { id: string; slug: string; data: { x: string; y: number | null }[] };
/** Server-rendered KPI heatmap (pure HTML grid, zero client JS). Cells carry the value as text for AT; colour is a sequential green ramp. */
const ramp = (v: number) => { const t = Math.max(0, Math.min(1, v / 100)); /* two AA-safe halves: <50 light greys take near-black ink (≥7:1); ≥50 slate→near-black take white ink (≥4.6:1) */ const stops: [number, string][] = [[0, "#f1f2f4"], [0.4999, "#cfd2d6"], [0.5, "#666b73"], [1, "#16181b"]]; let a = stops[0], b = stops[stops.length - 1]; for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; } const f = (b[0] - a[0]) ? (t - a[0]) / (b[0] - a[0]) : 0; const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const [r1, g1, b1] = hex(a[1]), [r2, g2, b2] = hex(b[1]); return `rgb(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)})`; };
export function HeatmapSSR({ rows }: { rows: HeatRow[] }) {
  const cols = rows[0]?.data.map((d) => d.x) ?? [];
  return (
    <div className="min-w-0 max-w-full overflow-x-auto" tabIndex={0} aria-label="KPI heatmap, scrollable">
      <table className="w-full min-w-[320px] border-separate border-spacing-1 text-xs">
        <caption className="sr-only">KPI heatmap: rows are companies, columns are sentiment, news volume and funding recency, each scaled 0 to 100.</caption>
        <thead><tr><th scope="col" className="sr-only">Company</th>{cols.map((c) => <th key={c} scope="col" className="pb-1 text-center font-medium text-muted">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <th scope="row" className="max-w-[140px] truncate pr-2 text-left font-medium"><Link href={`/company/${r.slug}`} className="underline-offset-2 hover:underline">{r.id}</Link></th>
              {r.data.map((d) => { const v = d.y ?? 0; const dark = v < 50; return <td key={d.x} className="h-7 rounded-md text-center font-semibold tabular-nums" style={{ background: d.y == null ? "var(--surface-3)" : ramp(v), color: dark ? "#16181b" : "#ffffff" }}><span className="sr-only">{d.x}: </span>{d.y == null ? "—" : Math.round(v)}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted" aria-hidden>Lighter = lower, darker = higher (0–100).</p>
    </div>
  );
}
