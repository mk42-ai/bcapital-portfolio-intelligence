/**
 * chip-overlap.spec.ts — UNIT 3: no two of an artifact card's badges / name / meta line may overlap, at 1440×900 and 390×844.
 * Hard assertion on /artifacts?skip=1 (every `artifact-card`); the in-chat compact card is asserted too when a thread with artifacts exists.
 *   cd web && BASE_URL=https://sb-… node node_modules/@playwright/test/cli.js test e2e/chip-overlap.spec.ts --project=desktop --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

type Box = { sel: string; text: string; x: number; y: number; w: number; h: number };
type CardReport = { id: string; name: string; overlaps: string[] };

const SELECTORS = ".art-badge, .art-card-meta, .art-card-name";

/** For each card, pairwise-intersect the bounding boxes of its badges/name/meta (1px tolerance; nested boxes — a badge INSIDE the meta line — are skipped). */
async function overlapReport(page: Page): Promise<CardReport[]> {
  return page.evaluate((selectors) => {
    const out: { id: string; name: string; overlaps: string[] }[] = [];
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="artifact-card"]'));
    for (const card of cards) {
      const els = Array.from(card.querySelectorAll<HTMLElement>(selectors)).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const boxes = els.map((el) => { const r = el.getBoundingClientRect(); return { el, sel: el.className, text: (el.textContent ?? "").trim().slice(0, 32), x: r.left, y: r.top, w: r.width, h: r.height }; });
      const overlaps: string[] = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // nesting (version badge inside the meta line) is by design
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 1 && iy > 1) overlaps.push(`"${a.text}" [${a.sel}] ∩ "${b.text}" [${b.sel}] = ${Math.round(ix)}×${Math.round(iy)}px`);
      }
      out.push({ id: card.dataset.id ?? "", name: card.querySelector(".art-card-name")?.textContent?.trim() ?? "", overlaps });
    }
    return out;
  }, SELECTORS);
}

for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`artifact cards: no chip/meta/name overlap on /artifacts at ${vp.width}×${vp.height}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await primeSettings(page);
    await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("artifacts-list").or(page.getByTestId("artifacts-empty")).first()).toBeVisible({ timeout: 30_000 });
    const cards = page.getByTestId("artifact-card");
    // the page waits for the first backend refresh before painting cards — give it up to 20 s before deciding the backend is empty
    await expect.poll(() => cards.count(), { timeout: 20_000 }).toBeGreaterThan(0).catch(() => undefined);
    const n = await cards.count();
    test.skip(n === 0, "no artifacts in this backend — nothing to measure");
    await page.waitForTimeout(800); // relative-time / status chips settle
    // scroll every card into view once so lazy probes (snippets) have rendered
    for (let i = 0; i < Math.min(n, 12); i++) await cards.nth(i).scrollIntoViewIfNeeded();
    const report = await overlapReport(page);
    await info.attach(`overlap-${vp.width}.json`, { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath(`artifacts-${vp.width}.png`), fullPage: false });
    const bad = report.filter((c) => c.overlaps.length);
    expect(bad, `cards with overlapping chips:\n${bad.map((c) => `${c.name}\n  ${c.overlaps.join("\n  ")}`).join("\n")}`).toEqual([]);
    // no floating count badge in the rail; the count (if any) sits inside the Artifacts nav item
    await expect(page.getByTestId("artifacts-toggle-shell")).toHaveCount(0);
    if (vp.width >= 1024) await expect(page.getByTestId("nav-artifacts-count")).toHaveAttribute("data-count", /^\d+$/);
    // one meta line per card, size never repeated by the snippet
    for (let i = 0; i < Math.min(n, 6); i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId("artifact-meta")).toHaveCount(1);
      const meta = (await card.getByTestId("artifact-meta").textContent()) ?? "";
      const size = meta.match(/\d+(\.\d+)?\s*(B|KB|MB)/)?.[0];
      const snippet = (await card.getByTestId("artifact-snippet").count()) ? (await card.getByTestId("artifact-snippet").textContent()) ?? "" : "";
      if (size) expect(snippet, `snippet repeats the size "${size}"`).not.toContain(size);
    }
  });
}

test("in-chat compact artifact card has no overlapping chips (when a thread with artifacts exists)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("artifacts-list").or(page.getByTestId("artifacts-empty")).first()).toBeVisible({ timeout: 30_000 });
  const threadId = await page.getByTestId("artifact-card").evaluateAll((els) => (els as HTMLElement[]).map((e) => e.getAttribute("data-thread") ?? "").find(Boolean) ?? "");
  const compactCount = async () => page.locator(".art-card.is-compact").count();
  if (threadId) await page.goto(`/chat?thread=${encodeURIComponent(threadId)}&skip=1`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  else await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const n = await compactCount();
  test.skip(n === 0, "no inline artifact card in the chat view for this backend — /artifacts is the hard assertion");
  const report = await overlapReport(page);
  const bad = report.filter((c) => c.overlaps.length);
  expect(bad, bad.map((c) => `${c.name}: ${c.overlaps.join("; ")}`).join("\n")).toEqual([]);
});
