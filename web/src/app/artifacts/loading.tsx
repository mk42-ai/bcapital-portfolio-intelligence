import { Skeleton } from "@/components/ui/skeleton";
import "@/components/artifacts/artifacts.css";

/** a34 — CLS-free skeleton for /artifacts. Mirrors the page header (44px mark + h1, 20/24px lede, mb-6), the chip filter bar (32px chips)
 *  and the responsive `.art-list` card grid (1 → 2 → 3 columns). Card height fixed at 96px (p-12 + 48px thumb + rows). */
const CARDS = 9;
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading artifacts" data-testid="artifacts-loading" style={{ minHeight: "100dvh" }}>
      <header className="art-page-header mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-3xl">
          <div className="flex h-11 items-center gap-3"><Skeleton w={44} h={44} className="rounded-lg" /><Skeleton w={160} h={32} /></div>
          <div className="mt-2 flex h-5 items-center sm:h-6"><Skeleton shape="text" className="w-3/4" h={14} /></div>
        </div>
      </header>
      <div className="art-page-layout">
        <div className="art-browser art-root">
          <div className="art-filterbar">
            <div className="art-filters" data-skeleton="toolbar">{[72, 84, 80, 76, 88, 96].map((w, i) => <Skeleton key={i} shape="pill" w={w} h={32} />)}</div>
          </div>
          <ul className="art-list mt-4" aria-hidden>
            {Array.from({ length: CARDS }).map((_, i) => (
              <li key={i}>
                <div className="art-card h-24" data-skeleton="art-card">
                  <Skeleton w={48} h={48} className="rounded-lg" />
                  <div className="art-card-main">
                    <div className="flex h-5 items-center gap-1.5"><Skeleton shape="pill" w={56} h={18} /><Skeleton shape="text" className="w-1/2" h={14} /></div>
                    <Skeleton shape="text" className="w-2/3" h={12} />
                    <div className="mt-1 flex gap-2"><Skeleton shape="pill" w={64} h={26} /><Skeleton shape="pill" w={64} h={26} /></div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
