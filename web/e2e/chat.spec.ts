import { test, expect } from "./helpers";

const QUESTION = "What did Fervo Energy announce recently?";
const POLL_MS = 250;
const MAX_MS = 240_000;
const FIRST_ACTIVITY_MS = 5_000;

test.describe("Analyst chat — streaming", () => {
  test.skip(process.env.SKIP_CHAT === "1", "SKIP_CHAT=1");

  test("answer streams incrementally via SSE with plugin activity and sources", async ({ page }, testInfo) => {
    test.setTimeout(MAX_MS + 60_000);
    await page.goto("/chat?skip=1");
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await expect(page.locator('img[data-testid="brand-logo"]').first()).toBeAttached();

    const responseP = page.waitForResponse((r) => r.url().includes("/api/chat"), { timeout: 30_000 });
    await textarea.fill(QUESTION);
    const t0 = Date.now();
    await textarea.press("Enter");

    // 1. transport: the chat route must be a non-cached SSE stream
    const res = await responseP;
    expect(res.status(), "chat route status").toBeLessThan(400);
    const h = res.headers();
    expect(h["content-type"] ?? "", "content-type").toContain("text/event-stream");
    expect((h["cache-control"] ?? "").toLowerCase(), "cache-control").toContain("no-cache");

    // 2. progressive growth of the assistant text, sampled every 250 ms
    const growth: { t: number; len: number; plugin: boolean }[] = [];
    let firstActivityAt: number | null = null;
    let lastLen = 0;
    const submit = page.locator("button.openui-agent-thread-composer__submit-button");

    const plugin = page.locator('[data-testid="plugin-activity"]');
    const errBanner = page.locator('[data-testid="chat-error"]');

    while (Date.now() - t0 < MAX_MS) {
      // One cheap DOM read per sample (locators auto-wait and re-resolve, which under streaming re-renders made samples ~1 s apart).
      const { len, hasPlugin, errCount, label } = await page.evaluate(() => {
        const a = document.querySelectorAll(".oiu-assistant"); const last = a[a.length - 1] as HTMLElement | undefined;
        return {
          len: last ? last.innerText.length : 0,
          hasPlugin: !!document.querySelector('[data-testid="plugin-activity"]'),
          errCount: document.querySelectorAll('[data-testid="chat-error"]').length,
          label: document.querySelector("button.openui-agent-thread-composer__submit-button")?.getAttribute("aria-label") ?? null,
        };
      });
      const t = Date.now() - t0;
      if (errCount > 0) {
        const msg = await errBanner.first().innerText().catch(() => "");
        throw new Error(`chat error banner appeared at +${t}ms: ${msg}`);
      }
      if (firstActivityAt === null && (hasPlugin || len > 0)) firstActivityAt = t;
      if (len > lastLen) {
        growth.push({ t, len, plugin: hasPlugin });
        lastLen = len;
      }
      // The OnDemand research phase (Perplexity) takes 40–80 s before the first token; keep polling while the composer shows Stop.
      if (lastLen === 0 && label === "Cancel message") { await page.waitForTimeout(POLL_MS); continue; }
      if (lastLen > 0 && label === "Send message" && t > 1_500) break; // idle again -> stream finished
      await page.waitForTimeout(POLL_MS);
    }

    console.log(`[chat-stream] firstActivityAt=${firstActivityAt}ms growth=${growth.length} events: ${growth.map((g) => `+${g.t}ms:${g.len}`).join(" ")}`);
    await testInfo.attach("stream-growth-log.json", {
      body: JSON.stringify({ question: QUESTION, firstActivityAt, growth }, null, 2),
      contentType: "application/json",
    });

    // 3. responsiveness + incrementality
    expect(firstActivityAt, "first activity (plugin card or text)").not.toBeNull();
    expect(firstActivityAt!, "first activity within 5 s").toBeLessThanOrEqual(FIRST_ACTIVITY_MS);
    expect(growth.length, "number of growth events").toBeGreaterThanOrEqual(3);
    for (let i = 1; i < growth.length; i++) {
      expect(growth[i].t, `growth[${i}].t > growth[${i - 1}].t`).toBeGreaterThan(growth[i - 1].t);
      expect(growth[i].len).toBeGreaterThan(growth[i - 1].len);
    }

    // 4. plugin activity card surfaced the tool call
    await expect(plugin.first()).toBeAttached();
    await expect(plugin.first()).toContainText(/Perplexity/i);
    await expect(plugin.first()).toContainText(/Fervo/i);

    // 5. final state: sources + idle composer
    await expect(page.locator('.oiu-sources a[href^="http"]').first()).toBeAttached({ timeout: 30_000 });
    expect(await page.locator('.oiu-sources a[href^="http"]').count()).toBeGreaterThanOrEqual(1);
    await expect(submit).toHaveAttribute("aria-label", "Send message", { timeout: 30_000 });
    const finalText = await page.locator(".oiu-assistant").last().innerText();
    expect(finalText.length).toBeGreaterThan(40);
    testInfo.annotations.push({ type: "answer-excerpt", description: finalText.slice(0, 300) });
  });
});
