/**
 * OnDemand configuration that is safe in BOTH bundles (no `server-only`): the chat query now runs in the browser
 * (lib/ondemand/browser-chat.ts → lib/ondemand/chat-bridge.ts), so the fixed model / plugin / deadline settings live here and
 * lib/ondemand/config.ts re-exports them alongside the server-only values.
 *
 * Endpoints — from the LIVE public docs (GET /config/v1/public/docs/reference/api/{createchatsession|submitquery}, re-read 2026-10-10):
 *   POST https://api.on-demand.io/chat/v1/sessions                       body { externalUserId*, pluginIds[], contextMetadata[] }  → data.id
 *   POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query     body { query*, endpointId*, responseMode*: "stream", pluginIds[], reasoningMode, modelConfigs? }
 *   header: apikey: <key>   (securitySchemes.apikey: type apiKey, in header, name apikey)
 * CORS (preflight probed 2026-10-12): an origin ALLOW-LIST — *.vercel.app, localhost:3000, localhost:5173, app.on-demand.io get
 * access-control-allow-origin + allow-headers `*`; *.vercel.run sandboxes and other origins get no CORS headers (→ proxy fallback, browser-chat.ts).
 * Stream wire format (responseMode "stream", observed live 2026-10-10 — web/proof/probe-deepseek-pplx.log):
 *   event:<heartbeat|thinking|message> + data:{json} with eventType ∈ planning_thinking | planning_output | step_thinking | step_output |
 *   plugin_sources | fulfillment_thinking | fulfillment (answer delta) | metricsLog | statusLog; terminal `data:[DONE]`; errors `data:[ERROR]:{…}`.
 *
 * FIXED CONFIGURATION (2026-10-10): exactly ONE fulfillment model and exactly ONE plugin. There is no model/plugin fallback chain anywhere:
 * when Perplexity fails upstream the bridge reports a typed error and never substitutes another plugin.
 */
import catalogue from "@/data/plugin-catalogue.json";

/** OnDemand base URL used by the browser (the server reads ONDEMAND_BASE_URL in config.ts). */
export const PUBLIC_ONDEMAND_BASE_URL = (process.env.NEXT_PUBLIC_ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
/** The OnDemand key shipped to the browser so the chat query runs client-side. It is PUBLIC: anyone who loads the site can read it. */
export const PUBLIC_ONDEMAND_API_KEY = process.env.NEXT_PUBLIC_ONDEMAND_API_KEY?.trim() || "";
/** "direct" (default): the browser calls OnDemand itself. "proxy": every turn goes through POST /api/chat (mock-SSE specs, replay scripts). */
export const CHAT_TRANSPORT: "direct" | "proxy" = process.env.NEXT_PUBLIC_CHAT_TRANSPORT === "proxy" ? "proxy" : "direct";
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
export const PLUGIN_CATALOGUE_IDS = new Set<string>((catalogue.plugins as { id: string }[]).map((p) => p.id));
export const PLUGIN_NAMES: Record<string, string> = Object.fromEntries((catalogue.plugins as { id: string; name: string }[]).map((p) => [p.id, p.name]));
/** PitchBook Investor Finder (plugin-1777018662, no credentials needed): sent ONLY on turns that carry a PitchBook context chip — allow-listed here
 *  so `resolvePluginIds` keeps it; it is not part of the curated toggle list. */
export const PITCHBOOK_PLUGIN_ID = "plugin-1777018662";
export const PITCHBOOK_PLUGIN_NAME = "Pitchbook Investor Finder";
PLUGIN_CATALOGUE_IDS.add(PITCHBOOK_PLUGIN_ID);
PLUGIN_NAMES[PITCHBOOK_PLUGIN_ID] ??= PITCHBOOK_PLUGIN_NAME;
/** Portfolio Plugin — registered 2026-10-11T10:13:56Z via the AI tool generator (plugin-1791713636 / agent-1791713636, REST tool over this
 *  product's own backend; see proof/data-lane/plugin-registration-2026-10-11b.log.txt). Allow-listed so `resolvePluginIds` keeps it, and ordered
 *  FIRST for portfolio-internal questions so sentiment/news asks route to the portfolio feed rather than to Perplexity. */
export const PORTFOLIO_PLUGIN_ID: string | null = process.env.NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID || "plugin-1791713636";
export const PORTFOLIO_QUESTION_RE = /\b(sentiment|portfolio|deltas?|movers?|news count|how many (news|companies)|focus compan|negative|positive|roll-?ups?)\b/i;
if (PORTFOLIO_PLUGIN_ID) { PLUGIN_CATALOGUE_IDS.add(PORTFOLIO_PLUGIN_ID); PLUGIN_NAMES[PORTFOLIO_PLUGIN_ID] ??= "Portfolio Plugin"; }
/** Plugins switched off for now: never sent on a session create or a query, even when a stored toggle or a caller still asks for them. */
export const DISABLED_PLUGIN_IDS: ReadonlySet<string> = new Set(["plugin-1785777296"]); // X search
/** Resolve the plugin list for one request: pinned Perplexity first, then every requested id that exists in the catalogue, in request order. */
export const resolvePluginIds = (requested: unknown, query?: string): { pluginIds: string[]; dropped: string[] } => {
  const req = Array.isArray(requested) ? requested.map(String) : [];
  const ok = req.filter((id) => PLUGIN_CATALOGUE_IDS.has(id) && id !== PLUGIN_ID && !DISABLED_PLUGIN_IDS.has(id));
  const base = [PLUGIN_ID, ...new Set(ok)];
  // Portfolio-internal question → the portfolio plugin leads (and is added if the client did not send it); everything else keeps Perplexity first.
  const portfolioFirst = !!PORTFOLIO_PLUGIN_ID && !!query && PORTFOLIO_QUESTION_RE.test(query);
  const pluginIds = portfolioFirst ? [PORTFOLIO_PLUGIN_ID!, ...base.filter((id) => id !== PORTFOLIO_PLUGIN_ID)] : base;
  return { pluginIds, dropped: req.filter((id) => id !== PLUGIN_ID && (!PLUGIN_CATALOGUE_IDS.has(id) || DISABLED_PLUGIN_IDS.has(id))) };
};
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
/** Upstream deadlines for a chat turn (ms). The ONDEMAND_* overrides are only visible on the server; the browser uses the defaults. */
export const CHAT_FIRST_BYTE_MS = Number(process.env.ONDEMAND_FIRST_BYTE_MS) || 90_000;
export const CHAT_TOTAL_MS = Number(process.env.ONDEMAND_TOTAL_MS) || 240_000;
export const CHAT_HEARTBEAT_MS = 10_000;
/** Upstream plugin failure signature — OnDemand never emits an error frame for it; it only appears inside *_thinking / answer deltas. */
export { PLUGIN_ERROR_RE } from "./sse-adapter";
