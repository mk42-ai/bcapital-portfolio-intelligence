import { CardSkeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading news"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>; }
