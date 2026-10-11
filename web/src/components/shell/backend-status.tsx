import { Badge } from "@/components/ui/badge";
import { backendBaseUrl } from "@/lib/api";
/** Global "live backend" badge (server component). Pings the portfolio API /health with `cache: "no-store"` and a 4 s timeout on EVERY
 *  render — no ISR, so it can never claim "live" from a 60 s-old cached answer. Title shows the backend host; `data-live` = 1|0. */
export async function BackendStatus() {
  let live = false; let detail = "";
  const host = (() => { try { return new URL(backendBaseUrl).host; } catch { return backendBaseUrl; } })();
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`${backendBaseUrl}/health`, { cache: "no-store", signal: ctl.signal, headers: { accept: "application/json" } });
    clearTimeout(t); live = r.ok;
    if (r.ok) { const j = (await r.json().catch(() => null)) as { news_total?: number; db_record_count_total?: number; version?: string } | null; if (j) detail = ` · ${j.db_record_count_total ?? "?"} companies · ${j.news_total?.toLocaleString("en-US") ?? "?"} news · ${j.version ?? ""}`; }
    else detail = ` · HTTP ${r.status}`;
  } catch (e) { live = false; detail = ` · ${e instanceof Error && e.name === "AbortError" ? "timeout 4 s" : "unreachable"}`; }
  return (
    <span data-testid="backend-status" data-live={live ? "1" : "0"} data-backend-host={host} className="inline-flex items-center gap-1.5 text-[11px] text-muted" title={`${live ? "live backend" : "cached snapshot"} · ${host}${detail} · checked ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}`}>
      <span aria-hidden className={`inline-block size-1.5 rounded-full ${live ? "bg-[#15803d]" : "bg-[#9ea2a8]"}`} />
      <Badge tone={live ? "primary" : "muted"}>{live ? "live backend" : "cached snapshot"}</Badge>
    </span>
  );
}
