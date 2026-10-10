import { test, expect, primeSettings } from "./helpers";

const VALUE = '[data-testid="growth-value"]';

test.describe("GROWTH values grid", () => {
  test.beforeEach(async ({ page }) => {
    // Fresh user: onboarding is the landing experience, so the GROWTH grid is on screen.
    await primeSettings(page, { onboarded: false, companies: [] });
    await page.goto("/onboarding?skip=1");
    await expect(page.locator('[data-testid="growth-grid"]')).toBeVisible();
  });

  test("renders six values, all collapsed, with correct ARIA wiring", async ({ page }) => {
    const values = page.locator(VALUE);
    await expect(values).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const btn = values.nth(i);
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      const controls = await btn.getAttribute("aria-controls");
      const id = await btn.getAttribute("id");
      expect(controls).toMatch(/^growth-panel-/);
      await expect(page.locator(`#${controls}`)).toHaveAttribute("aria-labelledby", id ?? "");
      await expect(page.locator(`#${controls}`)).toHaveAttribute("aria-hidden", "true");
    }
    await expect(page.getByRole("list", { name: "GROWTH values" })).toBeVisible();
  });

  test("click expands and reveals the description; click again collapses", async ({ page }) => {
    const first = page.locator(VALUE).first();
    await expect(first).toHaveAttribute("data-value", "generosity");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator("#growth-panel-generosity");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("We give first");
    // Multiple may be open at once.
    const second = page.locator(VALUE).nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "true");
    // Toggle off.
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  test("keyboard: Enter toggles, arrows move focus between values", async ({ page }) => {
    const second = page.locator(VALUE).nth(1);
    await second.focus();
    await expect(second).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#growth-panel-resilience")).toContainText("hard middle");
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-expanded", "false");
    // Space also works (native button).
    await page.keyboard.press("Space");
    await expect(second).toHaveAttribute("aria-expanded", "true");
    // Arrow navigation.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(VALUE).nth(2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(second).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator(VALUE).nth(5)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator(VALUE).nth(0)).toBeFocused();
  });

  test("collapsed panel content is not reachable by Tab (inert)", async ({ page }) => {
    const first = page.locator(VALUE).first();
    await first.focus();
    await page.keyboard.press("Tab");
    // With the panel collapsed, Tab must land on the next value button, not inside the hidden panel.
    await expect(page.locator(VALUE).nth(1)).toBeFocused();
  });

  test("still toggles under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const first = page.locator(VALUE).first();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#growth-panel-generosity")).toBeVisible();
    await expect(page.locator("#growth-panel-generosity")).toContainText("founders' wins compound");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });
});
