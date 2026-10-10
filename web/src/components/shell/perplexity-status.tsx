"use client";
/**
 * ONE honest Perplexity status banner in Settings (Agent 18). Fetches GET /api/plugins/status after mount (server probe, 60 s cache) and
 * renders a single neutral/green line — never a red card. A credit shortage on the OnDemand account is reported HERE, once; the chat thread
 * only shows a compact "see Settings → Plugins" line (error-banner.tsx / messages.tsx).
 */
import { useEffect, useState } from "react";

type State = "unknown" | "ok" | "no_credits" | "error";
type Status = { plugin: string; name: string; state: Exclude<State, "unknown">; message: string; checkedAt: string; httpStatus?: number };

const fmtTime = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

export function PerplexityStatus() {
  const [s, setS] = useState<Status | null>(null);
  const [http, setHttp] = useState<number | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/plugins/status", { signal: ac.signal, cache: "no-store" })
      .then(async (r) => { setHttp(r.status); const j = (await r.json().catch(() => null)) as Status | null; setS(j && typeof j.state === "string" ? j : { plugin: "plugin-1722260873", name: "Perplexity", state: "error", message: "", checkedAt: new Date().toISOString(), httpStatus: r.status }); })
      .catch((e) => { if ((e as Error)?.name !== "AbortError") setS({ plugin: "plugin-1722260873", name: "Perplexity", state: "error", message: "", checkedAt: new Date().toISOString(), httpStatus: 0 }); });
    return () => ac.abort();
  }, []);
  const state: State = s?.state ?? "unknown";
  const dot = state === "ok" ? "#0AC985" : state === "no_credits" ? "#d97706" : "#9ca3af";
  const box = state === "ok" ? { border: "1px solid #a7f3d0", background: "#E6FAF3", color: "#047857" } : { border: "1px solid #e5e7eb", background: "#f9fafb", color: "#111827" };
  return (
    <div data-testid="perplexity-status" data-state={state} role="status" className="rounded-md p-3 text-sm" style={box}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: dot }} />
        <div className="min-w-0 flex-1">
          {state === "unknown" && <span className="text-muted">Perplexity · checking credits…</span>}
          {state === "ok" && s && <span>Perplexity · credits available · checked {fmtTime(s.checkedAt)}</span>}
          {state === "no_credits" && s && (
            <>
              <p className="m-0">Perplexity has no credits on this OnDemand account — web research answers will fail until credits are added. Checked {fmtTime(s.checkedAt)}.</p>
              {s.message && <p className="m-0 mt-1 text-xs text-muted" data-testid="perplexity-status-upstream">Upstream: {s.message}</p>}
            </>
          )}
          {state === "error" && <span>Could not verify Perplexity (HTTP {s?.httpStatus ?? http ?? 0}){s?.message && !/^Could not verify/i.test(s.message) ? ` — ${s.message}` : ""}</span>}
        </div>
      </div>
    </div>
  );
}
