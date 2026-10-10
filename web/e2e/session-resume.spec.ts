import { test, expect } from "./helpers";

/**
 * Session-resume fallback route (Agent 14): POST /api/chat/resume forwards a sync query to the SAME OnDemand session.
 * API-only — no UI dependency, no live OnDemand data needed.
 */
test.describe("Session resume (/api/chat/resume)", () => {
  test("empty body → 400 JSON with ok:false", async ({ request }) => {
    const r = await request.post("/api/chat/resume", { data: {} });
    expect(r.status()).toBe(400);
    expect(r.headers()["content-type"] ?? "").toContain("application/json");
    const j = (await r.json()) as { ok?: boolean; error?: string };
    expect(j.ok).toBe(false);
    expect(typeof j.error).toBe("string");
  });

  test("non-JSON body → 400 JSON with ok:false", async ({ request }) => {
    const r = await request.post("/api/chat/resume", { data: "not json", headers: { "content-type": "text/plain" } });
    expect(r.status()).toBe(400);
    const j = (await r.json()) as { ok?: boolean };
    expect(j.ok).toBe(false);
  });

  test("bad kind / missing text → 400", async ({ request }) => {
    const r1 = await request.post("/api/chat/resume", { data: { sessionId: "abcdef123456", text: "Done", kind: "nope" } });
    expect(r1.status()).toBe(400);
    const r2 = await request.post("/api/chat/resume", { data: { sessionId: "abcdef123456", kind: "awaiting_browser_action" } });
    expect(r2.status()).toBe(400);
  });

  test("bogus sessionId → 4xx/5xx JSON with ok:false (no crash)", async ({ request }) => {
    const r = await request.post("/api/chat/resume", { data: { sessionId: "000000000000000000000000", text: "Done — I completed the browser action.", kind: "awaiting_browser_action" }, timeout: 120_000 });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(600);
    expect(r.headers()["content-type"] ?? "").toContain("application/json");
    const j = (await r.json()) as { ok?: boolean; status?: number; error?: string };
    expect(j.ok).toBe(false);
    expect(typeof j.status).toBe("number");
    expect(typeof j.error).toBe("string");
  });
});
