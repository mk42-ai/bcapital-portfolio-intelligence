import { test, expect, primeSettings } from "./helpers";

const VALUE = '[data-testid="growth-value"]';

test.describe("GROWTH values grid", () => {
  test.beforeEach(async ({ page }) => {
    // Fresh user: onboarding is the landing experience, so the GROWTH grid is on screen.
    await primeSettings(page, { onboarded: false, companies: [] });
    await page.goto("/onboarding?skip=1");
    await expect(page.locator('[data-testid="growth-grid"]')).toBeVisible();
  });

  test("renders six values, all collapsed, with correct ARIA wiring", async ({ page }) => {
    const values = page.locator(VALUE);
    await expect(values).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const btn = values.nth(i);
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      const controls = await btn.getAttribute("aria-controls");
      const id = await btn.getAttribute("id");
      expect(controls).toMatch(/^growth-panel-/);
      await expect(page.locator(`#${controls}`)).toHaveAttribute("aria-labelledby", id ?? "");
      await expect(page.locator(`#${controls}`)).toHaveAttribute("aria-hidden", "true");
    }
    await expect(page.getByRole("list", { name: "GROWTH values" })).toBeVisible();
  });

  test("click expands and reveals the description; click again collapses", async ({ page }) => {
    const first = page.locator(VALUE).first();
    await expect(first).toHaveAttribute("data-value", "generosity");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator("#growth-panel-generosity");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("We give first");
    // Multiple may be open at once.
    const second = page.locator(VALUE).nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "true");
    // Toggle off.
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  test("keyboard: Enter toggles, arrows move focus between values", async ({ page }) => {
    const second = page.locator(VALUE).nth(1);
    await second.focus();
    await expect(second).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#growth-panel-resilience")).toContainText("hard middle");
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-expanded", "false");
    // Space also works (native button).
    await page.keyboard.press("Space");
    await expect(second).toHaveAttribute("aria-expanded", "true");
    // Arrow navigation.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(VALUE).nth(2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(second).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator(VALUE).nth(5)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator(VALUE).nth(0)).toBeFocused();
  });

  test("collapsed panel content is not reachable by Tab (inert)", async ({ page }) => {
    const first = page.locator(VALUE).first();
    await first.focus();
    await page.keyboard.press("Tab");
    // With the panel collapsed, Tab must land on the next value button, not inside the hidden panel.
    await expect(page.locator(VALUE).nth(1)).toBeFocused();
  });

  test("renders a letter tile and three labelled lines (Definition / What it looks like here / Example) per value", async ({ page }) => {
    await expect(page.locator('[data-testid="growth-tile"]')).toHaveCount(6);
    await expect(page.locator('[data-testid="growth-definition"]')).toHaveCount(6);
    await expect(page.locator('[data-testid="growth-here"]')).toHaveCount(6);
    await expect(page.locator('[data-testid="growth-example"]')).toHaveCount(6);
    await page.locator(VALUE).first().click();
    const panel = page.locator("#growth-panel-generosity");
    await expect(panel).toHaveAttribute("data-state", "open");
    const def = panel.locator('[data-testid="growth-definition"]');
    const here = panel.locator('[data-testid="growth-here"]');
    const ex = panel.locator('[data-testid="growth-example"]');
    await expect(def).toBeVisible();
    await expect(here).toBeVisible();
    await expect(ex).toBeVisible();
    await expect(def).toContainText("Definition");
    await expect(def).toContainText("We give first");
    await expect(here).toContainText("What it looks like here");
    await expect(here).toContainText("warm intros to each other and to LPs without asking twice");
    await expect(ex).toContainText("Example");
    await expect(ex).toContainText("opens their network before a term sheet");
    // Order: definition, here, example.
    const order = await panel.locator(".growth-line").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["growth-definition", "growth-here", "growth-example"]);
    // Collapsed panels are closed + inert.
    const closed = page.locator("#growth-panel-resilience");
    await expect(closed).toHaveAttribute("data-state", "closed");
    await expect(closed).toHaveAttribute("aria-hidden", "true");
    expect(await closed.locator(".growth-panel-inner").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  });

  test("every value carries its own 'What it looks like here' line", async ({ page }) => {
    const expected: Record<string, string> = {
      generosity: "without asking twice",
      resilience: "2022–23 repricings",
      "open-mindedness": "dissent section",
      will: "full hold period",
      teamwork: "cross-office second partner",
      humility: "lowest scores first",
    };
    for (const [key, text] of Object.entries(expected)) {
      await page.locator(`${VALUE}[data-value="${key}"]`).click();
      await expect(page.locator(`#growth-panel-${key} [data-testid="growth-here"]`)).toContainText(text);
    }
  });

  test("reveals G-R-O-W-T-H on viewport entry (data-revealed, staggered --i)", async ({ page }) => {
    const grid = page.locator('[data-testid="growth-grid"]');
    await expect(grid).toHaveAttribute("data-brand", "green");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveAttribute("data-revealed", "true");
    // Every item ends fully visible with its own stagger index.
    const items = grid.locator("li.growth-item");
    await expect(items).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(items.nth(i)).toHaveCSS("opacity", "1");
      expect(await items.nth(i).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--i"))).toBe(String(i));
    }
  });

  test("hover / expanded / focus states are brand green on tile, card border and chevron; no old blue anywhere", async ({ page }) => {
    const BLUES = ["rgb(29, 78, 216)", "rgb(37, 99, 235)"];
    const GREEN = "rgb(10, 201, 133)";
    const GREEN_INK = "rgb(4, 120, 87)";
    const first = page.locator(VALUE).first();
    const card = page.locator('[data-testid="growth-grid"] li.growth-item').first();
    const tile = first.locator('[data-testid="growth-tile"]');
    const chevron = first.locator('[data-testid="growth-chevron"]');
    await page.locator('[data-testid="growth-grid"]').scrollIntoViewIfNeeded();
    // Let the one-shot light-up finish so it cannot mask the resting state.
    await page.waitForTimeout(1200);
    // Hover state: tile fill green + white letter, card border green.
    await first.hover();
    await expect(tile).toHaveCSS("background-color", GREEN);
    await expect(tile).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(card).toHaveCSS("border-top-color", GREEN);
    // Expanded state (hover off to prove the open state alone drives the green).
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await page.mouse.move(0, 0);
    await page.locator("body").hover({ position: { x: 0, y: 0 } });
    await expect(tile).toHaveCSS("background-color", GREEN);
    await expect(card).toHaveCSS("border-top-color", GREEN);
    await expect(card).toHaveCSS("border-bottom-color", GREEN);
    await expect(chevron).toHaveCSS("color", GREEN_INK);
    // Chevron rotated 180° when open (matrix(-1, 0, 0, -1, 0, 0)).
    const t = await chevron.evaluate((el) => getComputedStyle(el).transform);
    expect(t.replace(/\s/g, "")).toMatch(/^matrix\(-1,0,0,-1,0,0\)$/);
    // Keyboard focus-visible state → green outline on the button.
    await first.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    const outline = await first.evaluate((el) => getComputedStyle(el).outlineColor);
    expect(outline).toBe(GREEN);
    // Sweep every element in the grid (expanded + hovered) for either legacy blue.
    await first.hover();
    const offenders = await page.locator('[data-testid="growth-grid"]').evaluate((root, blues) => {
      const bad: string[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const cs = getComputedStyle(el);
        const values = [
          cs.color,
          cs.backgroundColor,
          cs.outlineColor,
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
        ];
        if (values.some((v) => blues.includes(v))) bad.push(`${el.tagName.toLowerCase()}.${el.className}`);
      });
      return bad;
    }, BLUES);
    expect(offenders).toEqual([]);
    // Collapsing returns the chevron to its resting colour and un-rotates it.
    await first.click();
    await page.mouse.move(0, 0);
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(chevron).not.toHaveCSS("color", GREEN_INK);
  });

  test("lights up G→R→O→W→T→H once on first scroll-into-view (data-lit timer chain)", async ({ page }) => {
    // Start with the grid out of view so the IntersectionObserver fires on scroll, then record the data-lit sequence.
    await page.setViewportSize({ width: 1280, height: 300 });
    await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="growth-grid"]');
      const spacer = document.createElement("div");
      spacer.style.height = "2000px";
      spacer.setAttribute("data-spacer", "1");
      grid?.parentElement?.insertBefore(spacer, grid);
      window.scrollTo(0, 0);
      (window as unknown as { __lit: string[] }).__lit = [];
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target as HTMLElement;
          if (el.getAttribute("data-lit") === "true") (window as unknown as { __lit: string[] }).__lit.push(el.getAttribute("data-testid") === "growth-tile" ? el.textContent ?? "" : "");
        }
      });
      mo.observe(grid as Node, { attributes: true, subtree: true, attributeFilter: ["data-lit"] });
    });
    const grid = page.locator('[data-testid="growth-grid"]');
    await expect(grid).toHaveAttribute("data-revealed", "false");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveAttribute("data-revealed", "true");
    // ~120ms stagger × 6 + 350ms hold → everything is back to resting well inside 2s.
    await page.waitForTimeout(2000);
    const seq = await page.evaluate(() => (window as unknown as { __lit: string[] }).__lit.filter(Boolean));
    expect(seq).toEqual(["G", "R", "O", "W", "T", "H"]);
    await expect(page.locator("[data-lit]")).toHaveCount(0);
    // Runs once: scrolling away and back must not replay.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await grid.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    const again = await page.evaluate(() => (window as unknown as { __lit: string[] }).__lit.filter(Boolean));
    expect(again).toEqual(["G", "R", "O", "W", "T", "H"]);
  });

  test("390px viewport: single column, no horizontal overflow, long names wrap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const grid = page.locator('[data-testid="growth-grid"]');
    await expect(grid).toBeVisible();
    const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
    expect(cols).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const gridRight = await grid.evaluate((el) => el.getBoundingClientRect().right);
    expect(gridRight).toBeLessThanOrEqual(390);
  });

  test("still toggles under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    // Items are visible without any reveal stagger or transform under reduced motion.
    const items = page.locator('[data-testid="growth-grid"] li.growth-item');
    await expect(items.first()).toHaveCSS("opacity", "1");
    await expect(items.last()).toHaveCSS("opacity", "1");
    expect(await items.last().evaluate((el) => getComputedStyle(el).transitionDelay)).toBe("0s");
    const first = page.locator(VALUE).first();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#growth-panel-generosity")).toBeVisible();
    await expect(page.locator("#growth-panel-generosity")).toContainText("founders' wins compound");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });

  test("prefers-reduced-motion: no light-up (no data-lit after 2s) and no transitions on tile/chevron/panel", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const grid = page.locator('[data-testid="growth-grid"]');
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveAttribute("data-revealed", "true");
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-lit]")).toHaveCount(0);
    const first = page.locator(VALUE).first();
    for (const sel of ['[data-testid="growth-tile"]', '[data-testid="growth-chevron"]']) {
      const dur = await first.locator(sel).evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(dur.split(",").every((d) => d.trim() === "0s")).toBe(true);
    }
    const panelDur = await page.locator("#growth-panel-generosity").evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(panelDur.split(",").every((d) => d.trim() === "0s")).toBe(true);
    // Green states still apply without motion.
    await first.hover();
    await expect(first.locator('[data-testid="growth-tile"]')).toHaveCSS("background-color", "rgb(10, 201, 133)");
  });
});
