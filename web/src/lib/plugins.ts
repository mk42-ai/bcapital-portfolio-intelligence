import runMeta from "@/data/run-meta.json";
export type PluginDef = { id: string | null; name: string; purpose: string; status: "active" | "pending" | "deferred" | "dropped"; defaultOn: boolean };
export const EARLIEST_TEST_UTC = process.env.NEXT_PUBLIC_EARLIEST_TEST_UTC || runMeta.earliest_test_utc || "2026-10-09T12:30:00Z";
export const PORTFOLIO_PLUGIN_ID = process.env.NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID || runMeta.portfolio_plugin_id || null;
export const PITCHBOOK_PLUGIN_ID = process.env.NEXT_PUBLIC_PITCHBOOK_PLUGIN_ID || runMeta.pitchbook_plugin_id || "plugin-1777018662";
export const DEFERRED_PLUGIN_IDS = new Set<string>(["plugin-1777018662"]);
export const PLUGINS: PluginDef[] = [
  { id: PORTFOLIO_PLUGIN_ID, name: "Portfolio Plugin", purpose: "This dashboard's own API (companies, news, sentiment, search)", status: PORTFOLIO_PLUGIN_ID ? "active" : "pending", defaultOn: !!PORTFOLIO_PLUGIN_ID },
  // Verified with a real create-session + streamed query on 2026-10-09 (see docs/HANDOFF.md → Plugin test matrix). Order = send order.
  { id: "plugin-1722260873", name: "Perplexity", purpose: "Latest news with sources (verified: 200, first token 37.5 s)", status: "active", defaultOn: true },
  { id: "plugin-1741871229", name: "GPT Search", purpose: "Funding / valuation / exit verification (verified: 200, 85 s) — opt-in", status: "active", defaultOn: false },
  { id: "plugin-1716429542", name: "US Stock Fundamentals", purpose: "Live quotes for public holdings e.g. FRVO (verified: 200, 35 s)", status: "active", defaultOn: false },
  { id: "plugin-1748003575", name: "Reddit", purpose: "Posts + comments, community sentiment (verified: 200, 38 s)", status: "active", defaultOn: false },
  { id: "plugin-1751872652", name: "X Search", purpose: "Posts from the last 7 days (verified: 200, 105 s)", status: "active", defaultOn: false },
  { id: "plugin-1718116202", name: "LinkedIn Search", purpose: "Dropped: the plugin's company-search tool returned 404 in the verification run (151 s)", status: "dropped", defaultOn: false },
  { id: PITCHBOOK_PLUGIN_ID, name: "PitchBook", purpose: "PitchBook Investor Finder — configuring, deferred by owner", status: DEFERRED_PLUGIN_IDS.has(PITCHBOOK_PLUGIN_ID) ? "deferred" : "active", defaultOn: false },
];
export const DEFAULT_MODEL = process.env.NEXT_PUBLIC_DEFAULT_MODEL || runMeta.model_endpoint_id || "predefined-claude-fable-5.1";
export const DEFAULT_EXTERNAL_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID || "INV-001";
export const DEFAULT_FOCUS = ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"];
export const MODEL_OPTIONS = ["predefined-claude-fable-5.1", "predefined-claude-sonnet-5.5", "predefined-claude-opus-5.5", "predefined-gpt-6.1-sol", "predefined-gpt-5.6-luna", "predefined-gemini-3.8-flash", "predefined-deepseek-v4-pro", "predefined-kimi-k3"];
