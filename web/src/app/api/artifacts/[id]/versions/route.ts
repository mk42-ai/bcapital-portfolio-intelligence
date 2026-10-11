import { NextRequest } from "next/server";
import { versionsFor } from "@/lib/artifacts/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/<id>/versions — version history. Forwards to backend GET /artifacts/:id/versions (all non-deleted rows sharing the
 * artifact's name + thread_id, newest version first) and returns `{ data: [...wire rows], name, thread_id, latest_version }` in the backend's
 * snake_case shape so `versionsFromWire()` applies on the client. Never cached.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const r = await versionsFor(id);
    if (r.status !== 200) return Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
    const v = r.body as import("@/lib/artifacts/types").ArtifactVersions;
    return Response.json({ data: v.versions.map((x) => ({ id: x.id, version: x.version, size_bytes: x.sizeBytes, created_at: x.createdAt, media_status: x.mediaStatus, media_id: x.mediaId, source: x.source, content_url: x.contentUrl })), name: v.name, thread_id: v.threadId, latest_version: v.latestVersion }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ code: "backend_unreachable", message: (e as Error).message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
