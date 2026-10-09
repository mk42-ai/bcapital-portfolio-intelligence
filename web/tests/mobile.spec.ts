import { test, expect } from "@playwright/test";
import { primeSettings, captureErrors } from "./helpers";
test.beforeEach(async ({ page }, info) => { const flush = captureErrors(page, info); (page as unknown as { __flush?: () => void }).__flush = flush; });
test.afterEach(async ({ page }) => { (page as unknown as { __flush?: () => void }).__flush?.(); });
test("mobile: every screen renders without horizontal overflow and nav works", async ({ page }) => {
  await primeSettings(page);
  for (const p of ["/overview", "/company/perplexity-ai", "/news", "/chat", "/settings"]) {
    await page.goto(p); await expect(page.locator("h1").first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(over, `${p} horizontal overflow`).toBeLessThanOrEqual(2);
  }
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "News Pulse" }).click(); await expect(page).toHaveURL(/\/news/);
});
