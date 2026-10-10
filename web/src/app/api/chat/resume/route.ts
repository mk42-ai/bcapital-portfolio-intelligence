import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, ENDPOINT_ID, REASONING_MODE, PLUGIN_IDS, UPSTREAM_USER_AGENT, resolvePluginIds } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Session-resume fallback (Agent 14) — non-streaming.
 *
 *   Browser → POST /api/chat/resume { sessionId, text, kind, pluginIds? }
 *   Server  → POST ${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query
 *             { query: text, endpointId: "predefined-deepseek-flash", responseMode: "sync", pluginIds, reasoningMode: "medium" }
 *   Server  → { ok, status, answer? }  (200) | { ok:false, status, error } (400 bad shape · 503 no key · 502 upstream error, with the upstream status)
 *
 * Used when a card (typically awaiting_browser_action "Done") must continue the SAME OnDemand session but no AgentInterface thread is open
 * to stream through /api/chat. The normal path is the streaming one (resume.ts → processMessage → /api/chat with context.sessionId).
 * The answer text is forwarded once and never logged or persisted; the apikey stays server-side.
 */
const KINDS = new Set(["clarification", "awaiting_input", "require_creds", "awaiting_browser_action"]);
const SESSION_RE = /^[A-Za-z0-9]{6,80}$/;
const TEXT_MAX = 8_000;
const bad = (error: string, status = 400) => Response.json({ ok: false, status, error }, { status });

export async function POST(req: NextRequest) {
  let body: { sessionId?: unknown; text?: unknown; kind?: unknown; pluginIds?: unknown } = {};
  try { body = await req.json(); } catch { return bad("expected JSON body"); }
  if (!body || typeof body !== "object") return bad("expected JSON object");
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!SESSION_RE.test(sessionId)) return bad("sessionId required (alphanumeric)");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return bad("text required");
  if (text.length > TEXT_MAX) return bad(`text too long (max ${TEXT_MAX} chars)`);
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!KINDS.has(kind)) return bad("kind must be one of clarification | awaiting_input | require_creds | awaiting_browser_action");
  if (body.pluginIds !== undefined && !(Array.isArray(body.pluginIds) && body.pluginIds.every((p) => typeof p === "string"))) return bad("pluginIds must be a string array");
  const { pluginIds } = resolvePluginIds(body.pluginIds ?? PLUGIN_IDS);
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return bad("No OnDemand key configured: set ONDEMAND_API_KEY on the server", 503);

  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 100_000);
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json", accept: "application/json", "user-agent": UPSTREAM_USER_AGENT },
      body: JSON.stringify({ query: text, endpointId: ENDPOINT_ID, responseMode: "sync", pluginIds, reasoningMode: REASONING_MODE }),
      signal: ac.signal, cache: "no-store",
    });
    const raw = await r.text().catch(() => "");
    let j: { message?: string; error?: string | { message?: string }; data?: { answer?: string; messageId?: string; sessionId?: string } } = {};
    try { j = JSON.parse(raw) as typeof j; } catch { /* non-JSON upstream body */ }
    if (!r.ok) {
      const msg = j?.message ?? (typeof j?.error === "string" ? j.error : j?.error?.message) ?? (raw ? raw.slice(0, 200) : r.statusText) ?? "upstream error";
      return Response.json({ ok: false, status: r.status, error: `OnDemand query failed (HTTP ${r.status}): ${msg}` }, { status: 502 });
    }
    return Response.json({ ok: true, status: r.status, answer: typeof j?.data?.answer === "string" ? j.data.answer : undefined, sessionId, kind, pluginIds }, { status: 200 });
  } catch (e) {
    const err = e as Error;
    const timedOut = err.name === "AbortError";
    return Response.json({ ok: false, status: timedOut ? 504 : 0, error: timedOut ? "OnDemand did not answer within 100 s" : `Upstream fetch failed: ${err.message || "fetch failed"}` }, { status: 502 });
  } finally { clearTimeout(timer); }
}
