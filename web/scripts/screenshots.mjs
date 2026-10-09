// Full-page screenshots per screen at desktop 1440 and mobile 390. Usage: BASE_URL=… OUT_DIR=… node scripts/screenshots.mjs
import { chromium } from "@playwright/test"; import fs from "node:fs"; import path from "node:path";
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, ""); const OUT = process.env.OUT_DIR ?? "docs/screenshots"; fs.mkdirSync(OUT, { recursive: true });
const SCREENS = [["overview", "/overview"], ["company-detail", "/company/perplexity-ai"], ["news-pulse", "/news"], ["chat", "/chat"], ["settings", "/settings"], ["onboarding", "/onboarding"]];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
const cap = setTimeout(() => { browser.close(); process.exit(2); }, 8 * 60_000); cap.unref();
const out = {};
for (const [vp, w, h, mobile] of [["desktop", 1440, 900, false], ["mobile", 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  await ctx.addInitScript(() => localStorage.setItem("bcap.settings.v1", JSON.stringify({ onboarded: true, companies: ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"], theme: "dark" })));
  const page = await ctx.newPage();
  for (const [name, p] of SCREENS) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
    if (name === "overview") { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(600); await page.evaluate(() => window.scrollTo(0, 0)); }
    const file = path.join(OUT, `${name}-${vp}-${w}.png`); await page.screenshot({ path: file, fullPage: true }); out[`${name}:${vp}`] = file; console.log("saved", file);
  }
  await ctx.close();
}
await browser.close(); clearTimeout(cap); fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), files: out }, null, 2));
