import runMeta from "@/data/run-meta.json";
/**
 * Client-visible OnDemand constants. ONE model, ONE plugin — fixed on 2026-10-10 (no fallback chain anywhere in the product).
 * The server bridge (/api/chat) enforces the same values; the client never chooses a model or a plugin list.
 */
export type PluginDef = { id: string | null; name: string; purpose: string; status: "active" | "builtin"; defaultOn: boolean };
export const EARLIEST_TEST_UTC = process.env.NEXT_PUBLIC_EARLIEST_TEST_UTC || runMeta.earliest_test_utc || "2026-10-09T12:30:00Z";
export const PORTFOLIO_PLUGIN_ID = process.env.NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID || runMeta.portfolio_plugin_id || null;
/** Perplexity — the only OnDemand plugin this product sends. */
export const PLUGIN_ID = "plugin-1722260873";
export const PLUGIN_NAME = "Perplexity";
/** DeepSeek Flash v4.1 — endpoint_id predefined-deepseek-flash (endpoint_name deepseek-v4.1-flash). */
export const MODEL_ID = "predefined-deepseek-flash";
export const MODEL_LABEL = "DeepSeek Flash v4.1";
export const REASONING_MODE = "medium";
export const PLUGINS: PluginDef[] = [
  // No OnDemand plugin id could be obtained for the portfolio API (public docs expose no plugin-registration endpoint — see web/proof/plugin-registration.log).
  // Until NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID is set, portfolio data reaches the model as built-in systemContext fetched from the live backend (chat page → chat-shell).
  { id: PORTFOLIO_PLUGIN_ID, name: "Portfolio context", purpose: PORTFOLIO_PLUGIN_ID ? "This dashboard's own API (companies, news, sentiment, search)" : "Built-in: live backend data (sentiment, news, status) for your 1–5 context companies is injected server-side into every chat thread", status: PORTFOLIO_PLUGIN_ID ? "active" : "builtin", defaultOn: true },
  { id: PLUGIN_ID, name: PLUGIN_NAME, purpose: "Live web research with cited sources — the only plugin sent to OnDemand (always on)", status: "active", defaultOn: true },
];
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
export const DEFAULT_FOCUS = ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"];
