/**
 * Register the deployed API on OnDemand as the custom REST tool 'Portfolio Plugin'.
 * Follows the live-documented contract (POST /plugin/v1, action.schema = JSON-stringified OpenAPI; pluginId
 * is NOT guaranteed in the create response → read it back from GET /plugin/v1/list / suggest).
 * Usage: ON_DEMAND_API_KEY=… PUBLIC_BASE_URL=https://… tsx scripts/register-plugin.ts
 * The apikey is read from env only and never written anywhere.
 */
import { buildOpenApi } from "../src/openapi.js";
const apikey = process.env.ON_DEMAND_API_KEY; if (!apikey) throw new Error("ON_DEMAND_API_KEY not set");
const base = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const publicUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""); if (!publicUrl) throw new Error("PUBLIC_BASE_URL not set");
const spec: any = buildOpenApi(publicUrl);
spec.openapi = "3.0.3"; // OnDemand's REST-plugin importer validates OpenAPI 3.0.x; the served /openapi.json stays 3.1
const body = {
  name: process.env.PLUGIN_NAME ?? "Portfolio Plugin",
  identifier: "rest_api",
  description: "B Capital Portfolio Intelligence: 136 portfolio records with brand tokens, flagged ownership estimates, news and daily OnDemand-scored sentiment (roll-ups, deltas, top movers, search).",
  category: "research_and_insights",
  logoUrl: "https://b.capital/wp-content/uploads/2023/10/BCapital_Logo_XL.png",
  type: "chat", source: "external", status: "private", fileSubType: "PRIMARYINGEST", chatSubType: "PRIMARYCHAT",
  privacyPolicy: "https://b.capital/privacy-policy/",
  conversationStarters: ["Which B Capital portfolio companies have negative sentiment this week?", "Show the latest news for Fervo Energy", "What is the portfolio sentiment roll-up by sector?"],
  action: { authentication: { type: "none" }, fields: [], schema: JSON.stringify(spec) },
  creatorPluginConfig: { active: true, fields: {} },
};
const r = await fetch(`${base}/plugin/v1`, { method: "POST", headers: { apikey, "content-type": "application/json" }, body: JSON.stringify(body) });
const txt = await r.text();
console.log(JSON.stringify({ step: "create", status: r.status, body: txt.slice(0, 1500), at: new Date().toISOString() }));
