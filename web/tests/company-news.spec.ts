import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { primeSettings, captureErrors } from "./helpers";
test.beforeEach(async ({ page }, info) => { const flush = captureErrors(page, info); (page as unknown as { __flush?: () => void }).__flush = flush; });
test.afterEach(async ({ page }) => { (page as unknown as { __flush?: () => void }).__flush?.(); });
const axeCheck = async (page: import("@playwright/test").Page) => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")); test.info().annotations.push({ type: "axe", description: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))) }); expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1)).toEqual([]); };
test.describe("Company detail", () => {
  test.beforeEach(async ({ page }) => primeSettings(page));
  test("Perplexity page shows palette, fonts, evidence tier, timeline and workflow stamp", async ({ page }) => {
    await page.goto("/company/perplexity-ai");
    await expect(page.getByRole("heading", { level: 1, name: "Perplexity AI" })).toBeVisible();
    await expect(page.getByText("evidence · Verified")).toBeVisible();
    await expect(page.getByText("#20808D")).toBeVisible();
    await expect(page.getByText("Perplexity Sans")).toBeVisible();
    await expect(page.getByText(/Last updated by daily workflow/)).toBeVisible();
    await expect(page.getByText(/Last updated by daily workflow/)).toContainText("06:00 UTC daily");
    await expect(page.getByText("B Capital participated · participant").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /^News \(\d+\)/ })).toBeVisible();
    await axeCheck(page);
  });
  test("unknown slug → not-found state", async ({ page }) => { await page.goto("/company/does-not-exist"); await expect(page.getByText("Company not found")).toBeVisible(); });
  test("Judi Rx rebrand is applied", async ({ page }) => { await page.goto("/company/judi-rx"); await expect(page.getByRole("heading", { level: 1, name: "Judi Rx" })).toBeVisible(); await expect(page.getByText("Capital Rx → Judi Rx")).toBeVisible(); });
});
test.describe("News Pulse", () => {
  test.beforeEach(async ({ page }) => primeSettings(page));
  test("feed loads grouped by day and filters by company / sector / source", async ({ page }) => {
    await page.goto("/news");
    await expect(page.getByRole("heading", { level: 1, name: "News Pulse" })).toBeVisible();
    const status = page.getByRole("status").filter({ hasText: /of \d+ items/ }); await expect(status).toBeVisible();
    const total = Number((await status.innerText()).match(/of (\d+) items/)?.[1]); expect(total).toBeGreaterThan(10);
    await expect(page.locator("section[aria-labelledby^='day-']").first()).toBeVisible();
    await page.getByLabel("Company", { exact: true }).selectOption("fervo-energy");
    await expect(status).not.toContainText(`${total} of ${total} items`);
    const n1 = Number((await status.innerText()).match(/^(\d+) of/)?.[1]); expect(n1).toBeGreaterThan(0); expect(n1).toBeLessThan(total);
    await page.getByLabel("Company", { exact: true }).selectOption(""); await page.getByLabel("Sector").selectOption("Healthcare"); await page.getByLabel("Source plugin").selectOption("x");
    await page.getByLabel("Search").fill("zzz-no-such-headline");
    await expect(page.getByText("No news matches these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click(); await expect(status).toContainText(`${total} of ${total} items`);
    await axeCheck(page);
  });
});
test.describe("Settings & onboarding", () => {
  test("onboarding shows tagline + GROWTH values and redirects first-run users", async ({ page }) => {
    await page.goto("/overview"); await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("We empower entrepreneurs to think bigger");
    for (const v of ["Generosity", "Resilience", "Open-mindedness", "Will", "Teamwork", "Humility"]) await expect(page.getByRole("list", { name: "GROWTH values" }).getByText(v, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Skip key for now" }).click(); await expect(page).toHaveURL(/\/overview/);
    await axeCheck(page);
  });
  test("settings persists apikey only in localStorage and lists plugin states", async ({ page }) => {
    await primeSettings(page, { apikey: "" }); await page.goto("/settings");
    await page.getByLabel("OnDemand apikey").fill("test-key-1234567890abcdef");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bcap.settings.v1") || "{}").apikey); expect(stored).toBe("test-key-1234567890abcdef");
    await expect(page.getByText("registration pending")).toBeVisible();
    await expect(page.getByText("configuring — deferred")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Enable PitchBook" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "Enable Portfolio Plugin" })).toBeDisabled();
    await page.getByRole("main").getByRole("button", { name: /Switch to light theme/ }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await axeCheck(page);
  });
});
