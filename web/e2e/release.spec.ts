import { test, expect } from "@playwright/test";
/** Step-5 regression tests: idempotent frame ids on the SSE bridge, session pre-warm, no-buffering headers, early/provisional plan. */
const CHAT = { threadId: `rel-${Date.now()}`, messages: [{ role: "user", content: "In one sentence, what does Fervo Energy do?" }], context: { pluginIds: ["plugin-1722260873", "plugin-1741871229"], externalUserId: "INV-001" } };

test.describe("release gates (bridge)", () => {
  test("every SSE frame carries a monotonic seq — no duplicates, no gaps, [DONE] last", async ({ request }) => {
    test.setTimeout(240_000);
    const r = await request.post("/api/chat", { data: CHAT, timeout: 200_000 });
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/event-stream");
    expect(r.headers()["cache-control"]).toContain("no-transform");
    expect(r.headers()["content-encoding"] ?? "identity").toBe("identity");
    const body = await r.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    expect(lines[lines.length - 1]).toBe("[DONE]");
    const seqs = lines.filter((l) => l !== "[DONE]").map((l) => (JSON.parse(l) as { seq?: number }).seq).filter((x): x is number => typeof x === "number");
    expect(seqs.length).toBeGreaterThan(5);
    expect(new Set(seqs).size, "no duplicate seq").toBe(seqs.length);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i], `gap before seq ${seqs[i]}`).toBe(seqs[i - 1] + 1);
  });

  test("session pre-warm answers with a session id and the shell marks itself ready", async ({ page, request }) => {
    const r = await request.get("/api/chat/prewarm?externalUserId=INV-001&pluginIds=plugin-1722260873");
    expect(r.status()).toBe(200);
    const j = (await r.json()) as { ok: boolean; sessionId?: string };
    expect(j.ok).toBe(true); expect(j.sessionId ?? "").toMatch(/^[A-Za-z0-9]{12,}$/);
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("chat-shell")).toHaveAttribute("data-prewarm", "ready", { timeout: 15_000 });
  });

  test("first turn reuses the pre-warmed session (ondemand.session viaHeader=true)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/chat?skip=1");
    await expect(page.getByTestId("chat-shell")).toHaveAttribute("data-prewarm", "ready", { timeout: 15_000 });
    const frames: string[] = [];
    await page.route("**/api/chat", async (route) => { const res = await route.fetch(); const txt = await res.text(); frames.push(txt); await route.fulfill({ response: res, body: txt, headers: { ...res.headers(), "content-encoding": "identity" } }); });
    const ta = page.locator("textarea:visible").first(); await ta.click(); await ta.fill("One sentence: what is Fervo Energy?"); await ta.press("Enter");
    await expect.poll(() => frames.length, { timeout: 200_000 }).toBeGreaterThan(0);
    const sess = frames[0].split("\n").filter((l) => l.includes("ondemand.session")).map((l) => JSON.parse(l.slice(5)) as { value: { viaHeader: boolean; created: boolean } })[0];
    expect(sess, "ondemand.session frame present").toBeTruthy();
    expect(sess.value.viaHeader, "session supplied by the client (pre-warmed), not created in-stream").toBe(true);
  });
});
