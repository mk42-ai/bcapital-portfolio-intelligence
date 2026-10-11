import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

/** a34 — CLS-free skeleton for /companies. Mirrors PageHeader + CompaniesList: sticky filter bar (py-3 + h-10 controls + border = 65px)
 *  and `company-row` rows (min-h-[84px] py-2 → 85px with border on mobile; lg:min-h-16 → 65px on desktop). Fixed heights only. */
const ROWS = 14;
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading companies" data-testid="companies-loading">
      <PageHeaderSkeleton titleW={200} ledeLines={2} />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="-mx-4 mb-2 h-[65px] border-b border-border px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" data-skeleton="toolbar">
            <div className="flex h-10 items-center gap-2 sm:gap-3">
              <Skeleton className="w-full sm:max-w-xs" h={40} />
              <Skeleton className="hidden sm:block" w={132} h={40} />
              <Skeleton className="hidden sm:block" w={124} h={40} />
              <Skeleton className="ml-auto hidden sm:block" w={128} h={16} />
            </div>
          </div>
          <ul className="m-0 list-none p-0" aria-hidden>
            {Array.from({ length: ROWS }).map((_, i) => (
              <li key={i} className="flex h-[85px] items-center gap-3 border-b border-border px-1 lg:h-[65px]" data-skeleton="company-row">
                <Skeleton shape="circle" w={28} h={28} />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton shape="text" className={i % 3 === 0 ? "w-2/5" : i % 3 === 1 ? "w-1/3" : "w-1/4"} h={16} />
                  <Skeleton shape="text" className="w-1/2 sm:w-1/3" h={12} />
                </div>
                <Skeleton className="hidden sm:block" w={96} h={14} />
                <Skeleton shape="pill" w={44} h={22} />
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden w-8 shrink-0 lg:block" aria-hidden><Skeleton className="mt-2" w={28} h={27 * 28} /></div>
      </div>
    </div>
  );
}
