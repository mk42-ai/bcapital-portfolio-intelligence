import "server-only";
/**
 * Server-side OnDemand configuration (read once; never shipped to the client bundle).
 * Endpoints — from the LIVE public docs (GET /config/v1/public/docs/reference/api/{createchatsession|submitquery|getchatsessions|getchatmessages}, 2026-10-09):
 *   POST https://api.on-demand.io/chat/v1/sessions                       body { externalUserId*, pluginIds[] }           → data.id
 *   POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query     body { query*, endpointId*, responseMode*: "sync"|"stream"|"webhook", pluginIds[], fulfillmentOnly?, modelConfigs? }
 *   GET  https://api.on-demand.io/chat/v1/sessions?externalUserId&sort&cursor&limit
 *   GET  https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages?externalUserId&sort&cursor&limit
 *   header: apikey: <key>   (securitySchemes.apikey: type apiKey, in header, name apikey)
 * Stream wire format (observed live, responseMode "stream"): text/event-stream frames `event:<heartbeat|thinking|message>` + `data:{json}`;
 *   fulfillment text arrives as data:{"answer":"…","eventType":"fulfillment"}; planning/step reasoning as {"eventType":"*_thinking","thinking":{"delta"}};
 *   terminal frame `data:[DONE]`.
 */
export const ONDEMAND_BASE_URL = (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
export const serverApiKey = () => process.env.ONDEMAND_API_KEY?.trim() || "";
export const DEFAULT_ENDPOINT_ID = process.env.NEXT_PUBLIC_DEFAULT_MODEL || "predefined-claude-fable-5.1";
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
/**
 * Verified plugin list — each ID below returned a complete streamed answer with this account's key on 2026-10-09 (see docs/HANDOFF.md
 * "Plugin test matrix"). Order matters: Perplexity first. plugin-1777018662 (PitchBook) stays DEFERRED and is never sent.
 */
export const VERIFIED_PLUGINS: { id: string; name: string; default: boolean }[] = [
  { id: "plugin-1722260873", name: "Perplexity", default: true },                 // 200 · first token 37.5 s · 5 001 chars
  { id: "plugin-1741871229", name: "GPT Search", default: true },                 // 200 · first token 85.0 s · 6 638 chars
  { id: "plugin-1716429542", name: "US Stock Fundamental Analysis", default: false }, // 200 · 35.4 s · live FRVO quote — opt-in
  { id: "plugin-1748003575", name: "Reddit Posts", default: false },              // 200 · 38.4 s — opt-in
  { id: "plugin-1751872652", name: "X Search Agent", default: false },            // 200 · 105.3 s — opt-in (slow)
];
/** Tested but DROPPED from the chat: LinkedIn Search plugin-1718116202 answered 200 but its tool returned 404 ("company search tool failed") and 151 s latency. */
export const DEFAULT_PLUGIN_IDS = VERIFIED_PLUGINS.filter((p) => p.default).map((p) => p.id);
export const ALLOWED_PLUGIN_IDS = new Set(VERIFIED_PLUGINS.map((p) => p.id));
export const DEFERRED_PLUGIN_IDS = new Set(["plugin-1777018662"]);
