import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

/** a34 — CLS-free skeleton for /news. Mirrors PageHeader + NewsFeed: filter card (p-4, label 16px + h-10 input; 1 col → 2 → 5),
 *  day heading (text-lg py-1 = 36px, mb-3), news cards (p-3 + 96px NewsThumb + border = 122px) + 16px meta line, 300px sticky aside. */
const NewsCardSk = () => (
  <div className="min-w-0" data-skeleton="news-card">
    <div className="card flex h-[122px] gap-3 p-3">
      <Skeleton w={96} h={96} className="shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex h-4 items-center gap-1.5"><Skeleton shape="pill" w={48} h={16} /><Skeleton shape="text" w={90} h={12} /><Skeleton shape="text" w={64} h={12} /></div>
        <Skeleton shape="text" className="mt-2 w-11/12" h={14} />
        <Skeleton shape="text" className="mt-1.5 w-4/5" h={14} />
        <Skeleton shape="text" className="mt-2 w-full" h={12} />
        <Skeleton shape="text" className="mt-1 w-2/3" h={12} />
      </div>
    </div>
    <div className="mt-1 flex h-4 items-center gap-2"><Skeleton shape="text" w={96} h={12} /><Skeleton shape="text" w={80} h={12} /><Skeleton shape="pill" w={44} h={16} /></div>
  </div>
);
const Day = ({ n }: { n: number }) => (
  <section className="mb-6">
    <div className="mb-3 flex h-9 items-center gap-2"><Skeleton w={112} h={20} /><Skeleton shape="pill" w={28} h={18} /></div>
    <div className="grid min-w-0 gap-3 md:grid-cols-2">{Array.from({ length: n }).map((_, i) => <NewsCardSk key={i} />)}</div>
  </section>
);
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading news" data-testid="news-loading">
      <PageHeaderSkeleton titleW={180} ledeLines={2} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" data-skeleton="toolbar">
            {["lg:col-span-2", "", "", "", ""].map((c, i) => <div key={i} className={`flex flex-col gap-1 ${c}`}><Skeleton shape="text" w={56} h={12} className="my-0.5" /><Skeleton className="w-full" h={40} /></div>)}
            <div className="flex h-10 items-end lg:col-span-4"><Skeleton shape="text" w={120} h={12} /></div>
          </div>
          <Day n={6} /><Day n={4} />
        </div>
        <aside className="card h-fit p-4 lg:sticky lg:top-6" aria-hidden>
          <div className="flex h-7 items-center"><Skeleton w={160} h={20} /></div>
          <Skeleton shape="text" className="mb-3 mt-1 w-full" h={12} />
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="flex h-5 items-center justify-between gap-2"><Skeleton shape="text" w={120} h={14} /><Skeleton shape="pill" w={48} h={18} /></div>)}</div>
        </aside>
      </div>
    </div>
  );
}
