import { NextRequest } from "next/server";
import { getBlob } from "@/lib/media/store";

/** Public read of a relayed upload: OnDemand's Create Media endpoint fetches the file from this URL. Token = 32 random bytes (hex); 2 h TTL. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ ok: false, code: "bad_token" }, { status: 400, headers: { "cache-control": "no-store" } });
  const e = getBlob(token);
  if (!e) return Response.json({ ok: false, code: "not_found", message: "expired or unknown upload token" }, { status: 404, headers: { "cache-control": "no-store" } });
  const body = new Uint8Array(e.bytes); // fresh view → BodyInit without SharedArrayBuffer typing issues
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": e.mime,
      "content-length": String(e.bytes.byteLength),
      "content-disposition": `inline; filename="${encodeURIComponent(e.name)}"`,
      "cache-control": "private, max-age=7200",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
