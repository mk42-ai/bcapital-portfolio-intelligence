import { CardSkeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true" aria-label="Loading"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>; }
