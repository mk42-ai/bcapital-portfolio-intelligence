import { test, expect } from "./helpers";

test.describe("Company page", () => {
  test("renders Fervo Energy with breadcrumb back to overview", async ({ page }) => {
    await page.goto("/company/fervo-energy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fervo/);
    const crumb = page.locator('nav[aria-label="Breadcrumb"] a[href="/overview"]');
    await expect(crumb).toBeVisible();
    await crumb.click();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
  });

  test("unknown slug shows a not-found state", async ({ page }) => {
    await page.goto("/company/unknown-xyz");
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });
});
