import { test, expect } from "@playwright/test";
import { primeSettings, hasKey, captureErrors } from "./helpers";

/**
 * a15 — two-turn session continuity in ONE thread (desktop 1440×900):
 *   send turn 1 → wait for `run-footer` → send turn 2 in the same thread →
 *   the second `run-view` renders BELOW the first, the first turn's `thinking-block` stays pinned (offsetTop unchanged),
 *   `threads-menu` lists exactly one thread for this session, no `chat-error`, no console/page errors.
 * Run: cd web && BASE_URL=<frontend> node node_modules/@playwright/test/cli.js test e2e/session-continuity.spec.ts --project=desktop --workers=1
 */
test.describe("session continuity — two turns, one thread", () => {
  test.skip(!hasKey(), "needs ON_DEMAND_API_KEY to send real turns");
  test.setTimeout(420_000);
  test.use({ viewport: { width: 1440, height: 900 } });

  test("turn 2 appends below turn 1; turn 1 thinking-block pinned; one thread; no errors", async ({ page }, testInfo) => {
    await primeSettings(page);
    const errors = captureErrors(page);
    const t0 = Date.now();
    await page.goto("/chat?skip=1");
    const input = page.getByTestId("composer-input");
    await expect(input).toBeVisible({ timeout: 30_000 });

    // ── turn 1
    await input.fill("What is the latest news about Fervo Energy? Cite sources.");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("user-message").first()).toContainText("Fervo Energy", { timeout: 30_000 });
    await expect(page.getByTestId("run-view")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("run-footer").first()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId("run-view").first()).toHaveAttribute("data-live", "false", { timeout: 60_000 });
    const turn1Ms = Date.now() - t0;
    const footer1 = page.getByTestId("run-footer").first();
    const totalMs1 = Number(await page.getByTestId("answer-badge").first().getAttribute("data-total-ms"));

    const firstThink = page.getByTestId("thinking-block").first();
    const hasThink = (await page.getByTestId("thinking-block").count()) > 0;
    const topBefore = hasThink ? await firstThink.evaluate((el) => (el as HTMLElement).offsetTop) : null;
    const run1Box = await page.getByTestId("run-view").first().boundingBox();
    expect(run1Box).not.toBeNull();

    // ── turn 2 in the SAME thread
    const t1 = Date.now();
    await input.fill("And Flutterwave?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("user-message")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("run-view")).toHaveCount(2, { timeout: 30_000 });
    // second run-view must sit BELOW the first (document order + geometry)
    const run2Box = await page.getByTestId("run-view").nth(1).boundingBox();
    expect(run2Box).not.toBeNull();
    expect(run2Box!.y).toBeGreaterThan(run1Box!.y);
    // first turn's thinking-block did not move while turn 2 streams
    if (hasThink) expect(await firstThink.evaluate((el) => (el as HTMLElement).offsetTop)).toBe(topBefore);

    await expect(page.getByTestId("run-footer")).toHaveCount(2, { timeout: 180_000 });
    await expect(page.getByTestId("run-view").nth(1)).toHaveAttribute("data-live", "false", { timeout: 60_000 });
    const turn2Ms = Date.now() - t1;
    const totalMs2 = Number(await page.getByTestId("answer-badge").nth(1).getAttribute("data-total-ms"));
    await expect(footer1).toBeVisible();
    if (hasThink) expect(await firstThink.evaluate((el) => (el as HTMLElement).offsetTop)).toBe(topBefore);
    const run2After = await page.getByTestId("run-view").nth(1).boundingBox();
    expect(run2After!.y).toBeGreaterThan((await page.getByTestId("run-view").first().boundingBox())!.y);

    // exactly one thread for this session (both turns persisted into the same thread)
    const menu = page.getByTestId("threads-menu");
    await expect(menu).toBeVisible({ timeout: 15_000 });
    await menu.locator("summary").click();
    await expect(page.getByTestId("threads-menu-item")).toHaveCount(1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bcap.chat.threads.v2") ?? "[]") as { id: string }[]);
    expect(stored.length).toBe(1);

    await expect(page.getByTestId("chat-error")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);

    const numbers = { turn1WallMs: turn1Ms, turn2WallMs: turn2Ms, badgeTotalMs: { turn1: totalMs1, turn2: totalMs2 }, thinkingBlockTop: topBefore, run1Y: run1Box!.y, run2Y: run2Box!.y, threads: stored.length };
    await testInfo.attach("continuity-numbers", { body: JSON.stringify(numbers, null, 2), contentType: "application/json" });
    console.log("[session-continuity]", JSON.stringify(numbers));
    await page.screenshot({ path: "proof/pass-3/continuity/two-turn-1440.png", fullPage: false });
  });
});
