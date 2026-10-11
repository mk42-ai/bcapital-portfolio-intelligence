#!/usr/bin/env node
// a44 — route smoke: 6 core routes (+ /company/<slug>, + /compare) × 2 viewports against a live frontend + backend.
// Usage: cd web && node scripts/smoke-routes.mjs --base https://<frontend> --api https://<backend> --label before
// Checks per route×viewport (new browser context each time, onboarding primed like e2e/helpers.ts):
//   main-document HTTP status == 200 · 0 console errors · 0 pageerrors · 0 failed requests (favicon/sourcemap/_rsc aborts ignored)
//   no horizontal overflow (scrollWidth <= innerWidth+1) · html.light present · body background rgb(255,255,255)
//   nav rail ([data-testid=nav-rail] aside) width <= 224px at lg+ (below 1024px it is the full-width top bar → info only) · no blue hue (190–260°, sat>0.15, chroma>0.15) in first 400 elements
// Backend: GET /health /openapi.json /news/summary /companies?limit=1 → 200 + JSON.
// Writes web/proof/pass-3/smoke/<label>.json, prints a PASS/FAIL table, exits 1 on any hard failure.
// /compare (a32) returning 404 is reported as "not deployed" (info), never a failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? ""] : null)).filter(Boolean));
const BASE = (args.base ?? process.env.BASE_URL ?? "").replace(/\/$/, "");
const API = (args.api ?? process.env.API_URL ?? "").replace(/\/$/, "");
const LABEL = args.label ?? process.env.QA_LABEL ?? "smoke";
if (!BASE || !API) {
  console.error("usage: node scripts/smoke-routes.mjs --base <frontend> --api <backend> --label <name>");
  process.exit(2);
}
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "pass-3", "smoke");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, `${LABEL}.json`);

const CORE_ROUTES = ["/overview", "/companies", "/news", "/chat?skip=1", "/artifacts", "/settings"];
const EXTRA_ROUTES = [
  { path: "/company/fervo-energy", optional: false },
  { path: "/compare?slugs=fervo-energy,apptronik", optional: true }, // a32 — 404 == not deployed (info)
];
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, isMobile: false },
  { name: "390x844", width: 390, height: 844, isMobile: true },
];
const API_ROUTES = ["/health", "/openapi.json", "/news/summary", "/companies?limit=1"];
const RAIL_MAX = 224;
const GOTO_TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS) || 45_000;
const SETTINGS_KEY = "bcap.settings.v1";
const SETTINGS = {
  onboarded: true,
  apikey: process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "",
  externalUserId: "INV-001",
  model: "predefined-deepseek-flash",
  theme: "light",
  companies: ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"],
};

/** Same noise filter as web/e2e/helpers.ts ALLOW (+ sourcemap / _rsc aborts). */
const ALLOW = [/favicon/i, /net::ERR_ABORTED/i, /ERR_BLOCKED_BY_ORB/i, /Failed to load resource.*404/i, /\.map(\?|$)/i, /[?&]_rsc=/i];
const isAllowed = (s) => ALLOW.some((re) => re.test(s));

/** Runs in the browser. Blue rule = src/lib/hue-audit.ts isBlueHue (hue 190–260, sat>0.15, chroma>0.15); first 400 elements, color/background-color/border-*-color. */
function inspectPage(railMax) {
  const parse = (input) => {
    const s = String(input).trim();
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
    return h >= 190 && h <= 260 && s > 0.15 && d > 0.15;
  };
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += "." + cls.join(".");
    const dt = el.getAttribute("data-testid"); if (dt) s += `[data-testid="${dt}"]`;
    return s;
  };
  const PROPS = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
  const els = Array.from(document.querySelectorAll("body *")).slice(0, 400);
  const blue = [];
  for (const el of els) {
    if (el.closest("[data-hue-audit-ignore]") || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    const cs = getComputedStyle(el);
    for (const p of PROPS) { const v = cs[p]; if (v && isBlue(v)) { blue.push({ selector: describe(el), prop: p, value: v }); if (blue.length >= 10) break; } }
    if (blue.length >= 10) break;
  }
  const se = document.scrollingElement || document.documentElement;
  const navEl = document.querySelector("[data-testid=nav-rail]") || document.querySelector("[data-testid=primary-nav]");
  const railHost = navEl ? navEl.closest("aside, nav") || navEl : null;
  const railW = railHost ? railHost.getBoundingClientRect().width : null;
  const railVisible = railHost ? getComputedStyle(railHost).display !== "none" && railW > 0 : false;
  // Below the lg breakpoint (1024px) nav-rail.tsx renders the same <aside> as a full-width TOP BAR (w-full, border-b); the ≤224px rule is the side-rail (lg:) constraint.
  const railTopBar = railVisible && window.innerWidth < 1024 && railW >= window.innerWidth - 1;
  return {
    scrollWidth: se.scrollWidth, innerWidth: window.innerWidth, overflow: !(se.scrollWidth <= window.innerWidth + 1),
    htmlLight: document.documentElement.classList.contains("light"), htmlClass: document.documentElement.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    railWidth: railW, railVisible, railTopBar, railHeight: railHost ? railHost.getBoundingClientRect().height : null, railOk: !railVisible || railTopBar || railW <= railMax,
    blue, elementsScanned: els.length, title: document.title, h1: document.querySelector("h1")?.textContent?.trim().slice(0, 80) ?? null,
  };
}

async function runRoute(browser, route, vp, optional) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [SETTINGS_KEY, SETTINGS]);
  const consoleErrors = [], pageErrors = [], failedRequests = [];
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text().slice(0, 300); if (!isAllowed(t)) consoleErrors.push(t); } });
  page.on("pageerror", (e) => { const t = String(e?.message ?? e).slice(0, 300); if (!isAllowed(t)) pageErrors.push(t); });
  page.on("requestfailed", (r) => { const line = `${r.method()} ${r.url()} — ${r.failure()?.errorText ?? "failed"}`; if (!isAllowed(line)) failedRequests.push(line.slice(0, 300)); });
  page.on("response", (r) => { if (r.request().resourceType() !== "document" && r.status() >= 500) failedRequests.push(`${r.status()} ${r.url()}`.slice(0, 300)); });
  const url = BASE + route;
  const result = { route, viewport: vp.name, url, status: null, pass: false, hard: [], info: [], consoleErrors, pageErrors, failedRequests, ms: 0 };
  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT });
    result.status = resp ? resp.status() : null;
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (optional && result.status === 404) {
      result.info.push("not deployed (404) — a32 route, informational");
      result.pass = true; result.skipped = true;
      return result;
    }
    const insp = await page.evaluate(inspectPage, RAIL_MAX);
    Object.assign(result, insp);
    if (result.status !== 200) result.hard.push(`status ${result.status}`);
    if (consoleErrors.length) result.hard.push(`${consoleErrors.length} console error(s)`);
    if (pageErrors.length) result.hard.push(`${pageErrors.length} pageerror(s)`);
    if (failedRequests.length) result.hard.push(`${failedRequests.length} failed request(s)`);
    if (insp.overflow) result.hard.push(`overflow ${insp.scrollWidth}>${insp.innerWidth}`);
    if (!insp.htmlLight) result.hard.push(`html.light missing (class="${insp.htmlClass}")`);
    if (insp.bodyBg !== "rgb(255, 255, 255)") result.hard.push(`body bg ${insp.bodyBg}`);
    if (!insp.railOk) result.hard.push(`rail ${Math.round(insp.railWidth)}px > ${RAIL_MAX}`);
    if (!insp.railVisible) result.info.push("rail hidden/absent at this viewport");
    if (insp.railTopBar) result.info.push(`rail is a top bar at this viewport (${Math.round(insp.railHeight)}px tall)`);
    if (insp.blue.length) result.hard.push(`${insp.blue.length} blue: ${insp.blue.slice(0, 2).map((b) => `${b.selector} ${b.prop}=${b.value}`).join("; ")}`);
    result.pass = result.hard.length === 0;
  } catch (e) {
    result.hard.push(`goto failed: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`);
  } finally {
    result.ms = Date.now() - t0;
    await ctx.close();
  }
  return result;
}

async function checkApi(route) {
  const url = API + route;
  const r = { route, url, status: null, json: false, pass: false, ms: 0, note: "" };
  const t0 = Date.now();
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 20_000);
    const resp = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    clearTimeout(tm);
    r.status = resp.status;
    const text = await resp.text();
    try { const j = JSON.parse(text); r.json = true; r.note = Array.isArray(j) ? `array[${j.length}]` : Object.keys(j ?? {}).slice(0, 5).join(","); } catch { r.note = text.slice(0, 80); }
    r.pass = resp.status === 200 && r.json;
  } catch (e) { r.note = String(e?.message ?? e).slice(0, 120); }
  r.ms = Date.now() - t0;
  return r;
}

const startedAt = new Date().toISOString();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const routes = [];
try {
  const all = [...CORE_ROUTES.map((p) => ({ path: p, optional: false })), ...EXTRA_ROUTES];
  for (const vp of VIEWPORTS) for (const r of all) {
    const res = await runRoute(browser, r.path, vp, r.optional);
    routes.push(res);
    process.stderr.write(`${res.pass ? "PASS" : "FAIL"} ${vp.name.padEnd(9)} ${r.path.padEnd(40)} ${res.status ?? "-"} ${res.ms}ms${res.hard.length ? " — " + res.hard.join(" | ") : ""}${res.info.length ? " — " + res.info.join(" | ") : ""}\n`);
  }
} finally {
  await browser.close();
}
const api = [];
for (const r of API_ROUTES) { const res = await checkApi(r); api.push(res); process.stderr.write(`${res.pass ? "PASS" : "FAIL"} API       ${r.padEnd(40)} ${res.status ?? "-"} ${res.ms}ms ${res.note}\n`); }

const hardFailures = [...routes.filter((r) => !r.pass), ...api.filter((r) => !r.pass)];
const summary = {
  label: LABEL, base: BASE, api: API, startedAt, finishedAt: new Date().toISOString(),
  total: routes.length + api.length, passed: routes.length + api.length - hardFailures.length, failed: hardFailures.length,
  skipped: routes.filter((r) => r.skipped).map((r) => `${r.route} @ ${r.viewport}`),
  routes, apiChecks: api,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

const pad = (s, n) => String(s).padEnd(n);
const cell = (ok) => (ok ? "ok" : "FAIL");
console.log(`\nSmoke "${LABEL}" — ${BASE} / ${API}`);
console.log(pad("route", 42) + pad("vp", 10) + pad("status", 7) + pad("errs", 6) + pad("overflow", 9) + pad("light", 6) + pad("bodyBg", 7) + pad("rail", 8) + pad("blue", 6) + "result");
for (const r of routes) {
  if (r.skipped) { console.log(pad(r.route, 42) + pad(r.viewport, 10) + pad(r.status, 7) + pad("-", 6) + pad("-", 9) + pad("-", 6) + pad("-", 7) + pad("-", 8) + pad("-", 6) + "INFO not deployed"); continue; }
  const errs = r.consoleErrors.length + r.pageErrors.length + r.failedRequests.length;
  console.log(pad(r.route, 42) + pad(r.viewport, 10) + pad(r.status ?? "-", 7) + pad(errs, 6) + pad(cell(!r.overflow), 9) + pad(cell(r.htmlLight), 6) + pad(cell(r.bodyBg === "rgb(255, 255, 255)"), 7)
    + pad(r.railWidth == null ? "-" : r.railTopBar ? "topbar" : `${Math.round(r.railWidth)}px`, 8) + pad(r.blue ? r.blue.length : "-", 6) + (r.pass ? "PASS" : "FAIL " + r.hard.join(" | ")));
}
for (const a of api) console.log(pad("API " + a.route, 42) + pad("-", 10) + pad(a.status ?? "-", 7) + pad("-", 6) + pad("-", 9) + pad("-", 6) + pad("-", 7) + pad("-", 8) + pad(a.json ? "json" : "-", 6) + (a.pass ? "PASS" : "FAIL " + a.note));
console.log(`\n${summary.passed}/${summary.total} passed · ${summary.failed} failed · wrote ${path.relative(process.cwd(), OUT)}`);
process.exit(hardFailures.length ? 1 : 0);
