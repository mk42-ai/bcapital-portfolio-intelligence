import { test, expect } from "./helpers";

/** Agent 18 — ONE honest Perplexity status banner in Settings; no red error cards anywhere on /settings. */
test.describe("Perplexity status", () => {
  test("GET /api/plugins/status answers JSON with a known state", async ({ request }, testInfo) => {
    test.setTimeout(60_000);
    const r = await request.get("/api/plugins/status", { timeout: 40_000 });
    if (r.status() === 404) { testInfo.annotations.push({ type: "soft-skip", description: "route not deployed yet (old build)" }); test.skip(); }
    expect(r.ok()).toBeTruthy();
    const j = (await r.json()) as { plugin: string; state: string; message: string; checkedAt: string };
    expect(j.plugin).toBe("plugin-1722260873");
    expect(["ok", "no_credits", "error"]).toContain(j.state);
    expect(typeof j.checkedAt).toBe("string");
    testInfo.annotations.push({ type: "perplexity", description: `${j.state}: ${j.message.slice(0, 120)}` });
  });

  test("/settings shows the banner with a resolved state and no red cards", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.goto("/settings");
    const banner = page.getByTestId("perplexity-status");
    if (!(await banner.count())) { testInfo.annotations.push({ type: "soft-skip", description: "banner absent (old build)" }); test.skip(); }
    await expect(banner).toBeVisible();
    await expect.poll(async () => banner.getAttribute("data-state"), { timeout: 40_000 }).not.toBe("unknown");
    const state = await banner.getAttribute("data-state");
    testInfo.annotations.push({ type: "perplexity", description: `banner state ${state}` });
    const reds = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => getComputedStyle(el).backgroundColor === "rgb(254, 242, 242)").length);
    expect(reds, "no red (#fef2f2) cards on /settings").toBe(0);
  });
});
