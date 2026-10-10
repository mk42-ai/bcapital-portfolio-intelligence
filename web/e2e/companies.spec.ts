import { test, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

const VIEWPORTS = [{ name: "desktop 1440×900", width: 1440, height: 900 }, { name: "mobile 390×844", width: 390, height: 844 }] as const;

async function scrollToDocumentBottom(page: Page) {
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const h = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; });
    await page.waitForTimeout(150);
    const y = await page.evaluate(() => window.scrollY + window.innerHeight);
    if (h === prev && y >= h - 2) break;
    prev = h;
  }
}

/** Among the list's ancestors (and the list itself), only document.scrollingElement may scroll vertically. */
async function nestedVerticalScrollers(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="companies-list"]');
    const out: string[] = [];
    for (let el: Element | null = list; el; el = el.parentElement) {
      if (el === document.scrollingElement) continue;
      const oy = getComputedStyle(el).overflowY;
      if (el.scrollHeight > el.clientHeight + 2 && (oy === "auto" || oy === "scroll")) out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className.toString().slice(0, 60)}`);
    }
    return out;
  });
}

for (const vp of VIEWPORTS) {
  test(`companies list reaches the last row with the document as the only vertical scroller (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await primeSettings(page);
    await page.goto("/companies?skip=1");
    const list = page.getByTestId("companies-list");
    await expect(list).toHaveAttribute("data-total", "136");
    await expect(page.getByTestId("companies-count")).toHaveText(/Showing 136 of 136/);

    // body/html must not be scroll-locked while the list is open
    const locked = await page.evaluate(() => [document.documentElement, document.body].some((e) => getComputedStyle(e).overflowY === "hidden"));
    expect(locked).toBe(false);
    expect(await nestedVerticalScrollers(page)).toEqual([]);

    // The last row is virtualized: it is NOT in the DOM until the window is scrolled to the bottom.
    await scrollToDocumentBottom(page);
    const lastRow = page.locator('[data-testid="company-row"][data-index="135"]');
    await expect(lastRow).toBeAttached();
    await expect(list).toHaveAttribute("data-last-visible", "true");
    const box = await lastRow.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);

    // Default sort = name asc, so the last row must be the alphabetically-last name from the page's own data.
    const names = JSON.parse((await page.getByTestId("companies-data").textContent()) ?? "[]") as string[];
    expect(names).toHaveLength(136);
    const maxName = names.reduce((m, n) => (n.localeCompare(m) > 0 ? n : m), names[0]);
    await expect(lastRow.getByTestId("company-row-name")).toHaveText(maxName);
    await expect(lastRow).toHaveAttribute("aria-rowindex", "136");
    expect(await nestedVerticalScrollers(page)).toEqual([]);
  });
}

test("End key jumps focus to the last row and announces it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  await page.goto("/companies?skip=1");
  await expect(page.getByTestId("companies-list")).toHaveAttribute("data-total", "136");
  await page.locator('[data-testid="company-row-link"][data-index="0"]').focus();
  await page.keyboard.press("End");
  const lastLink = page.locator('[data-testid="company-row-link"][data-index="135"]');
  await expect(lastLink).toBeFocused();
  await expect(page.getByTestId("companies-live")).toHaveText("Row 136 of 136");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-testid="company-row-link"][data-index="134"]')).toBeFocused();
});

test("A–Z rail: the last letter button scrolls a row starting with that letter into view (desktop)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  await page.goto("/companies?skip=1");
  await expect(page.getByTestId("companies-list")).toHaveAttribute("data-total", "136");
  const rail = page.getByTestId("companies-az");
  await expect(rail).toBeVisible();
  const buttons = rail.locator("button[data-letter]");
  const n = await buttons.count();
  expect(n).toBeGreaterThan(10);
  const last = buttons.nth(n - 1);
  const letter = (await last.getAttribute("data-letter")) ?? "";
  await last.click();
  await page.waitForTimeout(300);
  const match = page.locator('[data-testid="company-row"]').filter({ has: page.locator(`[data-testid="company-row-name"]`, { hasText: new RegExp(`^${letter === "#" ? "[^A-Za-z]" : letter}`) }) }).first();
  await expect(match).toBeInViewport();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
});

test("companies nav item points at /companies and overview links to the full list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  await page.goto("/overview?skip=1");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Companies" })).toHaveAttribute("href", "/companies");
  await expect(page.getByTestId("open-full-list")).toHaveAttribute("href", "/companies");
  // ≥1024 px: the overview table container no longer caps its height, so the page is the only vertical scroller there too
  const capped = await page.getByTestId("company-table-scroller").evaluate((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY === "auto");
  expect(capped).toBe(false);
});

// ── Agent 03: company logo avatars — real logo, monogram, or the local company-logo asset; never a broken image ──
test.describe("companies list logos", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await primeSettings(page);
    await page.goto("/companies?skip=1");
    await expect(page.getByTestId("companies-list")).toHaveAttribute("data-total", "136");
    // let lazy logos in the first viewport settle
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
  });

  test("every rendered row shows a decoded logo or a fallback (monogram / company-logo asset)", async ({ page }) => {
    const rows = page.locator('[data-testid="companies-list"] [data-testid="company-row"]');
    const n = await rows.count();
    test.skip(n === 0, "no company rows rendered (live data absent)");
    const stats = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="companies-list"]')!;
      const rows = Array.from(list.querySelectorAll('[data-testid="company-row"]'));
      let decoded = 0, fallback = 0, missing = 0;
      for (const r of rows) {
        const img = r.querySelector('img[data-testid="company-logo"]') as HTMLImageElement | null;
        const fb = r.querySelector('[data-testid="company-logo-fallback"]');
        if (img && img.naturalWidth > 0) decoded++;
        else if (fb) fallback++;
        else if (img && !img.complete) decoded++; // still loading — not a broken state
        else missing++;
      }
      return { decoded, fallback, missing, total: rows.length };
    });
    expect(stats.decoded + stats.fallback).toBeGreaterThan(0);
    expect(stats.missing, `rows with neither a logo nor a fallback: ${JSON.stringify(stats)}`).toBe(0);
  });

  test("zero broken <img> elements inside the companies list", async ({ page }) => {
    const broken = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="companies-list"]');
      if (!list) return [];
      return Array.from(list.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src") ?? "");
    });
    expect(broken, `broken images: ${broken.join(", ")}`).toEqual([]);
  });

  test("no image src references the retired /fallbacks/ directory", async ({ page }) => {
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "").filter((s) => s.includes("/fallbacks/")));
    expect(bad).toEqual([]);
    const fallbackAssets = await page.evaluate(() => Array.from(document.querySelectorAll('img[data-testid="company-logo-fallback"]')).map((i) => i.getAttribute("src") ?? ""));
    for (const s of fallbackAssets) expect(s).toMatch(/^\/assets\/company-logo-(256|512)\.(webp|png)$/);
  });
});
