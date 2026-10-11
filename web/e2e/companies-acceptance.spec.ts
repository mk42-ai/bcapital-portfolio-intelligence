/**
 * a35 — /companies acceptance + axe spec (pass-3).
 *
 * Hard assertions: 0 console/page errors, ≥20 rendered rows + data-total ≥ 100 (virtualised), A–Z rail works,
 * axe wcag2a/wcag2aa/wcag22aa → 0 serious/critical, no horizontal overflow at 390.
 * Everything that depends on a sibling pass-3 task (a27 sentiment card, a29 sector chips, a33 keyboard, a37 URL state)
 * and the logo/sort/view-toggle polish is `expect.soft` + an annotation, so a run on the baseline reports the
 * before-state precisely instead of aborting on the first missing testid.
 *
 * Run (one project, one worker):
 *   BASE_URL=https://sb-1gizcktepfgc.vercel.run node node_modules/@playwright/test/cli.js test e2e/companies-acceptance.spec.ts --project=desktop --workers=1
 * Screenshots → web/proof/pass-3/companies/<label>-<WxH>.png
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { captureErrors, primeSettings } from "./helpers";

const PROOF_DIR = path.resolve(__dirname, "..", "proof", "pass-3", "companies");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
}

async function shot(page: Page, label: string, vp: { width: number; height: number }) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  await page.screenshot({ path: path.join(PROOF_DIR, `${label}-${vp.width}x${vp.height}.png`), fullPage: false });
}

async function visibleRows(page: Page) {
  const rows = page.getByTestId("company-row");
  const n = await rows.count();
  const out: ReturnType<typeof rows.nth>[] = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const box = await r.boundingBox();
    if (box && box.y + box.height > 0 && box.y < page.viewportSize()!.height) out.push(r);
  }
  return out;
}

async function firstVisibleRowName(page: Page, headerBottom: number) {
  return page.evaluate((hb) => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="company-row"]')]
      .map((r) => ({ r, top: r.getBoundingClientRect().top, bottom: r.getBoundingClientRect().bottom }))
      .filter((x) => x.bottom > hb + 1)
      .sort((a, b) => a.top - b.top);
    return rows[0]?.r.querySelector('[data-testid="company-row-name"]')?.textContent?.trim() ?? "";
  }, headerBottom);
}

for (const vp of VIEWPORTS) {
  test.describe(`/companies acceptance (${vp.name} ${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`list, cards, chips, sort, keyboard, URL state, A–Z, axe, overflow`, async ({ page }, testInfo) => {
      const errors = captureErrors(page);
      await primeSettings(page);
      await page.goto("/companies?skip=1");

      // ---------- list rendered (hard) ----------
      const list = page.getByTestId("companies-list");
      await expect(list).toBeVisible();
      await expect(list).toHaveAttribute("data-total", /^\d+$/);
      const total = Number(await list.getAttribute("data-total"));
      expect(total, "companies-list data-total ≥ 100").toBeGreaterThanOrEqual(100);
      await expect.poll(() => page.getByTestId("company-row").count(), { message: "company-row rendered" }).toBeGreaterThan(0);
      const indicesAt = () => page.locator('[data-testid="company-row"]').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.index)));
      const seen = new Set<number>(await indicesAt());
      const atTop = seen.size;
      await shot(page, "list-top", vp);

      // virtualised: the DOM only holds the window (+overscan), so "≥20 rows rendered" is measured as the union of
      // distinct data-index values rendered across two scroll positions; data-total must still report the full set.
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(400);
      for (const i of await indicesAt()) seen.add(i);
      expect(Number(await list.getAttribute("data-total")), "data-total ≥ 100 after scroll").toBeGreaterThanOrEqual(100);
      note(testInfo, "list", `data-total=${total}, rows in DOM at top=${atTop}, distinct rows rendered across scroll=${seen.size}`);
      expect(seen.size, "≥20 distinct company-row rendered (virtualised, across scroll)").toBeGreaterThanOrEqual(20);
      await shot(page, "list-scrolled", vp);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);

      // ---------- logo chip per visible row (soft) ----------
      const rows = await visibleRows(page);
      let logoMissing = 0;
      for (const r of rows) {
        const ok = await r.evaluate((el) => {
          const imgs = [...el.querySelectorAll("img")];
          if (imgs.some((i) => i.complete && i.naturalWidth > 0)) return true;
          const mono = el.querySelector('[data-testid="company-logo-fallback"], [data-testid="logo-img"], [data-testid*="monogram"], [role="img"][aria-label]');
          return !!mono;
        });
        if (!ok) logoMissing++;
      }
      note(testInfo, "logo", `${rows.length - logoMissing}/${rows.length} visible rows have a logo chip (img naturalWidth>0 or monogram fallback)`);
      expect.soft(logoMissing, "every visible row has a logo chip or monogram fallback").toBe(0);

      // ---------- a27: company-card-sentiment per visible row (soft) ----------
      let sentimentCount = 0;
      for (const r of rows) sentimentCount += await r.getByTestId("company-card-sentiment").count();
      if (sentimentCount === 0) note(testInfo, "a27", "company-card-sentiment not in baseline");
      else note(testInfo, "a27", `company-card-sentiment present on ${sentimentCount}/${rows.length} visible rows`);
      expect.soft(sentimentCount, "a27: company-card-sentiment per visible row").toBe(rows.length);

      // ---------- a29: sector filter chips (soft) ----------
      const chips = page.getByTestId("chip-sector");
      const chipCount = await chips.count();
      const countEl = page.getByTestId("companies-count");
      const countBefore = (await countEl.textContent()) ?? "";
      const numBefore = Number(/Showing\s+(\d+)/.exec(countBefore)?.[1] ?? NaN);
      if (chipCount === 0) {
        note(testInfo, "a29", "chip-sector not in baseline");
        expect.soft(chipCount, "a29: chip-sector chips exist").toBeGreaterThan(0);
      } else {
        const chip = chips.first();
        expect.soft(await chip.getAttribute("aria-pressed"), "a29: chip has aria-pressed").not.toBeNull();
        const chipLabel = ((await chip.getAttribute("data-sector")) ?? (await chip.textContent()) ?? "").trim();
        await chip.click();
        await expect.soft(chip, "a29: chip toggles aria-pressed=true").toHaveAttribute("aria-pressed", "true");
        await expect.soft(countEl, "a29: companies-count shrinks after sector chip").not.toHaveText(countBefore);
        const numAfter = Number(/Showing\s+(\d+)/.exec((await countEl.textContent()) ?? "")?.[1] ?? NaN);
        expect.soft(numAfter, "a29: filtered count < unfiltered").toBeLessThan(numBefore);
        const selectVal = await page.getByTestId("companies-sector").inputValue().catch(() => "");
        expect.soft(selectVal.toLowerCase(), "a29: hidden companies-sector select in sync with chip").toContain(chipLabel.toLowerCase().slice(0, 4));
        // a37: URL state
        const url = new URL(page.url());
        if (!url.searchParams.has("sector")) note(testInfo, "a37", "?sector= URL state not in baseline");
        expect.soft(url.searchParams.get("sector"), "a37: selecting a sector writes ?sector=").toBeTruthy();
        await shot(page, "sector-chip", vp);
        await chip.click(); // reset
        await page.waitForTimeout(200);
      }
      // a37 via the select too (baseline path) — soft
      {
        const sel = page.getByTestId("companies-sector");
        const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
        if (opts.length > 0) {
          await sel.selectOption(opts[0]);
          await page.waitForTimeout(250);
          const hasParam = new URL(page.url()).searchParams.get("sector");
          if (!hasParam) note(testInfo, "a37", "select → ?sector= URL state not in baseline");
          expect.soft(hasParam, "a37: companies-sector select writes ?sector=").toBeTruthy();
          const numSel = Number(/Showing\s+(\d+)/.exec((await countEl.textContent()) ?? "")?.[1] ?? NaN);
          expect(numSel, "sector select reduces companies-count").toBeLessThan(numBefore);
          await sel.selectOption("");
          await page.waitForTimeout(250);
        }
      }

      // ---------- sort select options (soft) ----------
      const sortOpts = await page.getByTestId("companies-sort").locator("option").evaluateAll((os) => os.map((o) => `${(o as HTMLOptionElement).value}|${o.textContent}`.toLowerCase()));
      note(testInfo, "sort", `options: ${sortOpts.join(", ")}`);
      expect.soft(sortOpts.some((o) => /delta|change|Δ/.test(o)), "sort offers delta").toBe(true);
      expect.soft(sortOpts.some((o) => /news/.test(o)), "sort offers news").toBe(true);
      expect.soft(sortOpts.some((o) => /deal/.test(o)), "sort offers last deal").toBe(true);

      // ---------- view toggle (soft) ----------
      const gridBtn = page.getByTestId("companies-view-grid");
      if ((await gridBtn.count()) === 0) {
        note(testInfo, "view", "companies-view-grid not in baseline");
        expect.soft(await gridBtn.count(), "companies-view-grid exists").toBeGreaterThan(0);
      } else {
        const before = await list.getAttribute("data-view");
        await gridBtn.click();
        await expect.soft(list, "view toggle switches data-view").not.toHaveAttribute("data-view", before ?? "__none__");
        await shot(page, "view-grid", vp);
        const listBtn = page.getByTestId("companies-view-list");
        if (await listBtn.count()) await listBtn.click();
      }

      // ---------- a33 keyboard: Tab → first company-row-link, ArrowDown moves focus (soft) ----------
      {
        await page.evaluate(() => window.scrollTo(0, 0));
        const firstLink = page.locator('[data-testid="company-row-link"][data-index="0"]');
        // Tab from the element just before the list (the count/status) to avoid walking the whole header.
        await page.getByTestId("companies-count").evaluate((el) => (el as HTMLElement).setAttribute("tabindex", "-1"));
        await page.getByTestId("companies-count").focus();
        let reached = false;
        for (let i = 0; i < 12 && !reached; i++) {
          await page.keyboard.press("Tab");
          reached = await firstLink.evaluate((el) => el === document.activeElement).catch(() => false);
        }
        if (!reached) note(testInfo, "a33", "Tab did not reach company-row-link[0] within 12 tabs");
        expect.soft(reached, "a33: Tab reaches the first company-row-link").toBe(true);
        if (!reached) await firstLink.focus();
        await page.keyboard.press("ArrowDown");
        const focusedIdx = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.index ?? null);
        if (focusedIdx !== "1") note(testInfo, "a33", `ArrowDown focus → data-index=${focusedIdx} (expected 1)`);
        expect.soft(focusedIdx, "a33: ArrowDown moves focus to row 1").toBe("1");
        await shot(page, "keyboard-focus", vp);
      }

      // ---------- A–Z rail (hard on desktop where the rail is rendered; soft on mobile where it is lg:flex-hidden) ----------
      {
        const az = page.getByTestId("companies-az");
        const railVisible = await az.isVisible().catch(() => false);
        if (railVisible) {
          const letters = await az.locator("button[data-letter]").evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.letter!));
          const pick = letters.find((l) => /^[M-T]$/.test(l)) ?? letters[Math.floor(letters.length / 2)];
          await az.locator(`button[data-letter="${pick}"]`).click();
          await page.waitForTimeout(400);
          const hb = await page.getByTestId("companies-filter-bar").evaluate((el) => el.getBoundingClientRect().bottom).catch(() => 0);
          const first = await firstVisibleRowName(page, hb);
          note(testInfo, "az", `clicked ${pick} → first visible row "${first}"`);
          expect(first.toUpperCase().startsWith(pick), `A–Z rail: first visible row starts with ${pick} (got "${first}")`).toBe(true);
          await shot(page, `az-${pick}`, vp);
          await page.evaluate(() => window.scrollTo(0, 0));
        } else {
          note(testInfo, "az", "companies-az rail hidden at this viewport (lg:flex)");
          expect.soft(railVisible, "A–Z rail visible").toBe(vp.width >= 1024);
        }
      }

      // ---------- no horizontal overflow (hard at 390, also checked at 1440) ----------
      {
        const ov = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          bsw: document.body.scrollWidth,
        }));
        note(testInfo, "overflow", JSON.stringify(ov));
        expect(ov.sw, "documentElement.scrollWidth ≤ clientWidth").toBeLessThanOrEqual(ov.cw + 1);
        expect(ov.bsw, "body.scrollWidth ≤ clientWidth").toBeLessThanOrEqual(ov.cw + 1);
      }

      await shot(page, "final", vp);

      // ---------- axe (hard) ----------
      {
        await page.waitForLoadState("networkidle").catch(() => {});
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
        const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
        note(testInfo, "axe", JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))));
        expect(
          bad,
          JSON.stringify(bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1),
        ).toEqual([]);
      }

      // ---------- 0 console / page errors (hard) ----------
      expect(errors, "console/page errors").toEqual([]);
    });
  });
}
