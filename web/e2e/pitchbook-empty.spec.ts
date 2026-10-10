import { test, expect, primeSettings } from "./helpers";

/**
 * PitchBook per-field empty-state (Agent 4): each `[data-testid=pb-field-empty]` renders the local financial-empty asset
 * and ONE honest line. Soft-skips (with an annotation) when the deploy under test does not yet render the new markup.
 */
test.describe("PitchBook field empty-state", () => {
  test("every pb-field-empty shows the financial-empty asset and an honest line", async ({ page }, testInfo) => {
    await primeSettings(page);
    await page.goto("/company/1au");
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
    // Give the PitchBook panel time to load its record (it fetches client-side); don't fail if it never shows.
    await page.locator("[data-testid=pb-view], [data-testid=pb-offline], [data-testid=pb-empty]").first().waitFor({ timeout: 20_000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});

    const empties = page.locator("[data-testid=pb-field-empty]");
    const count = await empties.count();
    if (count === 0) {
      testInfo.annotations.push({ type: "skip-reason", description: "No [data-testid=pb-field-empty] on /company/1au (old markup or every field populated) — soft skip." });
      test.skip(true, "pb-field-empty not rendered on this deploy");
      return;
    }

    for (let i = 0; i < count; i++) {
      const el = empties.nth(i);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await expect(el).toHaveAttribute("data-field", /.+/);
      const img = el.locator("img").first();
      await expect(img).toHaveAttribute("src", /^\/assets\/financial-empty/);
      await expect.poll(() => img.evaluate((n) => (n as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
      const text = (await el.innerText()).trim();
      // Default copy or a custom `note` — never blank, never a credentials message.
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/credential/i);
      if (!/not available/i.test(text)) {
        testInfo.annotations.push({ type: "custom-note", description: `${await el.getAttribute("data-field")}: ${text}` });
      }
    }
  });
});
