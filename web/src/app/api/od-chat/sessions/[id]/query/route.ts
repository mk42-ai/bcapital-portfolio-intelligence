import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** /chat-od proxy transport: relay POST …/sessions/{id}/query with the server key and pipe OnDemand's SSE bytes back UNCHANGED, so the
 *  browser parser (components/od-chat/use-od-stream.ts) sees exactly the wire format of a direct connection. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9]+$/.test(id)) return Response.json({ message: "invalid session id", errorCode: "invalid_request" }, { status: 400 });
  const key = serverApiKey();
  if (!key) return Response.json({ message: "ONDEMAND_API_KEY is not configured on the server", errorCode: "unauthenticated" }, { status: 401 });
  const up = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions/${id}/query`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json", accept: "text/event-stream", "user-agent": UPSTREAM_USER_AGENT },
    body: await req.text(),
    signal: req.signal,
    cache: "no-store",
  });
  if (!up.ok || !up.body) {
    return new Response(await up.text().catch(() => ""), { status: up.status || 502, headers: { "content-type": up.headers.get("content-type") ?? "application/json" } });
  }
  return new Response(up.body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
