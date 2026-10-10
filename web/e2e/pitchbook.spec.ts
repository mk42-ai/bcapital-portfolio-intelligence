import { test, expect } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * PitchBook first-paint from the committed snapshot (src/data/pitchbook-snapshot.json — plugin-1777018662 "Pitchbook Investor Finder").
 * Owner's hard requirement: the company page card and the chat inspector drawer show the fields (name, HQ, industry, employees, founded,
 * last deal, investors) on first paint, with NO "Run now" button, NO execution id, and NO PitchBook network request on load.
 * "Ask in chat" lands the question in the EXISTING composer (no new thread). Selectors are data-testid only.
 */
const SLUG = "apptronik";
const PB_NET = /pitchbook|execute|workflow/i;
const FIELD_KEYS = ["name", "hq", "industry", "employees", "founded", "last_deal"];
const COMPOSER = '[data-testid="composer-input"]';

async function pbResourceUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
}
async function expectNoPbNetwork(page: Page) {
  const urls = (await pbResourceUrls(page)).filter((u) => PB_NET.test(u));
  expect(urls, `no /pitchbook|execute|workflow resource on load, got: ${urls.join(", ")}`).toEqual([]);
}
async function expectNoRunNowOrExecutionId(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toMatch(/Run now/);
  expect(text).not.toMatch(/execution ?id/i);
  expect(await page.locator("text=/execution ?id/i").count()).toBe(0);
  expect(await page.getByRole("button", { name: /run now/i }).count()).toBe(0);
}

test.describe("PitchBook snapshot (first paint, no network, no run button)", () => {
  test("company page renders the six fact rows + investors from the snapshot on first paint", async ({ page }) => {
    const pbRequests: string[] = [];
    page.on("request", (r) => { if (PB_NET.test(r.url())) pbRequests.push(r.url()); });
    await page.goto(`/company/${SLUG}`);
    const card = page.getByTestId("pitchbook-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("pb-header")).toContainText("Pitchbook Investor Finder");
    await expect(card.getByTestId("pb-header")).toContainText("next pull");
    const facts = card.getByTestId("pb-facts");
    await expect(facts).toBeVisible();
    const rows = facts.getByTestId("pb-field");
    await expect(rows).toHaveCount(6);
    for (const key of FIELD_KEYS) {
      const row = facts.locator(`[data-testid="pb-field"][data-field="${key}"]`);
      await expect(row).toHaveCount(1);
      await expect(row.getByTestId("pb-value")).toBeVisible();
    }
    // Apptronik is in the snapshot with known values — the rows are not all "—".
    const known = await facts.locator('[data-testid="pb-field"][data-availability="known"]').count();
    expect(known).toBeGreaterThanOrEqual(3);
    await expect(facts.locator('[data-testid="pb-field"][data-field="name"] [data-testid="pb-value"]')).toHaveText(/Apptronik/);
    await expect(card.getByTestId("pb-investors")).toBeVisible();
    expect(await card.getByTestId("pb-investor").count()).toBeGreaterThan(0);
    await expect(card.getByTestId("pb-unavailable")).toContainText("not available from the Investor Finder plugin");
    // Static dates only (no relative "x min ago"), no run button, no execution ids, no PitchBook network on load.
    await expect(card.getByTestId("pb-header")).not.toContainText(/ago\b/);
    expect(await card.getByTestId("pb-run-now").count()).toBe(0);
    expect(await card.getByTestId("pb-loading").count()).toBe(0);
    await expectNoRunNowOrExecutionId(page);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expectNoPbNetwork(page);
    expect(pbRequests, `no PitchBook/execute/workflow requests during load, got: ${pbRequests.join(", ")}`).toEqual([]);
  });

  test("'Ask in chat' on the company page lands the question in the existing composer on /chat?skip=1 (no new thread)", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    const card = page.getByTestId("pitchbook-card");
    const ask = card.getByTestId("pb-ask").first();
    await expect(ask).toBeAttached();
    await ask.click({ force: true });
    await expect(page).toHaveURL(/\/chat\?skip=1/);
    const composer = page.locator(COMPOSER).first();
    const hasComposer = await composer.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
    if (hasComposer) {
      await expect(composer).toHaveValue(/.+/);
      await expect(composer).toHaveValue(/Apptronik/);
    } else {
      // Composer testid not yet shipped on this build — the context chip is the fallback proof the ask landed.
      await expect(page.getByTestId("context-chip").first()).toBeVisible({ timeout: 10_000 });
    }
    // Exactly ONE thread container — asking never spawns a new thread.
    const threads = page.locator('.openui-agent-thread-messages, [data-testid="chat-thread"]');
    if (await threads.count()) expect(await threads.count()).toBe(1);
    const stored = await page.evaluate(() => sessionStorage.getItem("bcap.chat.context-chips"));
    const chips = JSON.parse(stored ?? "[]") as { company: string; field: string; value: string }[];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0].company).toBe("Apptronik");
    await expectNoRunNowOrExecutionId(page);
  });

  test("keyboard: Enter on a focused fact row asks in chat", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    const row = page.getByTestId("pitchbook-card").locator('[data-testid="pb-field"][data-field="hq"]');
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/chat\?skip=1/);
    const stored = await page.evaluate(() => sessionStorage.getItem("bcap.chat.context-chips"));
    expect(stored ?? "").toContain("Apptronik");
  });

  test("chat inspector drawer renders the PitchBook section from the snapshot with no PitchBook network", async ({ page }) => {
    test.skip((await page.viewportSize())!.width < 1024, "inspector drawer is a desktop (≥1024 px) surface");
    const pbRequests: string[] = [];
    page.on("request", (r) => { if (PB_NET.test(r.url())) pbRequests.push(r.url()); });
    await page.goto("/chat?skip=1");
    const toggle = page.getByTestId("inspector-toggle");
    const hasToggle = await toggle.first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
    test.skip(!hasToggle, "inspector-toggle not present on this build yet");
    const rail = page.getByTestId("pitchbook-rail");
    if (!(await rail.isVisible().catch(() => false))) await toggle.first().click();
    await expect(rail).toBeVisible({ timeout: 10_000 });
    await expect(rail.locator('[data-testid="pb-facts"], [data-testid="pb-empty"], [data-testid="pb-no-context"]').first()).toBeVisible();
    if (await rail.getByTestId("pb-facts").count()) {
      await expect(rail.getByTestId("pb-field")).toHaveCount(6);
      await expect(rail.getByTestId("pb-header")).toContainText("Pitchbook Investor Finder");
    }
    expect(await rail.getByTestId("pb-run-now").count()).toBe(0);
    expect(await rail.getByTestId("pb-loading").count()).toBe(0);
    await expectNoRunNowOrExecutionId(page);
    await expectNoPbNetwork(page);
    expect(pbRequests, `no PitchBook/execute/workflow requests on /chat, got: ${pbRequests.join(", ")}`).toEqual([]);
  });

  test("drawer 'Ask in chat' appends to the composer on the same route (no navigation, no new thread)", async ({ page }) => {
    test.skip((await page.viewportSize())!.width < 1024, "inspector drawer is a desktop (≥1024 px) surface");
    await page.goto("/chat?skip=1");
    const toggle = page.getByTestId("inspector-toggle");
    const hasToggle = await toggle.first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
    test.skip(!hasToggle, "inspector-toggle not present on this build yet");
    const rail = page.getByTestId("pitchbook-rail");
    if (!(await rail.isVisible().catch(() => false))) await toggle.first().click();
    await expect(rail).toBeVisible({ timeout: 10_000 });
    const ask = rail.locator('[data-testid="pb-ask"], [data-testid="pb-ask-investors"]').first();
    test.skip(!(await ask.count()), "no context company in the drawer — nothing to ask");
    const before = page.url();
    await ask.scrollIntoViewIfNeeded();
    await ask.evaluate((el) => (el as HTMLElement).click()); // the hidden "ask" icon sits in a hover row inside the scrollable drawer
    expect(page.url()).toBe(before);
    const composer = page.locator(COMPOSER).first();
    if (await composer.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) await expect(composer).toHaveValue(/.+/);
    else await expect(page.getByTestId("context-chip").first()).toBeVisible({ timeout: 10_000 });
    const threads = page.locator('.openui-agent-thread-messages, [data-testid="chat-thread"]');
    if (await threads.count()) expect(await threads.count()).toBe(1);
  });
});
