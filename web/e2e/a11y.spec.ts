import AxeBuilder from "@axe-core/playwright";
import { test, expect, SCREENS } from "./helpers";

test.describe("Accessibility (axe, WCAG 2.0/2.1 A+AA)", () => {
  for (const s of SCREENS) {
    test(`${s.name}: no serious/critical violations`, async ({ page }, testInfo) => {
      await page.goto(s.path);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
      testInfo.annotations.push({
        type: "axe",
        description: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))),
      });
      expect(
        bad,
        JSON.stringify(
          bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })),
          null,
          1,
        ),
      ).toEqual([]);
    });
  }
});
