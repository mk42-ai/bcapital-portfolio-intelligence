import { NextRequest } from "next/server";
import { artifactsBackend } from "@/lib/artifacts/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
type OpenWire = { id: string; name?: string; mime?: string; media_id: string | null; source_url: string | null; content_url: string; url: string; signed: boolean; resign: string; extracted_text_url?: string | null; checked_at: string };

/**
 * Re-sign on open (Lane C). Signed OnDemand media links expire (the ones minted this week on 14 and 17 Oct 2026), so nothing persists a signed
 * URL: the backend row keeps media_id + the UNSIGNED sourceUrl, and this route asks the backend to look the media object up again and hand back
 * a fresh signed `url`. Falls back to the same-origin /content copy, so a link never dies even when the media object is gone.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!validId(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400, headers: noStore });
  const contentUrl = `/api/artifacts/${encodeURIComponent(id)}/content`;
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts/${encodeURIComponent(id)}/open`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return Response.json({ data: { id, url: contentUrl, signed: false, resign: `backend_${r.status}`, sourceUrl: null, contentUrl, mediaId: null, checkedAt: new Date().toISOString() } }, { status: r.status === 404 ? 404 : 200, headers: noStore });
    const j = (await r.json()) as { data: OpenWire };
    const d = j.data;
    const signed = d.signed && /^https:\/\//.test(d.url);
    return Response.json({ data: { id: d.id, url: signed ? d.url : contentUrl, signed, resign: d.resign, sourceUrl: d.source_url, contentUrl, mediaId: d.media_id, extractedTextUrl: d.extracted_text_url ?? null, checkedAt: d.checked_at, name: d.name, mime: d.mime } }, { headers: noStore });
  } catch (e) {
    return Response.json({ data: { id, url: contentUrl, signed: false, resign: `error: ${(e as Error).message.slice(0, 120)}`, sourceUrl: null, contentUrl, mediaId: null, checkedAt: new Date().toISOString() } }, { headers: noStore });
  }
}
