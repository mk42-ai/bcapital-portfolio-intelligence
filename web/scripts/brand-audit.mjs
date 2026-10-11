#!/usr/bin/env node
// Lane G — brand hue audit (NO blue hues: HSL hue 190–260° with saturation >0.15 in any computed colour).
// Usage: cd web && QA_LABEL=final BASE_URL=https://<frontend> node scripts/brand-audit.mjs
// Visits 6 routes × 2 viewports with playwright-core (chromium at $CHROME_PATH or /usr/bin/chromium) and writes
// web/proof/qa-final/<label>/brand-audit.json {total_hits, by_route, samples}. Algorithm = e2e/brand-hue.spec.ts `isBlue` (inlined for page.evaluate).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";

const BASE_URL = (process.env.BASE_URL ?? "https://sb-7dj6w8wasj6f.vercel.run").replace(/\/$/, "");
const LABEL = process.env.QA_LABEL ?? "baseline";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "qa-final", LABEL);
fs.mkdirSync(OUT, { recursive: true });
const ROUTES = ["/overview", "/company/1au", "/news", "/chat?skip=1", "/artifacts", "/settings"];
const VIEWPORTS = [{ name: "1440x900", width: 1440, height: 900, device: "Desktop Chrome" }, { name: "390x844", width: 390, height: 844, device: "Pixel 7" }];
const SAMPLE_LIMIT = Number(process.env.BRAND_SAMPLE_LIMIT) || 25;
const SETTINGS = { onboarded: true, apikey: process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "", externalUserId: "INV-001", model: "predefined-deepseek-flash", theme: "light", companies: ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"] };

/** Runs in the browser — mirrors e2e/brand-hue.spec.ts auditInBrowser (hits capped at `limit` samples, but every element is COUNTED). */
function auditInBrowser(limit) {
  const PROPS = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke"];
  const parse = (input) => {
    const s = input.trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) { let h = m[1]; if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join(""); if (h.length !== 6 && h.length !== 8) return null; const n = parseInt(h.slice(0, 6), 16); const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1; return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; }
    m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
    if (m) { const ch = (v) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v)); const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [ch(m[1]), ch(m[2]), ch(m[3]), Number.isFinite(a) ? a : 1]; }
    return null;
  };
  const isBlue = (css) => {
    const c = parse(css); if (!c || c[3] <= 0) return false;
    const R = c[0] / 255, G = c[1] / 255, B = c[2] / 255; const max = Math.max(R, G, B), min = Math.min(R, G, B);
    if (max === min) return false;
    const l = (max + min) / 2, d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h; if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60; else if (max === G) h = ((B - R) / d + 2) * 60; else h = ((R - G) / d + 4) * 60;
    return h >= 190 && h <= 260 && s > 0.15 && d > 0.15; // d = chroma gate: brand charcoal #1F2937 / grey inks are neutral (see src/lib/hue-audit.ts)
  };
  const describe = (el) => {
    const parts = []; let node = el;
    while (node && parts.length < 4 && node !== document.documentElement) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`${s}#${node.id}`); break; }
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) s += "." + cls.join("."); const dt = node.getAttribute("data-testid"); if (dt) s += `[data-testid="${dt}"]`;
      parts.unshift(s); node = node.parentElement;
    }
    return parts.join(" > ");
  };
  const samples = []; let hits = 0; let elements = 0; const byProp = {};
  const els = document.querySelectorAll("*");
  for (const el of els) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.closest("[data-hue-audit-ignore]")) continue;
    elements++; const cs = getComputedStyle(el);
    for (const prop of PROPS) {
      const value = cs[prop];
      if (value && typeof value === "string" && isBlue(value)) { hits++; byProp[prop] = (byProp[prop] ?? 0) + 1; if (samples.length < limit) samples.push({ selector: describe(el), prop, value }); }
    }
  }
  return { hits, elements, byProp, samples };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const result = { label: LABEL, baseUrl: BASE_URL, at: new Date().toISOString(), rule: "no computed colour (color/background/border/outline/fill/stroke) with HSL hue 190–260° and saturation >0.15; transparent ignored; [data-hue-audit-ignore] skipped", total_hits: 0, by_route: {}, by_prop: {}, samples: [] };
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ ...devices[vp.device], viewport: { width: vp.width, height: vp.height } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), ["bcap.settings.v1", SETTINGS]);
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    const key = `${route} @${vp.name}`;
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const r = await page.evaluate(auditInBrowser, SAMPLE_LIMIT);
      result.total_hits += r.hits; result.by_route[key] = { hits: r.hits, elements: r.elements, byProp: r.byProp };
      for (const [p, n] of Object.entries(r.byProp)) result.by_prop[p] = (result.by_prop[p] ?? 0) + n;
      for (const s of r.samples) result.samples.push({ route, viewport: vp.name, ...s });
      console.error(`[brand-audit] ${key}: ${r.hits} hit(s) over ${r.elements} elements`);
    } catch (e) { result.by_route[key] = { hits: null, error: String(e.message).slice(0, 200) }; console.error(`[brand-audit] ${key}: ERROR ${e.message}`); }
  }
  await ctx.close();
}
await browser.close();
result.samples = result.samples.slice(0, 120);
fs.writeFileSync(path.join(OUT, "brand-audit.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ label: LABEL, total_hits: result.total_hits, by_route: Object.fromEntries(Object.entries(result.by_route).map(([k, v]) => [k, v.hits])), by_prop: result.by_prop, sample: result.samples.slice(0, 5) }, null, 2));
