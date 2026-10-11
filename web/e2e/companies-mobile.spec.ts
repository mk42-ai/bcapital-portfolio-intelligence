import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "./helpers";

// a38 — Companies list + company detail at Pixel 7 (390×844). Runs in the "mobile" project (testMatch /mobile\.spec\.ts/).
// Checks: 0 console/page errors (fixture), no horizontal page overflow, company rows ≤ 96px, toolbar tap targets ≥ 40×40 (soft),
// and writes screenshots to web/proof/pass-3/mobile-companies/<label>-<route>.png.
const LABEL = process.env.MOBILE_LABEL ?? "baseline";
const OUT = path.resolve(__dirname, "..", "proof", "pass-3", "mobile-companies");
const ROUTES: { path: string; route: string }[] = [
  { path: "/companies?skip=1", route: "companies" },
  { path: "/company/fervo-energy?skip=1", route: "company-fervo-energy" },
];

test.describe("Companies mobile (390×844)", () => {
  test.skip(({ viewport }) => !viewport || viewport.width > 640, "mobile project only");
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const r of ROUTES) {
    test(`${r.route}: no overflow, row heights, tap targets, screenshot`, async ({ page }, testInfo) => {
      await page.goto(r.path);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();
      if (r.route === "companies") await expect(page.getByTestId("company-row").first()).toBeVisible();
      else await expect(page.locator("h1").first()).toBeVisible();
      // MOBILE_INJECT_CSS=1 → inject the a38 stylesheets into the baseline deployment to preview the fix before it is merged.
      if (process.env.MOBILE_INJECT_CSS === "1") {
        for (const f of ["../src/components/companies/companies-mobile.css", "../src/components/company/company-mobile.css"]) await page.addStyleTag({ content: fs.readFileSync(path.resolve(__dirname, f), "utf8") });
      }
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);

      // No horizontal page overflow.
      const widths = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(widths.sw, `${r.path} scrollWidth ${widths.sw} > innerWidth ${widths.iw}`).toBeLessThanOrEqual(widths.iw + 1);

      if (r.route === "companies") {
        // Every rendered (virtualized) row ≤ 96px tall.
        const rows = await page.getByTestId("company-row").evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, name: e.textContent?.slice(0, 40) ?? "" })));
        expect(rows.length).toBeGreaterThan(0);
        const tall = rows.filter((x) => x.h > 96);
        expect(tall, `rows taller than 96px: ${JSON.stringify(tall)}`).toEqual([]);
        testInfo.annotations.push({ type: "row-heights", description: `n=${rows.length} max=${Math.max(...rows.map((x) => x.h)).toFixed(1)}` });

        // A–Z rail hidden on mobile; toolbar visible and sticky.
        await expect(page.getByTestId("companies-az")).toBeHidden();
        const bar = page.getByTestId("companies-filter-bar");
        await expect(bar).toBeVisible();
        expect(await bar.evaluate((e) => getComputedStyle(e).position)).toBe("sticky");

        // Tap targets in the toolbar ≥ 40×40 (soft: log offenders, do not fail).
        const targets = await bar.locator("button, a[role=button], select, input").evaluateAll((els) =>
          els.map((e) => { const b = e.getBoundingClientRect(); return { id: e.getAttribute("data-testid") ?? e.tagName.toLowerCase(), w: Math.round(b.width), h: Math.round(b.height) }; }));
        const small = targets.filter((t) => t.w < 40 || t.h < 40);
        testInfo.annotations.push({ type: "tap-targets", description: `${targets.length} checked; offenders: ${small.length ? JSON.stringify(small) : "none"}` });
        if (small.length) console.warn(`[a38] toolbar tap-target offenders (<40×40) on ${r.path}: ${JSON.stringify(small)}`);
        fs.writeFileSync(path.join(OUT, `${LABEL}-${r.route}-metrics.json`), JSON.stringify({ widths, rows: rows.length, maxRow: Math.max(...rows.map((x) => x.h)), targets }, null, 2));
      } else {
        // Detail: header visible, cards single column at this width.
        await expect(page.locator("header h1").first()).toBeVisible();
        const cols = await page.locator("[data-accent-source] > div.grid").first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
        expect(cols, "detail cards single column").toBe(1);
        fs.writeFileSync(path.join(OUT, `${LABEL}-${r.route}-metrics.json`), JSON.stringify({ widths, cols }, null, 2));
      }

      await page.screenshot({ path: path.join(OUT, `${LABEL}-${r.route}.png`), fullPage: false });
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${r.route}-full.png`), fullPage: true });
    });
  }
});
