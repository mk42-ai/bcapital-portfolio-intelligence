import { test, expect } from "./helpers";

/**
 * Agent 11 — awaiting_input interactive card.
 * The SSE bridge is mocked with page.route (POST /api/chat) using the client frame schema documented in web/src/app/api/chat/route.ts.
 * Turn 1 emits CUSTOM ondemand.session {sessionId:"sess-test-1"} and CUSTOM ondemand.awaiting_input {prompt, options} after RUN_STARTED and
 * keeps the stream open ~2 s before RUN_FINISHED (an init-script fetch shim re-emits the fulfilled frames with that pause, since route.fulfill
 * cannot trickle a body) so the live card is visible. Turn 2 (the resume) must be a second POST whose last user message contains "Fervo"
 * and whose context.sessionId is the same session id.
 */
const SESSION = "sess-test-1";

function frames(threadId: string, runId: string, prompt: boolean): string {
  let seq = 0;
  const f = (o: Record<string, unknown>) => `data: ${JSON.stringify({ seq: ++seq, ...o })}\n\n`;
  const messageId = `${runId}-m`;
  const out = [
    f({ type: "RUN_STARTED", threadId, runId }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "connecting", elapsedMs: 5 } }),
    f({ type: "CUSTOM", name: "ondemand.session", value: { sessionId: SESSION, created: !prompt ? false : true, viaHeader: !prompt, endpointId: "predefined-deepseek-flash", reasoningMode: "medium", pluginIds: ["plugin-1722260873"] } }),
  ];
  if (prompt) {
    out.push(f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "awaiting-input", elapsedMs: 30 } }));
    out.push(f({ type: "CUSTOM", name: "ondemand.awaiting_input", value: { prompt: "Which company?", options: ["Fervo", "Writer"] } }));
  } else {
    out.push(f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "answering", elapsedMs: 30 } }));
    out.push(f({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }));
    out.push(f({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Fervo Energy is a geothermal developer." }));
    out.push(f({ type: "TEXT_MESSAGE_END", messageId }));
  }
  out.push(f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "done", elapsedMs: 120 } }));
  out.push(f({ type: "RUN_FINISHED", threadId, runId }));
  out.push("data: [DONE]\n\n");
  return out.join("");
}

test.describe("awaiting_input card", () => {
  test("renders illustration + option chips; Submit resumes the SAME session with the chosen option", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Fetch shim: re-emit the route-fulfilled SSE body frame by frame and hold the stream open ~2 s before RUN_FINISHED.
    await page.addInitScript(() => {
      const orig = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (!/\/api\/chat(\?|$)/.test(url) || method !== "POST") return orig(input, init);
        const res = await orig(input, init);
        const text = await res.text();
        const parts = text.split("\n\n").filter(Boolean);
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(ctrl) {
            for (const p of parts) {
              if (p.includes('"RUN_FINISHED"')) await new Promise((r) => setTimeout(r, 2000));
              ctrl.enqueue(enc.encode(p + "\n\n"));
            }
            ctrl.close();
          },
        });
        return new Response(stream, { status: res.status, headers: res.headers });
      };
    });

    const posts: { body: string }[] = [];
    await page.route((u) => /\/api\/chat(\?|$)/.test(u.href), async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.fallback();
      posts.push({ body: req.postData() ?? "" });
      const n = posts.length;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-ondemand-session": SESSION },
        body: frames(`t-ai-${n}`, `r-ai-${n}`, n === 1),
      });
    });

    await page.goto("/chat?skip=1");
    const ta = page.locator("textarea:visible").first();
    await expect(ta).toBeVisible({ timeout: 30_000 });
    await ta.click(); await ta.fill("Tell me about the company"); await ta.press("Enter");

    // Live card with the local, transparent illustration (72 px, left) and the question + chips.
    const card = page.getByTestId("card-awaiting-input");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("clarification-form")).toBeVisible();
    await expect(card).toContainText("Which company?");
    const art = card.getByTestId("card-awaiting-input-art");
    await expect(art).toHaveAttribute("src", /^\/assets\/awaiting-input/);
    await expect.poll(() => art.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    const box = await art.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(56);
    expect(box?.width ?? 0).toBeLessThanOrEqual(72);

    // Submit is disabled until an answer exists; picking "Fervo" turns the chip brand-green and enables Submit.
    const submit = card.getByTestId("card-awaiting-input-submit");
    await expect(submit).toBeDisabled();
    const fervo = card.getByRole("button", { name: "Fervo" });
    await fervo.click();
    await expect(fervo).toHaveAttribute("aria-pressed", "true");
    await expect(fervo).toHaveCSS("border-color", "rgb(10, 201, 133)");
    await expect(submit).toBeEnabled();

    const second = page.waitForRequest((r) => r.method() === "POST" && /\/api\/chat(\?|$)/.test(r.url()) && r.postData() !== posts[0]?.body, { timeout: 30_000 });
    await submit.click();
    const req = await second;
    const body = JSON.parse(req.postData() ?? "{}") as { messages?: { role: string; content: unknown }[]; context?: { sessionId?: string } };
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
    expect(String(lastUser?.content ?? "")).toContain("Fervo");
    expect(body.context?.sessionId).toBe(SESSION);

    // The resume turn answers; the card is gone and the answer renders.
    await expect(page.getByTestId("card-awaiting-input")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("assistant-message").last()).toContainText("geothermal", { timeout: 60_000 });
  });
});
