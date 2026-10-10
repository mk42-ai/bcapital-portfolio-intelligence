import { test, expect } from "./helpers";

/**
 * PitchBook ask-in-chat (Agent 26): clicking a per-field "Ask in chat" chip on the company page injects company + field + value into the
 * EXISTING composer (ui-store draft) and the context-chips store, then lands on /chat?skip=1 — never a new thread. The header carries the
 * synced stamp (pb-synced) and the "Run now" button is gone (manual refresh lives in Settings). Soft-skips when the backend has no record.
 */
const SLUG = "1au";
const COMPOSER = '[data-testid="chat-shell"] textarea';

test.describe("PitchBook ask-in-chat", () => {
  test("pb-ask → /chat?skip=1 with draft + context chip; no Run now; synced stamp visible", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    const card = page.getByTestId("pitchbook-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("pb-loading")).toHaveCount(0, { timeout: 20_000 });
    await expect(card.getByTestId("pb-run-now")).toHaveCount(0);
    const ask = card.getByTestId("pb-ask").first();
    test.skip(!(await ask.count()), "no PitchBook record on this preview — nothing to ask about");
    await expect(card.getByTestId("pb-synced")).toBeVisible();
    await expect(card.getByTestId("pb-synced")).toContainText(/PitchBook · synced .+ · weekly/);
    const company = (await card.getByTestId("pb-view").getAttribute("data-company")) ?? "1AU";
    await ask.click();
    await expect(page).toHaveURL(/\/chat\?skip=1/);
    await expect(page.getByTestId("chat-shell")).toBeVisible();
    const composer = page.locator(COMPOSER).first();
    await expect(composer).toBeVisible();
    await expect.poll(async () => (await composer.inputValue()).toLowerCase(), { timeout: 10_000 }).toMatch(new RegExp(`(1au|${company.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`));
    await expect.poll(() => page.getByTestId("context-chip").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("context-chips")).toBeVisible();
  });
});
