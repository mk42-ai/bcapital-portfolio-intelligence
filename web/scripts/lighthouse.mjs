// Lighthouse (performance, accessibility, best-practices, seo) for mobile + desktop on the five screens. Usage: BASE_URL=… node scripts/lighthouse.mjs
import fs from "node:fs"; import { spawn } from "node:child_process"; import lighthouse from "lighthouse";
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const PAGES = ["/overview?e2e=1", "/company/perplexity-ai?e2e=1", "/news?e2e=1", "/chat?e2e=1", "/settings?e2e=1"];
const port = 9333;
const chrome = spawn(process.env.CHROME_PATH || "chromium", [`--remote-debugging-port=${port}`, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--user-data-dir=/tmp/lh-profile", "about:blank"], { stdio: "ignore", detached: true });
const kill = () => { try { process.kill(-chrome.pid, "SIGKILL"); } catch {} };
process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(1); }); setTimeout(() => { console.error("lighthouse wall-clock cap hit"); kill(); process.exit(2); }, 15 * 60_000).unref();
await new Promise((r) => setTimeout(r, 2500));
const out = { base: BASE, at: new Date().toISOString(), results: {} };
for (const form of ["mobile", "desktop"]) {
  for (const p of PAGES) {
    const url = `${BASE}${p}`;
    const cfg = form === "desktop" ? { extends: "lighthouse:default", settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 }, onlyCategories: ["performance", "accessibility", "best-practices", "seo"] } } : { extends: "lighthouse:default", settings: { onlyCategories: ["performance", "accessibility", "best-practices", "seo"] } };
    const r = await lighthouse(url, { port, output: "json", logLevel: "error" }, cfg);
    const c = r.lhr.categories; const a = r.lhr.audits;
    out.results[`${form}:${p.replace("?e2e=1", "")}`] = { performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), best_practices: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100), lcp_ms: Math.round(a["largest-contentful-paint"].numericValue), cls: +a["cumulative-layout-shift"].numericValue.toFixed(3), tbt_ms: Math.round(a["total-blocking-time"].numericValue), failing_seo: Object.values(a).filter((x) => x.score !== null && x.score < 1 && c.seo.auditRefs.some((ref) => ref.id === x.id)).map((x) => x.id), failing_a11y: Object.values(a).filter((x) => x.score !== null && x.score < 1 && c.accessibility.auditRefs.some((ref) => ref.id === x.id)).map((x) => x.id) };
    console.log(form, p, JSON.stringify(out.results[`${form}:${p.replace("?e2e=1", "")}`]));
  }
}
fs.mkdirSync(".lighthouse", { recursive: true }); fs.writeFileSync(".lighthouse/summary.json", JSON.stringify(out, null, 2)); kill(); process.exit(0);
