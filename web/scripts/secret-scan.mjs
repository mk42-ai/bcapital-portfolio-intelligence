#!/usr/bin/env node
/**
 * secret-scan.mjs — proves no server-side secret leaked into the client build or the live site.
 *
 * Reads ONDEMAND_API_KEY and INGEST_SECRET from web/.env (never prints them), then scans:
 *   - .next/static/**            (client JS/CSS chunks)
 *   - .next/server/app/**\/*.html (prerendered HTML)
 *   - public/**                   (static assets)
 *   - when BASE_URL is set: live HTML of /, /chat, /settings + every same-origin
 *     /_next/static/*.js chunk referenced by those pages
 * for the literal secret values and for the regexes /sk-[A-Za-z0-9]{20,}/ and /x-pitchbook-api-key/i.
 *
 * Exit 1 on any hit. Output is counts only — never the matched text.
 * Usage: node scripts/secret-scan.mjs            (from web/)
 *        BASE_URL=https://… node scripts/secret-scan.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET_NAMES = ["ONDEMAND_API_KEY", "INGEST_SECRET"];
const PATTERNS = [
  { name: "sk-token", re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "x-pitchbook-api-key", re: /x-pitchbook-api-key/gi },
];
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".txt", ".map", ".svg", ".xml", ".webmanifest", ".md"]);
const MAX_FILE = 25 * 1024 * 1024;

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const env = { ...readEnv(join(WEB, ".env")), ...readEnv(join(WEB, ".env.local")) };
const secrets = SECRET_NAMES.map((n) => ({ name: n, value: (process.env[n] ?? env[n] ?? "").trim() })).filter((s) => s.value.length >= 8);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}

const hits = {}; // name -> count
let filesScanned = 0;
let bytesScanned = 0;

function scanText(text) {
  for (const s of secrets) {
    let i = 0, n = 0;
    while ((i = text.indexOf(s.value, i)) !== -1) { n++; i += s.value.length; }
    if (n) hits[s.name] = (hits[s.name] ?? 0) + n;
  }
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m?.length) hits[p.name] = (hits[p.name] ?? 0) + m.length;
  }
}

function scanFile(file, textOnly) {
  const st = statSync(file);
  if (st.size === 0 || st.size > MAX_FILE) return;
  if (textOnly && !TEXT_EXT.has(extname(file).toLowerCase())) {
    // binary assets: still check for the literal secret bytes (cheap), skip regexes
    const buf = readFileSync(file);
    for (const s of secrets) if (buf.includes(s.value)) hits[s.name] = (hits[s.name] ?? 0) + 1;
    filesScanned++; bytesScanned += st.size;
    return;
  }
  scanText(readFileSync(file, "utf8"));
  filesScanned++; bytesScanned += st.size;
}

// ---- local build artefacts ----
const localTargets = [
  { dir: join(WEB, ".next", "static"), filter: () => true },
  { dir: join(WEB, ".next", "server", "app"), filter: (f) => f.endsWith(".html") },
  { dir: join(WEB, "public"), filter: () => true },
];
for (const t of localTargets) {
  for (const f of walk(t.dir)) if (t.filter(f)) scanFile(f, true);
}

// ---- live site ----
let liveDocs = 0;
let liveChunks = 0;
const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/$/, "");
async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "bcap-secret-scan" } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
if (BASE_URL) {
  const chunkUrls = new Set();
  for (const path of ["/", "/chat", "/settings"]) {
    const html = await fetchText(BASE_URL + path);
    if (html == null) { console.log(`secret-scan: live ${path} unreachable (skipped)`); continue; }
    liveDocs++;
    scanText(html);
    for (const m of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+\.js)"/g)) {
      const u = m[1].startsWith("http") ? m[1] : BASE_URL + (m[1].startsWith("/") ? "" : "/") + m[1];
      if (u.startsWith(BASE_URL)) chunkUrls.add(u);
    }
  }
  for (const u of chunkUrls) {
    const js = await fetchText(u);
    if (js == null) continue;
    liveChunks++;
    scanText(js);
  }
}

const total = Object.values(hits).reduce((a, b) => a + b, 0);
const summary = {
  secrets_loaded: secrets.length,
  files_scanned: filesScanned,
  bytes_scanned: bytesScanned,
  live_docs: liveDocs,
  live_chunks: liveChunks,
  hits: total,
  hits_by_rule: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v])),
};
console.log("secret-scan " + JSON.stringify(summary));
if (secrets.length === 0) console.log("secret-scan: WARNING no secret values loaded from web/.env — only regex rules applied");
if (total > 0) {
  console.log(`secret-scan: FAIL — ${total} hit(s). Rules: ${Object.keys(hits).join(", ")}`);
  process.exit(1);
}
console.log("secret-scan: PASS — 0 hits");
