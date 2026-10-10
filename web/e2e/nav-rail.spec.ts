import { test, expect } from "./helpers";

/** Global nav rail: ≤224 px expanded, 64 px collapsed (persisted), nested thread list under Chat, no OpenUI sidebar column. */
test.describe("Navigation rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  const width = async (page: import("@playwright/test").Page) => (await page.getByTestId("nav-rail").boundingBox())?.width ?? -1;

  test("expanded ≤224 px; toggle → 64 px; persists across reload; expanded again shows threads under Chat", async ({ page }) => {
    await page.goto("/overview");
    const rail = page.getByTestId("nav-rail");
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute("data-collapsed", "false");
    expect(await width(page)).toBeLessThanOrEqual(224);
    // Nested thread list sits under the Chat item (expanded state).
    const threads = page.getByTestId("nav-threads");
    await expect(threads).toBeVisible();
    const chatBox = await page.getByTestId("nav-item-chat").boundingBox();
    const threadsBox = await threads.boundingBox();
    expect(threadsBox!.y).toBeGreaterThan(chatBox!.y);
    const settingsBox = await page.getByTestId("nav-item-settings").boundingBox();
    expect(threadsBox!.y).toBeLessThan(settingsBox!.y);
    await expect(page.getByTestId("nav-new-chat")).toBeVisible();

    const toggle = page.getByTestId("nav-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => width(page)).toBeGreaterThanOrEqual(63);
    expect(await width(page)).toBeLessThanOrEqual(65);
    await expect(threads).toHaveCount(0);
    // Icons keep a tooltip (title) when collapsed.
    await expect(page.getByTestId("nav-item-overview")).toHaveAttribute("title", "Overview");

    await page.reload();
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect.poll(() => width(page)).toBeGreaterThanOrEqual(63);
    expect(await width(page)).toBeLessThanOrEqual(65);
    expect(await page.evaluate(() => localStorage.getItem("bcap.nav.rail"))).toBe("collapsed");

    await page.getByTestId("nav-toggle").click();
    await expect(rail).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("nav-threads")).toBeVisible();
    expect(await width(page)).toBeLessThanOrEqual(224);
  });

  test("active item uses aria-current and the brand soft tint", async ({ page }) => {
    await page.goto("/companies");
    const item = page.getByTestId("nav-item-companies");
    await expect(item).toHaveAttribute("aria-current", "page");
    const bg = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg.replace(/\s/g, "")).toBe("rgb(230,250,243)");
    await expect(page.getByTestId("nav-item-overview")).not.toHaveAttribute("aria-current", "page");
  });

  test("/chat: New chat keeps URL /chat and shows the welcome; no OpenUI sidebar; no 'Portfolio analyst' text", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("nav-rail")).toBeVisible();
    const newChat = page.getByTestId("nav-new-chat");
    await expect(newChat).toBeVisible();
    await expect(newChat).toBeEnabled();
    await newChat.click();
    await expect(page).toHaveURL(/\/chat(\?.*)?$/);
    await expect(page.getByTestId("chat-welcome")).toBeVisible();
    // OpenUI's own thread column is deleted.
    const side = page.locator(".openui-agent-sidebar-container");
    if ((await side.count()) > 0) await expect(side.first()).toBeHidden();
    await expect(page.locator("body")).not.toContainText("Portfolio analyst", { useInnerText: true });
  });

  test("no 'Portfolio analyst' on other screens", async ({ page }) => {
    for (const p of ["/overview", "/settings"]) {
      await page.goto(p);
      await expect(page.getByTestId("nav-rail")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Portfolio analyst", { useInnerText: true });
    }
  });

  test("mobile (<1024): top bar with icons only, threads hidden, New chat icon present", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    const rail = page.getByTestId("nav-rail");
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeLessThan(120);
    await expect(page.getByTestId("nav-threads")).toBeHidden();
    await expect(page.getByTestId("nav-toggle")).toBeHidden();
    await expect(page.getByTestId("nav-new-chat-mobile")).toBeVisible();
    await expect(page.getByTestId("nav-item-chat").locator(".nav-rail__label")).toBeHidden();
  });
});
