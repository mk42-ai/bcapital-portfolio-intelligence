import { test, expect, primeSettings } from "./helpers";

test.describe("Onboarding", () => {
  test("renders the company picker with a live count", async ({ page }) => {
    // Fresh user: onboarding not yet done, so /onboarding is the landing experience.
    await primeSettings(page, { onboarded: false, companies: [] });
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const count = page.locator('[data-testid="company-picker-count"]');
    await expect(count).toBeVisible();
    await expect(count).toHaveText(/\d+/);
  });

  test("backend status badge shows live data", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator('[data-testid="backend-status"][data-live="1"]')).toBeVisible({ timeout: 30_000 });
  });
});
