#!/usr/bin/env node
/**
 * fetch-logos.mjs — fetch official company marks from the company's OWN domain into web/public/logos.
 *
 * Order per domain (browser UA, 10 s timeout): /favicon.svg → /apple-touch-icon.png → /favicon.ico →
 * <link rel="icon"> parsed from the homepage → Google s2 favicon service (source "s2").
 * Magic bytes are validated; SVG is sanitised (scripts / on*= handlers / external hrefs stripped);
 * PNG/ICO > 8 KB is converted with PIL to 64×64 PNG (optimize), then 48×48 if still > 8 KB.
 * Any failure → sector-coloured 64×64 monogram SVG fallback, logged as OPEN.
 *
 * Usage: node web/scripts/fetch-logos.mjs [--all] [--budget-ms=60000]
 *   default: the six focus companies; --all: every company in web/src/data/snapshot.json within the time budget.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, "..");
const OUT = path.join(WEB, "public", "logos");
const MANIFEST = path.join(OUT, "manifest.json");
const LOG = path.resolve(WEB, "..", "docs", "owner-evidence", "pass-3", "logo-fetch-log.md");
const MAX_BYTES = 8192;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const FOCUS = ["fervo-energy", "flutterwave", "apptronik", "perplexity-ai", "writer", "aimotive"];
const FALLBACK_DOMAINS = {
  "fervo-energy": "fervoenergy.com", flutterwave: "flutterwave.com", apptronik: "apptronik.com",
  "perplexity-ai": "perplexity.ai", writer: "writer.com", aimotive: "aimotive.com",
};
// Sector tints — brand-green family + warm neutrals only (no blue hue: brand audit forbids hue 190–260°).
const SECTOR_TINT = {
  "Technology": "#047857", "Energy & Resilience": "#B45309", "Healthcare": "#BE123C",
  "Opportunistic": "#4B5563", "Venture Capital (firm)": "#1F2937",
};

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const BUDGET = Number((args.find((a) => a.startsWith("--budget-ms=")) || "").split("=")[1] || 60000);

const snapshot = JSON.parse(readFileSync(path.join(WEB, "src", "data", "snapshot.json"), "utf8"));
const companies = Array.isArray(snapshot) ? snapshot : snapshot.companies;
const bySlug = new Map(companies.map((c) => [c.slug, c]));

const domainOf = (slug) => {
  const c = bySlug.get(slug);
  const w = c?.website && /^https?:\/\//i.test(c.website) ? c.website : null;
  if (w) { try { return new URL(w).hostname.replace(/^www\./, ""); } catch { /* fallthrough */ } }
  return FALLBACK_DOMAINS[slug] || null;
};

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// Some WAFs (e.g. fervoenergy.com) 403 Node's TLS fingerprint but accept curl with a plain UA (the Chrome UA + curl TLS is flagged) — fall back to curl on 403/network error.
function curlGet(url) {
  try {
    const sep = "\n--a28--\n";
    const out = execFileSync("curl", ["-sSL", "-m", "10", "-A", "Mozilla/5.0", "-w", `${sep}%{http_code} %{content_type} %{url_effective}`, url],
      { maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const idx = out.lastIndexOf(sep);
    if (idx < 0) return null;
    const [code, type, ...rest] = out.subarray(idx + sep.length).toString().trim().split(" ");
    if (!/^2\d\d$/.test(code)) return null;
    return { buf: out.subarray(0, idx), type: (type || "").toLowerCase(), url: rest.join(" ") || url };
  } catch { return null; }
}

async function get(url, accept = "*/*") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: ctl.signal });
    if (r.status === 403 || r.status === 429 || r.status === 503) return curlGet(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, type: (r.headers.get("content-type") || "").toLowerCase(), url: r.url };
  } catch { return curlGet(url); } finally { clearTimeout(t); }
}

// Reject placeholder rasters (e.g. writer.com serves a 1×1 transparent apple-touch-icon.png).
function rasterUsable(buf, kind) {
  const py = `
import sys
from PIL import Image, ImageStat
im = Image.open(sys.stdin.buffer)
if getattr(im, "format", "") == "ICO" and hasattr(im, "ico"):
    im.size = max(im.ico.sizes(), key=lambda s: s[0]); im.load()
w, h = im.size
a = ImageStat.Stat(im.convert("RGBA")).mean[3]
print("ok" if (w >= 16 and h >= 16 and a > 2) else "bad")
`;
  try { return execFileSync("python3", ["-c", py], { input: buf, stdio: ["pipe", "pipe", "ignore"], timeout: 15_000 }).toString().trim() === "ok"; }
  catch { return false; }
}

function sniff(buf) {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  const head = buf.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "svg";
  return null;
}

function sanitiseSvg(src) {
  let s = src.toString("utf8");
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<script[^>]*\/>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // external hrefs (http(s)://, //, data: scripts) — keep internal #refs
  s = s.replace(/\s+(xlink:href|href)\s*=\s*("|')(?!#)[^"']*\2/gi, "");
  s = s.replace(/\s+style\s*=\s*("|')[^"']*url\([^"']*\)[^"']*\1/gi, "");
  s = s.replace(/<\?xml-stylesheet[^>]*\?>/gi, "");
  return Buffer.from(s, "utf8");
}

function iconHrefsFromHtml(html, base) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[2] ?? (tag.match(/\brel\s*=\s*'([^']*)'/i) || [])[1] ?? "";
    if (!/\bicon\b|apple-touch-icon|mask-icon/i.test(rel)) continue;
    const href = (tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || []);
    const h = href[2] ?? href[3] ?? href[4];
    if (!h) continue;
    try { out.push({ url: new URL(h, base).toString(), svgish: /\.svg(\?|$)/i.test(h) || /svg/i.test(tag) }); } catch { /* skip */ }
  }
  // prefer svg, then larger sizes
  return out.sort((a, b) => Number(b.svgish) - Number(a.svgish)).map((o) => o.url);
}

function shrinkRaster(buf, kind, slug) {
  // PIL: open ICO/PNG → RGBA → 64 (then 48) PNG optimised.
  const tmpIn = path.join(OUT, `.${slug}.${kind}`);
  const tmpOut = path.join(OUT, `.${slug}.out.png`);
  writeFileSync(tmpIn, buf);
  const py = `
import sys
from PIL import Image
src, dst, max_bytes = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
if getattr(im, "format", "") == "ICO":
    best = max(im.ico.sizes(), key=lambda s: s[0]) if hasattr(im, "ico") else im.size
    im.size = best
    im.load()
im = im.convert("RGBA")
for sz in (64, 48):
    out = im.resize((sz, sz), Image.LANCZOS)
    out.save(dst, "PNG", optimize=True)
    import os
    if os.path.getsize(dst) <= max_bytes:
        break
`;
  try {
    execFileSync("python3", ["-c", py, tmpIn, tmpOut, String(MAX_BYTES)], { stdio: "pipe", timeout: 20_000 });
    const out = readFileSync(tmpOut);
    return out;
  } catch (e) {
    return null;
  } finally {
    for (const f of [tmpIn, tmpOut]) if (existsSync(f)) unlinkSync(f);
  }
}

function monogram(company) {
  const name = company.name || company.slug;
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || "??").slice(0, 2)).toUpperCase();
  const fill = SECTOR_TINT[company.sector] || "#4B5563";
  const label = `${name} monogram`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${label.replace(/"/g, "&quot;")}">` +
    `<rect width="64" height="64" rx="14" fill="${fill}"/>` +
    `<text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="Inter,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="26" font-weight="700" fill="#FFFFFF">${initials}</text></svg>\n`,
    "utf8",
  );
}

async function tryCandidate(url, source) {
  const r = await get(url, "image/svg+xml,image/png,image/x-icon,image/*;q=0.8,*/*;q=0.5");
  if (!r || !r.buf.length) return null;
  const kind = sniff(r.buf);
  if (!kind) return null;
  if (kind !== "svg" && !rasterUsable(r.buf, kind)) return null;
  return { kind, buf: r.buf, source, url: r.url };
}

async function fetchOne(company) {
  const slug = company.slug;
  const domain = domainOf(slug);
  const rec = { slug, name: company.name, domain, source: null, file: null, bytes: 0, sha256: null, status: "OPEN", note: "" };
  if (!domain) { rec.note = "no domain"; return finish(rec, company); }

  const candidates = [
    [`https://${domain}/favicon.svg`, "favicon.svg"],
    [`https://${domain}/apple-touch-icon.png`, "apple-touch-icon"],
    [`https://${domain}/favicon.ico`, "favicon.ico"],
  ];
  let found = null;
  for (const [u, s] of candidates) { found = await tryCandidate(u, s); if (found) break; }
  if (!found) {
    const home = (await get(`https://${domain}/`, "text/html")) || (await get(`https://www.${domain}/`, "text/html"));
    if (home && /html/.test(home.type)) {
      for (const u of iconHrefsFromHtml(home.buf.toString("utf8"), home.url).slice(0, 4)) {
        found = await tryCandidate(u, "link-icon"); if (found) break;
      }
    }
  }
  if (!found) found = await tryCandidate(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, "s2");
  if (!found) { rec.note = "all sources failed"; return finish(rec, company); }

  let { kind, buf } = found;
  if (kind === "svg") {
    buf = sanitiseSvg(buf);
    if (buf.length > MAX_BYTES) { rec.note = `svg ${buf.length} B > 8 KB`; found = null; }
  } else if (buf.length > MAX_BYTES || kind === "ico") {
    const shrunk = shrinkRaster(buf, kind, slug);
    if (!shrunk) { rec.note = `PIL conversion failed (${kind})`; found = null; } else { buf = shrunk; kind = "png"; }
    if (buf && buf.length > MAX_BYTES) { rec.note = `raster still ${buf.length} B after 48px`; found = null; }
  }
  if (!found) return finish(rec, company);

  const file = `${slug}.${kind}`;
  // drop a stale sibling of another extension
  for (const ext of ["svg", "png"]) if (ext !== kind && existsSync(path.join(OUT, `${slug}.${ext}`))) unlinkSync(path.join(OUT, `${slug}.${ext}`));
  writeFileSync(path.join(OUT, file), buf);
  Object.assign(rec, { source: found.source, file, bytes: buf.length, sha256: sha256(buf), status: "ok", note: found.url });
  return rec;
}

function finish(rec, company) {
  const buf = monogram(company);
  const file = `${company.slug}.svg`;
  if (existsSync(path.join(OUT, `${company.slug}.png`))) unlinkSync(path.join(OUT, `${company.slug}.png`));
  writeFileSync(path.join(OUT, file), buf);
  Object.assign(rec, { source: "monogram", file, bytes: buf.length, sha256: sha256(buf), status: "OPEN" });
  return rec;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  const existing = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { logos: {} };
  const results = [];
  const todo = ALL ? companies : FOCUS.map((s) => bySlug.get(s)).filter(Boolean);
  let skipped = 0;
  for (const c of todo) {
    if (ALL && !FOCUS.includes(c.slug) && Date.now() - started > BUDGET) { skipped++; continue; }
    const rec = await fetchOne(c);
    results.push(rec);
    console.log(`${rec.status.padEnd(4)} ${rec.slug.padEnd(28)} ${String(rec.domain).padEnd(26)} ${String(rec.source).padEnd(16)} ${rec.bytes} B`);
  }
  // merge into manifest
  const logos = { ...existing.logos };
  // Manifest is imported by the client bundle and must itself stay ≤ 8 KB: keep it compact (sha256 + domain live in the log).
  for (const r of results) logos[r.slug] = { file: `/logos/${r.file}`, source: r.source, bytes: r.bytes, status: r.status };
  const manifest = { generatedAt: new Date().toISOString(), maxBytes: MAX_BYTES, logos };
  writeFileSync(MANIFEST, JSON.stringify(manifest) + "\n");

  // size gate
  const over = Object.values(logos).filter((l) => statSync(path.join(WEB, "public", l.file)).size > MAX_BYTES);
  if (over.length) { console.error("OVER 8 KB:", over.map((o) => o.file)); process.exitCode = 1; }

  // log
  const rows = results.map((r) => `| ${r.slug} | ${r.domain ?? "—"} | ${r.source} | ${r.bytes} | \`${(r.sha256 || "").slice(0, 12)}\` | ${r.status === "OPEN" ? `**OPEN** — ${r.note || "fallback monogram"}` : "ok"} |`);
  const md = [
    `# Logo fetch log — pass 3 (a28)`, ``,
    `Run: ${manifest.generatedAt} · mode: ${ALL ? "all companies" : "six focus companies"} · budget ${BUDGET} ms · elapsed ${Date.now() - started} ms · skipped ${skipped}`, ``,
    `Script: \`web/scripts/fetch-logos.mjs\` · output \`web/public/logos/\` + \`manifest.json\` · every file ≤ ${MAX_BYTES} bytes.`, ``,
    `| slug | domain | source | bytes | sha256 (12) | status |`, `|---|---|---|---|---|---|`, ...rows, ``,
    `Sources: favicon.svg / apple-touch-icon / favicon.ico (official domain), link-icon (parsed from homepage), s2 (Google favicon service), monogram (sector-tinted fallback → OPEN).`,
    skipped ? `\n**Skipped ${skipped} companies** — 60 s budget exhausted; rerun with \`--all --budget-ms=<n>\`.` : "",
  ].join("\n");
  mkdirSync(path.dirname(LOG), { recursive: true });
  writeFileSync(LOG, md + "\n");
  console.log(`\nmanifest: ${MANIFEST}\nlog: ${LOG}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
