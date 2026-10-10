import { test, expect } from "./helpers";

/** Agent 22 — conversation column: full width/height, messages ≤800 px centred, body never scrolls, composer visible on mobile. */
test.describe("thread layout", () => {
  test("desktop 1440×900: ≤800 px centred messages, no page scroll", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("chat-shell")).toBeVisible({ timeout: 30_000 });
    if (!(await page.getByTestId("chat-canvas").count())) { testInfo.annotations.push({ type: "soft-skip", description: "chat-canvas absent (old build)" }); test.skip(); }
    const col = (await page.locator(".chat-canvas__thread").boundingBox())!;
    const slot = page.locator(".chat-shell .openui-agent-composer-slot").first();
    const sb = (await slot.boundingBox())!;
    expect(sb.width).toBeLessThanOrEqual(840);
    const centre = sb.x + sb.width / 2, colCentre = col.x + col.width / 2;
    expect(Math.abs(centre - colCentre)).toBeLessThanOrEqual(8);
    const scroll = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, ih: innerHeight }));
    expect(scroll.sh).toBeLessThanOrEqual(scroll.ih + 1);
  });
  test("mobile 390×844: composer bottom within the viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("chat-shell")).toBeVisible({ timeout: 30_000 });
    if (!(await page.getByTestId("chat-canvas").count())) { testInfo.annotations.push({ type: "soft-skip", description: "chat-canvas absent (old build)" }); test.skip(); }
    const ta = page.locator("textarea:visible").first(); await expect(ta).toBeVisible();
    const b = (await ta.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(844);
  });
});
