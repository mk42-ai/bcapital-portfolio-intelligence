#!/usr/bin/env tsx
/**
 * register-plugin.ts — build the "Portfolio Plugin" OpenAPI 3.0.3 schema from the LIVE backend and try to register it on OnDemand.
 *
 * Usage: ON_DEMAND_API_KEY=… PUBLIC_BASE_URL=https://<backend> tsx scripts/register-plugin.ts [--out proof/data-lane/portfolio-plugin-openapi.json] [--dry-run]
 * The apikey is read from env only and never written anywhere. Every attempt is printed as one JSON line (UTC, variant, status, body).
 *
 * What is known to work / not work (2026-10-11, proof/data-lane/plugin-registration-2026-10-11*.log.txt):
 *   ✗ POST https://api.on-demand.io/plugin/v1 with action.schema = JSON string → 400 {"message":"schema is required"} (full spec) or 500 '' (3.0.3, 8 paths)
 *   ✗ action.schema as object → 400 "json: cannot unmarshal object into Go struct field PluginAction.action.schema of type string"
 *   ✗ YAML string, nested {plugin:{…}}, top-level openApiSchema/openapi_schema/apiSchema, /plugin/v1/{schema,validate,import,openapi} → 400/404/500
 *   ✗ MCP plugin_v1_plugin_create (JSON or YAML string) → empty response, nothing created (GET /plugin/v1/list total 0)
 *   ✓ MCP ondemandmcp__public_v1_plugin_ai_generated_tool_create (isAutoSave:true, prompt names the backend URL + 3 GET endpoints)
 *     → plugin-1791713636 / agent-1791713636 "B Capital Portfolio Intelligence" (3 ops, auth none, servers[0] = the sandbox URL).
 *     That tool is exposed through the OnDemand MCP server only (no documented REST route), so this script cannot call it; when the backend
 *     URL changes, re-run the MCP call with the prompt printed by `--print-prompt` and put the new id in config/plugins.json + web/.env.example.
 *
 * This script therefore: (1) derives the schema (GET-only, no-secret endpoints, examples stripped, 3.1 → 3.0.3 nullable conversion),
 * (2) writes it to --out, (3) unless --dry-run, tries POST /plugin/v1 once (so a future fix upstream is picked up automatically),
 * (4) lists account plugins so a success is visible, (5) prints the ai_generated_tool prompt as the fallback.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k: string) => argv.includes(k);
const publicUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""); if (!publicUrl) throw new Error("PUBLIC_BASE_URL not set");
const base = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const out = flag("--out") ?? path.resolve("proof/data-lane", "portfolio-plugin-openapi.json");
const KEEP = ["/companies", "/companies/{slug}", "/companies/{slug}/news", "/companies/{slug}/sentiment", "/sentiment/portfolio", "/search", "/signals", "/news/summary"];
const UA = "Mozilla/5.0 (X11; Linux x86_64) bcapital-portfolio-intelligence/1.0"; // api.on-demand.io sits behind Cloudflare: default fetch/urllib UAs get error 1010
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

/** OpenAPI 3.1 → 3.0.3: type arrays → nullable, const → enum, strip examples, null-only oneOf branches → nullable. */
function to30(x: any): any {
  if (Array.isArray(x)) return x.map(to30);
  if (!x || typeof x !== "object") return x;
  const o: any = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === "examples" || k === "example") continue;
    if (k === "const") { o.enum = [v]; continue; }
    o[k] = to30(v);
  }
  if (Array.isArray(o.type)) { const ts = o.type.filter((t: string) => t !== "null"); if (ts.length !== o.type.length) o.nullable = true; o.type = ts[0] ?? "string"; }
  if (Array.isArray(o.enum) && o.enum.includes(null)) { o.enum = o.enum.filter((e: unknown) => e !== null); o.nullable = true; }
  if (Array.isArray(o.oneOf)) { const nn = o.oneOf.filter((b: any) => !(b && b.type === "null" && Object.keys(b).length === 1)); if (nn.length === 1 && nn.length !== o.oneOf.length) { delete o.oneOf; Object.assign(o, nn[0], { nullable: true }); } }
  if (o.type === "object" && o.properties) for (const [pk, pv] of Object.entries(o.properties)) if (pv && typeof pv === "object" && !Object.keys(pv as object).length) o.properties[pk] = { type: "string" };
  return o;
}
function collectRefs(x: any, acc: Set<string>) { if (Array.isArray(x)) x.forEach((i) => collectRefs(i, acc)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) k === "$ref" ? acc.add(String(v).split("/").pop()!) : collectRefs(v, acc); }

const live: any = await (await fetch(`${publicUrl}/openapi.json`)).json();
const paths: Record<string, any> = {};
for (const p of KEEP) {
  const get = live.paths?.[p]?.get; if (!get) { log({ step: "schema", warn: `live /openapi.json has no GET ${p} — skipped` }); continue; }
  const g = to30(get); delete g.security;
  g.operationId ??= p.replace(/\W+/g, "_").replace(/^_|_$/g, ""); g.summary ??= p;
  g.responses ??= {}; g.responses["200"] ??= { description: "OK", content: { "application/json": { schema: { type: "object" } } } };
  paths[p] = { get: g };
}
const need = new Set<string>(); collectRefs(paths, need);
const done = new Set<string>(); const schemas: Record<string, any> = {};
while (need.size) { const n = [...need][0]; need.delete(n); if (done.has(n)) continue; done.add(n); const s = live.components?.schemas?.[n]; if (!s) continue; schemas[n] = to30(s); const more = new Set<string>(); collectRefs(s, more); more.forEach((m) => { if (!done.has(m)) need.add(m); }); }
for (const [n, s] of Object.entries(schemas)) { const stack = new Set<string>(); const walk = (name: string): boolean => { if (stack.has(name)) return true; stack.add(name); const r = new Set<string>(); collectRefs(schemas[name], r); for (const x of r) if (walk(x)) return true; stack.delete(name); return false; }; if (walk(n)) throw new Error(`$ref cycle through ${n}`); void s; }
const spec = { openapi: "3.0.3", info: { title: "B Capital Portfolio Intelligence API", version: String(live.info?.version ?? "1.0.0"), description: "Read-only portfolio API: 137 B Capital portfolio records with news, OnDemand-scored sentiment, roll-ups, deltas, Signal Scores and search. No authentication." }, servers: [{ url: publicUrl }], paths, components: { schemas } };
const schemaStr = JSON.stringify(spec);
if (schemaStr.length > 50 * 1024) throw new Error(`schema is ${schemaStr.length} bytes (> 50 KB)`);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(spec, null, 1));
log({ step: "schema", out, bytes: schemaStr.length, paths: Object.keys(paths), schemas: Object.keys(schemas) });

const prompt = `Create a REST tool named "Portfolio Plugin" for the public, no-auth B Capital Portfolio Intelligence API at ${publicUrl} with three GET endpoints: GET /companies (query params: sector, region, focus, limit (max 200), sort = name|sentiment|updated_at|ticket; returns {data:[{name, slug, sector, region, status, sentiment:{score,label,delta}}]}), GET /companies/{slug}/sentiment (path param slug; returns {company, current:{score,label,evidence}, delta, history:[{score,label,delta,recorded_at}]}), and GET /news/summary (no params; returns {total, by_company, companies}). No API key is needed.`;
if (has("--print-prompt")) log({ step: "ai_generated_tool_prompt", prompt });
if (has("--dry-run")) process.exit(0);

const apikey = process.env.ON_DEMAND_API_KEY; if (!apikey) throw new Error("ON_DEMAND_API_KEY not set");
const body = {
  name: process.env.PLUGIN_NAME ?? "Portfolio Plugin", identifier: "rest_api", type: "chat", source: "external", status: "private", category: "research_and_insights", chatSubType: "PRIMARYCHAT",
  description: "B Capital Portfolio Intelligence: 137 portfolio records with news, OnDemand-scored sentiment (score, label, delta vs prior run), roll-ups, Signal Scores and search. Read-only REST API, no auth.",
  logoUrl: "https://b.capital/wp-content/uploads/2023/10/BCapital_Logo_XL.png", privacyPolicy: "https://b.capital/privacy-policy/",
  conversationStarters: ["Which B Capital portfolio companies have negative sentiment?", "Show the latest news for Fervo Energy", "What is the portfolio sentiment roll-up by sector?"],
  action: { authentication: { type: "none" }, fields: [], schema: schemaStr },
};
const r = await fetch(`${base}/plugin/v1`, { method: "POST", headers: { apikey, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify(body) });
const txt = await r.text();
log({ step: "create", variant: "POST /plugin/v1 flat, action.schema = JSON string", status: r.status, body: txt.slice(0, 1500) });
const list = await fetch(`${base}/plugin/v1/list`, { headers: { apikey, "user-agent": UA } });
log({ step: "list", status: list.status, body: (await list.text()).slice(0, 800) });
if (!r.ok) { log({ step: "fallback", note: "POST /plugin/v1 still rejects the schema string. Use the OnDemand MCP tool ondemandmcp__public_v1_plugin_ai_generated_tool_create with isAutoSave:true and the prompt below (this is how plugin-1791713636 was created on 2026-10-11), then plugin_v1_plugin_configuration_create active:true and record the id in config/plugins.json + web/.env.example.", prompt }); process.exit(1); }
