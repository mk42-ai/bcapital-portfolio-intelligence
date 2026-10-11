import { test, expect } from "@playwright/test";
import { primeSettings } from "./helpers";

/**
 * a49 — copy pass + nav rail contract (desktop 1440×900).
 *  - rail bounding width ≤224 expanded, ≤64 collapsed after clicking `rail-toggle`; the choice persists across reload; `aria-expanded` tracks it.
 *  - developer/explainer copy is gone from user surfaces: "Why it's interactive" (only behind dev-disclosure), "Answers stream from".
 *  - the brand line "Catalysts. Questioners. Visionaries." is still present (onboarding).
 *  - /chat has no lede paragraph under the title; /overview and /news ledes are short.
 */
test.describe("a49 copy + rail", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("rail ≤224 expanded / ≤64 collapsed via rail-toggle, persisted", async ({ page }) => {
    await primeSettings(page);
    await page.goto("/overview");
    const rail = page.getByTestId("nav-rail");
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute("data-mounted", "true", { timeout: 15_000 });
    const toggle = page.getByTestId("rail-toggle");
    await expect(toggle).toBeVisible();
    // Normalise to expanded first (a previous run may have persisted "collapsed").
    if ((await rail.getAttribute("data-collapsed")) === "true") await toggle.click();
    await expect(rail).toHaveAttribute("data-collapsed", "false");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.waitForTimeout(400);
    const wExp = (await rail.boundingBox())!.width;
    expect(wExp, "expanded width ≤224").toBeLessThanOrEqual(224);
    const railW = await rail.evaluate((el) => getComputedStyle(el).getPropertyValue("--rail-w").trim());
    expect(railW, "--rail-w css var").toBe("224px");

    await toggle.click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(400);
    const wCol = (await rail.boundingBox())!.width;
    expect(wCol, "collapsed width ≤64").toBeLessThanOrEqual(64);
    expect(wCol).toBeLessThan(wExp);

    await page.reload();
    await expect(rail).toHaveAttribute("data-mounted", "true", { timeout: 15_000 });
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await page.waitForTimeout(400);
    expect((await rail.boundingBox())!.width, "collapsed persisted across reload").toBeLessThanOrEqual(64);
    await expect(page.getByTestId("rail-toggle")).toHaveAttribute("aria-expanded", "false");
  });

  test("/chat: no lede under the title, no explainer copy on user surfaces", async ({ page }) => {
    await primeSettings(page);
    await page.goto("/chat");
    const title = page.getByTestId("chat-title");
    await expect(title).toBeVisible({ timeout: 20_000 });
    await expect(title).toHaveText(/^Chat$/);
    // No PageHeader lede: no <p> directly following an h1 anywhere on the route.
    const ledes = await page.locator("h1 + p").count();
    expect(ledes, "no lede paragraph under the /chat title").toBe(0);
    const body = page.locator("body");
    // innerText = what the user can read (closed <details> / hidden drawers are excluded).
    await expect(body).not.toContainText("Answers stream from", { useInnerText: true });
    await expect(body).not.toContainText("Shift+Enter", { useInnerText: true });
    // Explainer card only behind the single developer reveal (dev-disclosure in run-rail) — never visible by default.
    await expect(page.getByTestId("why-interactive")).toBeHidden();
    await expect(body).not.toContainText("Why it’s interactive", { useInnerText: true });
    await expect(body).not.toContainText("Why it's interactive", { useInnerText: true });
    await expect(page.getByTestId("composer-hint")).toContainText("Enter to send");
  });

  test("overview/news ledes are short; brand line still present on onboarding", async ({ page }) => {
    await primeSettings(page);
    await page.goto("/overview");
    await expect(page.getByRole("heading", { level: 1, name: "Overview", exact: true })).toBeVisible();
    const lede = page.locator("h1 + p").first();
    await expect(lede).toBeVisible();
    const words = ((await lede.textContent()) ?? "").trim().split(/\s+/).length;
    expect(words, "overview lede ≤12 words").toBeLessThanOrEqual(12);

    await page.goto("/news");
    await expect(page.getByRole("heading", { level: 1, name: "News Pulse" })).toBeVisible();
    await expect(page.locator("h1 + p").first()).toHaveText(/^\d[\d,]* items · \d+ companies · daily 06:00 UTC$/);

    // Onboarding (not primed): brand line is kept.
    const fresh = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await fresh.newPage();
    await p2.goto("/");
    await expect(p2.locator("body")).toContainText("Catalysts. Questioners. Visionaries.", { timeout: 20_000 });
    await fresh.close();
  });
});
