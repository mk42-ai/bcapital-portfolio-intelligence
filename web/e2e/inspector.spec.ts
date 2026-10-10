import { test, expect } from "./helpers";

/**
 * Inspector slide-over drawer (Agent 24): ≤360 px, toggled from the top bar, closed by default, Escape closes, exactly ONE developer
 * reveal (<details data-testid="dev-disclosure">). Soft-skips when the toggle is absent (older build). Selectors are data-testid only.
 */
const DRAWER = "chat-inspector";
const TOGGLE = "inspector-toggle";

async function ensureFresh(page: import("@playwright/test").Page) {
  // First visit: no persisted inspector state → closed by default on desktop and mobile.
  await page.addInitScript(() => { try { localStorage.removeItem("bcap.chat.inspector"); } catch { /* private mode */ } });
}

test.describe("Inspector drawer", () => {
  test("desktop 1440×900: closed by default, ≤360 px wide, opens via toggle, Escape closes and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureFresh(page);
    await page.goto("/chat?skip=1");
    const toggle = page.getByTestId(TOGGLE);
    test.skip(!(await toggle.count()), "inspector-toggle absent on this build");
    const drawer = page.getByTestId(DRAWER);
    await expect(drawer).toHaveAttribute("data-open", "false");

    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(360);
    // Slides over the thread from the right edge of the canvas.
    const canvas = await page.getByTestId("chat-canvas").boundingBox();
    expect(Math.abs(box!.x + box!.width - (canvas!.x + canvas!.width))).toBeLessThanOrEqual(2);
    // Focus moved into the drawer.
    await expect.poll(async () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="chat-inspector"]'))).toBe(true);
    // Exactly one developer reveal; nothing dev-ish (request body) visible until it is opened.
    await expect(drawer.locator('[data-testid="dev-disclosure"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="dev-disclosure"]')).toHaveCount(1);
    await expect(drawer.getByTestId("request-body")).toBeHidden();
    await expect(drawer.getByTestId("rail-metrics")).toBeHidden();
    // The plan steps are never rendered a second time inside the drawer.
    await expect(drawer.locator('[data-testid="plan-step"], [data-testid="rail-plan-step"]')).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect.poll(async () => page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(TOGGLE);
    // Reopen via the toggle again and close with the drawer's own close button.
    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await page.getByTestId("inspector-close").click();
    await expect(drawer).toHaveAttribute("data-open", "false");
  });

  test("the only developer disclosure opens and holds the ids + metrics inside it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureFresh(page);
    await page.goto("/chat?skip=1");
    const toggle = page.getByTestId(TOGGLE);
    test.skip(!(await toggle.count()), "inspector-toggle absent on this build");
    await toggle.click();
    const drawer = page.getByTestId(DRAWER);
    await expect(drawer).toHaveAttribute("data-open", "true");
    const dev = drawer.getByTestId("dev-disclosure");
    await expect(dev).toHaveCount(1);
    await dev.locator("summary").click();
    await expect(dev.getByTestId("dev-ids")).toBeVisible();
    await expect(dev.getByTestId("rail-metrics")).toBeVisible();
    await expect(dev.getByTestId("dev-ids")).toContainText("plugins");
  });

  test("mobile 390×844: closed by default; when open it covers ≤100 % of the viewport width and is modal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureFresh(page);
    await page.goto("/chat?skip=1");
    const toggle = page.getByTestId(TOGGLE);
    test.skip(!(await toggle.count()), "inspector-toggle absent on this build");
    const drawer = page.getByTestId(DRAWER);
    await expect(drawer).toHaveAttribute("data-open", "false");
    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(drawer.locator('[data-testid="dev-disclosure"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("data-open", "false");
  });
});
