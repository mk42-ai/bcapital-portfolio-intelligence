import { test, expect, hasKey } from "./helpers";

/**
 * Voice mode (Agents 21–27). The live OnDemand audio services were probed on 2026-10-10 (web/proof/voice/probe.json: TTS 200, 3.19 s mp3;
 * STT round trip 200 with the identical transcript). These specs assert the relay contract and the UI states without faking audio.
 */
test.describe("voice", () => {
  test("voice relay: POST /api/voice/tts answers ok:true + https audioUrl, or an honest not_subscribed", async ({ request }, testInfo) => {
    test.skip(!hasKey(), "ONDEMAND_API_KEY not set in this runner");
    const r = await request.post("/api/voice/tts", { data: { text: "Hello from B Capital." } });
    const j = (await r.json()) as { ok: boolean; audioUrl?: string; code?: string; message?: string; ms?: number };
    if (j.ok) {
      expect(r.status()).toBe(200);
      expect(j.audioUrl).toMatch(/^https:\/\//);
      testInfo.annotations.push({ type: "voice", description: `TTS live: ${new URL(j.audioUrl!).host} in ${j.ms} ms` });
    } else {
      expect(j.code).toBe("not_subscribed");
      expect(r.status()).toBe(400);
      testInfo.annotations.push({ type: "voice", description: `BLOCKED_BY_EXTERNAL_DEPENDENCY: ${j.message}` });
    }
    // bad request shape
    const bad = await request.post("/api/voice/tts", { data: { text: "" } });
    expect(bad.status()).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe("bad_request");
  });

  test("voice relay: expired/unknown clip token is a 404 and STT rejects a non-audio form", async ({ request }) => {
    const miss = await request.get("/api/voice/clip/deadbeefdeadbeefdeadbeef0000");
    expect(miss.status()).toBe(404);
    const bad = await request.post("/api/voice/stt", { multipart: { note: "no audio here" } });
    expect(bad.status()).toBe(400);
  });

  test("voice UI: mic button in the composer → listening (fake mic) or an honest error; orb state matches", async ({ page, context }, testInfo) => {
    await context.grantPermissions(["microphone"]);
    await page.goto("/chat?skip=1");
    const mic = page.getByTestId("voice-mic");
    await expect(mic).toBeVisible({ timeout: 30_000 });
    // Rendered in the app composer row, BEFORE the send button (Attach · textarea · mic · send are siblings).
    const order = await page.evaluate(() => {
      const bar = document.querySelector("[data-testid=composer-row]");
      const mic = bar?.querySelector("[data-testid=voice-mic]"); const send = bar?.querySelector("[data-testid=composer-send]");
      return mic && send ? (mic.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING ? "mic-first" : "send-first") : "missing";
    });
    expect(order).toBe("mic-first");
    await expect(mic).toHaveAttribute("data-state", "idle");
    await mic.click();
    await expect(mic).toHaveAttribute("data-state", /^(listening|error)$/, { timeout: 10_000 });
    const state = await mic.getAttribute("data-state");
    const orb = page.getByTestId("voice-orb");
    await expect(orb).toBeVisible();
    await expect(orb).toHaveAttribute("data-state", state!);
    if (state === "error") {
      await expect(page.getByTestId("voice-error")).toBeVisible();
      testInfo.annotations.push({ type: "voice", description: `mic error: ${await page.getByTestId("voice-error").innerText()}` });
    } else {
      testInfo.annotations.push({ type: "voice", description: "fake mic → listening" });
      // Escape stops listening and keeps focus on the mic.
      await page.keyboard.press("Escape");
      await expect(mic).toHaveAttribute("data-state", "idle", { timeout: 5_000 });
      await expect(mic).toBeFocused();
    }
    // Mode toggle + voice select present, brand green only (no blue computed colours on the panel).
    await expect(page.getByTestId("voice-mode")).toBeVisible();
    await expect(page.getByTestId("voice-select")).toHaveValue("alloy");
    const blue = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-testid=voice-panel], [data-testid=voice-panel] *")) as HTMLElement[];
      return els.some((el) => { const cs = getComputedStyle(el); return [cs.color, cs.backgroundColor, cs.borderColor].some((c) => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m && +m[3] > 180 && +m[3] > +m[1] + 60 && +m[3] > +m[2] + 40; }); });
    });
    expect(blue).toBe(false);
  });

  test("voice a11y: caption strip is a polite live region and the mic has an accessible name", async ({ page, context }) => {
    await context.grantPermissions(["microphone"]);
    await page.goto("/chat?skip=1");
    const mic = page.getByTestId("voice-mic");
    await expect(mic).toBeVisible({ timeout: 30_000 });
    expect((await mic.getAttribute("aria-label")) ?? "").not.toBe("");
    await mic.click();
    const caption = page.getByTestId("voice-caption");
    await expect(caption).toBeAttached({ timeout: 10_000 });
    await expect(caption).toHaveAttribute("aria-live", "polite");
    await expect(caption).toHaveAttribute("aria-atomic", "true");
    await page.keyboard.press("Escape");
  });
});
