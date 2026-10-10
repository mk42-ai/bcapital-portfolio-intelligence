"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { PitchbookResponse, PitchbookRunResponse } from "@/lib/types";
import { SyncedBadge } from "@/components/company/synced-badge";

/**
 * Manual PitchBook refresh (Settings → Portfolio backend) behind a <details> reveal. The weekly workflow (Mon 06:00 UTC) is the normal path;
 * this only relays POST /api/pitchbook/run {slug} — INGEST_SECRET stays on the server, and the result text is whatever the server honestly
 * answered (execution id, local job, or the error code). The synced badge reads the newest record for the first default company after mount
 * (client-only fetch → no hydration mismatch).
 */
type RunState = { phase: "idle" | "running" | "done" | "error"; text?: string };
const SLUG_RE = /^(all|[a-z0-9][a-z0-9-]{0,79})$/i;

export function PitchbookRefresh() {
  const [s] = useSettings();
  const firstSlug = s.companies[0] ?? null;
  const [synced, setSynced] = useState<{ slug: string; at: string | null } | null>(null);
  const [slug, setSlug] = useState("all");
  const [state, setState] = useState<RunState>({ phase: "idle" });
  useEffect(() => {
    if (!firstSlug) return;
    const ctl = new AbortController();
    fetch(`/api/pitchbook/${encodeURIComponent(firstSlug)}`, { signal: ctl.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<PitchbookResponse>) : null))
      .then((j) => setSynced({ slug: firstSlug, at: j?.data?.provenance?.fetched_at ?? null }))
      .catch(() => setSynced({ slug: firstSlug, at: null }));
    return () => ctl.abort();
  }, [firstSlug]);
  const valid = SLUG_RE.test(slug.trim());
  const run = async (e: FormEvent) => {
    e.preventDefault();
    const target = slug.trim().toLowerCase();
    if (!SLUG_RE.test(target)) { setState({ phase: "error", text: "slug must be 'all' or a company slug (letters, digits, dashes)" }); return; }
    setState({ phase: "running" });
    try {
      const r = await fetch("/api/pitchbook/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target === "all" ? {} : { slug: target }) });
      const j = (await r.json().catch(() => ({}))) as PitchbookRunResponse;
      if (!r.ok) { setState({ phase: "error", text: j.code === "no_ingest_secret" ? "Refresh needs INGEST_SECRET on the frontend server — not configured" : j.message ?? j.code ?? `HTTP ${r.status}` }); return; }
      setState({ phase: "done", text: j.execution_id ? `execution ${j.execution_id}${j.status ? ` · ${j.status}` : ""}` : j.job_id ? `local job ${j.job_id}` : j.status ?? "queued" });
    } catch (err) { setState({ phase: "error", text: (err as Error).message }); }
  };
  return (
    <details data-testid="pitchbook-refresh" className="rounded-md border border-border bg-surface-2 p-3">
      <summary className="cursor-pointer text-sm font-medium" data-testid="pitchbook-refresh-summary">PitchBook · manual refresh</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="pitchbook-refresh-synced">
          {synced ? <SyncedBadge syncedAt={synced.at} compact /> : <span className="inline-flex items-center gap-1"><Loader2 className="size-3 oiu-spin" aria-hidden /> Checking newest record…</span>}
          {synced && <span>· {synced.at ? synced.slug : `no record for ${synced.slug}`}</span>}
        </div>
        <p className="text-xs text-muted">The weekly workflow (Mon 06:00 UTC) keeps every portfolio record fresh. Use this only to pull one company — or <code>all</code> — ahead of schedule.</p>
        <form onSubmit={run} className="flex flex-wrap items-center gap-2">
          <label htmlFor="pb-refresh-slug" className="text-xs font-medium">Slug</label>
          <input id="pb-refresh-slug" value={slug} onChange={(e) => setSlug(e.target.value)} data-testid="pitchbook-refresh-slug" aria-invalid={!valid} spellCheck={false}
            className={cn("h-8 w-40 rounded-md border bg-surface px-2 font-mono text-xs outline-none focus-visible:border-[var(--brand-green-ink)]", valid ? "border-border" : "border-danger")} />
          <button type="submit" disabled={state.phase === "running" || !valid} data-testid="pitchbook-refresh-run"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)] disabled:opacity-60">
            {state.phase === "running" ? <Loader2 className="size-3 oiu-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />} Refresh now
          </button>
        </form>
        {state.text && <p role="status" className={cn("font-mono text-[11px]", state.phase === "error" ? "text-danger" : "text-muted")} data-testid="pitchbook-refresh-result" data-state={state.phase}>{state.text}</p>}
      </div>
    </details>
  );
}
