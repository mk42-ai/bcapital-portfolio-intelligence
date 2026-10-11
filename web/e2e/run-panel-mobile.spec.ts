import { test, expect } from "./helpers";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * a11 — run panel at 390×844 (Pixel 7): no horizontal overflow, 64 px step rows, wrapped header/footer.
 * Run with:  BASE_URL=<frontend> node node_modules/@playwright/test/cli.js test e2e/run-panel-mobile.spec.ts --project=mobile --workers=1
 * (config `mobile` project matches /mobile\.spec\.ts/ — this file name ends in `-mobile.spec.ts` on purpose.)
 */
const QUESTION = "In one sentence, what does Fervo Energy do?";
const OUT = path.resolve(__dirname, "../proof/pass-3/mobile");

test.describe("a11 run panel @ 390×844", () => {
  test.skip(({ viewport }) => !viewport || viewport.width > 640, "mobile viewport only");

  test("no horizontal overflow; working rows ≤ 72 px; header/footer wrap", async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.goto("/chat?skip=1");
    const input = page.getByTestId("composer-input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill(QUESTION);
    await input.press("Enter");

    const run = page.getByTestId("run-view").last();
    await expect(run).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "run-390-streaming.png"), fullPage: false });

    const noOverflow = async (label: string) => {
      const m = await page.evaluate(() => {
        const se = document.scrollingElement!;
        const rv = document.querySelector('[data-testid="run-view"]') as HTMLElement | null;
        const rows = [...document.querySelectorAll('[data-testid="working-row"]')].map((r) => Math.round(r.getBoundingClientRect().height));
        const hdr = document.querySelector('[data-testid="run-header"]') as HTMLElement | null;
        const sh = document.querySelector('[data-testid="run-status-header"]') as HTMLElement | null;
        const cm = document.querySelector(".chat-main") as HTMLElement | null;
        return {
          docScroll: se.scrollWidth, inner: window.innerWidth,
          rvScroll: rv?.scrollWidth ?? 0, rvClient: rv?.clientWidth ?? 0,
          rows, headerH: hdr ? Math.round(hdr.getBoundingClientRect().height) : null,
          statusH: sh ? Math.round(sh.getBoundingClientRect().height) : null,
          chatMainH: cm ? Math.round(cm.getBoundingClientRect().height) : null,
        };
      });
      console.log(`[a11 ${label}]`, JSON.stringify(m));
      expect.soft(m.docScroll, `${label}: document scrollWidth`).toBeLessThanOrEqual(m.inner + 1);
      expect.soft(m.rvScroll, `${label}: run-view scrollWidth`).toBeLessThanOrEqual(m.rvClient + 1);
      for (const h of m.rows) expect.soft(h, `${label}: working-row height`).toBeLessThanOrEqual(72);
      if (m.headerH != null) expect.soft(m.headerH, `${label}: run-header ≤ 2 lines`).toBeLessThanOrEqual(44);
      // OD-style run panel (2026-10-11): run-status-header is a screen-reader-only live region (1px), progress shows in the step rows.
      if (m.statusH != null) expect.soft(m.statusH, `${label}: run-status-header is visually hidden`).toBeLessThanOrEqual(1);
      return m;
    };
    await noOverflow("streaming");

    // settled: answer block rendered (≤150 s)
    await expect(run.getByTestId("answer-block")).toBeVisible({ timeout: 150_000 });
    await expect.poll(async () => run.getAttribute("data-live"), { timeout: 150_000 }).toBe("false");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "run-390-settled.png"), fullPage: false });
    const settled = await noOverflow("settled");
    expect(settled.rvClient).toBeGreaterThan(0);

    // composer pinned: its row sits within the viewport
    const comp = await page.getByTestId("composer-row").boundingBox();
    expect(comp, "composer visible").not.toBeNull();
    expect(comp!.y + comp!.height).toBeLessThanOrEqual(844 + 1);

    // footer caption (if rendered) must not overflow its container
    const footer = page.getByTestId("run-footer").last();
    if (await footer.count()) {
      const f = await footer.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect.soft(f.sw, "run-footer no overflow").toBeLessThanOrEqual(f.cw + 1);
    }
  });
});
