import { test, expect } from "./helpers";

test.describe("Portfolio Overview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
  });

  test("live badge, treemap tiles and paginated table render", async ({ page }) => {
    await expect(page.locator('[data-testid="backend-status"][data-live="1"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="table-status"]')).toHaveText(/Showing 25 of 136 rows/);
    const tiles = page.locator("svg a");
    await expect.poll(async () => tiles.count(), { timeout: 30_000 }).toBeGreaterThan(20);
    await expect(page.locator('svg a[href="/company/fervo-energy"]').first()).toBeAttached();
    await expect(page.locator('a[href^="/company/"]').first()).toBeVisible();
  });

  test("search filters rows and show-all expands to 136", async ({ page }) => {
    const status = page.locator('[data-testid="table-status"]');
    await expect(status).toHaveText(/Showing 25 of 136 rows/);
    await page.locator('[data-testid="table-search"]').fill("fervo");
    await expect(status).toHaveText(/Showing 1 of 1 rows/);
    await expect(page.locator('table a[href="/company/fervo-energy"]').first()).toBeVisible();
    await page.locator('[data-testid="table-search"]').fill("");
    await expect(status).toHaveText(/Showing 25 of 136 rows/);
    await page.locator('[data-testid="table-show-all"]').click();
    await expect(status).toHaveText(/Showing 136 of 136 rows/);
    await expect(page.locator('[data-testid="company-table"] tbody tr')).toHaveCount(136);
  });

  test("sort by score toggles row order", async ({ page }) => {
    const sort = page.locator('[data-testid="sort-score"]');
    await expect(sort).toBeVisible();
    const firstBefore = await page.locator('[data-testid="company-table"] tbody tr').first().innerText();
    await sort.click();
    await expect.poll(async () => page.locator('[data-testid="company-table"] tbody tr').first().innerText()).not.toBe(firstBefore);
    await sort.click();
    await expect.poll(async () => page.locator('[data-testid="company-table"] tbody tr').first().innerText()).not.toBe("");
  });

  test("row links navigate to the company page", async ({ page }) => {
    await page.locator('table a[href="/company/fervo-energy"]').first().scrollIntoViewIfNeeded();
    await page.locator('table a[href="/company/fervo-energy"]').first().click();
    await expect(page).toHaveURL(/\/company\/fervo-energy/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fervo/);
  });
});
