import { Badge } from "@/components/ui/badge";
import { backendBaseUrl } from "@/lib/api";
/** Global "live backend" badge (server component, ISR 60 s): pings the portfolio API /health so every screen — including onboarding,
 *  company detail and settings — shows whether data is coming from the live Hono + Drizzle backend or the committed snapshot.
 *  `compact` renders just the dot (label visually hidden) — used when the nav rail is collapsed to the 64 px icon rail. */
export async function BackendStatus({ compact = false }: { compact?: boolean } = {}) {
  let live = false;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`${backendBaseUrl}/health`, { next: { revalidate: 60 }, signal: ctl.signal, headers: { accept: "application/json" } });
    clearTimeout(t); live = r.ok;
  } catch { live = false; }
  return (
    <span data-testid="backend-status" data-live={live ? "1" : "0"} className="inline-flex items-center gap-1.5 text-[11px] text-muted" title={backendBaseUrl}>
      <span aria-hidden className={`inline-block size-1.5 rounded-full ${live ? "bg-[#15803d]" : "bg-[#9ca3af]"}`} />
      {compact ? <span className="sr-only">{live ? "live backend" : "cached snapshot"}</span> : <Badge tone={live ? "primary" : "muted"}>{live ? "live backend" : "cached snapshot"}</Badge>}
    </span>
  );
}
