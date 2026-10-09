import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { primeSettings, captureErrors } from "./helpers";
test.beforeEach(async ({ page }, info) => { const flush = captureErrors(page, info); (page as unknown as { __flush?: () => void }).__flush = flush; });
test.afterEach(async ({ page }) => { (page as unknown as { __flush?: () => void }).__flush?.(); });
test.describe("Portfolio Overview", () => {
  test.beforeEach(async ({ page }) => primeSettings(page));
  test("renders KPI tiles, treemap, heatmap, gauges and 136-record table", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
    await expect(page.getByText("136 spec records")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Showing all 136 companies/ })).toBeVisible();
    await expect(page.getByRole("group", { name: /Treemap of 136 portfolio companies grouped by sector/ })).toBeVisible();
    await expect(page.getByRole("group", { name: /^Treemap/ }).locator('a[href="/company/fervo-energy"]')).toBeVisible();
    await page.getByRole("radio", { name: "By region" }).click(); await expect(page.getByRole("group", { name: /grouped by region/ })).toBeVisible();
    await expect(page.getByRole("table", { name: /KPI heatmap: rows are companies/ })).toBeVisible();
    await expect(page.getByRole("table", { name: /KPI heatmap/ }).locator("tbody tr")).toHaveCount(24);
    for (const s of ["Technology", "Healthcare", "Energy & Resilience"]) await expect(page.getByRole("img", { name: new RegExp(`^${s.replace("&", "&")}: sentiment`) })).toBeVisible();
    await expect(page.getByText("IPO Nasdaq: FRVO")).toBeVisible();
    await expect(page.getByText("Capital Rx → Judi Rx")).toBeVisible();
    await expect(page.getByText("Synack merged into NetSPI")).toBeVisible();
    await page.getByRole("button", { name: "Show all 136" }).click(); const rows = page.getByRole("table", { name: /Portfolio companies with sentiment/ }).locator("tbody tr"); await expect(rows).toHaveCount(136);
    // estimate badge tooltip exposes confidence + rationale
    const badge = page.getByRole("button", { name: /^estimate · (medium|low|high) — ESTIMATE/ }).first(); await badge.scrollIntoViewIfNeeded(); await badge.focus();
    await expect(page.getByText(/estimate_confidence:/).first()).toBeVisible({ timeout: 10_000 });
  });
  test("filters by sector via URL and saved filters persist", async ({ page }) => {
    await page.goto("/overview?sector=Energy%20%26%20Resilience");
    await expect(page.getByRole("status").filter({ hasText: /Showing 11 of 136 companies/ })).toBeVisible();
    await page.getByLabel("Sector", { exact: true }).selectOption("Healthcare");
    await expect(page.getByRole("status").filter({ hasText: /Showing 38 of 136 companies/ })).toBeVisible();
  });
  test("axe: no serious/critical violations", async ({ page }) => {
    await page.goto("/overview"); await page.getByRole("group", { name: /^Treemap of/ }).waitFor({ timeout: 30_000 });

    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    test.info().annotations.push({ type: "axe", description: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))) });
    expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1)).toEqual([]);
  });
});
