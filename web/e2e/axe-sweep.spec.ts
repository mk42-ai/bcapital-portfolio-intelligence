// a48 — axe-core a11y sweep (WCAG 2.2 AA + best-practice) across the 6 routes (+ /company/fervo-energy) at 1440×900 and 390×844,
// plus the /chat run panel after one short turn (desktop only). Writes per-route JSON to web/proof/pass-3/axe/<AXE_LABEL>/ and
// hard-fails on serious/critical; moderate/minor are reported only. Aggregate with `node scripts/axe-summary.mjs`.
//
//   cd web && AXE_LABEL=before BASE_URL=https://sb-1gizcktepfgc.vercel.run \
//     node node_modules/@playwright/test/cli.js test e2e/axe-sweep.spec.ts --project=desktop --workers=1
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { primeSettings, hasKey } from "./helpers";

const LABEL = process.env.AXE_LABEL ?? "before";
const OUT = path.resolve(__dirname, "..", "proof", "pass-3", "axe", LABEL);
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"];
const ROUTES = ["/overview", "/companies", "/news", "/chat?skip=1", "/artifacts", "/settings", "/company/fervo-energy"];
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];
const CHAT_PROMPT = "In one sentence, what does Fervo Energy do?";

type Impact = "critical" | "serious" | "moderate" | "minor";
export type AxeRouteReport = {
  label: string;
  route: string;
  viewport: string;
  url: string;
  state: "initial" | "after-turn";
  tags: string[];
  generatedUtc: string;
  counts: Record<Impact, number> & { total: number };
  passes: number;
  incomplete: number;
  violations: { id: string; impact: Impact | null; nodes: number; firstTarget: string; help: string; helpUrl: string; tags: string[] }[];
  fail: boolean;
};

// Own fixture: prime settings (onboarding + api key) but do NOT fail on console errors — this spec reports a11y only.
const test = base.extend<{ prime: void }>({
  prime: [
    async ({ page }, use) => {
      await primeSettings(page);
      await use();
    },
    { auto: true },
  ],
});

const slug = (s: string) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";

async function audit(page: Page, route: string, viewport: string, state: AxeRouteReport["state"]) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const counts: AxeRouteReport["counts"] = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
  const violations = r.violations.map((v) => {
    const impact = (v.impact ?? null) as Impact | null;
    if (impact) counts[impact] += 1;
    counts.total += 1;
    const t = v.nodes[0]?.target?.[0];
    return {
      id: v.id,
      impact,
      nodes: v.nodes.length,
      firstTarget: Array.isArray(t) ? t.join(" >>> ") : String(t ?? ""),
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
    };
  });
  const report: AxeRouteReport = {
    label: LABEL,
    route,
    viewport,
    url: page.url(),
    state,
    tags: TAGS,
    generatedUtc: new Date().toISOString(),
    counts,
    passes: r.passes.length,
    incomplete: r.incomplete.length,
    violations,
    fail: counts.critical + counts.serious > 0,
  };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${slug(route)}${state === "after-turn" ? "-after-turn" : ""}-${viewport}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return report;
}

async function settle(page: Page) {
  await expect(page.locator("main, [role=main]").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

const bad = (rep: AxeRouteReport) => rep.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
const explain = (rep: AxeRouteReport) =>
  JSON.stringify(bad(rep).map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes, target: v.firstTarget, help: v.helpUrl })), null, 1);

for (const vp of VIEWPORTS) {
  test.describe(`axe sweep @${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
    for (const route of ROUTES) {
      test(`${route} @${vp.name}: no serious/critical (WCAG 2.2 AA)`, async ({ page }, testInfo) => {
        await page.goto(route);
        await settle(page);
        const rep = await audit(page, route, vp.name, "initial");
        testInfo.annotations.push({ type: "axe", description: JSON.stringify(rep.counts) });
        expect(bad(rep), explain(rep)).toEqual([]);
      });
    }
  });
}

test.describe("axe sweep: /chat run panel after one turn @1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("/chat after-turn: no serious/critical (WCAG 2.2 AA)", async ({ page }, testInfo) => {
    test.skip(!hasKey(), "ON_DEMAND_API_KEY not set — cannot run a chat turn");
    await page.goto("/chat?skip=1");
    await settle(page);
    const input = page.getByTestId("composer-input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill(CHAT_PROMPT);
    await page.getByTestId("composer-send").click();
    const run = page.getByTestId("run-view").last();
    // wait for the answer to start, then for streaming to end (bounded)
    await expect(run.getByTestId("answer-block").first()).toBeVisible({ timeout: 150_000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      if ((await page.getByTestId("assistant-streaming").count().catch(() => 0)) === 0) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    const rep = await audit(page, "/chat", "1440x900", "after-turn");
    testInfo.annotations.push({ type: "axe", description: JSON.stringify(rep.counts) });
    expect(bad(rep), explain(rep)).toEqual([]);
  });
});
