"use client";
import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSettings } from "@/lib/settings";
import type { PitchbookResponse } from "@/lib/types";
import { PitchbookView, type PbSource, type PbStatus } from "@/components/company/pitchbook-view";

/**
 * Chat right rail: PitchBook investor matches for the FIRST context company.
 * `initial`: records pre-fetched SERVER-SIDE by the chat page (stored workflow data, DEFAULT_FOCUS slugs) keyed by slug. When the context
 * company is in `initial` the rail renders from it with ZERO network on first paint (pb-view data-source="server"). Only for a context
 * company NOT in `initial` (non-default context) does it fetch the same-origin proxy `/api/pitchbook/<slug>` (120 s cache) after mount
 * (data-source="client"). "offline" means the backend (and the committed snapshot) had no record.
 */
export function PitchbookRail({ companies, initial }: { companies: { slug: string; name: string }[]; initial?: Record<string, PitchbookResponse | null> }) {
  const [s] = useSettings();
  const slug = s.companies[0] ?? null; const name = companies.find((c) => c.slug === slug)?.name ?? slug ?? "";
  const fromInitial = (s: string | null): { slug: string | null; status: PbStatus; res: PitchbookResponse | null; source: PbSource } | null =>
    s && initial && s in initial ? { slug: s, status: initial[s] ? "ok" : "offline", res: initial[s], source: "server" } : null;
  // Client-fetched records are cached per slug for the session so switching context back and forth does not refetch.
  const [cache, setCache] = useState<Record<string, PitchbookResponse | null>>({});
  const [state, setState] = useState<{ slug: string | null; status: PbStatus; res: PitchbookResponse | null; source: PbSource }>(() => fromInitial(slug) ?? { slug: null, status: "loading", res: null, source: "client" });
  useEffect(() => {
    if (!slug) return;
    const init = fromInitial(slug); if (init) { setState(init); return; } // server-provided → no network
    if (slug in cache) { setState({ slug, status: cache[slug] ? "ok" : "offline", res: cache[slug], source: "client" }); return; }
    let alive = true; setState({ slug, status: "loading", res: null, source: "client" });
    fetch(`/api/pitchbook/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as PitchbookResponse; })
      .then((res) => { if (!alive) return; setCache((c) => ({ ...c, [slug]: res })); setState({ slug, status: "ok", res, source: "client" }); })
      .catch(() => { if (!alive) return; setCache((c) => ({ ...c, [slug]: null })); setState({ slug, status: "offline", res: null, source: "client" }); });
    return () => { alive = false; };
  }, [slug, initial]); // `cache` is read, not a trigger (no eslint config in repo)
  return (
    <Card className="p-3" data-testid="pitchbook-rail">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Landmark className="size-3.5 text-muted" aria-hidden /> PitchBook{name ? <span className="truncate font-normal text-muted">· {name}</span> : null}</h2>
      {slug ? <PitchbookView slug={slug} name={name} res={state.res} status={state.status} source={state.source} variant="rail" /> : <p className="text-xs text-muted" data-testid="pb-no-context">Pick a context company to see investor matches.</p>}
    </Card>
  );
}
