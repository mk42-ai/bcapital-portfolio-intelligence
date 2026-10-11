import { NextRequest } from "next/server";
import { signedUrlFor } from "@/lib/artifacts/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/<id>/signed-url[?download=1] — re-sign on open. Forwards to backend GET /artifacts/:id/signed-url which looks the
 * artifact's media_id up in OnDemand (fetch-media list) and returns a FRESH signed url (source "ondemand"); without media / on failure it
 * returns the same-origin /api/artifacts/<id>/content url (source "backend") with HTTP 200. Nothing signed is ever persisted or cached here.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400, headers: { "cache-control": "no-store" } });
  const download = req.nextUrl.searchParams.get("download") === "1";
  const data = await signedUrlFor(id, download);
  return Response.json({ data }, { headers: { "cache-control": "no-store" } });
}
