import { test, expect } from "./helpers";

/**
 * Voice orb (Agent 5): the orb renders one of the three local orb illustrations as its poster and its rings are brand green only.
 * Runs with --use-fake-device-for-media-stream / --use-fake-ui-for-media-stream (playwright.config.ts), so clicking the mic either
 * starts listening (fake device) or lands in an honest `error` / `idle` state — all three are accepted. Soft-skips when the mic is absent.
 */
const ORB_STATES = ["listening", "error", "idle", "thinking", "speaking"];

/** "rgb(r, g, b)" / "rgba(...)" → [r,g,b] or null (none / transparent / unparsable). */
function parseRgb(s: string | null | undefined): [number, number, number] | null {
  if (!s) return null;
  const m = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i.exec(s) ?? /rgba?\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

test.describe("voice orb", () => {
  test("mic click shows the orb with a local orb-asset poster and no blue ring", async ({ page }, testInfo) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    const mic = page.locator("[data-testid=voice-mic]").first();
    const hasMic = await mic.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false);
    test.skip(!hasMic, "voice-mic not rendered on /chat (voice dock absent in this build)");

    await mic.click();
    const orb = page.locator("[data-testid=voice-orb]").first();
    await expect(orb).toBeVisible({ timeout: 15_000 });

    // data-state is one of the known orb states (listening with the fake device, else an honest error/idle).
    await expect.poll(async () => (await orb.getAttribute("data-state")) ?? "", { timeout: 10_000 }).toMatch(/^(listening|error|idle|thinking|speaking)$/);
    const state = (await orb.getAttribute("data-state")) ?? "";
    expect(ORB_STATES).toContain(state);
    testInfo.annotations.push({ type: "voice-orb", description: `state after mic click: ${state}` });

    // Poster: local orb asset (never a remote/blob URL) and actually decoded.
    const poster = orb.locator("img.voice-orb__poster").first();
    await expect(poster).toHaveAttribute("src", /^\/assets\/voice-orb-/);
    const src = (await poster.getAttribute("src")) ?? "";
    expect(src.startsWith("/assets/voice-orb-")).toBe(true);
    if (state === "listening" || state === "speaking") expect(src).toContain("voice-orb-listening");
    else if (state === "thinking") expect(src).toContain("voice-orb-thinking");
    else expect(src).toContain("voice-orb-idle");
    await expect.poll(() => poster.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);

    // Rings: computed stroke must never be blue-dominant (brand green #0AC985 / ink #047857 only).
    const rings = orb.locator(".voice-orb__ring");
    const n = await rings.count();
    expect(n).toBeGreaterThan(0);
    const strokes = await rings.evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
    for (const stroke of strokes) {
      const rgb = parseRgb(stroke);
      if (!rgb) continue; // "none" / transparent are fine (not blue)
      const [r, g, b] = rgb;
      expect(b, `ring stroke ${stroke} must not be blue-dominant`).toBeLessThanOrEqual(r + g);
      expect(b, `ring stroke ${stroke} must not be more blue than green`).toBeLessThanOrEqual(g);
    }
    // Orb box is sized by --orb-size (44 px panel / 28 px mic) and square.
    const box = await orb.boundingBox();
    expect(box).not.toBeNull();
    if (box) { expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1); expect(box.width).toBeGreaterThanOrEqual(24); }
  });
});
