import type { Company } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
export type Round = { round: string; date: string; amount: string; post: string; lead: string; bcap: "lead" | "co-lead" | "participant" | null; source?: string };
/** PitchBook-style timeline. Rounds for focus companies come from the intelligence JSON; for everyone else the single known B Capital event (if any) is shown and the rest is marked pending (PitchBook plugin deferred). */
const ROUNDS: Record<string, Round[]> = {
  "perplexity-ai": [{ round: "Series D", date: "2024-12", amount: "$500M", post: "$9B", lead: "SoftBank, T. Rowe Price", bcap: "participant" }, { round: "Series E", date: "2025-03", amount: "—", post: "$14B", lead: "—", bcap: null }, { round: "Growth", date: "2025-09", amount: "—", post: "$20B", lead: "—", bcap: null }],
  apptronik: [{ round: "Series A", date: "2025-02", amount: "$350M", post: "—", lead: "B Capital, Capital Factory", bcap: "lead" }, { round: "Series A close", date: "2025-03", amount: "$53M", post: "—", lead: "B Capital (co-lead)", bcap: "co-lead" }, { round: "Series A-X", date: "2026-02-11", amount: "$520M", post: "~$5.3B", lead: "B Capital (co-lead, Ascent Fund III)", bcap: "co-lead" }],
  "fervo-energy": [{ round: "Series E", date: "2025-12-10", amount: "$462M", post: "~$1.4B", lead: "B Capital", bcap: "lead" }, { round: "IPO (Nasdaq: FRVO)", date: "2026-05-14", amount: "~$2.17B proceeds", post: "~$10.1B mkt cap", lead: "—", bcap: null }],
  flutterwave: [{ round: "Series D", date: "2022-02-16", amount: "$250M", post: ">$3B", lead: "B Capital", bcap: "lead" }, { round: "Series E", date: "2026-06-16", amount: "$262.75M", post: "$3.2B", lead: "Ripple Ventures", bcap: null }, { round: "Series E-II", date: "2026-07", amount: "—", post: "—", lead: "Circle Ventures", bcap: null }],
  writer: [{ round: "Series A", date: "2021-11", amount: "$21M", post: "—", lead: "—", bcap: "participant" }, { round: "Series C", date: "2024-11-12", amount: "$200M", post: "$1.9B", lead: "Premji Invest, Radical Ventures, ICONIQ", bcap: "participant" }],
  "code-metal": [{ round: "Series B", date: "2026-02-19", amount: "$125M", post: "$1.25B", lead: "Salesforce Ventures", bcap: "participant" }],
  artbio: [{ round: "Series B", date: "2025-07", amount: "$132M", post: "—", lead: "B Capital (co-lead)", bcap: "co-lead" }],
  "star-catcher": [{ round: "Seed", date: "—", amount: "—", post: "—", lead: "B Capital (co-lead)", bcap: "co-lead" }, { round: "Series A", date: "—", amount: "$65M", post: "—", lead: "B Capital", bcap: "lead" }],
  archimetis: [{ round: "Round", date: "2026-02", amount: "~$11.5M", post: "—", lead: "—", bcap: null }],
};
export function FundingTimeline({ company }: { company: Company }) {
  const rounds = ROUNDS[company.slug] ?? [];
  return (
    <div>
      {rounds.length ? (
        <ol className="relative ml-3 border-l border-border">
          {rounds.map((r, i) => (
            <li key={i} className="mb-5 ml-5">
              <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-background" style={{ background: r.bcap ? "var(--primary)" : "var(--muted-2)" }} aria-hidden />
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{r.round}<time className="font-normal text-muted" dateTime={r.date}>{r.date}</time>{r.bcap && <Badge tone="primary">B Capital participated · {r.bcap}</Badge>}</p>
              <p className="text-sm text-muted">Amount {r.amount} · Post-money {r.post} · Lead {r.lead}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted">No round-level data yet.{company.b_capital_round ? ` Known: ${company.b_capital_round}.` : ""} {company.anon_resolution ? `Note: ${company.anon_resolution}.` : ""}</p>}
      <p className="mt-2 text-xs text-muted">PitchBook enrichment: <Badge tone="muted">pending — plugin deferred</Badge> · estimate: {company.estimate_rationale}</p>
    </div>
  );
}
