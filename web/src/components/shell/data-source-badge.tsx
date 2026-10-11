import { resolveDataSource, DATA_SOURCE_CLASS, type FetchSource, type NamedSource } from "@/lib/data-source";
/** Page-level data-source badge (server component). `data-testid="data-source-badge"` + `data-source=live|partial|snapshot` for QA. */
export function DataSourceBadge({ sources, fetchedAt }: { sources: (FetchSource | NamedSource)[]; fetchedAt?: string }) {
  const r = resolveDataSource(sources);
  return (
    <p className="mt-2 text-xs text-muted-2">
      Data source: <span data-testid="data-source-badge" data-source={r.source} title={r.detail} className={`chip ${DATA_SOURCE_CLASS[r.source]}`}>{r.label}</span>{fetchedAt && <> · fetched {fetchedAt.replace(/\.\d+Z$/, "Z")}</>}
    </p>
  );
}
