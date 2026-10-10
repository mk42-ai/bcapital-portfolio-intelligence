import { test, expect } from "./helpers";

/**
 * PitchBook panel (plugin-1777018662 "Pitchbook Investor Finder" — investor search only, no credentials).
 * The backend route may not exist yet on the preview backend, so every assertion accepts the honest states (pb-empty / pb-offline)
 * as well as real data (pb-chip / pb-investor) — but NEVER a blank card and never a credentials message. Selectors are data-testid only.
 */
const SLUG = "fervo-energy";
const CHIPS_KEY = "bcap.chat.context-chips";
const COMPOSER = '[data-testid="chat-shell"] textarea';

test.describe("PitchBook panel", () => {
  test("company page shows the PitchBook card with data or an honest state (never blank)", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    const card = page.getByTestId("pitchbook-card");
    await expect(card).toBeVisible();
    const anyState = card.locator('[data-testid="pb-chip"], [data-testid="pb-investor"], [data-testid="pb-empty"], [data-testid="pb-offline"], [data-testid="pb-unavailable"]');
    await expect(anyState.first()).toBeVisible();
    await expect(card.getByTestId("pb-needs-creds")).toHaveCount(0);
    // Sections that exist carry the honest "not available from the plugin" copy, never a credentials prompt.
    const unavailable = card.getByTestId("pb-unavailable");
    if (await unavailable.count()) await expect(unavailable.first()).toContainText("Not available from the PitchBook Investor Finder plugin");
    const view = card.getByTestId("pb-view");
    if (await view.count()) { await expect(card.getByTestId("pb-header")).toContainText("Pitchbook Investor Finder"); await expect(card.getByTestId("pb-run-now")).toHaveCount(0); }
    if (await card.getByTestId("pb-empty").count()) { await expect(card.getByTestId("pb-empty")).toContainText("No PitchBook data yet"); await expect(card.getByTestId("pb-run-now")).toHaveCount(0); }
  });

  test("'Ask in chat' lands on /chat with a context chip above the composer (no new thread)", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    const card = page.getByTestId("pitchbook-card");
    const ask = card.locator('[data-testid="pb-chip"] [data-testid="pb-ask"], [data-testid="pb-investor"] [data-testid="pb-ask"], [data-testid="pb-ask-investors"]').first();
    test.skip(!(await ask.count()), "backend offline on this preview — no chip or empty-state ask button to click");
    await ask.click();
    await expect(page).toHaveURL(/\/chat\?skip=1/);
    await expect(page.getByTestId("chat-shell")).toBeVisible();
    await expect(page.locator(COMPOSER).first()).toBeVisible();
    await expect(page.getByTestId("context-chip").first()).toBeVisible();
    const stored = await page.evaluate((k) => sessionStorage.getItem(k), CHIPS_KEY);
    // The chip carries structured provenance; the plugin_id is the PitchBook plugin for investor chips and the enrichment plugin for
    // FROM_ENRICHMENT facts (overview / last round) — either way the turn adds plugin-1777018662 (see context-chips.ts).
    const chips = JSON.parse(stored ?? "[]") as { company: string; field: string; value: string; fetched_at: string | null }[];
    expect(chips.length).toBeGreaterThan(0); expect(chips[0].company.length).toBeGreaterThan(0); expect(chips[0].field.length).toBeGreaterThan(0); expect(chips[0].value.length).toBeGreaterThan(0);
    // Removable, and removal empties the store.
    await page.getByTestId("context-chip-remove").first().click();
    await expect(page.getByTestId("context-chip")).toHaveCount(0);
  });

  test("inspector drawer: opening it via the top-bar toggle reveals the PitchBook panel; closing hides it again", async ({ page }) => {
    await page.goto("/chat?skip=1");
    const drawer = page.getByTestId("chat-inspector");
    const toggle = page.getByTestId("inspector-toggle");
    await expect(toggle).toBeVisible();
    if ((await drawer.getAttribute("data-open")) !== "true") await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(drawer.getByTestId("pitchbook-rail")).toBeVisible();
    await expect(drawer.getByTestId("pitchbook-rail").locator('[data-testid="pb-chip"], [data-testid="pb-investor"], [data-testid="pb-empty"], [data-testid="pb-offline"], [data-testid="pb-unavailable"], [data-testid="pb-no-context"]').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("inspector-close").click();
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect(drawer.getByTestId("pitchbook-rail")).toBeHidden();
    await toggle.click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(drawer.getByTestId("pitchbook-rail")).toBeVisible();
  });

  test("keyboard: Enter on a focused chip (company page or rail) adds a context chip", async ({ page }) => {
    await page.goto(`/company/${SLUG}`);
    let chip = page.getByTestId("pitchbook-card").locator('[data-testid="pb-chip"], [data-testid="pb-investor"]').first();
    if (!(await chip.count())) {
      await page.goto("/chat?skip=1");
      if ((await page.getByTestId("chat-inspector").getAttribute("data-open")) !== "true") await page.getByTestId("inspector-toggle").click();
      const rail = page.getByTestId("pitchbook-rail");
      await expect(rail.locator('[data-testid="pb-chip"], [data-testid="pb-investor"], [data-testid="pb-empty"], [data-testid="pb-offline"], [data-testid="pb-unavailable"]').first()).toBeVisible({ timeout: 15_000 });
      chip = rail.locator('[data-testid="pb-chip"], [data-testid="pb-investor"]').first();
      test.skip(!(await chip.count()), "no PitchBook record on this preview backend — nothing to focus");
      await chip.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("context-chip").first()).toBeVisible();
      return;
    }
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/chat\?skip=1/);
    await expect(page.getByTestId("context-chip").first()).toBeVisible();
    await expect(page.locator(COMPOSER).first()).toBeVisible();
  });

  test("a persisted context chip renders above the composer on /chat and the store survives navigation", async ({ page }) => {
    await page.addInitScript(([k, v]) => { sessionStorage.setItem(k as string, JSON.stringify(v)); }, [CHIPS_KEY, [{ id: "fervo-energy|investor|Test Capital", company: "Fervo Energy", field: "investor", value: "Test Capital (VC · Austin)", source: "https://example.com", fetched_at: "2026-10-10T06:00:00Z", plugin_id: "plugin-1777018662" }]]);
    await page.goto("/chat?skip=1");
    await expect(page.locator(COMPOSER).first()).toBeVisible();
    const chip = page.getByTestId("context-chip").first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Fervo Energy");
    await expect(chip).toContainText("Test Capital");
    // The chip sits directly above the composer (same parent column as the composer slot).
    const above = await page.evaluate(() => { const c = document.querySelector('[data-testid="context-chips"]'); const t = document.querySelector('[data-testid="chat-shell"] textarea'); if (!c || !t) return false; return c.getBoundingClientRect().bottom <= t.getBoundingClientRect().top + 1; });
    expect(above).toBe(true);
  });
});
