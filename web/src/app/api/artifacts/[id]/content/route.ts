import { NextRequest } from "next/server";
import { artifactsBackend } from "@/lib/artifacts/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Streams backend /artifacts/:id/content same-origin (for <img>/<video>/<iframe>); forwards ?download=1 and Range (video seeking). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400 });
  const dl = req.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = {};
  const range = req.headers.get("range"); if (range) headers.range = range;
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts/${encodeURIComponent(id)}/content${dl ? "?download=1" : ""}`, { headers, cache: "no-store" });
    if (!r.ok && r.status !== 206) return new Response(await r.text() || "Not found", { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "text/plain" } });
    const out = new Headers();
    for (const h of ["content-type", "content-length", "content-disposition", "content-range", "accept-ranges", "etag", "last-modified"]) { const v = r.headers.get(h); if (v) out.set(h, v); }
    out.set("cache-control", r.headers.get("cache-control") ?? "private, max-age=300");
    out.set("x-content-type-options", "nosniff");
    // HTML/SVG served same-origin must not execute scripts with our origin's privileges.
    const ctype = (out.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("html") || ctype.includes("svg")) out.set("content-security-policy", "sandbox; default-src 'none'; img-src data: 'self'; style-src 'unsafe-inline'");
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) { return Response.json({ code: "bad_gateway", message: (e as Error).message }, { status: 502 }); }
}
