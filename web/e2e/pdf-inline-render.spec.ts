/**
 * pdf-inline-render.spec.ts — UNIT 3: a PDF artifact opened in the side pane (`artifact-open-pane`) and in the Artifacts preview pane renders
 * pdf.js pages (`pdf-pages[data-state=ready]` with ≥ 1 `pdf-page` canvas) OR the honest fallback (`preview-unavailable` img) — never the
 * browser's "can't render PDFs inline" <object> and never a broken-document placeholder.
 *   cd web && BASE_URL=https://sb-… node node_modules/@playwright/test/cli.js test e2e/pdf-inline-render.spec.ts --project=desktop --workers=1
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

async function firstPdfCard(page: Page): Promise<Locator | null> {
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("artifacts-list").or(page.getByTestId("artifacts-empty")).first()).toBeVisible({ timeout: 30_000 });
  const cards = page.getByTestId("artifact-card");
  await expect.poll(() => cards.count(), { timeout: 20_000 }).toBeGreaterThan(0).catch(() => undefined);
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const badge = ((await c.getByTestId("artifact-kind").textContent()) ?? "").trim().toUpperCase();
    const icon = await c.getAttribute("data-icon");
    if (badge === "PDF" || icon === "pdf") return c;
  }
  return null;
}

async function expectPagesOrFallback(scope: Locator | Page, label: string) {
  const pages = scope.getByTestId("pdf-pages");
  await expect(pages, `${label}: pdf-pages container`).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => pages.getAttribute("data-state"), { timeout: 45_000, message: `${label}: pdf-pages leaves loading` }).not.toBe("loading");
  const state = await pages.getAttribute("data-state");
  if (state === "ready") {
    const canvases = pages.getByTestId("pdf-page");
    await expect.poll(() => canvases.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    const count = Number(await pages.getAttribute("data-page-count"));
    expect(count, `${label}: data-page-count`).toBeGreaterThan(0);
    await expect(pages.locator(".art-pdf-caption").first()).toContainText(/Page 1 \/ \d+/);
    // the first canvas actually painted (non-zero backing store)
    const painted = await canvases.first().evaluate((c) => { const el = c as HTMLCanvasElement; return el.width > 0 && el.height > 0; });
    expect(painted, `${label}: first canvas has a backing store`).toBe(true);
    return "ready" as const;
  }
  await expect(pages.getByTestId("preview-unavailable"), `${label}: fallback`).toBeVisible();
  await expect(pages.getByTestId("preview-unavailable-icon")).toHaveAttribute("src", /preview-unavailable\.png$/);
  await expect(pages.getByTestId("preview-unavailable")).toContainText(/Preview unavailable/);
  return "error" as const;
}

test("PDF artifact → side pane renders pdf.js pages (or the preview-unavailable fallback)", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  const card = await firstPdfCard(page);
  test.skip(!card, "no PDF artifact in this backend");
  await card!.scrollIntoViewIfNeeded();
  await card!.getByTestId("artifact-open-pane").click();
  const pane = page.getByTestId("side-pane");
  await expect(pane).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByTestId("side-pane-pdf")).toBeVisible();
  // never the old <object> + "can't render PDFs inline"
  await expect(pane.locator("object[type='application/pdf']")).toHaveCount(0);
  await expect(pane).not.toContainText(/can't render PDFs inline/i);
  const result = await expectPagesOrFallback(pane, "side pane");
  await page.screenshot({ path: info.outputPath(`side-pane-pdf-${result}.png`) });
  info.annotations.push({ type: "pdf-side-pane", description: result });
});

test("PDF artifact → Artifacts preview pane renders pdf.js pages (or the fallback), one meta line, H1-style file name", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  const card = await firstPdfCard(page);
  test.skip(!card, "no PDF artifact in this backend");
  await card!.scrollIntoViewIfNeeded();
  await card!.getByTestId("artifact-preview-btn").click();
  const preview = page.getByTestId("artifact-preview");
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(preview.locator("iframe")).toHaveCount(0);
  const result = await expectPagesOrFallback(preview, "preview pane");
  await page.screenshot({ path: info.outputPath(`preview-pdf-${result}.png`) });
  // meta: exactly one line with vN · size · age; the snippet never repeats "PDF · <size>"
  await expect(card!.getByTestId("artifact-meta")).toHaveCount(1);
  await expect(card!.getByTestId("artifact-meta")).toContainText(/^v\d+/);
  const snippet = card!.getByTestId("artifact-snippet");
  if (await snippet.count()) await expect(snippet).not.toContainText(/PDF · \d/);
  // version-history toggle carries the version-history icon
  const toggle = card!.getByTestId("artifact-versions-toggle");
  if (await toggle.count()) await expect(toggle.locator("img")).toHaveAttribute("src", /version-history\.png$/);
});

test("non-PDF office artifact in the side pane shows the preview-unavailable fallback (when one exists)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeSettings(page);
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("artifacts-list").or(page.getByTestId("artifacts-empty")).first()).toBeVisible({ timeout: 30_000 });
  const office = page.getByTestId("artifact-card").filter({ has: page.locator("[data-testid='artifact-kind']", { hasText: /^(DOCX|XLSX|PPTX|DOC|XLS|PPT)$/ }) }).first();
  test.skip((await office.count()) === 0, "no docx/xlsx/pptx artifact in this backend");
  await office.getByTestId("artifact-open-pane").click();
  const pane = page.getByTestId("side-pane");
  await expect(pane.getByTestId("preview-unavailable")).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByTestId("preview-unavailable")).toContainText("Preview not available for this format");
  await expect(pane.getByTestId("preview-open-tab").locator("img")).toHaveAttribute("src", /open-externally\.png$/);
});
