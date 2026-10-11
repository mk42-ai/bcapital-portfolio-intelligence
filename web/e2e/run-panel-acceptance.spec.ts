import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings, captureErrors } from "./helpers";

/**
 * a12 — run-panel acceptance spec (pass-3). ONE chat turn per viewport (1440×900, 390×844), serial, against BASE_URL.
 * Numbered invariants (each `expect.soft` + annotation + ndjson line, so one failure never hides the others):
 *  1 thinking-block starts collapsed (first 3 s) and auto-expands (data-state=expanded|streaming + data-auto-expanded=true) ≤5 s after the
 *    first Portfolio Plugin working-row appears;
 *  2 run-status-header exists, precedes thinking-block in DOM order, and its offsetTop (relative to run-view) is stable (≤2 px) across ≥20 samples;
 *  3 the Portfolio Plugin working-row carries a /brand/ chip (B Capital mark);
 *  4 plan-stepper has ≥1 plan-step and no raw planner JSON;
 *  5 no raw JSON in run-view text; planner-payload hidden until dev-disclosure is opened;
 *  6 working-band absent;
 *  7 no console/page errors.
 * Log: web/proof/pass-3/run-panel-acceptance.ndjson
 */
const QUESTION = "Which of my context companies moved most since the last sentiment run, and why?";
const PORTFOLIO = "plugin-1791713636";
const PLAN_RAW_RE = /"plan_required"|"steps"\s*:|listPortfolioCompanies|^\s*\{/;
const RAW_JSON_RE = /"pluginId"|api_request_parameters|plan_required/;
const LOG = path.join(__dirname, "..", "proof", "pass-3", "run-panel-acceptance.ndjson");

type Rec = { n: number; label: string; pass: boolean; detail?: unknown };

function logLine(info: TestInfo, viewport: string, rec: Rec) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), base: process.env.BASE_URL ?? "", viewport, project: info.project.name, ...rec }) + "\n");
  info.annotations.push({ type: rec.pass ? `pass-${rec.n}` : `FAIL-${rec.n}`, description: `${rec.label}${rec.detail !== undefined ? ` — ${JSON.stringify(rec.detail).slice(0, 400)}` : ""}` });
}

/** Soft, numbered assertion: records the outcome, never throws (so later checks still run), but marks the test failed on a miss. */
function check(info: TestInfo, viewport: string, n: number, label: string, pass: boolean, detail?: unknown) {
  logLine(info, viewport, { n, label, pass, detail });
  expect.soft(pass, `(${n}) ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`).toBe(true);
}

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      await primeSettings(page);
      const errs = captureErrors(page);
      await use(errs);
    },
    { auto: true },
  ],
});
// Ordered run (workers=1 in both configs). NOT `mode: "serial"` on purpose: serial would skip the mobile turn after a desktop failure,
// and the before-state is expected to fail — both viewports must always report.
test.describe.configure({ mode: "default" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acceptance(page: Page, errors: string[], viewport: string) {
  const info = test.info();
  test.skip(!process.env.BASE_URL && !(process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY), "needs a live BASE_URL or an API key");
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("composer-input").fill(QUESTION);
  const t0 = Date.now();
  await page.getByTestId("composer-send").click();
  const run = page.getByTestId("run-view").last();
  const thinking = page.getByTestId("thinking-block").last();

  // ── (1a) first 3 s: thinking-block collapsed or absent body — record the FIRST observed state
  let firstState: string | null = null;
  const states = new Set<string>();
  let bodyWhileCollapsedWanted = false;
  while (Date.now() - t0 < 3_000) {
    const s = await thinking.evaluate((el) => ({ state: el.getAttribute("data-state"), body: !!el.querySelector(".oiu-think__body") }), undefined, { timeout: 200 }).catch(() => null);
    if (s) {
      if (firstState == null) firstState = s.state ?? "absent";
      states.add(s.state ?? "absent");
      if (s.body && s.state !== "collapsed") bodyWhileCollapsedWanted = true;
    } else if (firstState == null) firstState = "absent";
    await sleep(100);
  }
  check(info, viewport, 1, "thinking-block starts collapsed (or body absent) during the first 3 s", firstState === "absent" || firstState === "collapsed" || !bodyWhileCollapsedWanted, { firstState, observed: [...states] });

  // ── wait for the Portfolio Plugin working-row
  const portfolioRow = run.locator(`[data-testid="working-row"][data-plugin="${PORTFOLIO}"]`).first();
  let rowAt: number | null = null;
  await expect.poll(async () => portfolioRow.count(), { timeout: 150_000, intervals: [100] }).toBeGreaterThan(0).then(() => { rowAt = Date.now(); }).catch(() => {});
  check(info, viewport, 1, `working-row[data-plugin=${PORTFOLIO}] appears`, rowAt != null, { afterMs: rowAt ? rowAt - t0 : null });

  // ── (1b) auto-expand ≤5 s after the row appears
  let expanded: { state: string | null; auto: string | null } | null = null;
  if (rowAt != null) {
    while (Date.now() - rowAt < 5_000) {
      const s = await thinking.evaluate((el) => ({ state: el.getAttribute("data-state"), auto: el.getAttribute("data-auto-expanded") }), undefined, { timeout: 200 }).catch(() => null);
      if (s && (s.state === "expanded" || s.state === "streaming") && s.auto === "true") { expanded = s; break; }
      expanded = s;
      await sleep(100);
    }
  }
  check(info, viewport, 1, "thinking-block auto-expands (data-state=expanded|streaming, data-auto-expanded=true) within 5 s of the Portfolio row", !!expanded && (expanded.state === "expanded" || expanded.state === "streaming") && expanded.auto === "true", expanded);

  // ── (6) working-band absent (mid-run sample)
  const bandMid = await run.getByTestId("working-band").count();
  check(info, viewport, 6, "working-band absent while running", bandMid === 0, { count: bandMid });

  // ── (2) run-status-header: exists, precedes thinking-block, offsetTop stable across ≥20 samples
  const header = run.getByTestId("run-status-header");
  const headerCount = await header.count();
  check(info, viewport, 2, "run-status-header exists in run-view", headerCount > 0, { count: headerCount });
  if (headerCount > 0) {
    const before = await run.evaluate((el) => {
      const h = el.querySelector('[data-testid="run-status-header"]'); const t = el.querySelector('[data-testid="thinking-block"]');
      return !!h && !!t && !!(h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check(info, viewport, 2, "run-status-header precedes thinking-block in DOM order", before);
    const tops: number[] = [];
    for (let i = 0; i < 24; i++) {
      const top = await run.evaluate((el) => { const h = el.querySelector<HTMLElement>('[data-testid="run-status-header"]'); return h ? h.getBoundingClientRect().top - el.getBoundingClientRect().top : NaN; }).catch(() => NaN);
      if (!Number.isNaN(top)) tops.push(top);
      await sleep(120);
    }
    const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : NaN;
    check(info, viewport, 2, "run-status-header offsetTop (relative to run-view) moves ≤2 px across ≥20 samples", tops.length >= 20 && spread <= 2, { samples: tops.length, spread, min: tops.length ? Math.min(...tops) : null, max: tops.length ? Math.max(...tops) : null });
  }

  // ── (3) brand chip on the Portfolio Plugin row
  const brandImg = portfolioRow.locator('[data-testid="working-chips"] img[src*="/brand/"]');
  let brandCount = 0;
  await expect.poll(async () => (brandCount = await brandImg.count()), { timeout: 10_000, intervals: [250] }).toBeGreaterThan(0).catch(() => {});
  const chipSrcs = await portfolioRow.locator('[data-testid="working-chips"] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src"))).catch(() => []);
  check(info, viewport, 3, "Portfolio Plugin working-row chip is the B Capital /brand/ mark", brandCount > 0, { chipSrcs });

  // ── (4) plan-stepper: ≥1 plan-step, no raw planner JSON
  const stepper = run.getByTestId("plan-stepper").first();
  let stepCount = 0;
  await expect.poll(async () => (stepCount = await stepper.getByTestId("plan-step").count()), { timeout: 60_000, intervals: [250] }).toBeGreaterThan(0).catch(() => {});
  const stepperText = (await stepper.innerText({ timeout: 2_000 }).catch(() => "")) ?? "";
  check(info, viewport, 4, "plan-stepper contains ≥1 plan-step", stepCount > 0, { stepCount, stepperState: await stepper.getAttribute("data-state").catch(() => null) });
  check(info, viewport, 4, "plan-stepper text is a checklist, not raw planner JSON", stepCount > 0 && !PLAN_RAW_RE.test(stepperText), { sample: stepperText.slice(0, 200) });

  // ── settle: answer + frozen timer
  const answered = await expect(run.getByTestId("answer-block")).toBeVisible({ timeout: 200_000 }).then(() => true).catch(() => false);
  await expect.poll(async () => (await run.getByTestId("run-timer").getAttribute("data-state")) ?? "frozen", { timeout: 60_000, intervals: [500] }).toBe("frozen").catch(() => {});
  check(info, viewport, 0, "turn completes with an answer-block", answered);

  // ── (5) no raw JSON in run-view by default; planner-payload only behind dev-disclosure
  const runText = await run.innerText().catch(() => "");
  const m = runText.match(RAW_JSON_RE);
  check(info, viewport, 5, "run-view text carries no raw planner/tool JSON by default", !m, { match: m?.[0] ?? null, around: m ? runText.slice(Math.max(0, m.index! - 60), m.index! + 80) : null });
  const payload = page.getByTestId("planner-payload");
  const payloadVisibleBefore = (await payload.count()) > 0 && (await payload.first().isVisible().catch(() => false));
  check(info, viewport, 5, "planner-payload is NOT visible before dev-disclosure is opened", !payloadVisibleBefore, { count: await payload.count() });
  let disclosure = page.getByTestId("dev-disclosure");
  if ((await disclosure.count()) === 0 || !(await disclosure.first().isVisible().catch(() => false))) {
    const toggle = page.getByTestId("inspector-toggle");
    if (await toggle.count()) { await toggle.click({ timeout: 5_000 }).catch(() => {}); await sleep(400); }
    disclosure = page.getByTestId("dev-disclosure");
  }
  const hasDisclosure = (await disclosure.count()) > 0;
  if (hasDisclosure) {
    const d = disclosure.first();
    const open = await d.evaluate((el) => (el as HTMLDetailsElement).open).catch(() => false);
    if (!open) await d.locator("summary").first().click({ timeout: 5_000 }).catch(() => d.evaluate((el) => { (el as HTMLDetailsElement).open = true; }).catch(() => {}));
    await sleep(300);
  }
  const payloadAfter = await payload.count().catch(() => 0);
  check(info, viewport, 5, "planner-payload exists after dev-disclosure is opened", hasDisclosure && payloadAfter > 0, { hasDisclosure, payloadAfter });

  // ── (6) working-band absent after settle
  const bandEnd = await run.getByTestId("working-band").count();
  check(info, viewport, 6, "working-band absent after the turn settles", bandEnd === 0, { count: bandEnd });

  // ── (7) no console/page errors
  check(info, viewport, 7, "no console/page errors during the turn", errors.length === 0, { errors: errors.slice(0, 8) });

  const failed = info.annotations.filter((a) => a.type.startsWith("FAIL-")).map((a) => a.type.replace("FAIL-", "") + ": " + a.description);
  logLine(info, viewport, { n: 99, label: "summary", pass: failed.length === 0, detail: { failedNumbers: [...new Set(failed.map((f) => f.split(":")[0]))], failed } });
}

test.describe("run-panel acceptance — desktop 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("thinking auto-expand, anchored header, brand chip, checklist plan, no raw JSON", async ({ page, errors }) => {
    test.setTimeout(420_000);
    await acceptance(page, errors, "1440x900");
  });
});

test.describe("run-panel acceptance — mobile 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("thinking auto-expand, anchored header, brand chip, checklist plan, no raw JSON", async ({ page, errors }) => {
    test.setTimeout(420_000);
    await acceptance(page, errors, "390x844");
  });
});
