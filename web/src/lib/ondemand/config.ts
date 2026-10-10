import "server-only";
/**
 * Server-side OnDemand configuration (read once; never shipped to the client bundle).
 * Endpoints — from the LIVE public docs (GET /config/v1/public/docs/reference/api/{createchatsession|submitquery}, re-read 2026-10-10):
 *   POST https://api.on-demand.io/chat/v1/sessions                       body { externalUserId*, pluginIds[], contextMetadata[] }  → data.id
 *   POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query     body { query*, endpointId*, responseMode*: "stream", pluginIds[], reasoningMode, modelConfigs? }
 *   header: apikey: <key>   (securitySchemes.apikey: type apiKey, in header, name apikey)
 * Stream wire format (responseMode "stream", observed live 2026-10-10 — web/proof/probe-deepseek-pplx.log):
 *   event:<heartbeat|thinking|message> + data:{json} with eventType ∈ planning_thinking | planning_output | step_thinking | step_output |
 *   plugin_sources | fulfillment_thinking | fulfillment (answer delta) | metricsLog | statusLog; terminal `data:[DONE]`; errors `data:[ERROR]:{…}`.
 *
 * FIXED CONFIGURATION (2026-10-10): exactly ONE fulfillment model and exactly ONE plugin. There is no model/plugin fallback chain anywhere:
 * when Perplexity fails upstream the bridge reports a typed error and never substitutes another plugin.
 */
export const ONDEMAND_BASE_URL = (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
export const serverApiKey = () => process.env.ONDEMAND_API_KEY?.trim() || "";
/** DeepSeek Flash v4.1 — live endpoints API: endpoint_id "predefined-deepseek-flash", endpoint_name "deepseek-v4.1-flash". */
export const ENDPOINT_ID = "predefined-deepseek-flash";
export const ENDPOINT_LABEL = "DeepSeek Flash v4.1";
/** Accepted by the live API (probe 2026-10-10, HTTP 200). Only documented examples are low/high; "medium" is the value this product uses. */
export const REASONING_MODE = "medium";
export const RESPONSE_MODE = "stream" as const;
/** Perplexity — pinned, always sent first. Other plugins are sent ONLY when the user toggled them on (context.pluginIds), never substituted. */
export const PLUGIN_ID = "plugin-1722260873";
export const PLUGIN_NAME = "Perplexity";
export const PLUGIN_IDS: readonly string[] = [PLUGIN_ID];
/** Allow-list = the account's plugin catalogue (src/data/plugin-catalogue.json, from the live suggest-plugins API). */
import catalogue from "@/data/plugin-catalogue.json";
export const PLUGIN_CATALOGUE_IDS = new Set<string>((catalogue.plugins as { id: string }[]).map((p) => p.id));
export const PLUGIN_NAMES: Record<string, string> = Object.fromEntries((catalogue.plugins as { id: string; name: string }[]).map((p) => [p.id, p.name]));
/** PitchBook Investor Finder (plugin-1777018662, no credentials needed): sent ONLY on turns that carry a PitchBook context chip — allow-listed here
 *  so `resolvePluginIds` keeps it; it is not part of the curated toggle list. */
export const PITCHBOOK_PLUGIN_ID = "plugin-1777018662";
export const PITCHBOOK_PLUGIN_NAME = "Pitchbook Investor Finder";
PLUGIN_CATALOGUE_IDS.add(PITCHBOOK_PLUGIN_ID);
PLUGIN_NAMES[PITCHBOOK_PLUGIN_ID] ??= PITCHBOOK_PLUGIN_NAME;
/** Resolve the plugin list for one request: pinned Perplexity first, then every requested id that exists in the catalogue, in request order. */
export const resolvePluginIds = (requested: unknown): { pluginIds: string[]; dropped: string[] } => {
  const req = Array.isArray(requested) ? requested.map(String) : [];
  const ok = req.filter((id) => PLUGIN_CATALOGUE_IDS.has(id) && id !== PLUGIN_ID);
  return { pluginIds: [PLUGIN_ID, ...new Set(ok)], dropped: req.filter((id) => id !== PLUGIN_ID && !PLUGIN_CATALOGUE_IDS.has(id)) };
};
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
/** Cloudflare in front of api.on-demand.io returns 403 error 1010 ("browser_signature_banned") for bare/default user agents. */
export const UPSTREAM_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0";
/** Upstream deadlines for /api/chat (ms). */
export const CHAT_FIRST_BYTE_MS = Number(process.env.ONDEMAND_FIRST_BYTE_MS) || 90_000;
export const CHAT_TOTAL_MS = Number(process.env.ONDEMAND_TOTAL_MS) || 240_000;
export const CHAT_HEARTBEAT_MS = 10_000;
/** /api/chat header fast-path budget (ms) for the x-ondemand-session response header. Default 0: the stream is returned immediately (first client
 *  event < 400 ms) and the sessionId is delivered in-stream via CUSTOM ondemand.session; set ONDEMAND_SESSION_HEADER_WAIT_MS to re-enable the race. */
export const CHAT_SESSION_HEADER_WAIT_MS = Math.max(0, Number(process.env.ONDEMAND_SESSION_HEADER_WAIT_MS) || 0);
/** Payload audit (default ON): /api/chat appends {request (key redacted), first 10 raw upstream events} per turn to <cwd>/proof/chat-payload-audit.json. */
export const PAYLOAD_AUDIT = process.env.ONDEMAND_PAYLOAD_AUDIT !== "0";
/** Upstream plugin failure signature — OnDemand never emits an error frame for it; it only appears inside *_thinking / answer deltas. */
export { PLUGIN_ERROR_RE } from "./sse-adapter";
