import runMeta from "@/data/run-meta.json";
/**
 * Client-visible OnDemand constants. ONE model, ONE plugin — fixed on 2026-10-10 (no fallback chain anywhere in the product).
 * The server bridge (/api/chat) enforces the same values; the client never chooses a model or a plugin list.
 */
export type PluginDef = { id: string | null; name: string; purpose: string; status: "active" | "builtin"; defaultOn: boolean };
export const EARLIEST_TEST_UTC = process.env.NEXT_PUBLIC_EARLIEST_TEST_UTC || runMeta.earliest_test_utc || "2026-10-09T12:30:00Z";
/** OnDemand id of the registered "Portfolio Plugin" (REST tool over this dashboard's backend). null until registration succeeds —
 *  2026-10-11: POST /plugin/v1 still rejects every schema encoding (proof/data-lane/plugin-registration-2026-10-11.log). */
export const PORTFOLIO_PLUGIN_ID: string | null = process.env.NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID || runMeta.portfolio_plugin_id || null;
/** Perplexity — the only OnDemand plugin this product sends (plus the Portfolio plugin once PORTFOLIO_PLUGIN_ID is set). */
export const PLUGIN_ID = "plugin-1722260873";
export const PLUGIN_NAME = "Perplexity";
/** DeepSeek Flash v4.1 — endpoint_id predefined-deepseek-flash (endpoint_name deepseek-v4.1-flash). */
export const MODEL_ID = "predefined-deepseek-flash";
export const MODEL_LABEL = "DeepSeek Flash v4.1";
export const REASONING_MODE = "medium";
const PORTFOLIO_PLUGIN: PluginDef = { id: PORTFOLIO_PLUGIN_ID, name: PORTFOLIO_PLUGIN_ID ? "Portfolio Plugin" : "Portfolio context", purpose: PORTFOLIO_PLUGIN_ID ? "This dashboard's own API (companies, news, sentiment, search) — answers portfolio/sentiment questions from backend data first" : "Built-in: live backend data (sentiment, news, status) for your 1–5 context companies is injected server-side into every chat thread", status: PORTFOLIO_PLUGIN_ID ? "active" : "builtin", defaultOn: true };
const PERPLEXITY_PLUGIN: PluginDef = { id: PLUGIN_ID, name: PLUGIN_NAME, purpose: PORTFOLIO_PLUGIN_ID ? "Live web research with cited sources (always on)" : "Live web research with cited sources — the only plugin sent to OnDemand (always on)", status: "active", defaultOn: true };
/** Portfolio plugin FIRST (so sentiment/portfolio questions are routed to backend data before web research), then Perplexity.
 *  Until NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID is set the first entry is the built-in systemContext row (id null — never sent as a plugin id). */
export const PLUGINS: PluginDef[] = [PORTFOLIO_PLUGIN, PERPLEXITY_PLUGIN];
/** Plugin ids to send, in priority order: [portfolio, perplexity] when registered, else [perplexity]. */
export const PLUGIN_IDS_IN_ORDER: string[] = PORTFOLIO_PLUGIN_ID ? [PORTFOLIO_PLUGIN_ID, PLUGIN_ID] : [PLUGIN_ID];
/** Routing hint for the server bridge: true when a question should hit the Portfolio plugin first (sentiment / portfolio / news-count / deltas). */
export const PORTFOLIO_QUESTION = /\b(sentiment|portfolio|deltas?|movers?|news count|how many (news|companies)|focus compan|negative|positive|roll-?ups?)\b/i;
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
export const DEFAULT_FOCUS = ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"];
