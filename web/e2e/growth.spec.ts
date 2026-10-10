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

  test("renders an 'Example behaviour' line per value and a letter tile", async ({ page }) => {
    await expect(page.locator('[data-testid="growth-tile"]')).toHaveCount(6);
    await expect(page.locator('[data-testid="growth-example"]')).toHaveCount(6);
    await page.locator(VALUE).first().click();
    await expect(page.locator('#growth-panel-generosity [data-testid="growth-example"]')).toContainText("opens their network before a term sheet");
  });

  test("reveals G-R-O-W-T-H on viewport entry (data-revealed, staggered --i)", async ({ page }) => {
    const grid = page.locator('[data-testid="growth-grid"]');
    await expect(grid).toHaveAttribute("data-brand", "green");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveAttribute("data-revealed", "true");
    // Every item ends fully visible with its own stagger index.
    const items = grid.locator("li.growth-item");
    await expect(items).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(items.nth(i)).toHaveCSS("opacity", "1");
      expect(await items.nth(i).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--i"))).toBe(String(i));
    }
  });

  test("hovered tile is brand green (rgb(10, 201, 133)) and no old blue remains in hover/expanded states", async ({ page }) => {
    const BLUE = "rgb(29, 78, 216)";
    const GREEN = "rgb(10, 201, 133)";
    const first = page.locator(VALUE).first();
    const tile = first.locator('[data-testid="growth-tile"]');
    await page.locator('[data-testid="growth-grid"]').scrollIntoViewIfNeeded();
    // Hover state.
    await first.hover();
    await expect(tile).toHaveCSS("background-color", GREEN);
    await expect(tile).toHaveCSS("color", "rgb(255, 255, 255)");
    // Expanded state (keep hovering off to prove the open state alone drives the green).
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await page.mouse.move(0, 0);
    await expect(tile).toHaveCSS("background-color", GREEN);
    // Keyboard focus-visible state → green outline on the button.
    await first.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    const outline = await first.evaluate((el) => getComputedStyle(el).outlineColor);
    expect(outline).not.toBe(BLUE);
    // Sweep every element in the grid (expanded + hovered) for the old blue.
    await first.hover();
    const offenders = await page.locator('[data-testid="growth-grid"]').evaluate((root, blue) => {
      const bad: string[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.backgroundColor === blue || cs.outlineColor === blue || cs.borderColor === blue || cs.color === blue) {
          bad.push(`${el.tagName.toLowerCase()}.${el.className}`);
        }
      });
      return bad;
    }, BLUE);
    expect(offenders).toEqual([]);
  });

  test("390px viewport: single column, no horizontal overflow, long names wrap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const grid = page.locator('[data-testid="growth-grid"]');
    await expect(grid).toBeVisible();
    const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
    expect(cols).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const gridRight = await grid.evaluate((el) => el.getBoundingClientRect().right);
    expect(gridRight).toBeLessThanOrEqual(390);
  });

  test("still toggles under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    // Items are visible without any reveal stagger or transform under reduced motion.
    const items = page.locator('[data-testid="growth-grid"] li.growth-item');
    await expect(items.first()).toHaveCSS("opacity", "1");
    await expect(items.last()).toHaveCSS("opacity", "1");
    expect(await items.last().evaluate((el) => getComputedStyle(el).transitionDelay)).toBe("0s");
    const first = page.locator(VALUE).first();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#growth-panel-generosity")).toBeVisible();
    await expect(page.locator("#growth-panel-generosity")).toContainText("founders' wins compound");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });
});
