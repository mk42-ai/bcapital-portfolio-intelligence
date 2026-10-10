import { test, expect } from "./helpers";

// Agent 7 — empty-thread new-chat canvas. Fresh storage (helpers prime settings only, no threads).
test.describe("Chat welcome (empty thread)", () => {
  test("shows the new-chat canvas, 3 starters, centred in the thread column", async ({ page }) => {
    await page.goto("/chat");
    const welcome = page.getByTestId("chat-welcome");
    await expect(welcome).toBeVisible({ timeout: 30_000 });

    // Illustration: local asset, actually decoded.
    const img = welcome.locator('img[src^="/assets/new-chat"]');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    const w = await img.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(w)).toBe(160);

    // Title + three starter buttons; no recent-threads block (threads live in the nav rail).
    await expect(welcome.getByRole("heading", { name: "Ask the portfolio" })).toBeVisible();
    await expect(welcome.getByTestId("welcome-starters").locator("button")).toHaveCount(3);
    await expect(welcome.getByTestId("welcome-recent")).toHaveCount(0);

    // Vertically centred within the viewport (desktop project is 1440×900).
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 1024, "desktop-only geometry check");
    const box = await welcome.boundingBox();
    expect(box, "welcome bounding box").not.toBeNull();
    const centreY = box!.y + box!.height / 2;
    expect(Math.abs(centreY - vp!.height / 2), `welcome centreY=${centreY.toFixed(0)} vs viewport centre ${vp!.height / 2}`).toBeLessThan(160);
    expect(box!.width).toBeLessThanOrEqual(641);
  });
});
