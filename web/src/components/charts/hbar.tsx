/** Zero-JS horizontal bar list (server component) — replaces a Recharts bar chart on the overview to keep TBT low. */
export function HBar({ data, ariaLabel, format }: { data: { name: string; value: number; color?: string; href?: string }[]; ariaLabel: string; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ol className="space-y-2" aria-label={ariaLabel}>
      {data.map((d) => (
        <li key={d.name} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate font-medium">{d.name}</span>
          <span className="h-5 overflow-hidden rounded-md bg-surface-2" aria-hidden><span className="block h-full rounded-md" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? "var(--chart-1)" }} /></span>
          <span className="tabular-nums text-muted">{format(d.value)}</span>
        </li>
      ))}
    </ol>
  );
}
