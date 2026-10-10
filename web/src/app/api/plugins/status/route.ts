import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT, DEFAULT_EXTERNAL_USER_ID, PLUGIN_ID, PLUGIN_NAME, ENDPOINT_ID } from "@/lib/ondemand/config";

/**
 * GET /api/plugins/status — ONE honest Perplexity probe (Agent 18), server-side, 60 s cache.
 * Creates a session with pluginIds [PLUGIN_ID] and submits a tiny query that asks for the plugin; the upstream frames are scanned for the
 * credit-shortage signature ("not enough credits" / "insufficient credits" / quota) and for `plugin_sources` (= the plugin really answered).
 * Runtime is capped at 12 s; the API key never leaves the server and is never echoed. States: ok | no_credits | error.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PluginStatus = { plugin: string; name: string; state: "ok" | "no_credits" | "error"; message: string; checkedAt: string; httpStatus?: number; cached?: boolean };

const NO_CREDITS_RE = /not enough credits|insufficient credits|quota/i;
const PLUGIN_FAIL_RE = /tool returned an error|"error"\s*:\s*"internal server error"|rate limit exceeded/i;
const CACHE_MS = 60_000;
const CAP_MS = 12_000;
let cache: { at: number; body: PluginStatus } | null = null;

const strip = (s: string, key: string) => (key ? s.split(key).join("[redacted]") : s);

async function probe(key: string): Promise<PluginStatus> {
  const checkedAt = new Date().toISOString();
  const deadline = Date.now() + CAP_MS;
  const H = { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT };
  const out = (state: PluginStatus["state"], message: string, httpStatus?: number): PluginStatus => ({ plugin: PLUGIN_ID, name: PLUGIN_NAME, state, message: strip(message, key).slice(0, 300), checkedAt, ...(httpStatus ? { httpStatus } : {}) });
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: H, body: JSON.stringify({ externalUserId: DEFAULT_EXTERNAL_USER_ID, pluginIds: [PLUGIN_ID] }), cache: "no-store", signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    const j = (await r.json().catch(() => ({}))) as { data?: { id?: string }; message?: string };
    const msg = j?.message ?? "";
    if (!r.ok || !j?.data?.id) return NO_CREDITS_RE.test(msg) ? out("no_credits", msg, r.status) : out("error", `Could not verify ${PLUGIN_NAME} (HTTP ${r.status})${msg ? ` — ${msg}` : ""}`, r.status);
    const sessionId = j.data.id;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1000, deadline - Date.now()));
    try {
      // "ping" alone makes the planner skip every plugin, which would prove nothing — ask for the plugin explicitly so a credit error can surface.
      const q = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`, { method: "POST", headers: H, body: JSON.stringify({ query: `Use ${PLUGIN_NAME} to search the web: ping`, endpointId: ENDPOINT_ID, responseMode: "stream", reasoningMode: "low", pluginIds: [PLUGIN_ID], fulfillmentOnly: false }), cache: "no-store", signal: ac.signal });
      if (!q.ok || !q.body) {
        const t = await q.text().catch(() => "");
        return NO_CREDITS_RE.test(t) ? out("no_credits", t, q.status) : out("error", `Could not verify ${PLUGIN_NAME} (HTTP ${q.status})`, q.status);
      }
      const reader = q.body.getReader(); const dec = new TextDecoder(); let buf = "";
      let sawSources = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const m = buf.match(/[^\n]*(?:not enough credits|insufficient credits|quota)[^\n]*/i);
        if (m) { ac.abort(); return out("no_credits", extractMessage(m[0])); }
        const f = buf.match(/[^\n]*(?:tool returned an error|"error"\s*:\s*"internal server error"|rate limit exceeded)[^\n]*/i);
        if (f) { ac.abort(); return out("error", extractMessage(f[0])); }
        if (/"eventType":"plugin_sources"/.test(buf) || /"status":\s*"completed"/.test(buf)) { sawSources = /plugin_sources/.test(buf); ac.abort(); break; }
        if (buf.length > 200_000) buf = buf.slice(-50_000);
      }
      return out("ok", sawSources ? `${PLUGIN_NAME} returned sources — credits available` : `Query accepted — no credit error reported within ${CAP_MS / 1000} s`);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return out("ok", `Query accepted — no credit error reported within ${CAP_MS / 1000} s`);
      throw e;
    } finally { clearTimeout(timer); }
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (NO_CREDITS_RE.test(m)) return out("no_credits", m);
    return out("error", `Could not verify ${PLUGIN_NAME} (${(e as Error)?.name === "TimeoutError" ? "timeout" : "network error"})`);
  }
}

/** Pull the human message out of an SSE data line when possible; otherwise return the matched text. */
function extractMessage(line: string): string {
  try {
    const j = JSON.parse(line.replace(/^data:\s*/, "")) as Record<string, unknown>;
    const pick = (v: unknown): string | null => {
      if (typeof v === "string") return NO_CREDITS_RE.test(v) || PLUGIN_FAIL_RE.test(v) ? v : null;
      if (v && typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) { const p = pick(x); if (p) return p; } }
      return null;
    };
    return pick(j) ?? line;
  } catch { return line; }
}

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return Response.json({ ...cache.body, cached: true }, { headers: { "cache-control": "no-store" } });
  const key = serverApiKey();
  if (!key) {
    const body: PluginStatus = { plugin: PLUGIN_ID, name: PLUGIN_NAME, state: "error", message: `Could not verify ${PLUGIN_NAME} (no server key)`, checkedAt: new Date().toISOString(), httpStatus: 503 };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }
  const body = await probe(key);
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
