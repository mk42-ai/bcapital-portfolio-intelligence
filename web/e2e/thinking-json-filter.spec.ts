import { test, expect, hasKey } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * unit1 — planner JSON filter: the Thinking body never carries plan / tool-definition JSON ("pluginId", api_request_parameters,
 * "… 2048 chars each" truncation markers); when the Outputs card exists it carries the collapsed `planner-payload` disclosure instead.
 * Desktop 1440×900 + mobile 390×844. On the pre-unit1 build the first assertion FAILS (that is the before-state; do not weaken it).
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
  await expect.poll(async () => (await run.getByTestId("run-timer").getAttribute("data-state")) ?? "frozen", { timeout: 60_000, intervals: [500] }).toBe("frozen");
  return run;
}

function filterChecks() {
  test.skip(!hasKey() && !process.env.BASE_URL, "needs a live BASE_URL");
  test("Thinking body has no planner JSON; Outputs card carries the planner-payload disclosure", async ({ page }) => {
    const run = await runOneTurn(page);
    const think = run.getByTestId("thinking-block");
    await expect(think).toBeVisible();
    if ((await think.getAttribute("data-state")) === "collapsed") await think.locator("button.oiu-think__head").click();
    const body = await think.locator(".oiu-think__body, .oiu-think__pre").first().innerText().catch(() => "");
    const header = await think.locator(".oiu-think__head").innerText().catch(() => "");
    expect(body + "\n" + header, "thinking text must not match planner JSON markers").not.toMatch(PAYLOAD_RE);
    const outputs = run.getByTestId("outputs-card");
    if (await outputs.count()) {
      const payload = run.getByTestId("planner-payload");
      await expect(payload, "planner-payload details exist when outputs-card exists").toHaveCount(1);
      // collapsed by default; opens via the Outputs head + details summary and shows pretty-printed JSON in a <pre>
      await outputs.locator("button.oiu-outputs__head").click();
      await payload.locator("summary").click();
      await expect(payload.locator("pre").first()).toBeVisible();
      const n = Number(await payload.getAttribute("data-chars"));
      expect(n, "planner payload has content").toBeGreaterThan(0);
    } else {
      test.info().annotations.push({ type: "note", description: "no outputs-card on this turn (no step payload) — planner-payload assertion not applicable" });
    }
  });
}

test.describe("desktop 1440×900", () => { test.use({ viewport: { width: 1440, height: 900 } }); filterChecks(); });
test.describe("mobile 390×844", () => { test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); filterChecks(); });
