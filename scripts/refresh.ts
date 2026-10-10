/**
 * CLI: refresh live news for a set of companies through the OnDemand Chat API (Perplexity plugin).
 *   node node_modules/tsx/dist/cli.mjs scripts/refresh.ts [--slugs a,b,c] [--limit 40] [--concurrency 3] [--json out.json]
 * Env: ONDEMAND_API_KEY (required), DB_PATH (optional), ONDEMAND_DEFAULT_MODEL (optional).
 */
import fs from "node:fs";
import { refreshCompanies } from "../src/refresh.js";

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const slugs = opt("slugs")?.split(",").map((s) => s.trim()).filter(Boolean);
const limit = opt("limit") ? Number(opt("limit")) : undefined;
const concurrency = opt("concurrency") ? Number(opt("concurrency")) : undefined;
const out = opt("json");

if (!process.env.ONDEMAND_API_KEY) { console.error("ONDEMAND_API_KEY is required"); process.exit(2); }
const t0 = Date.now();
const r = await refreshCompanies({ slugs, limit, concurrency });
const summary = { ingest_run_id: r.ingest_run_id, status: r.status, companies_touched: r.companies_touched, news_upserted: r.news_upserted, with_images: r.with_images, dated: r.dated, errors: r.errors, seconds: Math.round((Date.now() - t0) / 1000), companies: r.companies.map(({ session_id, ...c }) => c) };
console.log(JSON.stringify(summary, null, 2));
if (out) fs.writeFileSync(out, JSON.stringify({ ...summary, items: r.items }, null, 2));
process.exit(r.status === "error" ? 1 : 0);
