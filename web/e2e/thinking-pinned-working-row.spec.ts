import { test, expect, hasKey } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * unit1 — DOM invariant of the run view: Thinking stays pinned at the top of the turn after the answer streams; a Working row renders
 * directly before each action (every working-row precedes answer-block in DOM order); the Jump-to-latest pill never intersects a Working
 * row; and the Thinking body never carries planner / tool-definition JSON. Desktop 1440×900 + mobile 390×844 (two describes).
 * Runs against BASE_URL (live sandbox); the question is short to keep the turn fast.
 */
const QUESTION = process.env.U1_QUESTION ?? "In one sentence, what does Fervo Energy do?";
const PAYLOAD_RE = /"pluginId"|api_request_parameters|chars each/;

async function runOneTurn(page: Page) {
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("composer-input").fill(QUESTION);
  await page.getByTestId("composer-send").click();
  const run = page.getByTestId("run-view").last();
  await expect(run).toBeVisible({ timeout: 30_000 });
  await expect(run.getByTestId("answer-block")).toBeVisible({ timeout: 200_000 });
  // settle: wait for the run timer to freeze (RUN_FINISHED) or 60 s, whichever first
  await expect.poll(async () => (await run.getByTestId("run-timer").getAttribute("data-state")) ?? "frozen", { timeout: 60_000, intervals: [500] }).toBe("frozen");
  return run;
}

function invariants() {
  test.skip(!hasKey() && !process.env.BASE_URL, "needs a live BASE_URL");
  test("Thinking pinned at top, Working rows before the answer, jump pill clear of Working rows, no planner JSON in Thinking", async ({ page }) => {
    const run = await runOneTurn(page);
    // 1. section order: run-header → thinking-block first
    const firstTwo = await run.evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => c.getAttribute("data-testid")));
    expect(firstTwo).toEqual(["run-header", "thinking-block"]);
    // 2. every working-row precedes answer-block in DOM order
    const order = await run.evaluate((el) => {
      const answer = el.querySelector('[data-testid="answer-block"]');
      const rows = Array.from(el.querySelectorAll('[data-testid="working-row"]'));
      return { rows: rows.length, allBefore: !!answer && rows.every((r) => !!(r.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING)) };
    });
    expect(order.rows, "at least one Working row").toBeGreaterThan(0);
    expect(order.allBefore, "every working-row precedes answer-block").toBe(true);
    // 3. thinking-block state after the answer
    const state = await run.getByTestId("thinking-block").getAttribute("data-state");
    expect(["collapsed", "expanded"]).toContain(state);
    // 4. jump-to-latest (if present) does not intersect any working-row box
    const jump = page.getByTestId("jump-to-latest");
    if (await jump.count()) {
      const jb = await jump.boundingBox();
      const rows = await run.getByTestId("working-row").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
      if (jb) for (const r of rows) {
        const intersects = jb.x < r.x + r.w && jb.x + jb.width > r.x && jb.y < r.y + r.h && jb.y + jb.height > r.y;
        expect(intersects, "jump-to-latest must not overlap a working-row").toBe(false);
      }
    }
    // 5. Thinking text (header + body, expanded) carries no planner JSON
    const think = run.getByTestId("thinking-block");
    if (state === "collapsed") await think.locator("button.oiu-think__head").click();
    const text = (await think.innerText());
    expect(text, "thinking-block must not contain planner/tool JSON").not.toMatch(PAYLOAD_RE);
  });
}

test.describe("desktop 1440×900", () => { test.use({ viewport: { width: 1440, height: 900 } }); invariants(); });
test.describe("mobile 390×844", () => { test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); invariants(); });
