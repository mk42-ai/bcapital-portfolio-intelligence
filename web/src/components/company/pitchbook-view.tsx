"use client";
/**
 * PitchBook view — thin compatibility wrapper over `PitchbookFacts` (./pitchbook-facts), which is the single implementation shared by the
 * company page card and the chat inspector drawer. Everything renders from the committed snapshot entry: no fetch, no "Run now", no
 * execution ids, no loading state. Kept so older imports of `PitchbookView` keep compiling.
 */
import type { PbSnapshotEntry } from "@/lib/pitchbook-snapshot-types";
import { PitchbookFacts, nextPull, ymd, type PitchbookFactsProps } from "./pitchbook-facts";

export type PitchbookViewProps = { slug: string; name: string; entry: PbSnapshotEntry | null; variant?: "page" | "drawer" | "rail"; onAsk?: PitchbookFactsProps["onAsk"] };

export function PitchbookView({ slug, name, entry, variant = "page", onAsk }: PitchbookViewProps) {
  return <PitchbookFacts entry={entry} slug={slug} name={name} variant={variant === "page" ? "page" : "drawer"} onAsk={onAsk} />;
}
export { PitchbookFacts, nextPull, ymd };
export type { PitchbookFactsProps };
