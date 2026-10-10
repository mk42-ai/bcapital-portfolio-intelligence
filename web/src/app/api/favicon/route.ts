import { NextRequest } from "next/server";

/**
 * Same-origin favicon proxy for source chips. Hitting Google's s2 endpoint directly from the page produced `Failed to load resource: 404`
 * console errors for hosts Google has no icon for (orennia.substack.com, thinkgeoenergy.com …). Here an unknown host answers 204 — the
 * <img onError> hides it exactly as before, but the browser console stays clean and the HAR shows no failed request. Icons are cached 1 day.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST_RE = /^[a-z0-9.-]{3,253}$/i;
const UPSTREAM = (host: string) => `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${host}&size=32`;
const EMPTY = new Response(null, { status: 204, headers: { "cache-control": "public, max-age=3600" } });

export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("host") ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!host || !HOST_RE.test(host)) return EMPTY.clone();
  try {
    const r = await fetch(UPSTREAM(host), { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) bcap-portfolio-intelligence/1.0" }, signal: AbortSignal.timeout(4000), cache: "force-cache" });
    if (!r.ok || !r.body) return EMPTY.clone();
    const ct = r.headers.get("content-type") ?? "image/png";
    if (!ct.startsWith("image/")) return EMPTY.clone();
    return new Response(r.body, { status: 200, headers: { "content-type": ct, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-favicon-host": host } });
  } catch {
    return EMPTY.clone();
  }
}
