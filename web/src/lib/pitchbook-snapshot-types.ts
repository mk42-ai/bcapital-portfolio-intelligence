/** Compact, client-safe PitchBook snapshot (committed in src/data/pitchbook-snapshot.json, rebuilt by scripts/build-pitchbook-snapshot.mjs).
 *  Rendered on FIRST PAINT by the company page card and the chat inspector drawer — no browser request to /pitchbook|execute|workflow on load.
 *  The builder drops null members to keep the JSON compact, so provenance members are optional (`?? null` when reading). */
export type PbSnapshotField = { value: string; source?: string | null; fetched_at?: string | null; plugin?: string | null };
export type PbSnapshotInvestor = { name: string; website?: string | null; location?: string | null; type?: string | null; aum_musd?: number | null };
export type PbSnapshotEntry = {
  slug: string; name: string;
  hq: PbSnapshotField | null; industry: PbSnapshotField | null; employees: PbSnapshotField | null; founded: PbSnapshotField | null; last_deal: PbSnapshotField | null;
  investors: PbSnapshotInvestor[];
  investors_total: number | null; investors_brief: string | null;
  availability: Record<string, string>; fetched_at: string | null; next_run_utc: string | null;
};
export type PbSnapshot = { fetched_at: string; source: string; workflow_id: string | null; plugin_id: string; companies: Record<string, PbSnapshotEntry> };
/** The six fact rows rendered (in order) by PitchbookFacts. */
export type PbFactKey = "name" | "hq" | "industry" | "employees" | "founded" | "last_deal";
