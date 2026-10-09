import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <EmptyState kind="error" title="Company not found" body="No portfolio record matches that slug. Try the overview table or search." action={<Button asChild><Link href="/overview">Back to overview</Link></Button>} />; }
