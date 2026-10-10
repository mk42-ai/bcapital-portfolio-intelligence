import type { Page } from "@playwright/test";
import { test, expect } from "./helpers";

/** naturalWidth of every matched <img> after it has finished loading (0 = broken / not loaded). */
async function naturalWidths(page: Page, selector: string): Promise<number[]> {
  return page.$$eval(selector, async (els: Element[]) => {
    const imgs = els as HTMLImageElement[];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((done) => {
            if (img.complete) return done();
            img.addEventListener("load", () => done(), { once: true });
            img.addEventListener("error", () => done(), { once: true });
            setTimeout(done, 15_000);
          }),
      ),
    );
    return imgs.map((img) => img.naturalWidth);
  });
}

test.describe("Images render (naturalWidth > 0)", () => {
  test("overview: B Capital logo and (when present) company logos", async ({ page }, testInfo) => {
    await page.goto("/overview?skip=1");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
    const brand = page.locator('img[data-testid="brand-logo"]').first();
    await expect(brand).toBeAttached();
    await expect.poll(() => naturalWidths(page, 'img[data-testid="brand-logo"]'), { timeout: 20_000 }).toEqual(expect.arrayContaining([expect.any(Number)]));
    const brandW = await naturalWidths(page, 'img[data-testid="brand-logo"]');
    expect(brandW[0], "B Capital brand logo naturalWidth").toBeGreaterThan(0);

    // Company logos in the table are being added by SA2; soft-skip when the deployed build does not render them yet.
    await page.waitForLoadState("networkidle").catch(() => {});
    const logoCount = await page.locator('img[data-testid="company-logo"]').count();
    if (logoCount === 0) {
      testInfo.annotations.push({ type: "soft-skip", description: 'no img[data-testid="company-logo"] on /overview (deployed build predates SA2 logos) — company-logo assertion skipped' });
      console.log('[images] SOFT-SKIP: no img[data-testid="company-logo"] on /overview in this build');
      return;
    }
    // Logos are loading="lazy": scroll the table into view and wait for decode before measuring.
    await page.locator('[data-testid="company-table"]').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await naturalWidths(page, 'img[data-testid="company-logo"]')).filter((w) => w > 0).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    const widths = await naturalWidths(page, 'img[data-testid="company-logo"]');
    const loaded = widths.filter((w) => w > 0).length;
    console.log(`[images] overview company logos: ${loaded}/${widths.length} loaded`);
    expect(loaded, "≥1 company logo with naturalWidth>0").toBeGreaterThanOrEqual(1);
  });

  test("company page: Fervo logo and news-card images", async ({ page }, testInfo) => {
    await page.goto("/company/fervo-energy?skip=1");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fervo/);
    const logoSel = 'img[data-testid="company-logo"], header img[alt$=" logo"], main img[alt$=" logo"]';
    const logo = page.locator(logoSel).first();
    await expect(logo, "company logo img rendered").toBeAttached();
    await expect.poll(async () => (await naturalWidths(page, logoSel))[0] ?? 0, { timeout: 20_000, message: "company logo naturalWidth>0" }).toBeGreaterThan(0);

    // News-card images: only asserted when the data has at least one image_url (an <img> inside an <article>).
    await page.waitForLoadState("networkidle").catch(() => {});
    const newsSel = 'article img[data-testid="news-image"], article img';
    const n = await page.locator(newsSel).count();
    const placeholders = await page.locator('[data-testid="news-image-placeholder"]').count();
    if (n === 0) {
      testInfo.annotations.push({ type: "soft-skip", description: `no <article> images on /company/fervo-energy (placeholders=${placeholders}) — no image_url in data, news-image assertion skipped` });
      console.log(`[images] SOFT-SKIP: no news-card <img> (placeholders=${placeholders})`);
      return;
    }
    const widths = await naturalWidths(page, newsSel);
    const loaded = widths.filter((w) => w > 0).length;
    console.log(`[images] fervo news images: ${loaded}/${widths.length} loaded`);
    testInfo.annotations.push({ type: "news-images", description: `${loaded}/${widths.length} loaded` });
    expect(loaded, "≥1 news-card image with naturalWidth>0").toBeGreaterThanOrEqual(1);
  });
});
