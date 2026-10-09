import { cn } from "@/lib/utils";
export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => <div aria-hidden className={cn("skeleton", className)} style={style} />;
export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="card p-5 space-y-3"><Skeleton className="h-5 w-1/3" />{Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
);
