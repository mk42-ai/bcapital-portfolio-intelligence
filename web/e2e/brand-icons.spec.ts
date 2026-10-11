import { test as base, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings, captureErrors } from "./helpers";

/**
 * brand-icons.spec.ts — the ten 2026-10-11 flat-line brand icons render on the LIVE preview, plus the pass-3 invariants the owner
 * asked to re-confirm: artifact card arrives before [DONE], the live data point (2,100 news) is present, no rail-plan elements.
 * One report-style chat turn per viewport (1440×900 and 390×844). Screenshots → web/proof/brand-icons/<label>-<WxH>.png.
 */
const OUT = path.join(__dirname, "..", "proof", "brand-icons");
const ICONS = ["writer-compose", "research-search", "compare", "stock-market", "fervo-geothermal", "portfolio-listing", "agent", "autonomous-mobility", "news-sentiment", "payments-fintech"] as const;
const QUESTION = "Write a short portfolio report on Fervo Energy with cited sources.";

const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => { await primeSettings(page); const errs = captureErrors(page); await use(errs); }, { auto: true }],
});
test.describe.configure({ mode: "default" });

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const vp = page.viewportSize()!; const file = path.join(OUT, `${name}-${vp.width}x${vp.height}.png`);
  await page.screenshot({ path: file, fullPage: false }); return file;
}
/** Every <img src=/brand/icons/icon-*.png> on the page: {icon, loaded (complete && naturalWidth>0)}. */
const iconsOnPage = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="/brand/icons/icon-"]')).map((img) => ({ src: img.getAttribute("src") ?? "", slot: img.getAttribute("data-slot"), ok: img.complete && img.naturalWidth > 0 })));

async function run(page: Page, errors: string[]) {
  const info = test.info(); const vp = page.viewportSize()!; const label = `${vp.width}x${vp.height}`;
  const seen = new Map<string, boolean>();
  const absorb = async () => { for (const i of await iconsOnPage(page)) { const name = i.src.replace(/.*icon-/, "").replace(/\.png$/, ""); seen.set(name, (seen.get(name) ?? false) || i.ok); } };

  // 1 — the files themselves serve 200 with a PNG body and decode to 1024² (naturalWidth > 0 is asserted via an <img> below)
  for (const n of ICONS) {
    const r = await page.request.get(`/brand/icons/icon-${n}.png`);
    expect.soft(r.status(), `GET /brand/icons/icon-${n}.png`).toBe(200);
    expect.soft((await r.body()).subarray(1, 4).toString(), `${n} PNG magic`).toBe("PNG");
  }
  // 2 — /chat welcome: starters carry brand icons; the /companies cards and the inspector carry company glyphs
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); await absorb(); await shot(page, "chat-welcome-icons");
  expect.soft(page.locator('[data-testid="brand-icon"][data-slot="welcome-starter"]')).toHaveCount(3);
  await page.goto("/companies?skip=1");
  await page.waitForTimeout(2500); await absorb(); await shot(page, "companies-icons");
  await page.goto("/overview?skip=1");
  await page.waitForTimeout(2500); await absorb();
  // live data point: the news total from the backend (2,100 after de-dup) is rendered somewhere on /overview or /news
  const bodyText = await page.locator("body").innerText();
  const live = /2,100|2100/.test(bodyText) ? "overview" : null;
  let liveWhere = live;
  if (!liveWhere) { await page.goto("/news?skip=1"); await page.waitForTimeout(2500); if (/2,100|2100/.test(await page.locator("body").innerText())) liveWhere = "news"; }
  info.annotations.push({ type: "live-data-point", description: liveWhere ? `2,100 found on /${liveWhere}` : "2,100 NOT found on /overview or /news" });
  expect.soft(liveWhere, "live data point 2,100 rendered").not.toBeNull();

  // 3 — one chat turn: run status row + Outputs rows + inspector; artifact card before DONE; no rail-plan
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  // open the inspector (company glyphs) if the toggle exists
  const insp = page.getByTestId("inspector-toggle");
  if (await insp.count()) {
    await insp.first().click().catch(() => undefined); await page.waitForTimeout(600); await absorb(); await shot(page, "inspector-icons");
    // close it again — the open drawer (z-70) overlays the composer and would intercept the send click
    await page.keyboard.press("Escape").catch(() => undefined);
    const bd = page.getByTestId("inspector-backdrop"); if (await bd.count()) await bd.first().click({ force: true }).catch(() => undefined);
    if ((await page.getByTestId("chat-inspector").getAttribute("data-open").catch(() => null)) === "true") await insp.first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.getByTestId("composer-input").fill(QUESTION);
  await page.getByTestId("composer-send").click({ force: true });
  const runView = page.getByTestId("run-view").last();
  let artifactAt: number | null = null; let doneAt: number | null = null; const t0 = Date.now();
  for (let i = 0; i < 480; i++) {
    await page.waitForTimeout(500); await absorb();
    if (artifactAt == null && (await runView.locator('[data-testid="inline-artifacts"], [data-testid="artifact-card"]').count())) { artifactAt = Date.now() - t0; await shot(page, "artifact-card-live"); }
    const state = await page.getByTestId("run-status-header").last().getAttribute("data-state").catch(() => null);
    if (state === "done" || state === "failed") { doneAt = Date.now() - t0; break; }
    if (i === 20) await shot(page, "run-status-row-icons");
  }
  await page.waitForTimeout(800); await absorb(); await shot(page, "run-settled");
  info.annotations.push({ type: "artifact-chain", description: `artifact card at ${artifactAt} ms, done at ${doneAt} ms` });
  expect.soft(artifactAt, "artifact card appears").not.toBeNull();
  expect.soft(doneAt, "run reaches done").not.toBeNull();
  if (artifactAt != null && doneAt != null) expect.soft(artifactAt <= doneAt, "artifact card before DONE").toBe(true);
  expect.soft(await page.locator('[data-testid="rail-plan"], [data-testid="rail-plan-step"]').count(), "no rail-plan elements").toBe(0);
  expect.soft(await page.getByTestId("run-status-header").last().count(), "run status header pinned").toBeGreaterThan(0);
  const outputsChip = page.getByTestId("run-status-outputs").last();
  if (await outputsChip.count()) { await outputsChip.click().catch(() => undefined); await page.waitForTimeout(500); await absorb(); await shot(page, "outputs-rows-icons"); }
  // 4 — every icon rendered (naturalWidth > 0) at least once across the surfaces visited, plus a direct <img> probe for any not yet seen
  for (const n of ICONS) {
    if (!seen.get(n)) {
      const ok = await page.evaluate((src) => new Promise<boolean>((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = src; }), `/brand/icons/icon-${n}.png`);
      seen.set(n, ok); info.annotations.push({ type: "icon-probe", description: `${n}: not on a visited surface in this run — direct <img> decode ${ok ? "ok" : "FAILED"}` });
    }
    expect.soft(seen.get(n), `icon ${n} renders (naturalWidth > 0)`).toBe(true);
  }
  const brokenImgs = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && /brand\/icons/.test(i.src)).map((i) => i.src));
  expect.soft(brokenImgs, "no broken brand icon <img>").toEqual([]);
  fs.appendFileSync(path.join(OUT, "results.ndjson"), JSON.stringify({ at: new Date().toISOString(), viewport: label, seen: Object.fromEntries(seen), artifactAt, doneAt, liveWhere, errors: errors.slice(0, 5) }) + "\n");
  expect.soft(errors, "no console/page errors").toEqual([]);
}

test.describe("brand icons on the live preview — 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("10 icons render; artifact before DONE; live data point; no rail-plan", async ({ page, errors }) => { test.setTimeout(330_000); await run(page, errors); });
});
test.describe("brand icons on the live preview — 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("10 icons render; artifact before DONE; live data point; no rail-plan", async ({ page, errors }) => { test.setTimeout(330_000); await run(page, errors); });
});
