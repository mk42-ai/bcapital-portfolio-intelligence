#!/usr/bin/env node
// a40 — static design-token audit. Scans web/src/**/*.{css,tsx,ts} for colour literals (hex, rgb()/hsl()), Tailwind
// colour classes, px font sizes, border radii and transition/animation durations. Every colour is classified by HSL hue
// with the brand-audit rule (hue 190–260° & sat > 0.15 & chroma > 0.15 ⇒ BLUE ⇒ violation; see scripts/brand-audit.mjs
// and src/lib/hue-audit.ts). Also computes WCAG contrast ratios for the token sheet in docs/design-tokens.md.
// Usage: cd web && node scripts/token-audit.mjs [--out proof/pass-3/token-audit.json] [--print-tokens]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(WEB, "src");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const OUT = path.resolve(WEB, outArg >= 0 ? args[outArg + 1] : "proof/pass-3/token-audit.json");

/* ---------- colour maths (same gate as brand-audit.mjs) ---------- */
export function parseColour(input) {
  const s = input.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const ch = (v) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [ch(m[1]), ch(m[2]), ch(m[3]), Number.isFinite(a) ? a : 1];
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const h = parseFloat(m[1]) / 360, sa = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
    const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, a];
  }
  return null;
}
export function hsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l, chroma: 0 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h; if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60; else if (max === G) h = ((B - R) / d + 2) * 60; else h = ((R - G) / d + 4) * 60;
  return { h, s, l, chroma: d };
}
export const isBlue = ({ h, s, chroma }) => h >= 190 && h <= 260 && s > 0.15 && chroma > 0.15;
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export function contrast(a, b) { const la = lum(parseColour(a)), lb = lum(parseColour(b)); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; }

/* ---------- file walk ---------- */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(p, acc); }
    else if (/\.(css|tsx|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files = walk(SRC);
const rel = (p) => path.relative(WEB, p).split(path.sep).join("/");

/* ---------- regexes ---------- */
const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const FUNC_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;
// Tailwind palette colour utilities (not our semantic tokens like text-primary / bg-surface). Includes arbitrary-value hex classes.
const TW_PALETTES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TW_RE = new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:text|bg|border|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret|placeholder)-(?:${TW_PALETTES})-(?:50|[1-9]00|950)(?:\\/\\d+)?(?![\\w-])`, "g");
const BLUE_FAMILIES = new Set(["sky", "blue", "indigo", "cyan"]); // cyan 500 ≈ hue 189–192; sky/blue/indigo squarely in the 190–260 gate
const FONT_PX_RE = /(?:font-size|font)\s*:\s*[^;{}]*?(\d+(?:\.\d+)?)px/gi;
const TW_TEXT_PX_RE = /(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g;
const RADIUS_RE = /border(?:-[a-z-]+)?-radius\s*:\s*([^;{}]+)/gi;
const TW_RADIUS_RE = /(?<![\w-])rounded(?:-[trbl]{1,2})?(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?![\w-])/g;
const DURATION_RE = /(?:transition|animation|transition-duration|animation-duration)\s*:\s*[^;{}]*?(\d+(?:\.\d+)?m?s)\b/gi;
const TW_DURATION_RE = /(?<![\w-])duration-(\d+|\[[^\]]+\])(?![\w-])/g;

const bump = (map, key, file) => { const e = map.get(key) ?? { count: 0, files: new Set() }; e.count++; e.files.add(file); map.set(key, e); };
const colours = new Map(), radii = new Map(), durations = new Map(), fontSizes = new Map(), tw = new Map();
const firstLine = new Map(); // "file|value" → first line number for the findings list

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const r = rel(f);
  const lines = text.split("\n");
  const noteLine = (value, re) => {
    const k = `${r}|${value.toLowerCase()}`; if (firstLine.has(k)) return;
    const idx = lines.findIndex((l) => l.toLowerCase().includes(value.toLowerCase()));
    firstLine.set(k, idx + 1);
  };
  // strip line/block comments in ts/tsx and block comments in css so documented hexes in comments don't count as usage
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  for (const m of code.matchAll(HEX_RE)) { const v = m[0].toLowerCase(); if (parseColour(v)) { bump(colours, v, r); noteLine(v); } }
  for (const m of code.matchAll(FUNC_RE)) { const v = m[0].replace(/\s+/g, " ").toLowerCase(); if (/var\(/.test(v)) continue; if (parseColour(v)) { bump(colours, v, r); noteLine(v); } }
  for (const m of code.matchAll(TW_RE)) { bump(tw, m[0], r); noteLine(m[0]); }
  for (const m of code.matchAll(FONT_PX_RE)) bump(fontSizes, `${m[1]}px`, r);
  for (const m of code.matchAll(TW_TEXT_PX_RE)) bump(fontSizes, `${m[1]}px`, r);
  for (const m of code.matchAll(RADIUS_RE)) bump(radii, m[1].trim(), r);
  for (const m of code.matchAll(TW_RADIUS_RE)) bump(radii, m[0], r);
  for (const m of code.matchAll(DURATION_RE)) bump(durations, m[1], r);
  for (const m of code.matchAll(TW_DURATION_RE)) bump(durations, `duration-${m[1]}`, r);
}

const toList = (map) => [...map.entries()].map(([value, e]) => ({ value, count: e.count, files: [...e.files].sort() })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
const colourList = toList(colours).map((c) => {
  const rgb = parseColour(c.value); const H = hsl(rgb);
  return { ...c, hue: Math.round(H.h), sat: +H.s.toFixed(3), chroma: +H.chroma.toFixed(3), alpha: +rgb[3].toFixed(3), violation: rgb[3] > 0 && isBlue(H) };
});
const twList = toList(tw).map((t) => { const fam = /-(?:[a-z]+)-(\d+)/.exec(t.value) && t.value.match(new RegExp(`-(${TW_PALETTES})-`))?.[1]; return { ...t, family: fam, violation: BLUE_FAMILIES.has(fam) }; });

// Advisory watchlist: cool-tinted greys that pass the chroma gate today but sit in the blue hue band with sat > 0.15
// (e.g. Tailwind gray-900 #111827, slate #1f2937, #374151, gray-50 #f9fafb). Not violations — but not tokens.css either.
const TOKEN_HEXES = new Set((fs.readFileSync(path.join(SRC, "styles", "tokens.css"), "utf8").match(HEX_RE) ?? []).map((h) => h.toLowerCase()));
const watchlist = colourList.filter((c) => !c.violation && c.hue >= 190 && c.hue <= 260 && c.sat > 0.15 && c.alpha > 0).map((c) => ({ value: c.value, hue: c.hue, sat: c.sat, chroma: c.chroma, count: c.count, inTokens: TOKEN_HEXES.has(c.value.slice(0, 7)), files: c.files }));
const offTokenGreys = colourList.filter((c) => !c.violation && c.alpha === 1 && c.sat <= 0.5 && c.chroma <= 0.15 && !TOKEN_HEXES.has(c.value) && !["#ffffff", "#fff", "#000000", "#000"].includes(c.value)).map((c) => ({ value: c.value, count: c.count, files: c.files }));
const findings = [];
for (const c of colourList) if (c.violation) for (const f of c.files) findings.push({ file: f, line: firstLine.get(`${f}|${c.value}`) ?? null, value: c.value, hue: c.hue, kind: "literal" });
for (const t of twList) if (t.violation) for (const f of t.files) findings.push({ file: f, line: firstLine.get(`${f}|${t.value.toLowerCase()}`) ?? null, value: t.value, kind: "tailwind-class" });
findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));

/* ---------- token sheet contrast (documented in docs/design-tokens.md) ---------- */
const WHITE = "#ffffff";
const sectors = {
  emerald: { hex: "#0AC985", ink: "#047857", soft: "#E6FAF3" },
  amber: { hex: "#F59E0B", ink: "#B45309", soft: "#FEF3C7" },
  plum: { hex: "#A855F7", ink: "#6B21A8", soft: "#F3E8FF" },
  coral: { hex: "#FB7185", ink: "#BE123C", soft: "#FFE4E6" },
  teal: { hex: "#14B8A6", ink: "#0F766E", soft: "#CCFBF1" },
  olive: { hex: "#84CC16", ink: "#4D7C0F", soft: "#ECFCCB" },
  rose: { hex: "#F472B6", ink: "#9D174D", soft: "#FCE7F3" },
  "slate-warm": { hex: "#9EA2A8", ink: "#3B3F45", soft: "#F1F2F4" },
};
const sectorTokens = Object.fromEntries(Object.entries(sectors).map(([k, v]) => {
  const H = hsl(parseColour(v.hex)), Hi = hsl(parseColour(v.ink));
  return [k, { ...v, hue: Math.round(H.h), inkOnWhite: contrast(v.ink, WHITE), inkOnSoft: contrast(v.ink, v.soft), hexOnWhite: contrast(v.hex, WHITE), blueGate: isBlue(H) || isBlue(Hi) ? "FAIL" : "pass" }];
}));
const core = { "#0AC985": contrast("#0AC985", WHITE), "#047857": contrast("#047857", WHITE), "#065f46": contrast("#065f46", WHITE), "#1F2937": contrast("#1F2937", WHITE), "#16181b": contrast("#16181b", WHITE), "#5c6168": contrast("#5c6168", WHITE), "#B45309": contrast("#B45309", WHITE), "#EF4444": contrast("#EF4444", WHITE), "#b91c1c": contrast("#b91c1c", WHITE), "#047857 on #E6FAF3": contrast("#047857", "#E6FAF3"), "#ffffff on #047857": contrast(WHITE, "#047857") };

const report = {
  generatedAt: new Date().toISOString(),
  scanned: { files: files.length, root: "web/src", globs: ["**/*.css", "**/*.tsx", "**/*.ts"] },
  rule: "BLUE = HSL hue 190–260° AND saturation > 0.15 AND chroma (max−min) > 0.15 → violation (brand-audit.mjs / src/lib/hue-audit.ts). Tailwind families sky/blue/indigo/cyan are violations by construction.",
  summary: { distinctColours: colourList.length, watchlist: 0, offTokenGreys: 0, violatingColours: colourList.filter((c) => c.violation).length, violatingTailwindClasses: twList.filter((t) => t.violation).length, findings: findings.length },
  colours: colourList,
  tailwindColourClasses: twList,
  radii: toList(radii),
  durations: toList(durations),
  fontSizes: toList(fontSizes),
  findings,
  watchlist,
  offTokenGreys,
  tokenContrast: { core, sectors: sectorTokens },
};
report.summary.watchlist = watchlist.length; report.summary.offTokenGreys = offTokenGreys.length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`token-audit: ${files.length} files · ${colourList.length} distinct colours · ${report.summary.violatingColours} blue literals · ${report.summary.violatingTailwindClasses} blue Tailwind classes · ${findings.length} findings`);
for (const f of findings) console.log(`  ${f.file}:${f.line ?? "?"}  ${f.value}${f.hue != null ? `  (hue ${f.hue})` : ""}`);
console.log(`  watchlist (blue-band hue, sat>0.15, chroma≤0.15 — advisory): ${watchlist.length} · off-token greys: ${offTokenGreys.length}`);
if (args.includes("--print-tokens")) console.log(JSON.stringify(report.tokenContrast, null, 2));
console.log(`wrote ${rel(OUT)}`);
