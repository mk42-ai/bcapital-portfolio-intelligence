import { getPitchbook } from "@/lib/api";
import type { Company } from "@/lib/types";
import { PitchbookView, type PbProfileFact } from "./pitchbook-view";

/**
 * Server component for the company page: fetches `/pitchbook/{slug}` (ISR 120 s). The backend route may not exist yet — `getPitchbook`
 * then answers `{data:null, source:'snapshot'}` and the view renders the honest "offline" state, so prerender never blanks the card.
 * Sections the Investor Finder plugin cannot answer fall back to the portfolio profile fields the record already carries (with provenance).
 */
export async function PitchbookPanel({ company }: { company: Company }) {
  const r = await getPitchbook(company.slug);
  const fetched = company.last_checked ?? company.updated_at ?? null; const source = company.sources?.[0] ?? company.website ?? null;
  const overview: PbProfileFact[] = ([
    company.hq ? { field: "HQ", value: company.hq, source, fetched_at: fetched } : null,
    company.employees ? { field: "employees", value: company.employees.toLocaleString(), source, fetched_at: fetched } : null,
    company.stage ? { field: "stage", value: company.stage, source, fetched_at: fetched } : null,
  ] as (PbProfileFact | null)[]).filter((x): x is PbProfileFact => !!x);
  const lastRound: PbProfileFact[] = company.b_capital_round ? [{ field: "B Capital round", value: company.b_capital_round, source, fetched_at: fetched }] : [];
  return <PitchbookView slug={company.slug} name={company.name} res={r.source === "live" ? r.data : null} status={r.source === "live" ? "ok" : "offline"} variant="page" profile={{ overview, last_round: lastRound }} />;
}
