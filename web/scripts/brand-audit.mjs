#!/usr/bin/env node
/**
 * brand-audit.mjs — scans web/src for hex colours and named CSS blues and fails if any "blue" remains.
 * Blue = HSL hue in [195°, 260°] with saturation > 25 % (so neutral slates like #6b7280 pass, #3b82f6 / #1D4ED8 fail).
 * Allowlist: the e2e BLUES constants used as negative assertions, and comment lines in tokens.css.
 * Usage: node scripts/brand-audit.mjs [--json]   (run from web/)  → exit 1 when any blue is found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const EXT = /\.(tsx?|jsx?|css|mjs|md)$/;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const NAMED = { blue: "#0000ff", royalblue: "#4169e1", dodgerblue: "#1e90ff", steelblue: "#4682b4", cornflowerblue: "#6495ed", deepskyblue: "#00bfff", skyblue: "#87ceeb", lightblue: "#add8e6", navy: "#000080", midnightblue: "#191970", slateblue: "#6a5acd", mediumblue: "#0000cd", darkblue: "#00008b", cadetblue: "#5f9ea0", powderblue: "#b0e0e6", indigo: "#4b0082" };
const NAMED_RE = new RegExp(`\\b(${Object.keys(NAMED).join("|")})\\b`, "gi");
/** Allowlist: regexes applied to "relpath:line-content". */
const ALLOW = [
  /^styles\/tokens\.css:.*\/\*.*\*\//, // explanatory comments in tokens.css
  /^styles\/tokens\.css:\s*(\/\*|\*|\/\/)/,
  /BLUES\s*=/, // e2e negative-assertion constants (also matched if copied into src)
  /brand-audit|legacy blue|never blue|no blue|not blue|zero blue/i, // prose mentioning blue as a forbidden colour
];
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line); // named colours in prose comments (e.g. "dark-navy wordmark") are not styles

export function hexToHsl(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  h = h.slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l, c: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue;
  if (max === r) hue = ((g - b) / d) % 6; else if (max === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4;
  hue = Math.round(hue * 60); if (hue < 0) hue += 360;
  return { h: hue, s, l, c: d };
}
/** Spec rule: hue ∈ [195°,260°] ∧ HSL saturation > 25 %. HSL saturation inflates towards black/white (Tailwind gray-900 #111827 reads as
 *  39 % "saturated" yet is visually neutral), so a perceptual guard is added: chroma (max−min) must be ≥ 0.10 (≈ 25/255) for the colour to
 *  carry any visible blue. #1D4ED8 / #2563eb / #3b82f6 / #0285ff / #64748b are blue; #111827 / #1f2937 / #cbd5e1 / #e2e8f0 are not. */
export const isBlue = (hex) => { const { h, s, l, c } = hexToHsl(hex); return h >= 195 && h <= 260 && s > 0.25 && (c >= 0.10 || (l > 0.85 && s > 0.6)); }; // 2nd clause: pale blue washes (#edf5ff)

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) { if (n !== "node_modules") walk(p, out); } else if (EXT.test(n)) out.push(p); }
  return out;
}

const rows = []; let scanned = 0, total = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file); const lines = readFileSync(file, "utf8").split("\n"); scanned++;
  lines.forEach((line, i) => {
    const found = [];
    for (const m of line.matchAll(HEX)) { total++; if (isBlue(m[0])) found.push(m[0]); }
    if (!isComment(line)) for (const m of line.matchAll(NAMED_RE)) { total++; found.push(m[0].toLowerCase()); }
    if (!found.length) return;
    const key = `${rel}:${line}`;
    if (ALLOW.some((re) => re.test(key))) return;
    for (const c of found) { const hex = NAMED[c] ?? c; const { h, s } = hexToHsl(hex); rows.push({ file: rel, line: i + 1, colour: c, hue: h, sat: Math.round(s * 100), snippet: line.trim().slice(0, 90) }); }
  });
}

if (process.argv.includes("--json")) console.log(JSON.stringify({ scanned, total, blues: rows }, null, 2));
else {
  console.log(`brand-audit: ${scanned} files, ${total} colour tokens scanned, ${rows.length} blue${rows.length === 1 ? "" : "s"} found`);
  if (rows.length) { console.log("file:line:colour  (hue°/sat%)  snippet"); for (const r of rows) console.log(`${r.file}:${r.line}:${r.colour}  (${r.hue}°/${r.sat}%)  ${r.snippet}`); }
}
process.exit(rows.length ? 1 : 0);
