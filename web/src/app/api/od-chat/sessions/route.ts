import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT, DEFAULT_EXTERNAL_USER_ID, resolvePluginIds, PLUGIN_IDS } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /chat-od proxy transport (used when the browser holds no OnDemand key): create a chat session with the server key. */
export async function POST(req: NextRequest) {
  const key = serverApiKey();
  if (!key) return Response.json({ message: "ONDEMAND_API_KEY is not configured on the server", errorCode: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { externalUserId?: string; pluginIds?: string[] };
  const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT },
    body: JSON.stringify({ externalUserId: (body.externalUserId || DEFAULT_EXTERNAL_USER_ID).slice(0, 64), pluginIds: resolvePluginIds(body.pluginIds ?? PLUGIN_IDS).pluginIds }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { message?: string; data?: { id?: string } };
  if (!r.ok || !j?.data?.id) return Response.json({ message: j?.message ?? `OnDemand create session failed (HTTP ${r.status})`, errorCode: "server_error" }, { status: r.status >= 400 ? r.status : 502 });
  return Response.json({ sessionId: j.data.id });
}
