import { NextRequest } from "next/server";
import { backendBaseUrl } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Relays "Run now" to POST {backend}/pitchbook/run, adding the X-Ingest-Secret from the server env (INGEST_SECRET). The secret never reaches
 *  the browser; without it the route answers 503 {code:'no_ingest_secret'} so the UI can say so instead of failing silently. */
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET?.trim();
  if (!secret) return Response.json({ code: "no_ingest_secret", message: "INGEST_SECRET is not configured on the frontend server" }, { status: 503 });
  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const raw = typeof (body as { slug?: unknown })?.slug === "string" ? (body as { slug: string }).slug.trim().toLowerCase() : undefined;
  // "all" / empty → whole portfolio; anything else must be a plain company slug (never forwarded unvalidated).
  const slug = !raw || raw === "all" ? undefined : raw;
  if (slug && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return Response.json({ code: "bad_request", message: "slug must be 'all' or letters, digits and dashes" }, { status: 400 });
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(`${backendBaseUrl}/pitchbook/run`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "X-Ingest-Secret": secret }, body: JSON.stringify(slug ? { slug } : {}), signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    const text = await r.text();
    return new Response(text || "{}", { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch (e) { return Response.json({ code: "bad_gateway", message: `Backend unreachable: ${(e as Error).message}` }, { status: 502 }); }
}
