import { NextRequest } from "next/server";
import { getPitchbook } from "@/lib/api";
export const runtime = "nodejs";
/** Same-origin read-only proxy for the chat rail (non-default context companies only — default ones are server-rendered): GET {backend}/pitchbook/{slug}
 *  through `getPitchbook` (ISR 120 s, committed snapshot fallback). 404 only when neither the backend nor the snapshot has a record. No secrets involved. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(slug)) return Response.json({ message: "bad slug", errorCode: "bad_request" }, { status: 400 });
  const r = await getPitchbook(slug);
  if (!r.data) return Response.json({ message: `No PitchBook record for ${slug}`, errorCode: "not_found", source: r.source }, { status: 404 });
  return Response.json(r.data, { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=300", "x-pb-source": r.source } });
}
