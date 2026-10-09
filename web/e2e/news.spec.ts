import { test, expect } from "./helpers";

test.describe("News Pulse", () => {
  test("renders cards with external source links", async ({ page }) => {
    await page.goto("/news");
    await expect(page.getByRole("heading", { level: 1, name: "News Pulse" })).toBeVisible();
    const links = page.locator('main a[href^="http"]');
    await expect.poll(async () => links.count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const first = links.first();
    await expect(first).toHaveAttribute("href", /^https?:\/\//);
    // external links must not leak the opener
    const rel = (await first.getAttribute("rel")) ?? "";
    const target = (await first.getAttribute("target")) ?? "";
    if (target === "_blank") expect(rel).toMatch(/noopener|noreferrer/);
  });
});
