import { Skeleton } from "@/components/ui/skeleton";

/** a34 — CLS-free skeleton for /company/[slug]. Mirrors the page: breadcrumb (20px, mb-4) → header card (p-6 + 80px logo = 130px incl.
 *  border, mb-6) → data-source line (16px, mb-5) → status chips row (24px, mb-5) → 3-col card grid → 2-col grid → news card. Fixed heights. */
const CardSk = ({ h, lines = 4, className = "" }: { h: number; lines?: number; className?: string }) => (
  <div className={`card p-5 ${className}`} style={{ height: h }} data-skeleton="card">
    <Skeleton className="w-1/3" h={20} />
    <Skeleton shape="text" className="mt-2 w-3/4" h={14} />
    <div className="mt-5 space-y-3">{Array.from({ length: lines }).map((_, i) => <Skeleton key={i} shape="text" className={i % 2 ? "w-5/6" : "w-full"} h={16} />)}</div>
  </div>
);
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading company" data-testid="company-loading">
      <div className="mb-4 flex h-5 items-center gap-2"><Skeleton shape="text" w={64} h={14} /><Skeleton shape="text" w={120} h={14} /></div>
      <header className="mb-6 h-[130px] overflow-hidden rounded-lg border border-border bg-surface" data-skeleton="detail-header">
        <div className="flex items-start gap-5 p-6">
          <Skeleton w={80} h={80} className="shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex h-4 items-center"><Skeleton shape="text" w={160} h={12} /></div>
            <div className="flex h-9 items-center sm:h-10"><Skeleton w={240} h={32} /></div>
            <div className="mt-1 flex h-5 items-center"><Skeleton shape="text" w={200} h={14} /></div>
          </div>
        </div>
      </header>
      <div className="mb-5 flex h-4 items-center gap-2"><Skeleton shape="text" w={80} h={12} /><Skeleton shape="pill" w={72} h={16} /><Skeleton shape="text" className="hidden sm:block" w={260} h={12} /></div>
      <div className="mb-5 flex h-6 items-center gap-2" data-skeleton="kpi-row"><Skeleton shape="pill" w={110} h={24} /><Skeleton shape="pill" w={96} h={24} /><Skeleton shape="pill" className="hidden sm:block" w={128} h={24} /></div>
      <div className="grid gap-5 lg:grid-cols-3">
        <CardSk h={300} lines={6} className="lg:col-span-2" />
        <CardSk h={300} lines={6} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CardSk h={360} lines={8} />
        <CardSk h={360} lines={8} />
        <CardSk h={280} lines={5} />
      </div>
      <CardSk h={420} lines={10} className="mt-5" />
    </div>
  );
}
