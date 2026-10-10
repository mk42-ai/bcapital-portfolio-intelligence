import { test, expect } from "./helpers";

/**
 * Agent 10 — compact publisher-first source row above the answer.
 * The SSE bridge is mocked (page.route on POST /api/chat) with the exact client frame schema documented in web/src/app/api/chat/route.ts,
 * carrying 7 plugin sources, so the assertions do not depend on upstream credits or live data.
 */
const SOURCES = [
  { url: "https://www.reuters.com/technology/fervo-energy-raises", title: "Fervo Energy raises new funding", sourceName: "reuters.com" },
  { url: "https://techcrunch.com/2025/01/fervo-geothermal", title: "Fervo's geothermal bet", sourceName: "techcrunch.com" },
  { url: "https://www.bloomberg.com/news/articles/fervo", title: "Fervo Energy valuation", sourceName: "bloomberg.com" },
  { url: "https://fervoenergy.com/about", title: "About Fervo", sourceName: "fervoenergy.com" },
  { url: "https://www.crunchbase.com/organization/fervo-energy", title: "Fervo Energy — Crunchbase", sourceName: "crunchbase.com" },
  { url: "https://pitchbook.com/profiles/company/fervo", title: "Fervo Energy — PitchBook", sourceName: "pitchbook.com" },
  { url: "https://www.wsj.com/articles/fervo-energy", title: "Fervo Energy in the WSJ", sourceName: "wsj.com" },
];

function sseBody(): string {
  const threadId = "t-src", runId = "r-src", messageId = "m-src";
  let seq = 0;
  const f = (o: Record<string, unknown>) => `data: ${JSON.stringify({ seq: ++seq, ...o })}\n\n`;
  const answer = "Fervo Energy is a next-generation geothermal developer. It raised capital from several investors [1] and expanded its Cape Station project [2].";
  return [
    f({ type: "RUN_STARTED", threadId, runId }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "connecting", elapsedMs: 5 } }),
    f({ type: "CUSTOM", name: "ondemand.session", value: { sessionId: "s-mock", created: false, viaHeader: true, endpointId: "predefined-deepseek-flash", reasoningMode: "medium", pluginIds: ["plugin-1722260873"] } }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "researching", elapsedMs: 40 } }),
    f({ type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "Perplexity", parentMessageId: messageId }),
    f({ type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: JSON.stringify({ plugin: "Perplexity", pluginId: "plugin-1722260873", query: "What is Fervo Energy?" }) }),
    f({ type: "TOOL_CALL_END", toolCallId: "tc1" }),
    f({ type: "CUSTOM", name: "ondemand.sources", value: { messageId, pluginId: "plugin-1722260873", pluginName: "Perplexity", partial: false, sources: SOURCES } }),
    f({ type: "TOOL_CALL_RESULT", messageId: "tr1", toolCallId: "tc1", content: JSON.stringify({ status: "ok", plugin: "Perplexity", sources: SOURCES.length }) }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "answering", elapsedMs: 80 } }),
    f({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }),
    ...answer.split(/(?<=\. )/).map((delta) => f({ type: "TEXT_MESSAGE_CONTENT", messageId, delta })),
    f({ type: "TEXT_MESSAGE_END", messageId }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "done", elapsedMs: 120 } }),
    f({ type: "RUN_FINISHED", threadId, runId }),
    "data: [DONE]\n\n",
  ].join("");
}

test.describe("compact source row", () => {
  test("7 sources → one ≤40 px row, 5 chips + '+2' that expands inline; the answer starts above the fold", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route((u) => /\/api\/chat(\?|$)/.test(u.href), async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-ondemand-session": "s-mock" }, body: sseBody() });
    });
    await page.goto("/chat?skip=1");
    const ta = page.locator("textarea:visible").first();
    await expect(ta).toBeVisible({ timeout: 30_000 });
    await ta.click(); await ta.fill("What is Fervo Energy?"); await ta.press("Enter");

    // Final (settled) assistant message with the 7 plugin sources.
    const msg = page.getByTestId("assistant-message").last();
    const rail = msg.getByTestId("sources-rail");
    await expect(rail).toHaveAttribute("data-count", "7", { timeout: 60_000 });
    await expect(rail).toHaveAttribute("data-expanded", "false");

    // Collapsed: 5 visible publisher chips + a "+2" expander, total row height ≤ 40 px.
    const links = rail.getByTestId("source-link");
    await expect(links).toHaveCount(5);
    const first = links.first();
    await expect(first).toHaveAttribute("href", SOURCES[0].url);
    await expect(first).toHaveAttribute("target", "_blank");
    await expect(first).toHaveAttribute("rel", /noopener/);
    await expect(first).toContainText("reuters.com");
    const more = rail.getByTestId("sources-more");
    await expect(more).toHaveText("+2");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    const box = await rail.boundingBox();
    expect(box, "sources-rail is laid out").toBeTruthy();
    expect(box!.height, "collapsed source row height").toBeLessThanOrEqual(40);

    // The answer text starts within the 1440×900 viewport (y < 900).
    const md = msg.getByTestId("answer-markdown");
    await expect(md).toContainText("Fervo Energy");
    const mdBox = await md.boundingBox();
    expect(mdBox, "answer markdown is laid out").toBeTruthy();
    expect(mdBox!.y, "first answer text node top is above the fold").toBeLessThan(900);
    // Order inside the message body: source row above the answer text.
    expect(box!.y, "source row sits above the answer").toBeLessThan(mdBox!.y);

    // "+2" expands inline → all 7 chips, aria-expanded=true.
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(rail).toHaveAttribute("data-expanded", "true");
    await expect(links).toHaveCount(7);
    await expect(links.nth(6)).toHaveAttribute("href", SOURCES[6].url);
    // Collapses again.
    await more.click();
    await expect(links).toHaveCount(5);
  });
});
