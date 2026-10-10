"use client";
/**
 * Manual PitchBook refresh moved into Settings behind a reveal (Agent 26). Posts /api/pitchbook/run (INGEST_SECRET stays server-side).
 * SKELETON — Agent 26 implements.
 */
export function PitchbookRefresh() {
  return <details data-testid="pitchbook-refresh"><summary className="cursor-pointer text-sm font-medium">PitchBook · manual refresh</summary><p className="mt-2 text-xs text-muted">Weekly workflow 6aca3d3faeef8927baa25a05 (Mon 06:00 UTC) keeps 136/136 records fresh.</p></details>;
}
