import { DataSourceBadge } from "@/components/shell/data-source-badge";
import type { FetchSource, NamedSource } from "@/lib/data-source";
/** `sources` = the real per-fetch sources of EVERY dataset the page rendered (resolved by lib/data-source.ts → live | partial | snapshot).
 *  `source` (single) is kept for callers with one dataset. */
export function PageHeader({ title, lede, source, sources, fetchedAt, actions }: { title: string; lede?: string; source?: FetchSource; sources?: (FetchSource | NamedSource)[]; fetchedAt?: string; actions?: React.ReactNode }) {
  const all = sources ?? (source ? [source] : []);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {lede && <p className="mt-2 text-sm text-muted sm:text-base">{lede}</p>}
        {all.length > 0 && <DataSourceBadge sources={all} fetchedAt={fetchedAt} />}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
