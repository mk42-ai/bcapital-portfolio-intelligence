"use client";
import { Landmark } from "lucide-react";
import { useSettings } from "@/lib/settings";
import type { PbSnapshotEntry } from "@/lib/pitchbook-snapshot-types";
import { PitchbookFacts } from "@/components/company/pitchbook-facts";

/**
 * Chat inspector drawer section: PitchBook facts for the FIRST context company, rendered from the committed snapshot on first paint.
 * `entries` is `PB_SNAPSHOT.companies` passed down from the server page (chat/page.tsx) so the client bundle does not carry the JSON.
 * NO fetch, NO useEffect loading, NO run button, NO execution ids — "Ask in chat" only appends to the existing composer draft.
 */
export type PitchbookDrawerSectionProps = { companies: { slug: string; name: string }[]; entries?: Record<string, PbSnapshotEntry> | null; className?: string };

export function PitchbookDrawerSection({ companies, entries, className }: PitchbookDrawerSectionProps) {
  const [s] = useSettings();
  const slug = s.companies[0] ?? null;
  const entry = slug ? entries?.[slug] ?? null : null;
  const name = entry?.name ?? companies.find((c) => c.slug === slug)?.name ?? slug ?? "";
  return (
    <section className={className ?? "p-3"} data-testid="pitchbook-rail" aria-label="PitchBook">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Landmark className="size-3.5 text-muted" aria-hidden /> PitchBook{name ? <span className="truncate font-normal text-muted">· {name}</span> : null}</h2>
      {slug ? <PitchbookFacts entry={entry} slug={slug} name={name} variant="drawer" /> : <p className="text-xs text-muted" data-testid="pb-no-context">Pick a context company to see PitchBook facts.</p>}
    </section>
  );
}
export const PitchbookRail = PitchbookDrawerSection;
export default PitchbookDrawerSection;
