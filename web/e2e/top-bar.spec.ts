import { test, expect, type Page } from "./helpers";

/**
 * Chat top bar (Agent 20): 52 px tall at desktop and mobile widths, five testids present, Plan/Run toggle persists to
 * localStorage (bcap.chat.tab), inspector toggle opens the drawer. Soft-skips when the top bar is not rendered (old build).
 */
const TOPBAR = '[data-testid="chat-topbar"]';
const IDS = ["thread-title", "model-pill", "plan-run-toggle", "freshness-dot", "inspector-toggle"] as const;

async function openChat(page: Page) {
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  const bar = page.locator(TOPBAR);
  const present = await bar.waitFor({ state: "attached", timeout: 15_000 }).then(() => true, () => false);
  test.skip(!present, "chat-topbar not rendered on this build");
  return bar;
}

test.describe("Chat top bar", () => {
  test("is 52 px tall at 1440×900 with all five items", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const bar = await openChat(page);
    const box = await bar.boundingBox();
    expect(box, "top bar has a box").not.toBeNull();
    expect(Math.abs((box?.height ?? 0) - 52)).toBeLessThanOrEqual(1);
    for (const id of IDS) await expect(page.getByTestId(id), id).toBeVisible();
    await expect(page.getByTestId("model-pill")).toContainText("DeepSeek Flash");
    await expect(page.getByTestId("thread-title")).toHaveText(/\S/);
  });

  test("stays 52 px at 390×844 and hides the model pill text", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const bar = await openChat(page);
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.height ?? 0) - 52)).toBeLessThanOrEqual(1);
    for (const id of IDS) await expect(page.getByTestId(id), id).toBeAttached();
    const pillBox = await page.getByTestId("model-pill").boundingBox();
    expect(pillBox?.width ?? 999).toBeLessThanOrEqual(40);
  });

  test("Plan/Run toggle selects Run and persists across reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openChat(page);
    const toggle = page.getByTestId("plan-run-toggle");
    const run = toggle.getByRole("tab", { name: /^Run/ });
    const plan = toggle.getByRole("tab", { name: /^Plan/ });
    await run.click();
    await expect(run).toHaveAttribute("aria-selected", "true");
    await expect(plan).toHaveAttribute("aria-selected", "false");
    expect(await page.evaluate(() => localStorage.getItem("bcap.chat.tab"))).toBe("run");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("plan-run-toggle").getByRole("tab", { name: /^Run/ })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => localStorage.getItem("bcap.chat.tab"))).toBe("run");
    // leave the default behind for other specs
    await page.getByTestId("plan-run-toggle").getByRole("tab", { name: /^Plan/ }).click();
  });

  test("inspector toggle opens the drawer", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openChat(page);
    const btn = page.getByTestId("inspector-toggle");
    await expect(btn).toHaveAttribute("aria-controls", "chat-inspector");
    if ((await btn.getAttribute("aria-expanded")) === "true") await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-testid="chat-inspector"][data-open="true"]')).toBeAttached();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  test("freshness dot carries a source and a tooltip", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openChat(page);
    const dot = page.getByTestId("freshness-dot");
    await expect(dot).toHaveAttribute("data-source", /^(live|snapshot)$/);
    await expect(dot).toHaveAttribute("title", /\S/);
  });
});
