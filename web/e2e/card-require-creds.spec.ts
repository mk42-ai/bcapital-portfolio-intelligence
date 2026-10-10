import { test, expect } from "./helpers";

/**
 * Agent 12 — require_creds interactive card.
 * The SSE bridge is mocked (page.route on POST /api/chat) with the client frame schema documented in web/src/app/api/chat/route.ts,
 * emitting CUSTOM ondemand.session then CUSTOM ondemand.require_creds. POST /api/chat/creds is also mocked so the test captures the
 * exact body the card sends, and the spec proves the typed secret never lands in localStorage / sessionStorage.
 */
const SECRET = "zq-9f8e7d6c-SECRET-5b4a";

function sseBody(): string {
  const threadId = "t-creds", runId = "r-creds";
  let seq = 0;
  const f = (o: Record<string, unknown>) => `data: ${JSON.stringify({ seq: ++seq, ...o })}\n\n`;
  return [
    f({ type: "RUN_STARTED", threadId, runId }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "connecting", elapsedMs: 5 } }),
    f({ type: "CUSTOM", name: "ondemand.session", value: { sessionId: "sess-test-2", created: true, viaHeader: false, endpointId: "predefined-deepseek-flash", reasoningMode: "medium", pluginIds: ["plugin-x"] } }),
    f({ type: "CUSTOM", name: "ondemand.status", value: { phase: "planning", elapsedMs: 30 } }),
    f({ type: "CUSTOM", name: "ondemand.require_creds", value: { pluginId: "plugin-x", service: "Acme", fields: [{ key: "api_key", label: "API key" }] } }),
    // Stream intentionally left open-ended by the bridge while the user acts; we close it so the mock terminates cleanly.
    f({ type: "RUN_FINISHED", threadId, runId }),
    "data: [DONE]\n\n",
  ].join("");
}

test.describe("require_creds card", () => {
  test("renders illustration + password field, posts to /api/chat/creds with sessionId, never stores the secret", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    let captured: { sessionId?: string; pluginId?: string | null; cancelled?: boolean; fields?: { key: string; value: string }[] } | null = null;
    await page.route((u) => /\/api\/chat\/creds(\?|$)/.test(u.href), async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      captured = route.request().postDataJSON();
      await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, status: 200 }) });
    });
    await page.route((u) => /\/api\/chat(\?|$)/.test(u.href), async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-ondemand-session": "sess-test-2" }, body: sseBody() });
    });

    await page.goto("/chat?skip=1");
    const ta = page.locator("textarea:visible").first();
    await expect(ta).toBeVisible({ timeout: 30_000 });
    await ta.click(); await ta.fill("Run the Acme plugin"); await ta.press("Enter");

    const card = page.getByTestId("card-require-creds");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText("Acme needs a credential to continue");
    const art = card.getByTestId("card-require-creds-art");
    await expect(art).toHaveAttribute("src", /\/assets\/require-creds-256\.webp$/);
    expect(await art.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);

    const form = card.getByTestId("creds-form");
    const input = form.getByTestId("creds-input-api_key");
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("autocomplete", "off");
    await input.fill(SECRET);
    await form.getByTestId("creds-send").click();

    await expect(page.getByTestId("prompt-done")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => captured, { timeout: 10_000 }).not.toBeNull();
    expect(captured!.sessionId).toBe("sess-test-2");
    expect(captured!.pluginId).toBe("plugin-x");
    expect(captured!.cancelled).toBe(false);
    expect(captured!.fields?.[0]?.key).toBe("api_key");
    expect(captured!.fields?.[0]?.value).toBe(SECRET);

    // The secret must not survive in any browser storage (persistence/draft stores serialise everything they keep).
    const storage = await page.evaluate(() => {
      const dump = (s: Storage) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`).join("\n");
      return { local: dump(localStorage), session: dump(sessionStorage) };
    });
    expect(storage.local).not.toContain(SECRET);
    expect(storage.session).not.toContain(SECRET);
    // …nor in the DOM after submit.
    expect(await page.content()).not.toContain(SECRET);
  });
});
