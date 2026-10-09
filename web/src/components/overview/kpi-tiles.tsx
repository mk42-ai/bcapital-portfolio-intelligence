export function KpiTiles({ tiles }: { tiles: { label: string; value: string; sub?: string }[] }) {
  return (
    <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => <div key={t.label} className="card p-4"><dt className="text-xs uppercase tracking-wide text-muted">{t.label}</dt><dd className="mt-1 font-display text-2xl font-semibold">{t.value}</dd>{t.sub && <dd className="mt-0.5 text-xs text-muted">{t.sub}</dd>}</div>)}
    </dl>
  );
}
