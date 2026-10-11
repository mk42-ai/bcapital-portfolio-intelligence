import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
/** Mirrors company/[slug]/page.tsx: breadcrumb → hero card (logo 80px + copy) → brand 2/3 + position card → 2-col row (signal, pitchbook, funding) → news 2-col grid. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading company">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="mb-6 flex flex-wrap items-start gap-5 rounded-lg border border-border bg-surface p-6"><Skeleton className="size-20 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-9 w-64" /><Skeleton className="h-5 w-full max-w-xl" /><Skeleton className="h-6 w-80 max-w-full" /></div></div>
      <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><CardSkeleton lines={6} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /><Skeleton className="h-80 lg:col-span-2" /></div>
      <div className="card mt-5 p-5"><Skeleton className="mb-4 h-6 w-32" /><div className="grid min-w-0 gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[220px]" />)}</div></div>
    </div>
  );
}
