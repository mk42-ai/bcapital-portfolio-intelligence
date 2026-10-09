import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div className="grid gap-4 lg:grid-cols-[260px_1fr_300px]" role="status" aria-busy="true" aria-label="Loading chat"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div>; }
