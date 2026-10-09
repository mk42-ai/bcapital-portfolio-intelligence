"use client";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <EmptyState kind="error" title="Something went wrong" body={`${error.message || "Unexpected error"}${error.digest ? ` (ref ${error.digest})` : ""}. The cached snapshot may still be available on other pages.`} action={<Button onClick={reset}>Try again</Button>} />;
}
