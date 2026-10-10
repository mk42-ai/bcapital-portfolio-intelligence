import { test, expect, type Page } from "@playwright/test";
import { qaCheck } from "./qa-owner-helpers";
import { primeSettings } from "./helpers";

/**
 * Owner QA — Agent B, check 2: PitchBook first paint on the company page and in the chat inspector drawer.
 * Runs against the LIVE preview (BASE_URL), both viewports, serial; one test per (check × viewport).
 * Rows → ../../qa/qa-B.json, screenshots → ../../qa-evidence/.
 */
test.describe.configure({ mode: "serial" });
test.use({ trace: "off" });

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const FIELDS = ["name", "hq", "industry", "employees", "founded", "last_deal"] as const;
const MUST_KNOW = ["name", "hq", "industry", "founded"] as const;
const PB_RE = /pitchbook|execute|workflow/i;

function captureRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r) => { if (PB_RE.test(r.url())) hits.push(r.url()); });
  return hits;
}
async function resourceHits(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /pitchbook|execute|workflow/i.test(n)));
}
async function readFacts(root: ReturnType<Page["locator"]>) {
  // Single DOM read (robust against hydration re-renders between per-field locator calls).
  return root.first().evaluate((el, fields) => {
    const out: Record<string, { value: string; availability: string }> = {};
    for (const f of fields) {
      const row = el.querySelector(`[data-testid=pb-field][data-field=${f}]`);
      out[f] = {
        value: (row?.querySelector("[data-testid=pb-value]")?.textContent || "").trim(),
        availability: row?.getAttribute("data-availability") || "",
      };
    }
    return out;
  }, FIELDS as unknown as string[], { timeout: 5000 });
}
const fmtFacts = (f: Record<string, { value: string; availability: string }>) =>
  FIELDS.map((k) => `${k}=${f[k].value}${f[k].availability === "known" ? "" : `(${f[k].availability || "?"})`}`).join("; ");

async function dismissOverlays(page: Page) {
  // Best effort: close any onboarding / cookie overlay that may intercept clicks.
  for (const sel of ["[data-testid=onboarding-skip]", "button:has-text('Skip')", "[aria-label=Close]"]) {
    const l = page.locator(sel).first();
    if (await l.isVisible({ timeout: 500 }).catch(() => false)) await l.click({ timeout: 2000 }).catch(() => {});
  }
}

for (const vp of VIEWPORTS) {
  const tag = `${vp.width}x${vp.height}`;

  test(`2a-company-page-first-paint @${tag}`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2a-company-page-first-paint", async () => {
      await page.goto("/company/apptronik", { waitUntil: "commit", timeout: 60_000 });
      const card = page.locator("[data-testid=pitchbook-card]");
      const facts = card.locator("[data-testid=pb-facts]");
      await expect(facts, "pb-facts attached immediately after commit").toBeAttached({ timeout: 5000 });
      await expect(facts.locator("[data-testid=pb-field]"), "six pb-field rows").toHaveCount(6, { timeout: 5000 });
      const f = await readFacts(facts);
      const problems: string[] = [];
      for (const k of MUST_KNOW) {
        if (f[k].availability !== "known") problems.push(`${k}.data-availability="${f[k].availability}" (expected known)`);
        if (!f[k].value || f[k].value === "—") problems.push(`${k}.pb-value="${f[k].value}" (expected non-empty, non-dash)`);
      }
      const investors = await card.locator("[data-testid=pb-investor]").count();
      const header = ((await card.locator("[data-testid=pb-header]").first().textContent().catch(() => "")) || "").trim();
      expect(problems, `apptronik facts: ${fmtFacts(f)}; problems: ${problems.join(" | ")}`).toEqual([]);
      return `${fmtFacts(f)}; investors=${investors}; header="${header.slice(0, 90)}"`;
    });
  });

  test(`2b-company-page-no-runnow-no-execid @${tag}`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2b-company-page-no-runnow-no-execid", async () => {
      await page.goto("/company/apptronik", { waitUntil: "commit", timeout: 60_000 });
      await expect(page.locator("[data-testid=pb-facts]")).toBeAttached({ timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      const runNow = await page.locator("text=/Run now/i").count();
      const runNowBtn = await page.locator("[data-testid=pb-run-now]").count();
      const body = await page.evaluate(() => document.body.innerText);
      const execIdMatch = body.match(/execution ?id/i)?.[0] ?? body.match(/executionId/)?.[0] ?? null;
      expect(runNow, `"Run now" text occurrences=${runNow}`).toBe(0);
      expect(runNowBtn, `[data-testid=pb-run-now] count=${runNowBtn}`).toBe(0);
      expect(execIdMatch, `body innerText contains "${execIdMatch}"`).toBeNull();
      return `runNow=0; pb-run-now=0; execId=none; bodyChars=${body.length}`;
    });
  });

  test(`2c-company-page-no-pitchbook-request @${tag}`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2c-company-page-no-pitchbook-request", async () => {
      const captured = captureRequests(page);
      await page.goto("/company/apptronik", { waitUntil: "commit", timeout: 60_000 });
      await expect(page.locator("[data-testid=pb-facts]")).toBeAttached({ timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      const res = await resourceHits(page);
      const total = await page.evaluate(() => performance.getEntriesByType("resource").length);
      expect(res, `performance resource entries matching /pitchbook|execute|workflow/i: ${JSON.stringify(res)}`).toEqual([]);
      expect(captured, `captured page.on('request') URLs matching /pitchbook|execute|workflow/i: ${JSON.stringify(captured)}`).toEqual([]);
      return `resourceEntries=${total}; matching=0; capturedRequestsMatching=0`;
    });
  });

  test(`2d-ask-in-chat-lands-in-composer @${tag}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2d-ask-in-chat-lands-in-composer", async () => {
      await page.goto("/company/apptronik", { waitUntil: "commit", timeout: 60_000 });
      const ask = page.locator("[data-testid=pb-ask]").first();
      await expect(ask).toBeAttached({ timeout: 15_000 });
      const label = (await ask.getAttribute("aria-label")) || "";
      await ask.scrollIntoViewIfNeeded().catch(() => {});
      await ask.click({ timeout: 10_000 });
      await expect(page, "URL should be /chat?skip=1").toHaveURL(/\/chat\?skip=1/, { timeout: 15_000 });
      const composer = page.locator("[data-testid=composer-input]");
      await expect(composer).toBeAttached({ timeout: 15_000 });
      await expect.poll(async () => (await composer.inputValue().catch(() => "")).length, { timeout: 15_000, message: "composer value non-empty" }).toBeGreaterThan(0);
      const value = await composer.inputValue();
      const fieldLabel = label.replace(/^Ask in chat about\s*/i, "").trim();
      const mentions = /apptronik/i.test(value) || (fieldLabel.length > 0 && value.toLowerCase().includes(fieldLabel.toLowerCase()));
      expect(mentions, `composer value "${value.slice(0, 160)}" should mention "Apptronik" or field label "${fieldLabel}"`).toBe(true);
      await expect(page.locator(".openui-agent-thread-container"), "exactly one thread container").toHaveCount(1, { timeout: 15_000 });
      const msgs = await page.locator(".openui-agent-thread-messages").count();
      expect(msgs, `.openui-agent-thread-messages count=${msgs} (expected 0 or 1)`).toBeLessThanOrEqual(1);
      const chips = await page.locator("[data-testid=context-chip]").count();
      expect(chips, `context-chip count=${chips} (expected ≥1)`).toBeGreaterThanOrEqual(1);
      expect(context.pages().length, `tabs open=${context.pages().length} (expected 1, no new tab)`).toBe(1);
      return `composer="${value.slice(0, 120)}"; aria="${label}"; threads=1; msgs=${msgs}; chips=${chips}; tabs=1`;
    });
  });

  test(`2e-chat-drawer-first-paint @${tag}`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2e-chat-drawer-first-paint", async () => {
      await page.goto("/chat?skip=1", { waitUntil: "commit", timeout: 60_000 });
      await dismissOverlays(page);
      const toggle = page.locator("[data-testid=inspector-toggle]").first();
      await expect(toggle).toBeVisible({ timeout: 20_000 });
      await toggle.click({ timeout: 10_000 });
      const t0 = Date.now();
      await expect(page.locator("[data-testid=chat-inspector][data-open=true]")).toBeAttached({ timeout: 5000 });
      const rail = page.locator("[data-testid=inspector-pitchbook] [data-testid=pitchbook-rail]").first();
      const facts = rail.locator("[data-testid=pb-facts]").first();
      await expect(facts, "pb-facts visible within 5 s of opening the drawer").toBeVisible({ timeout: 5000 });
      await expect(facts.locator("[data-testid=pb-field]"), "six pb-field rows in drawer").toHaveCount(6, { timeout: 5000 });
      const elapsed = Date.now() - t0;
      const f = await readFacts(facts);
      const known = FIELDS.filter((k) => f[k].availability === "known").length;
      const header = ((await rail.locator("[data-testid=pb-header]").first().textContent().catch(() => "")) || "").trim();
      expect(elapsed, `drawer facts painted in ${elapsed} ms`).toBeLessThanOrEqual(5000);
      return `company=${f.name.value || "?"}; knownFields=${known}/6; paintMs=${elapsed}; ${fmtFacts(f)}; header="${header.slice(0, 80)}"`;
    });
  });

  test(`2f-chat-drawer-no-runnow-no-request @${tag}`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2f-chat-drawer-no-runnow-no-request", async () => {
      const captured = captureRequests(page);
      await page.goto("/chat?skip=1", { waitUntil: "commit", timeout: 60_000 });
      await dismissOverlays(page);
      const toggle = page.locator("[data-testid=inspector-toggle]").first();
      await expect(toggle).toBeVisible({ timeout: 20_000 });
      await toggle.click({ timeout: 10_000 });
      await expect(page.locator("[data-testid=chat-inspector][data-open=true]")).toBeAttached({ timeout: 10_000 });
      await expect(page.locator("[data-testid=pitchbook-rail] [data-testid=pb-facts]").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      const runNow = await page.locator("text=/Run now/i").count();
      const body = await page.evaluate(() => document.body.innerText);
      const execIdMatch = body.match(/execution ?id/i)?.[0] ?? null;
      const res = await resourceHits(page);
      const total = await page.evaluate(() => performance.getEntriesByType("resource").length);
      expect(runNow, `"Run now" text occurrences=${runNow}`).toBe(0);
      expect(execIdMatch, `body innerText contains "${execIdMatch}"`).toBeNull();
      expect(res, `performance resource entries matching /pitchbook|execute|workflow/i: ${JSON.stringify(res)}`).toEqual([]);
      expect(captured, `captured request URLs matching /pitchbook|execute|workflow/i: ${JSON.stringify(captured)}`).toEqual([]);
      return `runNow=0; execId=none; resourceEntries=${total}; matching=0; capturedMatching=0`;
    });
  });

  test(`2g-drawer-ask-same-thread @${tag}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(vp);
    await primeSettings(page); // returning-user profile (onboarded, default 5 companies, no API key) — the gate redirects fresh profiles to /onboarding
    await qaCheck("B", page, testInfo, "2g-drawer-ask-same-thread", async () => {
      await page.goto("/chat?skip=1", { waitUntil: "commit", timeout: 60_000 });
      await dismissOverlays(page);
      const toggle = page.locator("[data-testid=inspector-toggle]").first();
      await expect(toggle).toBeVisible({ timeout: 20_000 });
      await toggle.click({ timeout: 10_000 });
      const drawer = page.locator("[data-testid=chat-inspector]");
      await expect(page.locator("[data-testid=chat-inspector][data-open=true]")).toBeAttached({ timeout: 10_000 });
      const ask = page.locator("[data-testid=pitchbook-rail] [data-testid=pb-ask]").first();
      await expect(ask).toBeAttached({ timeout: 10_000 });
      const label = (await ask.getAttribute("aria-label")) || "";
      const urlBefore = page.url();
      await ask.scrollIntoViewIfNeeded().catch(() => {});
      await ask.click({ timeout: 10_000 });
      const composer = page.locator("[data-testid=composer-input]");
      await expect.poll(async () => (await composer.inputValue().catch(() => "")).length, { timeout: 15_000, message: "composer value non-empty after drawer ask" }).toBeGreaterThan(0);
      const value = await composer.inputValue();
      const urlAfter = page.url();
      expect(urlAfter, `URL changed from ${urlBefore} to ${urlAfter}`).toMatch(/\/chat/);
      expect(new URL(urlAfter).pathname, "pathname unchanged (still /chat)").toBe(new URL(urlBefore).pathname);
      await expect(page.locator(".openui-agent-thread-container"), "still exactly one thread container").toHaveCount(1, { timeout: 10_000 });
      const drawerOpen = (await drawer.first().getAttribute("data-open").catch(() => null)) === "true";
      expect(context.pages().length, "no new tab").toBe(1);
      return `composer="${value.slice(0, 100)}"; aria="${label}"; url=${urlAfter.replace(/^https?:\/\/[^/]+/, "")}; threads=1; drawerAfterAsk=${drawerOpen ? "open" : "closed"}`;
    });
  });
}
