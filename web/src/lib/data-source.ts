/**
 * ONE definition of the data-source badge shared by every page-level header (News Pulse, Overview, Company) and QA.
 * A page is "live" only if EVERY dataset it rendered came from the backend; if some fell back to the committed snapshot it is
 * "partial" (amber — never blue); if none came from the backend it is "snapshot".
 */
export type FetchSource = "live" | "snapshot";
export type DataSource = "live" | "partial" | "snapshot";
export type NamedSource = { name: string; source: FetchSource };
export type ResolvedDataSource = { source: DataSource; label: string; detail: string; fallbacks: string[] };

export function resolveDataSource(sources: (FetchSource | NamedSource)[]): ResolvedDataSource {
  const named = sources.map((s, i) => (typeof s === "string" ? { name: `dataset ${i + 1}`, source: s } : s));
  const live = named.filter((s) => s.source === "live").length;
  const fallbacks = named.filter((s) => s.source !== "live").map((s) => s.name);
  if (named.length === 0 || live === 0) return { source: "snapshot", label: "cached snapshot", detail: named.length ? `all ${named.length} datasets served from the committed snapshot (backend unreachable)` : "no datasets fetched", fallbacks };
  if (fallbacks.length === 0) return { source: "live", label: "live backend", detail: `all ${named.length} datasets fetched from the live backend`, fallbacks };
  return { source: "partial", label: `partial (cached fallback for ${fallbacks.join(", ")})`, detail: `${live} of ${named.length} datasets live; cached snapshot for ${fallbacks.join(", ")}`, fallbacks };
}

/** Tailwind classes per resolved source. Partial is amber #B45309 (no blue hue anywhere in the product). */
export const DATA_SOURCE_CLASS: Record<DataSource, string> = {
  live: "border-[#a7f3d0] bg-[#E6FAF3] text-[#065f46]",
  partial: "border-[#fcd34d] bg-[#fffbeb] text-[#B45309]",
  snapshot: "border-border bg-transparent text-muted",
};
