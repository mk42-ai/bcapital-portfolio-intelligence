import { NextRequest } from "next/server";
import { GET as getBlob } from "../route";

/** Same blob, addressed with the original file name as the last path segment (`/api/media/blob/<token>/<name.ext>`): OnDemand's fetcher
 *  infers the media type from the URL's extension — a bare-token URL with no extension was observed to hang (proof/upload/media-create.json). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { token } = await params;
  return getBlob(req, { params: Promise.resolve({ token }) });
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ token: string; name: string }> }) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
