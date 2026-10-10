import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * require_creds relay (submit-query v1): POST {pluginId, fields:[{key,value}]} or {cancelled:true} to the client tool-credentials route.
 * Server-side only: the apikey never reaches the browser, the credential values are forwarded once and never logged or persisted.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return Response.json({ error: "no server key" }, { status: 503 });
  let body: { sessionId?: string; messageId?: string; pluginId?: string | null; cancelled?: boolean; fields?: { key: string; value: string }[] } = {};
  try { body = await req.json(); } catch { return Response.json({ error: "expected JSON" }, { status: 400 }); }
  if (!body.sessionId || !/^[A-Za-z0-9]+$/.test(body.sessionId)) return Response.json({ error: "sessionId required" }, { status: 400 });
  const mid = body.messageId && /^[A-Za-z0-9]+$/.test(body.messageId) ? body.messageId : "latest";
  const payload = body.cancelled ? { pluginId: body.pluginId ?? undefined, cancelled: true } : { pluginId: body.pluginId ?? undefined, fields: (body.fields ?? []).map((f) => ({ key: String(f.key).slice(0, 80), value: String(f.value).slice(0, 4000) })) };
  const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/client/sessions/${body.sessionId}/messages/${mid}/tool-credentials`, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify(payload), cache: "no-store" });
  return Response.json({ ok: r.ok, status: r.status }, { status: r.ok ? 200 : 502 });
}
