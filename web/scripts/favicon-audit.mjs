#!/usr/bin/env node
// Favicon audit — Node 22, no deps. Fetches the LIVE plugin directory (GET /plugin/v1/search, header apikey read
// from web/.env — never printed), merges it onto the curated catalogue exactly like src/lib/plugin-catalogue.ts,
// then probes every URL in each plugin's favicon chain (live logoUrl → logoUrlBase → Google s2) and writes
// proof/favicon-audit.json. Usage: node scripts/favicon-audit.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0";
const REFERENCE_PLUGIN_IDS = ["plugin-1722260873", "plugin-1713924030", "plugin-1741871229", "plugin-1751872652", "plugin-1785777296", "plugin-1716372717", "plugin-1716164040", "plugin-1785987361", "plugin-1784356219", "plugin-1748003575", "plugin-1718116202"];
const ELIGIBLE = new Set(["research_and_insights", "general", "finance", "marketing", "data_and_analytics"]);
const CAP = 40;

// --- env (dotenv-less; value never logged) -------------------------------------------------------
async function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await readFile(path.join(root, f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, "$2").trim();
      }
    } catch { /* file absent */ }
  }
  return "";
}
const apikey = await readEnv("ONDEMAND_API_KEY");
const base = ((await readEnv("ONDEMAND_BASE_URL")) || "https://api.on-demand.io").replace(/\/$/, "");
const endpoint = `${base}/plugin/v1/search?limit=100&page=1..3`;

// --- live directory ------------------------------------------------------------------------------
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const extract = (b) => { const d = b?.data ?? b; if (Array.isArray(d)) return d; for (const k of ["plugins", "items", "results", "list"]) if (Array.isArray(d?.[k])) return d[k]; return []; };
async function fetchLive() {
  if (!apikey) { console.warn("! ONDEMAND_API_KEY not found — auditing curated catalogue only (no live logoUrl)"); return { live: [], error: "no apikey" }; }
  const out = new Map();
  for (const page of [1, 2, 3]) {
    const r = await fetch(`${base}/plugin/v1/search?limit=100&page=${page}`, { headers: { apikey, "user-agent": UA, accept: "application/json" } });
    if (!r.ok) return { live: [...out.values()], error: `upstream HTTP ${r.status} on page ${page}` };
    for (const p of extract(await r.json())) {
      const id = String(p.pluginId ?? p.id ?? "");
      if (!id || out.has(id) || (p.type ?? "chat") !== "chat") continue;
      out.set(id, { id, name: p.name ?? id, identifier: p.identifier, category: p.category, logoUrl: isHttp(p.logoUrl) ? p.logoUrl : undefined, isSubscribed: p.isSubscribed === true, description: p.description ?? "" });
    }
  }
  return { live: [...out.values()] };
}

// --- merge (mirror of mergeLivePlugins) ----------------------------------------------------------
const DOMAIN_RULES = [[/twitter|\bx\b|x search/i, "x.com"], [/youtube/i, "youtube.com"], [/linkedin/i, "linkedin.com"], [/instagram/i, "instagram.com"], [/tiktok/i, "tiktok.com"], [/reddit/i, "reddit.com"], [/stock|mutual/i, "sec.gov"], [/crypto|solana|dex/i, "coingecko.com"], [/weather/i, "weather.gov"]];
const domainFor = (n) => DOMAIN_RULES.find(([re]) => re.test(n))?.[1] ?? "on-demand.io";
function merge(curated, directory, live) {
  const liveById = new Map(live.map((p) => [p.id, p]));
  const dirById = new Map(directory.map((p) => [p.id, p]));
  const cur = curated.map((p) => { const l = liveById.get(p.id); return l ? { ...p, name: l.name || p.name, logoUrl: l.logoUrl } : { ...p }; });
  const seen = new Set(cur.map((p) => p.id));
  const extra = [];
  for (const l of live) {
    if (seen.has(l.id) || !l.isSubscribed) continue;
    const d = dirById.get(l.id);
    if (!(REFERENCE_PLUGIN_IDS.includes(l.id) || (d && ELIGIBLE.has(d.category)))) continue;
    seen.add(l.id);
    extra.push({ id: l.id, name: l.name || d?.name || l.id, domain: domainFor(l.name || d?.name || ""), category: l.category ?? d?.category ?? "general", logoUrl: l.logoUrl });
  }
  extra.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return [...cur, ...extra].slice(0, CAP);
}

// --- probe ---------------------------------------------------------------------------------------
const s2 = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
const chainFor = (p) => [
  ...(isHttp(p.logoUrl) ? [{ kind: "logo", url: p.logoUrl }] : []),
  ...(isHttp(p.logoUrlBase) && p.logoUrlBase !== p.logoUrl ? [{ kind: "logoBase", url: p.logoUrlBase }] : []),
  { kind: "s2", url: s2(p.domain) },
];
const redact = (url) => url.replace(/([?&](sig|se|sp|sv|sr|st|skoid|sktid|skt|ske|sks|skv|spr)=)[^&]*/gi, "$1…");
async function probe({ kind, url }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA, accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5" } });
    const buf = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get("content-type") ?? "";
    return { kind, url: redact(url), status: r.status, contentType, bytes: buf.length, ok: r.status === 200 && contentType.startsWith("image/") };
  } catch (e) {
    return { kind, url: redact(url), status: 0, contentType: "", bytes: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  } finally { clearTimeout(t); }
}

// --- run -----------------------------------------------------------------------------------------
const cat = JSON.parse(await readFile(path.join(root, "src/data/plugin-catalogue.json"), "utf8")).plugins;
const dir = JSON.parse(await readFile(path.join(root, "src/data/plugin-directory.json"), "utf8")).plugins ?? [];
const { live, error: liveError } = await fetchLive();
console.log(`live directory: ${live.length} chat plugins${liveError ? ` (error: ${liveError})` : ""}`);
const plugins = merge(cat, dir, live);
const summary = { logo: 0, logoBase: 0, s2: 0, monogram: 0, failures: [] };
const byPlugin = [];
for (const p of plugins) {
  const chain = [];
  for (const c of chainFor(p)) chain.push(await probe(c));
  const first = chain.find((c) => c.ok);
  const used = first ? first.kind : "monogram";
  summary[used]++;
  for (const c of chain) if (!c.ok) summary.failures.push({ id: p.id, name: p.name, kind: c.kind, status: c.status, contentType: c.contentType, error: c.error });
  byPlugin.push({ id: p.id, name: p.name, domain: p.domain, chain, used });
  console.log(`${used.padEnd(8)} ${p.id}  ${p.name.padEnd(36).slice(0, 36)}  ${chain.map((c) => `${c.kind}:${c.status}${c.ok ? "" : "✗"}`).join(" ")}`);
}
const out = { generatedAt: new Date().toISOString(), endpoint, liveCount: live.length, liveError, totalPlugins: plugins.length, byPlugin, summary };
await mkdir(path.join(root, "proof"), { recursive: true });
await writeFile(path.join(root, "proof/favicon-audit.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nsummary: total=${plugins.length} logo=${summary.logo} logoBase=${summary.logoBase} s2=${summary.s2} monogram=${summary.monogram} failures=${summary.failures.length} → proof/favicon-audit.json`);
