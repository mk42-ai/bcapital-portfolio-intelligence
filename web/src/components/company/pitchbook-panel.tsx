import { getPitchbook } from "@/lib/api";
import type { Company } from "@/lib/types";
import { PitchbookView, type PbProfileFact } from "./pitchbook-view";

/**
 * Server component for the company page: fetches `/pitchbook/{slug}` (ISR 120 s) and renders the stored record SYNCHRONOUSLY — `res` is
 * passed as a prop and PitchbookView performs no fetch on mount (data-source="server"). When the live backend does not answer, `getPitchbook`
 * falls back to the committed `pitchbook-snapshot.json` (source 'snapshot'), so first paint always has content; the honest "offline" state
 * appears only when neither the backend nor the snapshot has a record for the slug.
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
  return <PitchbookView slug={company.slug} name={company.name} res={r.data} status={r.data ? "ok" : "offline"} variant="page" source="server" profile={{ overview, last_round: lastRound }} />;
}
