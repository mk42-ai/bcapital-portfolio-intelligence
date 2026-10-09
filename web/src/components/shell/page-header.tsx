import { Badge } from "@/components/ui/badge";
export function PageHeader({ title, lede, source, fetchedAt, actions }: { title: string; lede?: string; source?: "live" | "snapshot"; fetchedAt?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {lede && <p className="mt-2 text-sm text-muted sm:text-base">{lede}</p>}
        {source && (
          <p className="mt-2 text-xs text-muted-2">
            Data source: <Badge tone={source === "live" ? "primary" : "muted"}>{source === "live" ? "live backend" : "cached snapshot"}</Badge>{fetchedAt && <> · fetched {fetchedAt.replace(/\.\d+Z$/, "Z")}</>}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
