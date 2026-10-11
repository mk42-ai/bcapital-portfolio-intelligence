import { test, expect, devices, type Page, type Locator, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings } from "./helpers";

/**
 * a14 — visual snapshot spec of the chat run panel (`[data-testid=run-view]`) at 1440×900 and 390×844.
 *
 *   VISUAL_LABEL (default "before") → web/proof/pass-3/visual/<label>/<state>-<WxH>.png + metrics-<WxH>.json
 *   BASE_URL                        → playwright baseURL (playwright.config.ts)
 *
 * One short chat turn per viewport (2 turns total). States: first-frame (≤3 s after send), first-working-row,
 * answer-streaming (first answer-block text), settled (run-footer present) + full-page settled.
 * `toHaveScreenshot` is used ONLY when a committed baseline exists under e2e/run-panel-visual.spec.ts-snapshots/;
 * otherwise plain screenshots are written (we need images, not pixel-diff failures). Soft-asserted either way.
 *
 * Run:  cd web && BASE_URL=<deployment> VISUAL_LABEL=before node node_modules/@playwright/test/cli.js test e2e/run-panel-visual.spec.ts --project=desktop --workers=1
 */

const LABEL = process.env.VISUAL_LABEL ?? "before";
const OUT = path.resolve(__dirname, "..", "proof", "pass-3", "visual", LABEL);
const SNAPSHOT_DIR = path.resolve(__dirname, "run-panel-visual.spec.ts-snapshots");
const PROMPT = "In one sentence, what does Fervo Energy do?";
const STATES = ["first-frame", "first-working-row", "answer-streaming", "settled"] as const;
type State = (typeof STATES)[number];

type Metrics = {
  state: State;
  at: string;
  tSinceSendMs: number;
  runViewHeight: number | null;
  workingRows: number;
  workingRowHeights: number[];
  workingRowStates: string[];
  runStatusHeader: { exists: boolean; offsetTop: number | null };
  thinkingBlockState: string | null;
  childTestids: string[];
  answerChars: number;
  runFooter: boolean;
  scrollHeight: number;
  viewport: string;
};

function vp(page: Page) {
  const v = page.viewportSize() ?? { width: 0, height: 0 };
  return `${v.width}x${v.height}`;
}

async function readMetrics(page: Page, state: State, t0: number): Promise<Metrics> {
  const m = await page.evaluate(() => {
    const rv = document.querySelector<HTMLElement>('[data-testid="run-view"]');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="working-row"]'));
    const rsh = document.querySelector<HTMLElement>('[data-testid="run-status-header"]');
    const think = document.querySelector<HTMLElement>('[data-testid="thinking-block"]');
    const answer = document.querySelector<HTMLElement>('[data-testid="answer-block"]');
    return {
      runViewHeight: rv ? Math.round(rv.getBoundingClientRect().height) : null,
      workingRows: rows.length,
      workingRowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      workingRowStates: rows.map((r) => r.dataset.state ?? ""),
      runStatusHeader: { exists: !!rsh, offsetTop: rsh ? rsh.offsetTop : null },
      thinkingBlockState: think ? (think.dataset.state ?? null) : null,
      childTestids: rv ? Array.from(rv.children).map((c) => (c as HTMLElement).dataset.testid ?? `<${c.tagName.toLowerCase()}.${(c as HTMLElement).className.split(" ")[0]}>`) : [],
      answerChars: answer ? (answer.textContent ?? "").length : 0,
      runFooter: !!document.querySelector('[data-testid="run-footer"]'),
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  return { state, at: new Date().toISOString(), tSinceSendMs: Date.now() - t0, viewport: vp(page), ...m };
}

/** Element screenshot of run-view → OUT/<state>-<WxH>.png; soft pixel-diff only when a baseline exists. */
async function snap(page: Page, ti: TestInfo, runView: Locator, state: State) {
  const file = `${state}-${vp(page)}.png`;
  const p = path.join(OUT, file);
  try {
    await runView.screenshot({ path: p, timeout: 10_000, animations: "disabled" });
  } catch (e) {
    // Fall back to the viewport if the element is mid-layout (never lose the frame).
    await page.screenshot({ path: p, timeout: 10_000 }).catch(() => {});
    ti.annotations.push({ type: "snap-fallback", description: `${file}: ${String((e as Error).message).slice(0, 120)}` });
  }
  const baseline = path.join(SNAPSHOT_DIR, `${file.replace(/\.png$/, "")}-${ti.project.name}-linux.png`);
  if (fs.existsSync(baseline)) {
    await expect.soft(runView).toHaveScreenshot(file, { maxDiffPixelRatio: 0.02, animations: "disabled", timeout: 10_000 });
  }
  return file;
}

async function captureRun(page: Page, ti: TestInfo) {
  fs.mkdirSync(OUT, { recursive: true });
  const metrics: Metrics[] = [];
  const files: string[] = [];
  const log = (s: string) => ti.annotations.push({ type: "visual", description: s });

  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("composer-input").fill(PROMPT);
  const t0 = Date.now();
  await page.getByTestId("composer-send").click();

  const runView = page.getByTestId("run-view").last();

  // 1. first-frame (≤3 s after send)
  await expect(runView).toBeVisible({ timeout: 3_000 });
  files.push(await snap(page, ti, runView, "first-frame"));
  metrics.push(await readMetrics(page, "first-frame", t0));

  // 2. first working-row (a short run may skip tools — record NA rather than fail)
  const row = page.getByTestId("working-row").first();
  const gotRow = await row.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
  if (gotRow) {
    files.push(await snap(page, ti, runView, "first-working-row"));
    metrics.push(await readMetrics(page, "first-working-row", t0));
  } else log("first-working-row: no working-row rendered within 60 s (NA)");

  // 3. answer streaming — first answer-block text
  const answer = page.getByTestId("answer-block").first();
  const gotAnswer = await expect
    .poll(async () => ((await answer.count()) ? ((await answer.textContent()) ?? "").trim().length : 0), { timeout: 150_000 })
    .toBeGreaterThan(0)
    .then(() => true, () => false);
  if (gotAnswer) {
    files.push(await snap(page, ti, runView, "answer-streaming"));
    metrics.push(await readMetrics(page, "answer-streaming", t0));
  } else log("answer-streaming: no answer-block text within 150 s (NA)");

  // 4. settled — run-footer present
  const footer = page.getByTestId("run-footer").last();
  const settled = await footer.waitFor({ state: "attached", timeout: 180_000 }).then(() => true, () => false);
  if (settled) {
    await page.waitForTimeout(500);
    files.push(await snap(page, ti, runView, "settled"));
    metrics.push(await readMetrics(page, "settled", t0));
    const full = `settled-fullpage-${vp(page)}.png`;
    await page.screenshot({ path: path.join(OUT, full), fullPage: true, timeout: 15_000 }).catch(() => {});
    files.push(full);
  } else log("settled: run-footer not present within 180 s (NA)");

  const mfile = `metrics-${vp(page)}.png`.replace(/\.png$/, ".json");
  fs.writeFileSync(path.join(OUT, mfile), JSON.stringify({ label: LABEL, baseURL: ti.project.use.baseURL ?? process.env.BASE_URL ?? null, prompt: PROMPT, files, states: metrics }, null, 2));
  for (const m of metrics) {
    console.log(`[visual ${LABEL} ${m.viewport}] ${m.state} t+${m.tSinceSendMs}ms runView=${m.runViewHeight}px rows=${m.workingRows}${m.workingRowHeights.length ? `[${m.workingRowHeights.join(",")}]` : ""} statusHeader=${m.runStatusHeader.exists ? m.runStatusHeader.offsetTop : "none"} thinking=${m.thinkingBlockState ?? "none"} children=[${m.childTestids.join(" > ")}]`);
  }
  expect(files.length, "at least the first-frame image was captured").toBeGreaterThan(0);
  expect(settled, "run settled (run-footer)").toBe(true);
}

test.describe("run panel visual — desktop 1440×900", () => {
  const { defaultBrowserType: _d, ...desktop } = devices["Desktop Chrome"];
  test.use({ ...desktop, viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => primeSettings(page));
  test("captures run-view states + layout metrics", async ({ page }, ti) => {
    test.setTimeout(300_000);
    await captureRun(page, ti);
  });
});

test.describe("run panel visual — mobile 390×844 (Pixel 7)", () => {
  const { defaultBrowserType: _m, ...pixel7 } = devices["Pixel 7"];
  test.use({ ...pixel7, viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => primeSettings(page));
  test("captures run-view states + layout metrics", async ({ page }, ti) => {
    test.setTimeout(300_000);
    await captureRun(page, ti);
  });
});
