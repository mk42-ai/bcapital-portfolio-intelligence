"use client";
import { useState } from "react";
import type { ArtifactFilter } from "@/lib/artifacts/types";
import { ArtifactsBrowser } from "./artifacts-panel";

/** Client half of /artifacts: same list/filters/preview as the panel; preview sits beside the list (≥1024px) or below as a sheet. */
export function ArtifactsPageClient() {
  const [filter, setFilter] = useState<ArtifactFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  return <ArtifactsBrowser variant="page" filter={filter} onFilter={setFilter} selectedId={selected} onSelect={(id) => { setSelected(id); if (id && window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => document.querySelector("[data-testid='artifact-preview']")?.scrollIntoView({ block: "nearest" })); }} />;
}
