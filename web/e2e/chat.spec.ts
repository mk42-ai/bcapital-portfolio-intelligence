import { test, expect } from "./helpers";

const QUESTION = "What did Fervo Energy announce recently?";
const POLL_MS = 250;
const MAX_MS = 240_000;
const FIRST_ACTIVITY_MS = 5_000;

test.describe("Analyst chat — streaming", () => {
  test.skip(process.env.SKIP_CHAT === "1", "SKIP_CHAT=1");

  test("answer streams incrementally via SSE with plugin activity and sources", async ({ page }, testInfo) => {
    test.setTimeout(MAX_MS + 60_000);
    // Network-level probe: wrap window.fetch for /api/chat BEFORE the app boots. The response is cloned and the clone's body
    // is read chunk-by-chunk, recording performance.now() (relative to the fetch call) + the chunk text into window.__chunks.
    // Playwright's page.route cannot observe a streaming body incrementally, hence the in-page wrapper.
    await page.addInitScript(() => {
      const w = window as unknown as { __chunks: { t: number; bytes: number; text: string }[]; __chunkMeta: { fetchAt: number; headersAt: number | null; done: boolean; error: string | null } };
      w.__chunks = [];
      w.__chunkMeta = { fetchAt: 0, headersAt: null, done: false, error: null };
      const orig = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!/\/api\/chat(\?|$)/.test(url)) return orig(input, init); // the pre-warm GET (/api/chat/prewarm) is not a turn
        const t0 = performance.now();
        w.__chunkMeta.fetchAt = t0;
        const res = await orig(input, init);
        w.__chunkMeta.headersAt = performance.now() - t0;
        if (res.body) {
          const reader = res.clone().body!.getReader();
          const dec = new TextDecoder();
          (async () => {
            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                w.__chunks.push({ t: performance.now() - t0, bytes: value.byteLength, text: dec.decode(value, { stream: true }) });
              }
              w.__chunkMeta.done = true;
            } catch (e) {
              w.__chunkMeta.error = String(e);
            }
          })();
        }
        return res;
      };
    });
    await page.goto("/chat?skip=1");
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await expect(page.locator('img[data-testid="brand-logo"]').first()).toBeAttached();

    const responseP = page.waitForResponse((r) => /\/api\/chat(\?|$)/.test(r.url()) && r.request().method() === "POST", { timeout: 30_000 }); // not the /api/chat/prewarm GET (JSON)
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
    // Product change: a Perplexity upstream failure (currently "Not enough credits" on this account) is surfaced as a
    // `chat-error` banner with data-error-code="plugin_error" while the answer still streams. That is the designed
    // behaviour, not a transport failure, so it is recorded instead of failing the spec; any other error code still fails.
    let pluginErrorCode: string | null = null;
    const submit = page.locator("button.openui-agent-thread-composer__submit-button");

    const plugin = page.locator('[data-testid="plugin-activity"]');
    const errBanner = page.locator('[data-testid="chat-error"]');

    while (Date.now() - t0 < MAX_MS) {
      // One cheap DOM read per sample (locators auto-wait and re-resolve, which under streaming re-renders made samples ~1 s apart).
      const { len, hasPlugin, errCount, errCode, label } = await page.evaluate(() => {
        const a = document.querySelectorAll(".oiu-assistant"); const last = a[a.length - 1] as HTMLElement | undefined;
        const errEl = document.querySelector<HTMLElement>('[data-testid="chat-error"]');
        return {
          len: last ? last.innerText.length : 0,
          hasPlugin: !!document.querySelector('[data-testid="plugin-activity"]'),
          errCount: document.querySelectorAll('[data-testid="chat-error"]').length,
          errCode: errEl?.dataset.errorCode ?? null,
          label: document.querySelector("button.openui-agent-thread-composer__submit-button")?.getAttribute("aria-label") ?? null,
        };
      });
      const t = Date.now() - t0;
      if (errCount > 0 && errCode !== "plugin_error") {
        const msg = await errBanner.first().innerText().catch(() => "");
        throw new Error(`chat error banner (${errCode}) appeared at +${t}ms: ${msg}`);
      }
      if (errCount > 0 && pluginErrorCode === null) {
        pluginErrorCode = errCode;
        testInfo.annotations.push({ type: "plugin-error", description: (await errBanner.first().innerText().catch(() => "")).slice(0, 200) });
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

    // 3b. network level: per-chunk timestamps recorded by the injected fetch wrapper
    const net = await page.evaluate(() => {
      const w = window as unknown as { __chunks: { t: number; bytes: number; text: string }[]; __chunkMeta: { fetchAt: number; headersAt: number | null; done: boolean; error: string | null } };
      return { meta: w.__chunkMeta, chunks: w.__chunks.map((c) => ({ t: c.t, bytes: c.bytes })), text: w.__chunks.map((c) => c.text).join("") };
    });
    console.log(`[chat-stream] net: headersAt=${net.meta.headersAt?.toFixed(0)}ms chunks=${net.chunks.length} first=${net.chunks[0]?.t.toFixed(0)}ms last=${net.chunks.at(-1)?.t.toFixed(0)}ms done=${net.meta.done} err=${net.meta.error}`);
    await testInfo.attach("stream-chunks.json", {
      body: JSON.stringify({ meta: net.meta, chunks: net.chunks, frameTypes: [...net.text.matchAll(/"type":"([A-Z_]+)"/g)].map((m) => m[1]) }, null, 2),
      contentType: "application/json",
    });
    expect(net.meta.error, "fetch wrapper read error").toBeNull();
    expect(net.chunks.length, "network chunks received").toBeGreaterThanOrEqual(3);
    expect(net.chunks[0].t, "first network chunk < 5000 ms after fetch()").toBeLessThan(5_000);
    for (let i = 1; i < net.chunks.length; i++) {
      expect(net.chunks[i].t, `chunk[${i}].t > chunk[${i - 1}].t`).toBeGreaterThan(net.chunks[i - 1].t);
    }
    const toolArgsFrame = net.text.split("\n").find((l) => l.includes('"type":"TOOL_CALL_ARGS"')) ?? "";
    expect(toolArgsFrame, "TOOL_CALL_ARGS frame present").not.toBe("");
    // the delta is a JSON string embedded in JSON, so the inner quotes are escaped on the wire
    expect(toolArgsFrame.replace(/\\"/g, '"'), 'TOOL_CALL_ARGS carries "query":"What did Fervo').toContain('"query":"What did Fervo');

    // 4. plugin activity card surfaced the tool call
    await expect(plugin.first()).toBeAttached();
    await expect(plugin.first()).toContainText(/Perplexity/i);
    await expect(plugin.first()).toContainText(/Fervo/i);

    // 5. final state: sources (only when the plugin actually searched) + idle composer
    const cardState = await plugin.last().getAttribute("data-state");
    if (pluginErrorCode === null && cardState !== "failed") {
      await expect(page.locator('.oiu-sources a[href^="http"]').first()).toBeAttached({ timeout: 30_000 });
      expect(await page.locator('.oiu-sources a[href^="http"]').count()).toBeGreaterThanOrEqual(1);
    } else {
      expect(cardState, "plugin card ends in failed when Perplexity errored").toBe("failed");
      console.log(`[chat-stream] plugin_error surfaced (card=${cardState}); sources assertion skipped`);
    }
    await expect(submit).toHaveAttribute("aria-label", "Send message", { timeout: 30_000 });
    const finalText = await page.locator(".oiu-assistant").last().innerText().catch(() => "");
    if (pluginErrorCode === null && cardState !== "failed") expect(finalText.length).toBeGreaterThan(40);
    else expect(await page.locator('[data-testid="chat-error"], [data-testid="plugin-error-card"], [data-testid="plugin-activity"][data-state="failed"]').count(), "honest error card shown when the plugin failed (no fabricated prose required)").toBeGreaterThan(0);
    testInfo.annotations.push({ type: "answer-excerpt", description: finalText.slice(0, 300) });
  });
});
