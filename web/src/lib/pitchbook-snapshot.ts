import snap from "@/data/pitchbook-snapshot.json";
import type { PbSnapshot, PbSnapshotEntry } from "./pitchbook-snapshot-types";

/**
 * Server-safe loader for the committed PitchBook snapshot. Import from server components / route handlers (the company page panel,
 * chat/page.tsx which passes `PB_SNAPSHOT.companies` to the inspector drawer). Pure static data — never contacts the backend.
 */
export const PB_SNAPSHOT = snap as unknown as PbSnapshot;
export const PB_SNAPSHOT_META = {
  fetched_at: PB_SNAPSHOT.fetched_at, source: PB_SNAPSHOT.source, workflow_id: PB_SNAPSHOT.workflow_id, plugin_id: PB_SNAPSHOT.plugin_id,
  count: Object.keys(PB_SNAPSHOT.companies).length,
} as const;

export function getPbSnapshot(slug: string | null | undefined): PbSnapshotEntry | null {
  if (!slug) return null;
  return PB_SNAPSHOT.companies[slug] ?? null;
}
export const listPbSnapshotSlugs = (): string[] => Object.keys(PB_SNAPSHOT.companies);
