import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div role="status" aria-busy="true" aria-label="Loading company"><Skeleton className="mb-6 h-36 w-full rounded-2xl" /><div className="grid gap-5 lg:grid-cols-3"><CardSkeleton lines={5} /><CardSkeleton lines={5} /><CardSkeleton lines={5} /></div></div>; }
