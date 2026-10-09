import { test, expect, noHorizontalOverflow, SCREENS } from "./helpers";

// Runs only in the "mobile" project (see playwright.config.ts testMatch).
test.describe("Mobile layout (Pixel 7, 390x844)", () => {
  for (const s of SCREENS) {
    test(`${s.name}: no horizontal overflow, nav visible, no page errors`, async ({ page, errors }) => {
      await page.goto(s.path);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page.locator("nav").first()).toBeVisible();
      expect(await noHorizontalOverflow(page), `${s.path} has horizontal overflow`).toBe(true);
      expect(errors, `${s.path} page errors`).toEqual([]);
    });
  }
});
