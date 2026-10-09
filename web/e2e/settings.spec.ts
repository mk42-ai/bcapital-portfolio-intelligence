import { test, expect, SETTINGS_KEY } from "./helpers";

test.describe("Settings", () => {
  test("shows user, backend and model inputs; PitchBook is deferred", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("#set-user")).toBeVisible();
    await expect(page.locator("#set-user")).toHaveValue("INV-001");
    await expect(page.locator("#set-backend")).toBeVisible();
    const model = page.locator("select#set-model");
    await expect(model).toBeVisible();
    expect(await model.locator("option").count()).toBeGreaterThan(0);
    const pitchbook = page.getByRole("switch", { name: /pitchbook/i });
    await expect(pitchbook).toBeDisabled();
  });

  test("editing the user id persists to localStorage", async ({ page }) => {
    await page.goto("/settings");
    const user = page.locator("#set-user");
    await user.fill("INV-777");
    await user.blur();
    await expect
      .poll(async () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").externalUserId, SETTINGS_KEY))
      .toBe("INV-777");
  });
});
