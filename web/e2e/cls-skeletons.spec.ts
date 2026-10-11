import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * a34 — CLS budget for the skeleton-backed routes (companies, company detail, news, artifacts).
 * For each route × viewport: throttle the network to Fast 3G via CDP, install a PerformanceObserver for `layout-shift`
 * BEFORE any script runs (addInitScript), navigate, wait for networkidle + 2 s, then assert CLS ≤ 0.1 (soft target 0.05,
 * logged). The shift sources (element selectors + rects) are written to web/proof/pass-3/cls/<route>-<WxH>.json.
 * Run: BASE_URL=<frontend> node node_modules/@playwright/test/cli.js test e2e/cls-skeletons.spec.ts --project=desktop --workers=1
 */
const ROUTES: { name: string; path: string }[] = [
  { name: "companies", path: "/companies?skip=1" },
  { name: "company-fervo-energy", path: "/company/fervo-energy?skip=1" },
  { name: "news", path: "/news?skip=1" },
  { name: "artifacts", path: "/artifacts?skip=1" },
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const HARD = 0.1;
const SOFT = 0.05;
const OUT = path.resolve(__dirname, "..", "proof", "pass-3", "cls");
const FAST_3G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

type ShiftSource = { selector: string; prev: number[]; cur: number[] };
type Shift = { t: number; value: number; hadRecentInput: boolean; sources: ShiftSource[] };
declare global { interface Window { __cls?: { total: number; shifts: Shift[] } } }

const OBSERVER = `(() => {
  const sel = (el) => { if (!el || !(el instanceof Element)) return String(el && el.nodeName || "?"); const parts = []; let n = el; let depth = 0;
    while (n && n.nodeType === 1 && depth < 5) { let s = n.tagName.toLowerCase(); const tid = n.getAttribute("data-testid"); const sk = n.getAttribute("data-skeleton");
      if (n.id) { s += "#" + n.id; } else if (tid) { s += "[data-testid=" + tid + "]"; } else if (sk) { s += "[data-skeleton=" + sk + "]"; } else if (n.classList.length) { s += "." + Array.from(n.classList).slice(0, 2).join("."); }
      parts.unshift(s); if (n.id || tid) break; n = n.parentElement; depth++; } return parts.join(" > "); };
  const r = (x) => x ? [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)] : [];
  window.__cls = { total: 0, shifts: [] };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) { const ls = e; if (ls.hadRecentInput) continue; window.__cls.total += ls.value;
    window.__cls.shifts.push({ t: Math.round(ls.startTime), value: +ls.value.toFixed(5), hadRecentInput: !!ls.hadRecentInput,
      sources: (ls.sources || []).slice(0, 6).map((s) => ({ selector: sel(s.node), prev: r(s.previousRect), cur: r(s.currentRect) })) }); } }).observe({ type: "layout-shift", buffered: true }); } catch {}
})();`;

async function measure(page: Page, route: string, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", FAST_3G);
  const t0 = Date.now();
  await page.goto(route, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => window.__cls ?? { total: 0, shifts: [] });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.detach();
  return { ...res, loadMs: Date.now() - t0 };
}

test.describe("CLS — skeleton routes @ Fast 3G", () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(OBSERVER); });
  for (const r of ROUTES) for (const vp of VIEWPORTS) {
    const label = `${vp.width}x${vp.height}`;
    test(`${r.name} ${label}: CLS ≤ ${HARD}`, async ({ page }, info) => {
      info.setTimeout(240_000);
      const m = await measure(page, r.path, vp);
      const cls = +m.total.toFixed(4);
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `${r.name}-${label}.json`);
      fs.writeFileSync(file, JSON.stringify({ route: r.path, viewport: label, network: "Fast 3G (CDP emulateNetworkConditions)", measuredAt: new Date().toISOString(), baseURL: info.project.use.baseURL, cls, hard: HARD, soft: SOFT, pass: cls <= HARD, softPass: cls <= SOFT, loadMs: m.loadMs, shifts: m.shifts }, null, 2));
      const worst = [...m.shifts].sort((a, b) => b.value - a.value).slice(0, 3).map((s) => `${s.value}@${s.t}ms ${s.sources.map((x) => x.selector).join(" | ")}`);
      console.log(`[cls] ${r.name} ${label} CLS=${cls} ${cls <= SOFT ? "(soft ok)" : cls <= HARD ? "(soft 0.05 MISSED)" : "(FAIL)"} shifts=${m.shifts.length} load=${m.loadMs}ms${worst.length ? "\n       worst: " + worst.join("\n              ") : ""}`);
      if (cls > SOFT) info.annotations.push({ type: "soft-cls-miss", description: `CLS ${cls} > soft target ${SOFT} on ${r.path} @ ${label}` });
      expect(cls, `CLS budget ${HARD} on ${r.path} @ ${label} — see ${path.relative(process.cwd(), file)}`).toBeLessThanOrEqual(HARD);
    });
  }
});
