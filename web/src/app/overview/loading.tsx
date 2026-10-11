import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
/** Mirrors overview/page.tsx geometry (PageHeader → 7 KPI tiles → filters → count line → treemap 2/3 + sector card → 2-col row → 3 stacked cards) so the swap is CLS-free. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading overview">
      <header className="mb-6 max-w-3xl space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-5 w-full" /><Skeleton className="h-6 w-56" /></header>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="mb-6 h-24 w-full" />
      <Skeleton className="mb-4 h-5 w-48" />
      <div className="grid gap-5 xl:grid-cols-3"><Skeleton className="h-[520px] xl:col-span-2" /><CardSkeleton lines={8} /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2"><Skeleton className="h-[420px]" /><CardSkeleton lines={8} /></div>
      <Skeleton className="mt-5 h-40" />
      <Skeleton className="mt-5 h-44" />
      <Skeleton className="mt-5 h-[560px]" />
    </div>
  );
}
