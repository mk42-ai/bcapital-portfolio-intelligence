import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return <EmptyState kind="error" title="Page not found" body="That company or page does not exist in the portfolio database (company not found)." action={<Button asChild><Link href="/overview">Back to overview</Link></Button>} />;
}
