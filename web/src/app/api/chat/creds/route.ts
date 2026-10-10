import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * require_creds relay (Agent 12). Browser POSTs {sessionId, pluginId, fields:[{key,value}]} or {sessionId, pluginId, cancelled:true};
 * the route validates the shape strictly (400 otherwise), forwards ONCE to OnDemand
 * `/chat/v1/client/sessions/{sid}/messages/{mid}/tool-credentials` with the SERVER key (env, or an `x-ondemand-key` header override)
 * and answers {ok, status} only. Credential values are never logged, never persisted, never echoed back — every error message is static.
 */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_FIELDS = 32;
const MAX_KEY = 80;
const MAX_VALUE = 4096;

type Field = { key: string; value: string };
type Body = { sessionId: string; messageId: string; pluginId: string | null; cancelled: boolean; fields: Field[] };

const bad = (error: string) => Response.json({ ok: false, error }, { status: 400 });

/** Returns a validated body or a string describing WHICH part is malformed (shape only — never a value). */
function validate(raw: unknown): Body | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "expected a JSON object";
  const o = raw as Record<string, unknown>;
  if (typeof o.sessionId !== "string" || !ID_RE.test(o.sessionId)) return "sessionId must be a short alphanumeric string";
  const messageId = typeof o.messageId === "string" && ID_RE.test(o.messageId) ? o.messageId : "latest";
  let pluginId: string | null = null;
  if (o.pluginId !== undefined && o.pluginId !== null) {
    if (typeof o.pluginId !== "string" || !ID_RE.test(o.pluginId)) return "pluginId must be a string or null";
    pluginId = o.pluginId;
  }
  const cancelled = o.cancelled === true;
  if (o.cancelled !== undefined && typeof o.cancelled !== "boolean") return "cancelled must be a boolean";
  const fields: Field[] = [];
  if (!cancelled) {
    if (!Array.isArray(o.fields)) return "fields must be an array";
    if (o.fields.length > MAX_FIELDS) return "too many fields";
    for (const f of o.fields) {
      if (!f || typeof f !== "object") return "each field must be {key, value}";
      const { key, value } = f as Record<string, unknown>;
      if (typeof key !== "string" || !key || key.length > MAX_KEY) return "field key must be a non-empty string ≤ 80 chars";
      if (typeof value !== "string" || value.length > MAX_VALUE) return "field value must be a string ≤ 4 KB";
      fields.push({ key, value });
    }
  }
  return { sessionId: o.sessionId, messageId, pluginId, cancelled, fields };
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return Response.json({ ok: false, status: 503, error: "no server key" }, { status: 503 });

  const ct = req.headers.get("content-type") ?? "";
  if (!/application\/json/i.test(ct)) return bad("expected application/json");
  let raw: unknown;
  try { raw = await req.json(); } catch { return bad("expected JSON"); }
  const body = validate(raw);
  if (typeof body === "string") return bad(body);

  const payload = body.cancelled ? { pluginId: body.pluginId ?? undefined, cancelled: true } : { pluginId: body.pluginId ?? undefined, fields: body.fields };
  const url = `${ONDEMAND_BASE_URL}/chat/v1/client/sessions/${encodeURIComponent(body.sessionId)}/messages/${encodeURIComponent(body.messageId)}/tool-credentials`;
  try {
    const r = await fetch(url, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify(payload), cache: "no-store" });
    // Drain without reading into any log: the upstream body is irrelevant to the browser.
    void r.body?.cancel().catch(() => undefined);
    return Response.json({ ok: r.ok, status: r.status }, { status: r.ok ? 200 : 502 });
  } catch {
    // Network failure — deliberately no error text, so no payload fragment can leak through an exception message.
    return Response.json({ ok: false, status: 0 }, { status: 502 });
  }
}
