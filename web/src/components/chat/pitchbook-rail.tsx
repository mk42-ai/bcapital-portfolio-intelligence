"use client";
import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSettings } from "@/lib/settings";
import type { PitchbookResponse } from "@/lib/types";
import { PitchbookView, type PbStatus } from "@/components/company/pitchbook-view";

/** Chat right rail: PitchBook investor matches for the FIRST context company, via the same-origin proxy `/api/pitchbook/<slug>` (120 s cache). */
export function PitchbookRail({ companies }: { companies: { slug: string; name: string }[] }) {
  const [s] = useSettings();
  const slug = s.companies[0] ?? null; const name = companies.find((c) => c.slug === slug)?.name ?? slug ?? "";
  const [state, setState] = useState<{ slug: string | null; status: PbStatus; res: PitchbookResponse | null }>({ slug: null, status: "loading", res: null });
  useEffect(() => {
    if (!slug) return; let alive = true; setState({ slug, status: "loading", res: null });
    fetch(`/api/pitchbook/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as PitchbookResponse; })
      .then((res) => { if (alive) setState({ slug, status: "ok", res }); })
      .catch(() => { if (alive) setState({ slug, status: "offline", res: null }); });
    return () => { alive = false; };
  }, [slug]);
  return (
    <Card className="p-3" data-testid="pitchbook-rail">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Landmark className="size-3.5 text-muted" aria-hidden /> PitchBook{name ? <span className="truncate font-normal text-muted">· {name}</span> : null}</h2>
      {slug ? <PitchbookView slug={slug} name={name} res={state.res} status={state.status} variant="rail" /> : <p className="text-xs text-muted" data-testid="pb-no-context">Pick a context company to see investor matches.</p>}
    </Card>
  );
}
