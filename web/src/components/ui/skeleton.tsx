import { cn } from "@/lib/utils";

type Shape = "rect" | "circle" | "pill" | "text";
const SHAPE_CLASS: Record<Shape, string> = { rect: "rounded-md", circle: "rounded-full", pill: "rounded-full", text: "rounded" };
const px = (v: number | string | undefined) => (v == null ? undefined : typeof v === "number" ? `${v}px` : v);

/** CLS-safe placeholder. `w`/`h` set FIXED width/height (numbers → px) so the swap to real content shifts nothing; `shape` picks the radius.
 *  `aria-hidden` always (the wrapping `role="status"` in each loading.tsx carries the accessible label). Shimmer is disabled under
 *  `prefers-reduced-motion` (motion-reduce:animate-none, on top of the global reduced-motion rule in globals.css). */
export const Skeleton = ({ className, style, shape = "rect", w, h }: { className?: string; style?: React.CSSProperties; shape?: Shape; w?: number | string; h?: number | string }) => (
  <div aria-hidden data-skeleton={shape} className={cn("skeleton motion-reduce:animate-none", SHAPE_CLASS[shape], className)} style={{ width: px(w), height: px(h), ...style }} />
);

export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="card p-5 space-y-3"><Skeleton className="w-1/3" h={20} />{Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className="w-full" h={16} />)}</div>
);

/** Mirrors `PageHeader` (shell/page-header.tsx): h1 32px line (text-3xl; 40px at sm) + lede 20px (text-sm → 24px at sm), mb-6. */
export const PageHeaderSkeleton = ({ titleW = 220, ledeLines = 2, badge = true }: { titleW?: number; ledeLines?: number; badge?: boolean }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-4" data-skeleton="page-header">
    <div className="w-full max-w-3xl">
      <div className="flex h-9 items-center sm:h-10"><Skeleton w={titleW} h={32} /></div>
      {Array.from({ length: ledeLines }).map((_, i) => <div key={i} className={cn("flex h-5 items-center sm:h-6", i === 0 ? "mt-2" : "")}><Skeleton shape="text" className={i === ledeLines - 1 ? "w-2/3" : "w-full"} h={14} /></div>)}
      {badge && <div className="mt-2 flex h-6 items-center"><Skeleton shape="pill" w={168} h={24} /></div>}
    </div>
  </header>
);
