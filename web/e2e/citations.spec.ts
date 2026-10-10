/**
 * citations.spec.ts — inline citation chips render LIVE from a mocked SSE stream (Agent 9).
 * POST /api/chat is intercepted with page.route and answered with a scripted AG-UI event stream (same frame shapes as
 * web/src/app/api/chat/route.ts, incl. `seq`): a CUSTOM ondemand.sources frame arrives BEFORE the answer text, the text carries a
 * numeric marker `[1]` (→ plugin source) and a bare URL (→ text source). No OnDemand key or network is needed.
 */
import { test, expect } from "./helpers";

const COMPOSER = '[data-testid="chat-shell"] textarea';
const CHIP = '[data-testid="citation-chip"]';
const INK = "rgb(4, 120, 87)"; // #047857 brand ink

function mockSse(threadId: string) {
  const runId = "run-mock-1"; const messageId = "msg-mock-1"; let seq = 0;
  const f = (o: Record<string, unknown>) => `data: ${JSON.stringify({ seq: ++seq, ...o })}\n\n`;
  const deltas = ["Claim one ", "[1]", ". Claim two ", "https://example.org/b", " ."];
  return [
    f({ type: "RUN_STARTED", threadId, runId }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "researching", elapsedMs: 5 } }),
    f({ type: "CUSTOM", name: "ondemand.sources", value: { elapsedMs: 10, sources: [{ url: "https://example.com/a", title: "Example A", sourceName: "example.com" }], pluginId: "plugin-1722260873", pluginName: "Perplexity", partial: false } }),
    f({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }),
    ...deltas.map((delta) => f({ type: "TEXT_MESSAGE_CONTENT", messageId, delta })),
    f({ type: "TEXT_MESSAGE_END", messageId }),
    f({ type: "RUN_FINISHED", threadId, runId }),
    "data: [DONE]\n\n",
  ].join("");
}

test.describe("Inline citations — live SSE", () => {
  test("chips render from ondemand.sources + text URLs, brand green, hover card shows the title", async ({ page }) => {
    await page.route(/\/api\/chat(\?|$)/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      let threadId = "thread-mock";
      try { threadId = (JSON.parse(route.request().postData() ?? "{}") as { threadId?: string }).threadId ?? threadId; } catch { /* keep default */ }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "x-ondemand-session": "6aca0a89261cbe2340484665" },
        body: mockSse(threadId),
      });
    });
    await page.route(/\/api\/chat\/prewarm/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "6aca0a89261cbe2340484665", pluginIds: ["plugin-1722260873"] }) }));

    await page.goto("/chat?skip=1");
    const textarea = page.locator(COMPOSER).first();
    await expect(textarea).toBeVisible({ timeout: 30_000 });
    await textarea.fill("Citation chip smoke test");
    await textarea.press("Enter");

    // ≥2 chips: [1] → plugin source (example.com/a), bare URL → example.org/b
    const chips = page.locator(CHIP);
    await expect.poll(async () => chips.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    const hrefs = await chips.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    expect(hrefs, "chip hrefs").toContain("https://example.com/a");
    expect(hrefs, "chip hrefs").toContain("https://example.org/b");
    const ns = await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-n")));
    expect(ns, "numbered in text order").toEqual(expect.arrayContaining(["1", "2"]));

    // Brand green, 18 px pill, opens in a new tab, keyboard focusable
    const first = chips.first();
    await expect(first).toBeVisible();
    const style = await first.evaluate((e) => { const cs = getComputedStyle(e); return { color: cs.color, border: cs.borderTopColor, h: Math.round(e.getBoundingClientRect().height), radius: cs.borderTopLeftRadius, target: e.getAttribute("target"), rel: e.getAttribute("rel"), tabbable: (e as HTMLElement).tabIndex >= 0 }; });
    expect(style.color, "ink #047857").toBe(INK);
    expect(style.border, "border #0AC985").toBe("rgb(10, 201, 133)");
    expect(style.h, "18 px tall").toBe(18);
    expect(style.radius).toBe("999px");
    expect(style.target).toBe("_blank");
    expect(style.rel).toContain("noopener");
    expect(style.tabbable).toBe(true);

    // Hover card: favicon · title · host — the plugin title "Example A" for the [1] chip
    const chipA = page.locator(`${CHIP}[href="https://example.com/a"]`).first();
    await chipA.hover();
    const preview = chipA.locator('[data-testid="citation-preview"]');
    await expect(preview).toContainText("Example A");
    await expect(preview).toContainText("example.com");
    await expect.poll(() => preview.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
    await expect(preview.locator("img")).toHaveAttribute("src", /\/api\/favicon\?host=example\.com/);
  });
});
