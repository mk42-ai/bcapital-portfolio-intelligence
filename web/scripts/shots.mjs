#!/usr/bin/env node
/**
 * Evidence screenshots (pass-3): overview, companies, company/fervo-energy, news, artifacts,
 * chat empty + one live chat turn (streaming / settled / run-panel element) at 1440×900 and 390×844.
 *
 *   node scripts/shots.mjs --base https://sb-xxxx.vercel.run --label before|after [--out proof/pass-3/shots]
 *
 * Uses playwright-core with the system Chromium (/usr/bin/chromium). Primes the onboarding flag exactly like
 * web/e2e/helpers.ts (`primeSettings`); the apikey is taken from $ON_DEMAND_API_KEY / $ONDEMAND_API_KEY and is
 * never printed. Writes <out>/<label>/*.png and (re)generates <out>/README.md (index table).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
  return acc;
}, []));
const BASE = (args.base ?? "http://localhost:3000").replace(/\/$/, "");
const LABEL = args.label ?? "before";
if (!["before", "after"].includes(LABEL)) throw new Error("--label must be before|after");
const OUT_ROOT = path.resolve(here, "..", args.out ?? "proof/pass-3/shots");
const OUT = path.join(OUT_ROOT, LABEL);
fs.mkdirSync(OUT, { recursive: true });

const SETTINGS_KEY = "bcap.settings.v1";
const COMPANIES = ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"];
const KEY = process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "";
const QUESTION = "Which of my context companies moved most since the last sentiment run, and why?";
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const SETTLE_MS = 150_000;
const CHROME = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";

const rows = []; // { file, route, viewport, captured_at }
const log = (...a) => console.log(`[shots:${LABEL}]`, ...a);

async function shot(page, file, route, vp, opts = {}) {
  const fp = path.join(OUT, file);
  await page.screenshot({ path: fp, fullPage: !!opts.fullPage, animations: "disabled", caret: "hide" });
  rows.push({ file: `${LABEL}/${file}`, route, viewport: `${vp.width}×${vp.height}`, captured_at: new Date().toISOString() });
  log("saved", file);
}

async function elementShot(locator, file, route, vp) {
  const fp = path.join(OUT, file);
  await locator.screenshot({ path: fp, animations: "disabled" });
  rows.push({ file: `${LABEL}/${file}`, route, viewport: `${vp.width}×${vp.height}`, captured_at: new Date().toISOString() });
  log("saved", file);
}

async function goto(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function runViewport(browser, vp) {
  const tag = `${vp.width}x${vp.height}`;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [SETTINGS_KEY, {
    onboarded: true, apikey: KEY, externalUserId: "INV-001", model: "predefined-deepseek-flash", theme: "light", companies: COMPANIES,
  }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  // Static routes (full page).
  for (const [route, name] of [["/overview", "overview"], ["/companies", "companies"], ["/company/fervo-energy", "company-fervo"], ["/news", "news"], ["/artifacts", "artifacts"]]) {
    try {
      await goto(page, route);
      await shot(page, `${name}-${tag}.png`, route, vp, { fullPage: true });
    } catch (e) { log(`WARN ${route} failed: ${e.message}`); }
  }

  // Chat: empty state, then ONE live turn.
  try {
    await goto(page, "/chat");
    await shot(page, `chat-empty-${tag}.png`, "/chat", vp);
    const input = page.locator("[data-testid=composer-input]");
    await input.waitFor({ state: "visible" });
    await input.fill(QUESTION);
    const t0 = Date.now();
    await input.press("Enter");
    // Streaming: first working-row (fallback: settled footer if the run completes before any row appears).
    const working = page.locator("[data-testid=working-row]").first();
    const footer = page.locator("[data-testid=run-footer]").first();
    await Promise.race([
      working.waitFor({ state: "attached", timeout: 60_000 }),
      footer.waitFor({ state: "attached", timeout: 60_000 }),
    ]).catch((e) => log("WARN no working-row/run-footer within 60 s:", e.message));
    await page.waitForTimeout(250);
    await shot(page, `chat-run-streaming-${tag}.png`, "/chat (streaming, first working-row)", vp);
    log(`first row at +${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await footer.waitFor({ state: "attached", timeout: SETTLE_MS }).catch((e) => log("WARN run-footer not attached within 150 s:", e.message));
    await page.waitForTimeout(1200);
    log(`settled at +${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await shot(page, `chat-run-settled-${tag}.png`, "/chat (settled, run-footer)", vp);
    const runView = page.locator("[data-testid=run-view]").first();
    if (await runView.count()) {
      await runView.scrollIntoViewIfNeeded().catch(() => {});
      await elementShot(runView, `run-panel-settled-${tag}.png`, "/chat [data-testid=run-view] (element)", vp);
    } else log("WARN run-view not found");
  } catch (e) { log(`WARN /chat failed: ${e.message}`); }

  await ctx.close();
}

function writeReadme() {
  const readme = path.join(OUT_ROOT, "README.md");
  // Keep rows of the *other* label if a previous README exists.
  const prev = fs.existsSync(readme) ? fs.readFileSync(readme, "utf8") : "";
  const kept = prev.split("\n").filter((l) => /^\| `(before|after)\//.test(l) && !l.startsWith(`| \`${LABEL}/`));
  const mine = rows.map((r) => `| \`${r.file}\` | \`${r.route}\` | ${r.viewport} | ${r.captured_at} |`);
  const all = [...kept, ...mine].sort();
  const body = [
    "# Pass-3 evidence screenshots",
    "",
    "Generated by `node web/scripts/shots.mjs --base <url> --label before|after` (playwright-core + system Chromium).",
    `Viewports 1440×900 and 390×844; onboarding primed via localStorage (\`${SETTINGS_KEY}\`), one live chat turn per viewport:`,
    `> ${QUESTION}`,
    "",
    "Full-page: overview, companies, company-fervo, news, artifacts. Viewport: chat-empty, chat-run-streaming (first `working-row`),",
    "chat-run-settled (after `run-footer`). Element: run-panel-settled (`[data-testid=run-view]`).",
    "",
    "| file | route | viewport | captured_at (UTC) |",
    "|---|---|---|---|",
    ...all,
    "",
  ].join("\n");
  fs.writeFileSync(readme, body);
  log("index written", path.relative(process.cwd(), readme));
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
try {
  log("base", BASE, "out", OUT, "key", KEY ? "present" : "MISSING");
  for (const vp of VIEWPORTS) await runViewport(browser, vp);
} finally {
  await browser.close().catch(() => {});
}
writeReadme();
log(`done: ${rows.length} files`);
