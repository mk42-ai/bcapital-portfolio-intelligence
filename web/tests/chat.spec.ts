import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { primeSettings, hasKey, captureErrors } from "./helpers";
test.beforeEach(async ({ page }, info) => { const flush = captureErrors(page, info); (page as unknown as { __flush?: () => void }).__flush = flush; });
test.afterEach(async ({ page }) => { (page as unknown as { __flush?: () => void }).__flush?.(); });
test.describe("Chat", () => {
  test("streaming round-trip with company context (real OnDemand when a key is present, mock otherwise)", async ({ page }) => {
    await primeSettings(page); await page.goto("/chat");
    await expect(page.getByRole("heading", { level: 1, name: "Analyst chat" })).toBeVisible();
    await expect(page.getByText(/context 5 companies/)).toBeVisible();
    await expect(page.getByText(hasKey() ? "live · OnDemand" : /mock mode/)).toBeVisible();
    await expect(page.getByText("configuring — deferred")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Use PitchBook" })).toBeDisabled();
    const q = "In one short sentence: what is Fervo Energy's current status? Cite one URL.";
    await page.getByLabel("Message").fill(q); await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(q).first()).toBeVisible(); // optimistic user bubble (useOptimistic may briefly render twice)
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^(submitted…|streaming…)$/ })).toBeVisible();
    const assistant = page.locator("main .card").filter({ has: page.locator("img[src*='chat-avatar']") }).last();
    await expect(page.getByRole("status").filter({ hasText: /^ready$/ })).toBeVisible({ timeout: 170_000 });
    const text = await assistant.innerText(); expect(text.length).toBeGreaterThan(40);
    test.info().annotations.push({ type: "chat-mode", description: hasKey() ? "real OnDemand SSE round-trip" : "mock stream (no key)" });
    test.info().annotations.push({ type: "answer-excerpt", description: text.slice(0, 300) });
    if (hasKey()) { expect(text.toLowerCase()).toMatch(/fervo|geothermal|frvo/); await expect(page.getByRole("list", { name: "Sources" }).first()).toBeVisible(); }
    // regenerate + stop
    await page.getByRole("button", { name: "Regenerate last answer" }).click();
    const stopBtn = page.getByRole("button", { name: "Stop generating" }); await expect(stopBtn).toBeVisible(); await stopBtn.click();
    await expect(page.getByRole("status").filter({ hasText: /^ready$/ })).toBeVisible({ timeout: 30_000 });
    const stopped = await page.getByText("Stopped by you.").count(); test.info().annotations.push({ type: "stop", description: stopped ? "aborted mid-stream" : "stream finished before abort landed" });
    // thread persisted
    const threads = await page.evaluate(() => JSON.parse(localStorage.getItem("bcap.chat.threads.v1") || "[]")); expect(threads.length).toBeGreaterThan(0); expect(threads[0].messages.length).toBeGreaterThanOrEqual(2);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    test.info().annotations.push({ type: "axe", description: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))) });
    expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1)).toEqual([]);
  });
  test("proxy refuses requests without x-ondemand-key and non-allow-listed paths", async ({ request }) => {
    const r1 = await request.post("/api/ondemand/chat/v1/sessions", { data: {} }); expect(r1.status()).toBe(401);
    const r2 = await request.get("/api/ondemand/media/v1/public/file", { headers: { "x-ondemand-key": "x" } }); expect(r2.status()).toBe(403);
  });
});
