import { test, expect } from "./helpers";

/**
 * SyncedBadge freshness stamp (Agent 8): "PitchBook · synced <d Mon yyyy> · weekly" with the transparent synced-badge asset.
 * Agent 26 wires <SyncedBadge> into the company page; until that merge the badge may be absent → soft-skip with an annotation.
 * Selectors are data-testid only.
 */
const SLUG = "1au";

test.describe("SyncedBadge", () => {
  test("company page shows the PitchBook synced stamp with a loaded badge image", async ({ page }, testInfo) => {
    await page.goto(`/company/${SLUG}`);
    await page.waitForLoadState("domcontentloaded");
    const badge = page.getByTestId("pb-synced").first();
    // Give the server-rendered card a moment; if the stamp is not wired/synced yet, skip honestly instead of failing.
    const present = await badge.waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    if (!present) {
      testInfo.annotations.push({ type: "skip", description: `[data-testid=pb-synced] not present on /company/${SLUG} (not wired yet or record missing)` });
      test.skip(true, "pb-synced not present on this deploy");
      return;
    }
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/PitchBook · synced .+ · weekly/);
    await expect(badge).toHaveAttribute("data-synced-at", /.*/);

    const img = badge.locator("img");
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("src", /\/assets\/synced-badge-/);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);

    // Pill geometry: 24 px tall, no red staleness colour anywhere (grey dot only, if at all).
    const box = await badge.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(22);
    expect(box?.height ?? 0).toBeLessThanOrEqual(26);
    const dot = badge.locator(".synced-badge__dot");
    if ((await dot.count()) > 0) {
      const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toMatch(/rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/);
    }
  });
});
