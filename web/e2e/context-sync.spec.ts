import { test, expect, type Page } from "@playwright/test";
import { primeSettings, COMPANIES } from "./helpers";

/**
 * unit2 — company context is in sync between the inspector chips, the "Context: N companies — …" line under the composer and the
 * `context.systemContext` actually POSTed to /api/chat. Removes one chip (Perplexity AI), adds none, sends ONE turn with the request
 * intercepted (body captured, request continued, answer NOT awaited) and asserts the payload names exactly what the context line shows.
 * Run: cd web && BASE_URL=<frontend> node node_modules/@playwright/test/cli.js test e2e/context-sync.spec.ts --workers=1
 */
const NAMES: Record<string, string> = { "perplexity-ai": "Perplexity AI", apptronik: "Apptronik", "fervo-energy": "Fervo Energy", flutterwave: "Flutterwave", writer: "WRITER" };
const namesFromLine = (txt: string) => (txt.split("—")[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);

async function openInspector(page: Page) {
  const drawer = page.getByTestId("chat-inspector");
  if ((await drawer.getAttribute("data-open")) !== "true") await page.getByTestId("inspector-toggle").click();
  await expect(drawer).toHaveAttribute("data-open", "true", { timeout: 10_000 });
  return drawer;
}

test("context line + POST /api/chat systemContext mirror the inspector chips (remove one company)", async ({ page }) => {
  test.setTimeout(120_000);
  await primeSettings(page);
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });

  const line = page.getByTestId("context-line");
  await expect(line, "context-line renders under the composer").toBeVisible({ timeout: 15_000 });
  const before = (await line.textContent()) ?? "";
  console.log("[context-sync] before:", before);
  expect(before).toMatch(/^Context: 5 companies — /);
  for (const slug of COMPANIES) expect(before).toContain(NAMES[slug]);

  // Remove Perplexity AI in the inspector → line updates live (no reload, no send)
  const drawer = await openInspector(page);
  const chips = drawer.locator('[data-testid="inspector-context"] [data-testid="company-chip"]');
  await expect(chips).toHaveCount(5, { timeout: 10_000 });
  await drawer.getByRole("button", { name: "Remove Perplexity AI" }).click();
  await expect(chips).toHaveCount(4);
  await expect(line).toHaveText(/^Context: 4 companies — /, { timeout: 5_000 });
  const after = (await line.textContent()) ?? "";
  console.log("[context-sync] after remove:", after);
  expect(after).not.toContain("Perplexity AI");
  const shown = namesFromLine(after);
  expect(shown).toEqual(["Apptronik", "Fervo Energy", "Flutterwave", "WRITER"]);
  await page.getByTestId("inspector-close").click();

  // Intercept the POST /api/chat body: capture, continue, do not wait for the answer.
  let captured: { context?: { systemContext?: string; sessionContext?: { key: string }[]; contextSlugs?: string[] } } | null = null;
  const got = new Promise<void>((resolve) => {
    void page.route("**/api/chat", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && !captured) { try { captured = req.postDataJSON(); } catch { captured = null; } resolve(); }
      await route.continue();
    });
  });
  await page.getByTestId("composer-input").fill("One line: which context company has the highest sentiment score?");
  await page.getByTestId("composer-send").click();
  await Promise.race([got, page.waitForTimeout(30_000)]);
  expect(captured, "POST /api/chat body captured").toBeTruthy();
  const sc = captured!.context?.systemContext ?? "";
  console.log("[context-sync] systemContext chars:", sc.length, "slugs:", JSON.stringify(captured!.context?.contextSlugs ?? null));
  for (const n of shown) expect(sc, `systemContext names ${n}`).toContain(n);
  expect(sc, "removed company must NOT be sent").not.toContain("Perplexity AI");
  expect(sc).toContain("sentiment_score");
  expect(sc).toContain("sentiment_delta_vs_prior_run");
  const keys = (captured!.context?.sessionContext ?? []).map((c) => c.key);
  expect(keys).toEqual(["company:apptronik", "company:fervo-energy", "company:flutterwave", "company:writer"]);
  // stop the run so the spec does not wait on the model
  const stop = page.getByTestId("composer-send");
  if ((await stop.getAttribute("aria-label")) === "Cancel message") await stop.click().catch(() => {});
});

test("empty context → helper copy; mobile 390 wraps the line", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await primeSettings(page, { companies: [] });
  await page.goto("/chat?skip=1");
  const line = page.getByTestId("context-line");
  await expect(line).toHaveText("Context: none — pick up to 5 companies in the inspector", { timeout: 30_000 });
  const ws = await line.evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(ws).not.toBe("nowrap");
});
