import { Skeleton } from "@/components/ui/skeleton";
/** Mirrors chat/page.tsx: one full-height .chat-row canvas (top bar → centred welcome + 3 starters → pinned composer). No side columns: the inspector is a drawer, so a 3-column skeleton would shift. */
export default function Loading() {
  return (
    <div className="chat-row flex h-full min-h-0 flex-1 flex-col" role="status" aria-busy="true" aria-label="Loading chat">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-24" /></div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-8">
        <Skeleton className="mx-auto h-8 w-72" />
        <Skeleton className="mx-auto h-5 w-96 max-w-full" />
        <div className="grid gap-2 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4"><Skeleton className="h-24 w-full rounded-2xl" /></div>
    </div>
  );
}
