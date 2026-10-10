import { test as base, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

/**
 * Release gates (consumed by scripts/gates.sh via --reporter=json annotations):
 *   broken_images=<n>      — img elements that finished loading with naturalWidth 0 across /news, /companies, /chat
 *   rail_width_px=<w>      — [data-testid=nav-rail] width at 1440×900
 *   last_row_reachable=true|false — the last virtualised company row can be scrolled into view
 *
 * Uses the plain Playwright `test` (not the helpers fixture) so console noise never masks a gate result.
 * Soft-skips ONLY when the page itself returns 404.
 */
const test = base.extend<{ prime: void }>({
  prime: [
    async ({ page }, use) => {
      await primeSettings(page);
      await use();
    },
    { auto: true },
  ],
});

test.use({ viewport: { width: 1440, height: 900 } });

async function gotoOr404(page: Page, path: string): Promise<boolean> {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  if (res && res.status() === 404) {
    test.info().annotations.push({ type: "skip-reason", description: `${path} returned 404` });
    return false;
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
  return true;
}

/** Scroll the window and every scrollable container (incl. the virtualised companies list) to the end, in steps. */
async function scrollEverything(page: Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    // window — virtualised lists are window-scrolled, so step through to let rows mount
    let last = -1;
    for (let i = 0; i < 400; i++) {
      window.scrollBy(0, step);
      await sleep(40);
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (y >= max - 2 || y === last) break;
      last = y;
    }
    // explicit list + any overflow containers (chat thread etc.)
    const list = document.querySelector<HTMLElement>("[data-testid=companies-list]");
    const containers = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
    });
    if (list && !containers.includes(list)) containers.push(list);
    for (const el of containers) {
      let prev = -1;
      for (let i = 0; i < 200; i++) {
        el.scrollTop += step;
        await sleep(30);
        if (el.scrollTop === prev || el.scrollTop >= el.scrollHeight - el.clientHeight - 2) break;
        prev = el.scrollTop;
      }
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(300);
    window.scrollTo(0, 0);
    await sleep(200);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Force eager loading, await decode (5 s cap per page), return broken image srcs (complete && naturalWidth===0). */
async function countBrokenImages(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const imgs = Array.from(document.images);
    for (const img of imgs) {
      if (img.loading === "lazy") img.loading = "eager";
    }
    const cap = new Promise<void>((r) => setTimeout(r, 5000));
    await Promise.race([
      Promise.allSettled(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))),
      cap,
    ]);
    const broken: string[] = [];
    for (const img of imgs) {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (!src) continue; // placeholder/empty img — not a broken asset
      if (img.complete && img.naturalWidth === 0) broken.push(src.slice(0, 160));
    }
    return broken;
  });
}

test("gate: zero broken images on /news, /companies, /chat", async ({ page }) => {
  const broken: string[] = [];
  let visited = 0;
  for (const path of ["/news", "/companies", "/chat"]) {
    if (!(await gotoOr404(page, path))) continue;
    visited++;
    await scrollEverything(page);
    const b = await countBrokenImages(page);
    for (const s of b) broken.push(`${path} ${s}`);
  }
  test.info().annotations.push({ type: "broken_images", description: String(broken.length) });
  if (broken.length) test.info().annotations.push({ type: "broken_images_detail", description: broken.slice(0, 20).join(" | ") });
  test.skip(visited === 0, "all gate pages returned 404");
  expect(broken, "broken <img> elements (complete && naturalWidth===0)").toEqual([]);
});

test("gate: nav rail width ≤ 224 px at 1440×900", async ({ page }) => {
  if (!(await gotoOr404(page, "/chat"))) test.skip(true, "/chat returned 404");
  // HEAD renders <aside data-testid="nav-rail" aria-label="Primary">; older builds only have the aria-label.
  const rail = page.locator('[data-testid=nav-rail], aside[aria-label="Primary"], nav[aria-label="Primary"]').first();
  await expect(rail).toBeVisible({ timeout: 15_000 });
  const w = await rail.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  test.info().annotations.push({ type: "rail_width_px", description: String(w) });
  expect(w, "nav rail width px").toBeLessThanOrEqual(224);
});

test("gate: last company row reachable on /companies", async ({ page }) => {
  if (!(await gotoOr404(page, "/companies"))) test.skip(true, "/companies returned 404");
  const list = page.locator("[data-testid=companies-list]").first();
  await expect(list).toBeVisible({ timeout: 15_000 });
  const total = Number((await list.getAttribute("data-total")) ?? 0);
  if (!total) {
    test.info().annotations.push({ type: "last_row_reachable", description: "false" });
    test.info().annotations.push({ type: "companies_total", description: "0" });
  }
  expect(total, "companies-list data-total").toBeGreaterThan(0);
  const lastRow = page.locator(`[data-testid=company-row][data-index="${total - 1}"]`);
  let reachable = false;
  // the list is window-virtualised: step the window (and the list itself, if scrollable) until the last row mounts
  for (let i = 0; i < 300 && !reachable; i++) {
    await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>("[data-testid=companies-list]");
      if (list && list.scrollHeight > list.clientHeight + 4) list.scrollTop += 800;
      window.scrollBy(0, 800);
    });
    await page.waitForTimeout(60);
    if ((await lastRow.count()) > 0) {
      await lastRow.first().scrollIntoViewIfNeeded().catch(() => {});
      reachable = await lastRow.first().isVisible();
    }
  }
  test.info().annotations.push({ type: "companies_total", description: String(total) });
  test.info().annotations.push({ type: "last_row_reachable", description: String(reachable) });
  expect(reachable, `company-row data-index=${total - 1} visible after scrolling`).toBe(true);
  await expect(lastRow.first()).toBeInViewport();
});
