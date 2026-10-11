import { test, expect } from "./helpers";

/** a33 — roving tabindex + typeahead on /companies, arrow-key nav on the rail, brand-green (#0AC985) focus rings everywhere. */
const activeInfo = () => {
  const el = document.activeElement as HTMLElement | null;
  const cs = el ? getComputedStyle(el) : null;
  return { testid: el?.dataset.testid ?? null, name: el?.textContent?.trim() ?? "", outline: cs?.outlineColor ?? "", width: cs?.outlineWidth ?? "" };
};
const isBlue = (rgb: string) => {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/); if (!m) return false;
  const [r, g, b] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; if (d < 0.15) return false;
  let h = 0; if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360; const s = max === 0 ? 0 : d / max;
  return h >= 190 && h <= 260 && s > 0.15;
};

test.describe("a33 keyboard nav", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("companies: roving tabindex, arrows, Home, typeahead, live region", async ({ page }) => {
    await page.goto("/companies?skip=1");
    const links = page.getByTestId("company-row-link");
    await expect(links.first()).toBeVisible();
    // exactly one row link is tabbable
    expect(await page.locator('[data-testid="company-row-link"][tabindex="0"]').count()).toBe(1);
    // Tab until the first row link is focused (toolbar controls come first)
    let info = { testid: null as string | null, name: "", outline: "", width: "" };
    for (let i = 0; i < 20 && info.testid !== "company-row-link"; i++) { await page.keyboard.press("Tab"); info = await page.evaluate(activeInfo); }
    expect(info.testid).toBe("company-row-link");
    const firstName = info.name;
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    info = await page.evaluate(activeInfo);
    expect(info.testid).toBe("company-row-link");
    expect(info.outline).toContain("10, 201, 133");
    expect(info.name).not.toBe(firstName);
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.index)).toBe("3");
    await expect(page.getByTestId("companies-live")).toHaveText(/Row 4 of \d+/);
    expect(await page.locator('[data-testid="company-row-link"][tabindex="0"]').count()).toBe(1);
    await page.keyboard.press("Home");
    await page.waitForTimeout(200);
    info = await page.evaluate(activeInfo);
    expect(info.testid).toBe("company-row-link");
    expect(info.name).toBe(firstName);
    // typeahead: "f" → next company starting with F (skipped if the portfolio has none)
    const hasF = await page.evaluate(() => JSON.parse(document.querySelector('[data-testid="companies-data"]')!.textContent!).some((n: string) => /^f/i.test(n)));
    test.skip(!hasF, "no company starting with F");
    await page.keyboard.press("f");
    await page.waitForTimeout(250);
    info = await page.evaluate(activeInfo);
    expect(info.testid).toBe("company-row-link");
    expect(info.name.toUpperCase().startsWith("F")).toBe(true);
    expect(info.outline).toContain("10, 201, 133");
  });

  test("nav rail: Tab + arrows, no blue focus ring anywhere", async ({ page }) => {
    await page.goto("/overview?skip=1");
    await expect(page.getByTestId("nav-overview")).toBeVisible();
    const seen: { testid: string | null; outline: string }[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(activeInfo);
      seen.push({ testid: info.testid, outline: info.outline });
      expect(isBlue(info.outline), `blue focus ring on ${info.testid}: ${info.outline}`).toBe(false);
      if (info.testid === "nav-settings") break;
    }
    expect(seen.some((s) => s.testid === "nav-overview")).toBe(true);
    await page.getByTestId("nav-overview").focus();
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid)).toBe("nav-companies");
    await page.keyboard.press("End");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid)).toBe("nav-settings");
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid)).toBe("nav-overview");
    await page.keyboard.press("Home");
    const home = await page.evaluate(activeInfo);
    expect(home.testid).toBe("nav-overview");
    expect(home.outline).toContain("10, 201, 133");
  });
});
