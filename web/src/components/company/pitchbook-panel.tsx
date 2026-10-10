import type { Company } from "@/lib/types";
import { getPbSnapshot } from "@/lib/pitchbook-snapshot";
import { PitchbookFacts } from "./pitchbook-facts";

/**
 * Server component for the company page PitchBook card. PURE STATIC: reads the committed snapshot (src/data/pitchbook-snapshot.json)
 * — the backend is never contacted for PitchBook here, so the fields (name, HQ, industry, employees, founded, last deal, investors)
 * are in the HTML on first paint and the browser issues no /pitchbook|execute|workflow request on load.
 */
export function PitchbookPanel({ company }: { company: Company }) {
  const entry = getPbSnapshot(company.slug);
  return <PitchbookFacts entry={entry} slug={company.slug} name={company.name} variant="page" />;
}
