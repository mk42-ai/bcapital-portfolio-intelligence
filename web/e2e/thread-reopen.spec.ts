import { test, expect } from "@playwright/test";
import { primeSettings, hasKey } from "./helpers";

/**
 * Thread re-open after a hard reload (turn3/stream, Lane D gap):
 *   send one short message → page.reload() → the previous thread is listed in welcome-recent / threads-menu → click it → the user message is back.
 * Also: /chat?thread=<id> deep link selects that thread on mount.
 * Run: cd web && BASE_URL=<frontend> npx playwright test e2e/thread-reopen.spec.ts --workers=1
 */
test.describe("thread re-open after reload", () => {
  test.skip(!hasKey(), "needs ON_DEMAND_API_KEY to send a real turn");
  test.setTimeout(240_000);

  test("reload → recent thread listed → click → messages restored; ?thread deep link", async ({ page }) => {
    await primeSettings(page);
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
    const q = "In one sentence: what does Fervo Energy do?";
    await page.getByTestId("composer-input").fill(q);
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("user-message").first()).toContainText("Fervo Energy", { timeout: 30_000 });
    // wait for the turn to settle so the thread is persisted with its title + messages
    await expect(page.getByTestId("run-view").last()).toHaveAttribute("data-live", "false", { timeout: 150_000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bcap.chat.threads.v2") ?? "[]") as { id: string; title: string }[]);
    expect(stored.length).toBeGreaterThan(0);
    const tid = stored[0].id;

    // hard reload → the thread must be re-openable
    await page.reload();
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
    const menu = page.getByTestId("threads-menu");
    await expect(menu).toBeVisible({ timeout: 15_000 });
    await menu.locator("summary").click();
    const item = page.getByTestId("threads-menu-item").filter({ hasText: /Fervo Energy/ }).first();
    await expect(item).toBeVisible({ timeout: 15_000 });
    // welcome-recent lists it too when the welcome screen is shown (no thread selected after reload)
    const recent = page.getByTestId("welcome-recent");
    if (await recent.count()) await expect(recent.getByTestId("welcome-thread").filter({ hasText: /Fervo Energy/ })).toHaveCount(1);
    await item.click();
    await expect(page.getByTestId("user-message").first()).toContainText("Fervo Energy", { timeout: 30_000 });
    await expect(page.getByTestId("chat-title")).toContainText(/Fervo Energy/);

    // deep link selects the thread on mount
    await page.goto(`/chat?skip=1&thread=${encodeURIComponent(tid)}`);
    await expect(page.getByTestId("user-message").first()).toContainText("Fervo Energy", { timeout: 30_000 });
  });
});
