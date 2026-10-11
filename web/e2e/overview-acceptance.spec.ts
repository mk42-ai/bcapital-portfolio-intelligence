/**
 * a25 — /overview acceptance + axe spec (pass-3).
 * Covers the verdict row (a17 `hero-stats`), top movers (a19 `top-movers`/`mover-row`), news mini-feed (a20 `news-mini-feed`),
 * the existing KPI tiles / heatmap / paged table, the data-source badge, WCAG 2.2 AA via axe, tabular numerals and no horizontal overflow.
 * Screenshots → web/proof/pass-3/overview/<VISUAL_LABEL|before>-<WxH>.png.
 * Run (one project, one worker):  cd web && BASE_URL=https://sb-… node node_modules/@playwright/test/cli.js test e2e/overview-acceptance.spec.ts --project=desktop --workers=1
 */
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { test, expect, noHorizontalOverflow } from "./helpers";

const LABEL = process.env.VISUAL_LABEL ?? "before";
const PROOF_DIR = path.join(__dirname, "..", "proof", "pass-3", "overview");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`overview acceptance @ ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`verdict row, movers, mini-feed, cards, badge, a11y, overflow (${vp.name})`, async ({ page, errors }, testInfo) => {
      const soft = (what: string, ok: boolean, note: string) => {
        if (!ok) testInfo.annotations.push({ type: "soft-fail", description: `${what}: ${note}` });
        expect.soft(ok, `${what}: ${note}`).toBe(true);
      };

      // 1. HTTP 200 + main visible. (`errors` fixture from helpers.captureErrors asserts 0 console/page errors after the test.)
      const res = await page.goto("/overview?skip=1");
      expect(res?.status(), "GET /overview?skip=1 → 200").toBe(200);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});

      // 2. First content block under the page header must be the verdict row `hero-stats` (a17).
      const header = page.locator("main header").first();
      const hero = page.getByTestId("hero-stats");
      if ((await hero.count()) === 0) {
        testInfo.annotations.push({ type: "soft-fail", description: "hero-stats not in baseline" });
        expect.soft(false, "hero-stats not in baseline").toBe(true);
      } else {
        await expect(hero).toBeVisible();
        const isFirst = await header.evaluate((h) => {
          let n: Element | null = h.nextElementSibling;
          while (n && (n.tagName === "SCRIPT" || n.tagName === "STYLE" || n.tagName === "TEMPLATE")) n = n.nextElementSibling;
          return !!n && (n.getAttribute("data-testid") === "hero-stats" || !!n.querySelector(":scope > [data-testid=hero-stats]"));
        });
        soft("hero-stats", isFirst, "must be the FIRST content block after the page header");
        // Tabular numerals on the verdict values (soft).
        const vals = page.getByTestId("hero-stat-value");
        const nVals = await vals.count();
        soft("hero-stat-value", nVals > 0, "≥1 value expected inside hero-stats");
        for (let i = 0; i < nVals; i++) {
          const fvn = await vals.nth(i).evaluate((el) => getComputedStyle(el).fontVariantNumeric);
          soft(`hero-stat-value[${i}] tabular-nums`, /tabular-nums/.test(fvn), `font-variant-numeric="${fvn}"`);
        }
      }

      // 3. Top movers (a19): ≥1 mover-row, each with a delta arrow svg.
      const movers = page.getByTestId("top-movers");
      if ((await movers.count()) === 0) {
        testInfo.annotations.push({ type: "soft-fail", description: "top-movers not in baseline" });
        expect.soft(false, "top-movers (a19) missing").toBe(true);
      } else {
        await expect(movers).toBeVisible();
        const rows = movers.getByTestId("mover-row");
        const n = await rows.count();
        soft("mover-row", n >= 1, "≥1 mover-row expected");
        for (let i = 0; i < n; i++) soft(`mover-row[${i}] delta arrow`, (await rows.nth(i).locator("svg").count()) > 0, "missing delta arrow svg");
      }

      // 4. News mini-feed (a20): ≥1 row; each favicon img decoded (naturalWidth>0) or a fallback glyph rendered.
      const feed = page.getByTestId("news-mini-feed");
      if ((await feed.count()) === 0) {
        testInfo.annotations.push({ type: "soft-fail", description: "news-mini-feed not in baseline" });
        expect.soft(false, "news-mini-feed (a20) missing").toBe(true);
      } else {
        await expect(feed).toBeVisible();
        const rows = feed.locator("[data-testid=news-mini-row], li, a[href]");
        const n = await rows.count();
        soft("news-mini-feed rows", n >= 1, "≥1 row expected");
        const bad = await feed.evaluate((root) => {
          const items = Array.from(root.querySelectorAll<HTMLElement>("[data-testid=news-mini-row], li"));
          const out: string[] = [];
          for (const it of items) {
            const img = it.querySelector("img");
            if (img) {
              if (!(img.complete && img.naturalWidth > 0)) out.push(`img ${img.getAttribute("src") ?? "?"} not decoded`);
            } else if (!it.querySelector("svg, [data-testid=favicon-fallback], [data-fallback], .favicon-fallback")) {
              out.push(`row "${(it.textContent ?? "").trim().slice(0, 40)}" has neither favicon img nor fallback glyph`);
            }
          }
          return out;
        });
        soft("news-mini-feed favicons", bad.length === 0, bad.join(" | ") || "ok");
      }

      // 5. Existing cards still render: KPI tiles (kpi-tiles.tsx → <dl> of .card), KPI heatmap (heatmap-ssr.tsx), paged table (paged-table.tsx/data-table.tsx).
      const kpiDl = page.locator("main dl").filter({ has: page.locator(".card") }).first();
      await expect(kpiDl, "KPI tiles <dl> renders").toBeVisible();
      expect(await kpiDl.locator(".card").count(), "≥5 KPI tiles").toBeGreaterThanOrEqual(5);
      await expect(page.locator('[aria-label="KPI heatmap, scrollable"] table').first(), "KPI heatmap table renders").toBeVisible();
      await expect(page.getByTestId("company-table").first(), "paged company table renders").toBeVisible();
      await expect(page.getByTestId("table-status").first(), "paged table status row renders").toBeVisible();
      expect(await page.getByTestId("company-table").first().locator("tbody tr").count(), "table has rows").toBeGreaterThan(0);

      // 6. Data-source badge shows live|partial.
      const badge = page.getByTestId("data-source-badge").first();
      await expect(badge, "data-source-badge present").toBeVisible();
      const src = await badge.getAttribute("data-source");
      testInfo.annotations.push({ type: "data-source", description: String(src) });
      expect(["live", "partial"], `data-source-badge data-source="${src}" must be live|partial`).toContain(src);

      // 7. No horizontal overflow (hard at 390, also checked at 1440).
      expect(await noHorizontalOverflow(page), `no horizontal overflow at ${vp.width}px`).toBe(true);

      // 8. Screenshot proof.
      fs.mkdirSync(PROOF_DIR, { recursive: true });
      const shot = path.join(PROOF_DIR, `${LABEL}-${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await testInfo.attach(`overview-${LABEL}-${vp.width}x${vp.height}`, { path: shot, contentType: "image/png" });

      // 9. axe-core sweep — WCAG 2.0/2.1/2.2 A+AA; 0 serious/critical.
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
      testInfo.annotations.push({
        type: "axe",
        description: JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))),
      });
      expect(
        bad,
        JSON.stringify(bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1),
      ).toEqual([]);

      // 10. Client errors so far (the fixture re-asserts after the test; this gives an in-test annotation for the report).
      if (errors.length) testInfo.annotations.push({ type: "client-errors-at-end", description: errors.slice(0, 5).join(" | ") });
    });
  });
}
