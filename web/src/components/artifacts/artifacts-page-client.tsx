"use client";
import { useState } from "react";
import { ArtifactsBrowser, DEFAULT_FILTERS, type ArtifactsFilters } from "./artifacts-panel";

/** Client half of /artifacts: list + type/thread/date filters + preview beside the list (≥1024px) or below as a sheet. */
export function ArtifactsPageClient() {
  const [filters, setFilters] = useState<ArtifactsFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  return <ArtifactsBrowser variant="page" filters={filters} onFilters={setFilters} selectedId={selected} onSelect={(id) => { setSelected(id); if (id && window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => document.querySelector("[data-testid='artifact-preview']")?.scrollIntoView({ block: "nearest" })); }} />;
}
