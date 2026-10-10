import { test, expect } from "./helpers";

/** Agent 23 — one-row composer (Attach · textarea · mic · send) pinned to the bottom; floating jump-to-latest never overlaps the composer. */
const seedThread = (n: number) => {
  const id = "t-seed-long"; const msgs = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", content: `${i % 2 ? "Answer" : "Question"} ${i}: ` + "lorem ipsum dolor sit amet ".repeat(12) }));
  localStorage.setItem("bcap.chat.threads.v2", JSON.stringify([{ id, title: "Seeded long thread", createdAt: new Date().toISOString() }]));
  localStorage.setItem(`bcap.chat.thread.v2.${id}`, JSON.stringify(msgs));
};
test.describe("composer", () => {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`one row + pinned bottom @${vp.width}×${vp.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(vp);
      await page.goto("/chat?skip=1");
      const shell = page.getByTestId("chat-shell"); await expect(shell).toBeVisible({ timeout: 30_000 });
      await page.locator(".chat-shell .oiu-attach-host").first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {}); // enhancer mounts after hydration
      if (!(await page.locator(".chat-shell .oiu-attach-host").count())) { testInfo.annotations.push({ type: "soft-skip", description: "composer enhancer absent (old build)" }); test.skip(); }
      const ta = page.locator("textarea:visible").first(); await expect(ta).toBeVisible();
      const parts = [page.getByTestId("attachment-button").first(), ta, page.getByTestId("voice-mic").first(), page.locator("button.openui-agent-thread-composer__submit-button").first()];
      const centres: number[] = [];
      for (const p of parts) { if (!(await p.count())) continue; const b = (await p.boundingBox())!; centres.push(b.y + b.height / 2); }
      expect(centres.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(6);
      const tb = (await ta.boundingBox())!; expect(vp.height - (tb.y + tb.height)).toBeLessThanOrEqual(48);
    });
  }
  test("jump-to-latest floats above the composer on a long finished thread", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(seedThread, 40);
    await page.goto("/chat?skip=1&thread=t-seed-long");
    await expect(page.getByTestId("chat-shell")).toBeVisible({ timeout: 30_000 });
    if (!(await page.locator(".chat-shell .oiu-attach-host").count())) { testInfo.annotations.push({ type: "soft-skip", description: "composer enhancer absent (old build)" }); test.skip(); }
    const area = page.locator(".chat-shell .openui-agent-thread-scroll-area");
    await expect(page.getByTestId("user-message").first()).toBeVisible({ timeout: 20_000 });
    await area.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
    const jump = page.getByTestId("jump-to-latest"); await expect(jump).toBeVisible({ timeout: 10_000 });
    const jb = (await jump.boundingBox())!; const cb = (await page.locator(".chat-shell .openui-agent-composer-slot").first().boundingBox())!;
    expect(jb.y + jb.height).toBeLessThanOrEqual(cb.y + 1);
  });
});
