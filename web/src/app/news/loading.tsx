import { Skeleton } from "@/components/ui/skeleton";
/** Mirrors news/page.tsx: PageHeader → filter bar → per-day heading + 2-col NewsCard grid (card ≈ 220px). */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading news">
      <header className="mb-6 max-w-3xl space-y-3"><Skeleton className="h-10 w-56" /><Skeleton className="h-5 w-full" /><Skeleton className="h-6 w-56" /></header>
      <Skeleton className="mb-6 h-14 w-full" />
      {Array.from({ length: 2 }).map((_, d) => (
        <section key={d} className="mb-6">
          <Skeleton className="mb-3 h-7 w-40" />
          <div className="grid min-w-0 gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[220px]" />)}</div>
        </section>
      ))}
    </div>
  );
}
