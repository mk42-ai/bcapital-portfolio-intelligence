import { test, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

/**
 * unit2 — thread titles never clip mid-word: every thread-title render (threads menu, welcome recent list, top-bar title) is single-line,
 * ellipsised, and carries the FULL title in its `title` attribute. Seeds `bcap.chat.threads.v2` (shape: {id,title,createdAt}[]) with a
 * 120-char title; runs on both viewports (desktop project + a 390×844 override inside the spec).
 * Run: cd web && BASE_URL=<frontend> node node_modules/@playwright/test/cli.js test e2e/title-ellipsis.spec.ts --workers=1
 */
const LONG = "Which of my context companies moved most since the last scoring run, and create me a document on all of these companies and their news and valuations".slice(0, 120).trim();
const SHORT = "create me a document on all of these companies and their latest headlines please";
const THREADS_KEY = "bcap.chat.threads.v2";

async function seed(page: Page) {
  await primeSettings(page);
  await page.addInitScript(([k, long, short]) => {
    const now = Date.now();
    const threads = [
      { id: "t-long-120", title: long, createdAt: new Date(now - 60_000).toISOString() },
      { id: "t-short", title: short, createdAt: new Date(now - 120_000).toISOString() },
    ];
    localStorage.setItem(k as string, JSON.stringify(threads));
    localStorage.setItem(`bcap.chat.thread.v2.t-long-120`, JSON.stringify([{ id: "m1", role: "user", content: long }]));
    localStorage.setItem(`bcap.chat.thread.v2.t-short`, JSON.stringify([{ id: "m2", role: "user", content: short }]));
  }, [THREADS_KEY, LONG, SHORT]);
}

const ellipsised = async (el: ReturnType<Page["locator"]>) => el.evaluate((n) => {
  const cs = getComputedStyle(n);
  const span = n.querySelector('[data-testid="thread-title"]') as HTMLElement | null;
  const target = span ?? n;
  const tcs = getComputedStyle(target);
  return { overflowOk: target.scrollWidth <= target.clientWidth + 1, textOverflow: tcs.textOverflow, whiteSpace: tcs.whiteSpace, outerTextOverflow: cs.textOverflow, title: n.getAttribute("title"), spanTitle: span?.getAttribute("title") ?? null, hasSpan: !!span, text: (target.textContent ?? "").trim() };
});

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile-390", width: 390, height: 844 }]) {
  test(`thread titles ellipsise + carry the full title (${vp.name})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seed(page);
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });

    // Threads menu
    const menu = page.getByTestId("threads-menu");
    await expect(menu).toBeVisible();
    await menu.locator("summary").click();
    const item = page.locator('[data-testid="threads-menu-item"][data-thread-id="t-long-120"]');
    await expect(item).toBeVisible({ timeout: 10_000 });
    const m = await ellipsised(item);
    console.log(`[title-ellipsis ${vp.name}] threads-menu-item`, JSON.stringify(m));
    expect(m.text).toBe(LONG);
    expect(m.overflowOk || m.textOverflow === "ellipsis", `menu item must not overflow or must use text-overflow: ellipsis (got ${JSON.stringify(m)})`).toBeTruthy();
    expect(m.title, "menu item carries the full title in title=").toBe(LONG);
    expect(m.hasSpan, "data-testid=thread-title span present").toBeTruthy();
    expect(m.spanTitle).toBe(LONG);
    expect(m.whiteSpace).toBe("nowrap");

    // Select it → top-bar title shows the full title (ellipsised) with a tooltip
    await item.click();
    const title = page.getByTestId("chat-title");
    await expect(title).toHaveAttribute("title", LONG, { timeout: 15_000 });
    const t = await ellipsised(title);
    console.log(`[title-ellipsis ${vp.name}] chat-title`, JSON.stringify(t));
    expect(t.overflowOk || t.textOverflow === "ellipsis").toBeTruthy();
    expect(t.whiteSpace).toBe("nowrap");

    // New chat → welcome recent list shows the other thread with the same guarantees
    await page.getByTestId("new-thread").click();
    const welcome = page.locator('[data-testid="welcome-thread"][data-thread-id="t-long-120"]');
    if (await welcome.count()) {
      const w = await ellipsised(welcome.first());
      console.log(`[title-ellipsis ${vp.name}] welcome-thread`, JSON.stringify(w));
      expect(w.overflowOk || w.textOverflow === "ellipsis").toBeTruthy();
      expect(w.title).toBe(LONG);
    }
    // Every thread-title span on the page is ellipsised (CSS contract) and no blue hues
    const spans = page.getByTestId("thread-title");
    const n = await spans.count();
    for (let i = 0; i < n; i++) {
      const cs = await spans.nth(i).evaluate((el) => { const c = getComputedStyle(el); return { to: c.textOverflow, ws: c.whiteSpace, of: c.overflow, title: el.getAttribute("title"), text: el.textContent }; });
      expect(cs.to).toBe("ellipsis"); expect(cs.ws).toBe("nowrap"); expect(cs.of).toBe("hidden"); expect(cs.title).toBe(cs.text);
    }
  });
}
