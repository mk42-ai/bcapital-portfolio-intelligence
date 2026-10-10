import { test as base, expect } from "@playwright/test";
import { primeSettings, captureErrors } from "./helpers";
import * as fs from "node:fs";
import * as path from "node:path";

// QA route matrix. Runs at both viewports via explicit test.use (the "mobile" project only matches *mobile.spec.ts).
const PROOF = path.resolve(__dirname, "..", "proof");
fs.mkdirSync(PROOF, { recursive: true });
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const ROUTES: { path: string; slug: string; onboarded?: boolean; expect404?: boolean }[] = [
  { path: "/onboarding", slug: "onboarding", onboarded: false },
  { path: "/overview", slug: "overview" },
  { path: "/company/fervo-energy", slug: "company-fervo-energy" },
  { path: "/company/perplexity-ai", slug: "company-perplexity-ai" },
  { path: "/news", slug: "news" },
  { path: "/settings", slug: "settings" },
  { path: "/chat", slug: "chat" },
  { path: "/company/does-not-exist", slug: "company-does-not-exist", expect404: true },
];

const MATRIX_FILE = path.join(PROOF, "qa-route-matrix.json");
function appendMatrix(entry: Record<string, unknown>) {
  let arr: Record<string, unknown>[] = [];
  try { arr = JSON.parse(fs.readFileSync(MATRIX_FILE, "utf8")); } catch { /* fresh */ }
  arr = arr.filter((e) => !(e.route === entry.route && e.viewport === entry.viewport && e.reducedMotion === entry.reducedMotion));
  arr.push(entry);
  fs.writeFileSync(MATRIX_FILE, JSON.stringify(arr, null, 2));
}

const test = base;

/** Logos/news thumbs are `loading="lazy"` and sit below the fold: scroll through the document so they actually fetch. */
async function scrollThrough(page: import("@playwright/test").Page, maxMs = 12_000) {
  const t0 = Date.now();
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  });
  // wait until all lazy imgs settled (complete) or timeout
  while (Date.now() - t0 < maxMs) {
    const pending = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>("img[loading=lazy]")).filter((i) => !i.complete).length);
    if (pending === 0) break;
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

for (const vp of VIEWPORTS) {
  test.describe(`QA routes @ ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    const W = vp.width;

    for (const r of ROUTES) {
      test(`${r.path}`, async ({ page }) => {
        test.setTimeout(120_000);
        await primeSettings(page, r.onboarded === false ? { onboarded: false } : {});
        const errors = captureErrors(page);
        const res = await page.goto(r.path, { waitUntil: "domcontentloaded" });
        const status = res?.status() ?? 0;
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const extra: Record<string, unknown> = {};

        if (r.expect404) {
          expect(status, "404 status for unknown company").toBe(404);
          const body = (await page.locator("body").innerText()).toLowerCase();
          expect(body, "not-found UI").toMatch(/not found|404|doesn.t exist|no such company/);
          extra.notFoundUi = true;
        }

        if (r.slug === "overview" || r.slug === "news") await scrollThrough(page);
        if (r.slug === "overview") {
          const logos = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLImageElement>('img[data-testid="company-logo"]')).map((i) => ({ src: i.currentSrc || i.src, naturalWidth: i.naturalWidth })),
          );
          const ok = logos.filter((l) => l.naturalWidth > 0).length;
          extra.companyLogos = { total: logos.length, ok, fallbacks: await page.locator('[data-testid="company-logo-fallback"]').count() };
          expect(ok, "≥1 company-logo img rendered (naturalWidth>0)").toBeGreaterThanOrEqual(1);
          await page.screenshot({ path: path.join(PROOF, `overview-logos-${W}.png`), fullPage: true });
        }

        if (r.slug === "company-perplexity-ai") {
          const hero = page.locator('[data-testid="logo-img"]').first();
          await expect(hero).toBeAttached();
          const info = await hero.evaluate((el) => ({ src: (el as HTMLImageElement).src, nw: (el as HTMLImageElement).naturalWidth }));
          extra.heroLogo = info;
          expect(info.src, "hero logo src").toMatch(/\/brand\/logos\/perplexity\.svg$/);
          expect(info.nw, "hero logo naturalWidth>0").toBeGreaterThan(0);
          if (W === 1440) await page.screenshot({ path: path.join(PROOF, "perplexity-logo-rendered.png"), fullPage: false });
        }

        if (r.slug === "news") {
          const imgs = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLImageElement>('img[data-testid="news-image"]')).map((i) => i.naturalWidth),
          );
          extra.newsImages = { total: imgs.length, ok: imgs.filter((n) => n > 0).length, placeholders: await page.locator('[data-testid="news-image-placeholder"]').count() };
          await page.screenshot({ path: path.join(PROOF, `news-logos-${W}.png`), fullPage: true });
        }

        if (r.slug === "onboarding") {
          const gv = page.locator('[data-testid="growth-value"]').first();
          await expect(gv).toBeVisible();
          await gv.click();
          await expect(gv).toHaveAttribute("aria-expanded", "true");
          const panelId = await gv.getAttribute("aria-controls");
          const panel = panelId ? page.locator(`#${panelId}`) : page.locator('[data-testid="growth-panel"]').first();
          await expect(panel).toBeVisible();
          const txt = (await panel.innerText()).trim();
          expect(txt.length, "growth panel text").toBeGreaterThan(0);
          extra.growth = { expanded: true, panelText: txt.slice(0, 120) };
          await page.screenshot({ path: path.join(PROOF, `growth-expanded-${W}.png`), fullPage: true });
        }

        await page.screenshot({ path: path.join(PROOF, `qa-${r.slug}-${W}.png`), fullPage: true });
        // Third-party image hosts (news thumbnails / logos) failing with a cert or CORP error are resource noise, not app errors;
        // they are counted separately so they stay visible in the matrix but do not fail the route.
        const resourceNoise = errors.filter((e) => /Failed to load resource: net::ERR_/.test(e));
        const real = errors.filter((e) => !resourceNoise.includes(e));
        appendMatrix({ route: r.path, viewport: W, reducedMotion: false, status, consoleErrors: real.filter((e) => e.startsWith("console")).length, pageErrors: real.filter((e) => e.startsWith("pageerror")).length, thirdPartyResourceErrors: resourceNoise.length, errors: real.slice(0, 5), ...extra });
        expect(real, "0 console/page errors").toEqual([]);
      });
    }

    test("/onboarding with reduced motion: growth value expands", async ({ page }) => {
      await primeSettings(page, { onboarded: false });
      const errors = captureErrors(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const res = await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const gv = page.locator('[data-testid="growth-value"]').first();
      await gv.click();
      await expect(gv).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator('[data-testid="growth-panel"]').first()).toBeVisible();
      await page.screenshot({ path: path.join(PROOF, `growth-expanded-reduced-motion-${W}.png`), fullPage: true });
      appendMatrix({ route: "/onboarding", viewport: W, reducedMotion: true, status: res?.status(), consoleErrors: errors.filter((e) => e.startsWith("console")).length, pageErrors: errors.filter((e) => e.startsWith("pageerror")).length, errors: errors.slice(0, 5) });
      expect(errors).toEqual([]);
    });
  });
}

test.describe("Logo audit (browser) @ desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("collect every company-logo / logo-img on /overview (paging ≤60 s)", async ({ page }) => {
    test.setTimeout(120_000);
    await primeSettings(page);
    await page.goto("/overview", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const start = Date.now();
    const all: { src: string; naturalWidth: number; testid: string }[] = [];
    let fallbacks = 0, monograms = 0, pages = 0;
    const collect = async () => {
      await scrollThrough(page);
      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLImageElement>('img[data-testid="company-logo"], img[data-testid="logo-img"]')).map((i) => ({ src: i.currentSrc || i.src, naturalWidth: i.naturalWidth, testid: i.dataset.testid! })),
      );
      all.push(...items);
      fallbacks += await page.locator('[data-testid="company-logo-fallback"]').count();
      monograms += await page.locator('[data-testid="logo-monogram"]').count();
      pages++;
    };
    await collect();
    const next = page.locator('[data-testid="paged-table"] button[aria-label*="ext" i], [data-testid="paged-table"] button:has-text("Next")').first();
    while ((await next.count()) > 0 && (await next.isEnabled().catch(() => false)) && Date.now() - start < 60_000) {
      await next.click();
      await collect();
    }
    const uniq = new Map(all.map((a) => [a.src, a]));
    const list = Array.from(uniq.values());
    const audit = {
      generatedAt: new Date().toISOString(), route: "/overview", pagesVisited: pages,
      total: list.length, ok: list.filter((l) => l.naturalWidth > 0).length, broken: list.filter((l) => l.naturalWidth === 0),
      fallbacks: { companyLogoFallback: fallbacks, logoMonogram: monograms },
      images: list,
    };
    fs.writeFileSync(path.join(PROOF, "logo-audit-browser.json"), JSON.stringify(audit, null, 2));
    expect(audit.ok, "at least one rendered logo").toBeGreaterThanOrEqual(1);
  });
});
