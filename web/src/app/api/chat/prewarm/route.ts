import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT, DEFAULT_EXTERNAL_USER_ID, resolvePluginIds, PLUGIN_IDS } from "@/lib/ondemand/config";

/**
 * Plugin/session pre-warm (TTFT work, step 5). The first turn of a thread normally pays the OnDemand `POST /chat/v1/sessions` round-trip
 * (~200–400 ms) INSIDE the stream before the query can be submitted. The shell calls this route on page load; it creates a session for the
 * current externalUserId + explicit plugin set and hands the id back so the first `/api/chat` call can send `context.sessionId` and skip the
 * create step (`viaHeader:true` in the ondemand.session frame). Sessions are cheap and single-use here: each warm id is consumed once.
 * The API key never leaves the server; a user-supplied x-ondemand-key is honoured like the chat bridge does.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const warm = new Map<string, { id: string; at: number }>();
const TTL_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return Response.json({ ok: false, reason: "no_key" }, { status: 503 });
  const externalUserId = (req.nextUrl.searchParams.get("externalUserId") ?? DEFAULT_EXTERNAL_USER_ID).slice(0, 64);
  const { pluginIds } = resolvePluginIds((req.nextUrl.searchParams.get("pluginIds") ?? PLUGIN_IDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean));
  const cacheKey = `${externalUserId}|${pluginIds.join(",")}`;
  const hit = warm.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS && req.nextUrl.searchParams.get("fresh") !== "1") { warm.delete(cacheKey); return Response.json({ ok: true, sessionId: hit.id, pluginIds, source: "cache", ageMs: Date.now() - hit.at }, { headers: { "cache-control": "no-store" } }); }
  const t0 = Date.now();
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify({ externalUserId, pluginIds }), cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as { data?: { id?: string }; message?: string };
    if (!r.ok || !j?.data?.id) return Response.json({ ok: false, reason: `upstream_http_${r.status}`, message: j?.message ?? null }, { status: 502, headers: { "cache-control": "no-store" } });
    // Also warm a spare for the next page load.
    void fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify({ externalUserId, pluginIds }), cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async (r2) => { const j2 = (await r2.json().catch(() => ({}))) as { data?: { id?: string } }; if (r2.ok && j2?.data?.id) warm.set(cacheKey, { id: j2.data.id, at: Date.now() }); }).catch(() => {});
    return Response.json({ ok: true, sessionId: j.data.id, pluginIds, source: "created", elapsedMs: Date.now() - t0 }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, reason: "fetch_failed", message: String((e as Error)?.message ?? e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
