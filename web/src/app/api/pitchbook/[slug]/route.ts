import { NextRequest } from "next/server";
import { backendBaseUrl } from "@/lib/api";
export const runtime = "nodejs";
/** Same-origin read-only proxy for the chat rail: GET {backend}/pitchbook/{slug}, cached 120 s. No secrets are involved or forwarded. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(slug)) return Response.json({ message: "bad slug", errorCode: "bad_request" }, { status: 400 });
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${backendBaseUrl}/pitchbook/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" }, next: { revalidate: 120 }, signal: ctl.signal });
    clearTimeout(t);
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (e) { return Response.json({ message: `Backend unreachable: ${(e as Error).message}`, errorCode: "bad_gateway" }, { status: 502 }); }
}
