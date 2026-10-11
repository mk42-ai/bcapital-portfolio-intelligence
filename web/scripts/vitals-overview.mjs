// Overview-specific web-vitals runner (a26). No new deps: playwright-core + /usr/bin/chromium.
// Usage: BASE_URL=https://… LABEL=before node scripts/vitals-overview.mjs  [RUNS=3] [CPU=4]
// Loads /overview?skip=1 N× cold (fresh context each), desktop 1440×900, CPU throttled via CDP Emulation.setCPUThrottlingRate,
// collects LCP / CLS (session-window, no recent input) / TBT (Σ max(0, longtask−50) between FCP and load+2s) / FCP / TTFB /
// transfer bytes / LCP element selector; reports the MEDIAN of N and a budget verdict {LCP ≤2500, TBT ≤200, CLS ≤0.1}.
import fs from "node:fs"; import path from "node:path"; import { chromium } from "playwright-core";
const BASE = (process.env.BASE_URL ?? "https://sb-1gizcktepfgc.vercel.run").replace(/\/$/, "");
const LABEL = process.env.LABEL ?? "before"; const RUNS = +(process.env.RUNS ?? 3); const CPU = +(process.env.CPU ?? 4);
const PATHNAME = process.env.PATHNAME ?? "/overview?skip=1";
const BUDGET = { lcp_ms: 2500, tbt_ms: 200, cls: 0.1 };
const OUT = process.env.OUT ?? path.join("proof", "pass-3", "perf", `overview-${LABEL}.json`);
const CAP_MS = 6 * 60_000; const cap = setTimeout(() => { console.error("vitals wall-clock cap hit"); process.exit(2); }, CAP_MS); cap.unref();

// Installed before any page script runs: buffers the perf entries we need and exposes a reader.
const INIT = `(() => {
  const S = (window.__vitals = { lcp: null, lcpSel: null, cls: 0, clsWin: 0, clsWinStart: 0, clsWinLast: 0, longtasks: [], fcp: null });
  const sel = (el) => { if (!el || !el.tagName) return null; const parts = []; let e = el; let depth = 0;
    while (e && e.nodeType === 1 && depth < 5) { let s = e.tagName.toLowerCase(); if (e.id) { s += "#" + e.id; parts.unshift(s); break; }
      const tid = e.getAttribute && e.getAttribute("data-testid"); if (tid) { s += "[data-testid=" + tid + "]"; parts.unshift(s); break; }
      if (e.classList && e.classList.length) s += "." + [...e.classList].slice(0, 2).join("."); parts.unshift(s); e = e.parentElement; depth++; }
    return parts.join(">"); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { S.lcp = e.startTime; S.lcpSel = sel(e.element); S.lcpSize = e.size; S.lcpUrl = e.url || null; } }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue;
      // session window: gap ≤1s, total ≤5s (web-vitals v3 semantics)
      if (S.clsWin && e.startTime - S.clsWinLast < 1000 && e.startTime - S.clsWinStart < 5000) { S.clsWin += e.value; S.clsWinLast = e.startTime; }
      else { S.clsWin = e.value; S.clsWinStart = e.startTime; S.clsWinLast = e.startTime; }
      if (S.clsWin > S.cls) S.cls = S.clsWin; (S.shifts ||= []).push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).slice(0, 2).map((s) => sel(s.node)) }); } }).observe({ type: "layout-shift", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.longtasks.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") S.fcp = e.startTime; }).observe({ type: "paint", buffered: true }); } catch {}
})();`;

const READ = `(() => { const S = window.__vitals; const nav = performance.getEntriesByType("navigation")[0];
  const fcp = S.fcp ?? nav?.responseEnd ?? 0; const end = (nav?.loadEventEnd || nav?.domContentLoadedEventEnd || 0) + 2000;
  const tbt = S.longtasks.filter(([t]) => t >= fcp && t <= end).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  const res = performance.getEntriesByType("resource"); const transfer = (nav?.transferSize || 0) + res.reduce((a, r) => a + (r.transferSize || 0), 0);
  const byType = {}; for (const r of res) { const k = r.initiatorType || "other"; byType[k] = (byType[k] || 0) + (r.transferSize || 0); }
  return { lcp_ms: S.lcp == null ? null : Math.round(S.lcp), lcp_selector: S.lcpSel, lcp_url: S.lcpUrl || null, cls: +S.cls.toFixed(4), shifts: S.shifts || [], tbt_ms: Math.round(tbt), longtasks: S.longtasks.length,
    fcp_ms: Math.round(fcp), ttfb_ms: Math.round(nav?.responseStart || 0), load_ms: Math.round(nav?.loadEventEnd || 0), transfer_bytes: transfer, transfer_by_type: byType, requests: res.length + 1 }; })()`;

const median = (xs) => { const a = xs.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); // cold: new context = empty cache/storage
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable"); await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    let cdpBytes = 0; cdp.on("Network.loadingFinished", (e) => { cdpBytes += e.encodedDataLength || 0; });
    await page.addInitScript(INIT);
    const t0 = Date.now();
    await page.goto(`${BASE}${PATHNAME}`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(2500); // let the 2 s post-load TBT window + late LCP candidates settle
    // LCP is finalised on first input; a tiny scroll makes the observer flush without counting as "recent input" for CLS (shifts already recorded)
    await page.mouse.move(10, 10);
    await page.waitForTimeout(300);
    const m = await page.evaluate(READ); m.cdp_encoded_bytes = cdpBytes; m.wall_ms = Date.now() - t0; m.run = i + 1;
    runs.push(m); console.log(`run ${i + 1}:`, JSON.stringify({ lcp_ms: m.lcp_ms, fcp_ms: m.fcp_ms, ttfb_ms: m.ttfb_ms, tbt_ms: m.tbt_ms, cls: m.cls, transfer_kb: Math.round(m.transfer_bytes / 1024), lcp: m.lcp_selector }));
    await ctx.close();
  }
} finally { await browser.close(); }
const med = { lcp_ms: median(runs.map((r) => r.lcp_ms)), fcp_ms: median(runs.map((r) => r.fcp_ms)), ttfb_ms: median(runs.map((r) => r.ttfb_ms)), tbt_ms: median(runs.map((r) => r.tbt_ms)), cls: median(runs.map((r) => r.cls)), transfer_bytes: median(runs.map((r) => r.transfer_bytes)), cdp_encoded_bytes: median(runs.map((r) => r.cdp_encoded_bytes)), load_ms: median(runs.map((r) => r.load_ms)) };
const verdict = { lcp: med.lcp_ms != null && med.lcp_ms <= BUDGET.lcp_ms, tbt: med.tbt_ms <= BUDGET.tbt_ms, cls: med.cls <= BUDGET.cls }; verdict.pass = verdict.lcp && verdict.tbt && verdict.cls;
const out = { label: LABEL, base: BASE, path: PATHNAME, at: new Date().toISOString(), viewport: "1440x900", cpu_throttle: CPU, runs: RUNS, budget: BUDGET, median: med, lcp_selector: runs.map((r) => r.lcp_selector), verdict, per_run: runs };
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n[${LABEL}] median of ${RUNS} @ CPU ${CPU}× — LCP ${med.lcp_ms} ms (≤${BUDGET.lcp_ms}) ${verdict.lcp ? "PASS" : "FAIL"} · TBT ${med.tbt_ms} ms (≤${BUDGET.tbt_ms}) ${verdict.tbt ? "PASS" : "FAIL"} · CLS ${med.cls} (≤${BUDGET.cls}) ${verdict.cls ? "PASS" : "FAIL"} · FCP ${med.fcp_ms} · TTFB ${med.ttfb_ms} · ${Math.round(med.transfer_bytes / 1024)} KB`);
console.log(`BUDGET ${verdict.pass ? "PASS" : "FAIL"} → ${OUT}`);
process.exit(verdict.pass ? 0 : 1);
