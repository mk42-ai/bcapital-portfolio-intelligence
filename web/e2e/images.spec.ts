import type { Page } from "@playwright/test";
import { test, expect } from "./helpers";

/** naturalWidth of every matched <img> after it has finished loading (0 = broken / not loaded). */
async function naturalWidths(page: Page, selector: string): Promise<number[]> {
  return page.$$eval(selector, async (els: Element[]) => {
    const imgs = els as HTMLImageElement[];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((done) => {
            if (img.complete) return done();
            img.addEventListener("load", () => done(), { once: true });
            img.addEventListener("error", () => done(), { once: true });
            setTimeout(done, 15_000);
          }),
      ),
    );
    return imgs.map((img) => img.naturalWidth);
  });
}

test.describe("Images render (naturalWidth > 0)", () => {
  test("overview: B Capital logo and (when present) company logos", async ({ page }, testInfo) => {
    await page.goto("/overview?skip=1");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
    const brand = page.locator('img[data-testid="brand-logo"]').first();
    await expect(brand).toBeAttached();
    await expect.poll(() => naturalWidths(page, 'img[data-testid="brand-logo"]'), { timeout: 20_000 }).toEqual(expect.arrayContaining([expect.any(Number)]));
    const brandW = await naturalWidths(page, 'img[data-testid="brand-logo"]');
    expect(brandW[0], "B Capital brand logo naturalWidth").toBeGreaterThan(0);

    // Company logos in the table are being added by SA2; soft-skip when the deployed build does not render them yet.
    await page.waitForLoadState("networkidle").catch(() => {});
    const logoCount = await page.locator('img[data-testid="company-logo"]').count();
    if (logoCount === 0) {
      testInfo.annotations.push({ type: "soft-skip", description: 'no img[data-testid="company-logo"] on /overview (deployed build predates SA2 logos) — company-logo assertion skipped' });
      console.log('[images] SOFT-SKIP: no img[data-testid="company-logo"] on /overview in this build');
      return;
    }
    // Logos are loading="lazy": scroll the table into view and wait for decode before measuring.
    await page.locator('[data-testid="company-table"]').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await naturalWidths(page, 'img[data-testid="company-logo"]')).filter((w) => w > 0).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    const widths = await naturalWidths(page, 'img[data-testid="company-logo"]');
    const loaded = widths.filter((w) => w > 0).length;
    console.log(`[images] overview company logos: ${loaded}/${widths.length} loaded`);
    expect(loaded, "≥1 company logo with naturalWidth>0").toBeGreaterThanOrEqual(1);
  });

  test("company page: Fervo logo and news-card images", async ({ page }, testInfo) => {
    await page.goto("/company/fervo-energy?skip=1");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fervo/);
    const logoSel = 'img[data-testid="company-logo"], header img[alt$=" logo"], main img[alt$=" logo"]';
    const logo = page.locator(logoSel).first();
    await expect(logo, "company logo img rendered").toBeAttached();
    await expect.poll(async () => (await naturalWidths(page, logoSel))[0] ?? 0, { timeout: 20_000, message: "company logo naturalWidth>0" }).toBeGreaterThan(0);

    // News-card images: only asserted when the data has at least one image_url (an <img> inside an <article>).
    await page.waitForLoadState("networkidle").catch(() => {});
    const newsSel = 'article img[data-testid="news-image"], article img';
    const n = await page.locator(newsSel).count();
    const placeholders = await page.locator('[data-testid="news-image-placeholder"]').count();
    if (n === 0) {
      testInfo.annotations.push({ type: "soft-skip", description: `no <article> images on /company/fervo-energy (placeholders=${placeholders}) — no image_url in data, news-image assertion skipped` });
      console.log(`[images] SOFT-SKIP: no news-card <img> (placeholders=${placeholders})`);
      return;
    }
    const widths = await naturalWidths(page, newsSel);
    const loaded = widths.filter((w) => w > 0).length;
    console.log(`[images] fervo news images: ${loaded}/${widths.length} loaded`);
    testInfo.annotations.push({ type: "news-images", description: `${loaded}/${widths.length} loaded` });
    expect(loaded, "≥1 news-card image with naturalWidth>0").toBeGreaterThanOrEqual(1);
  });
});

/* ───────────────────────────── TEAM IMAGES regression tests (proxy, fallback chain, decode) ───────────────────────────── */

type ImgState = { src: string; complete: boolean; naturalWidth: number; kind: string | null };

/** Wait until every matched <img> has settled (complete), then report src/naturalWidth/kind for each. */
async function imgStates(page: Page, selector: string, cap = 120): Promise<ImgState[]> {
  return page.$$eval(selector, async (els: Element[], cap: number) => {
    const imgs = (els as HTMLImageElement[]).slice(0, cap);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((done) => {
            if (img.complete) return done();
            img.addEventListener("load", () => done(), { once: true });
            img.addEventListener("error", () => done(), { once: true });
            setTimeout(done, 15_000);
          }),
      ),
    );
    return imgs.map((img) => ({ src: img.currentSrc || img.src, complete: img.complete, naturalWidth: img.naturalWidth, kind: img.getAttribute("data-thumb-kind") }));
  }, cap);
}

const isFallbackTile = (s: ImgState) => s.src.includes("/assets/news-card") || s.src.includes("/fallbacks/");

test.describe("Image pipeline (proxy + fallback chain)", () => {
  test("News Pulse: first-page thumbnails decode (naturalWidth>0)", async ({ page }, testInfo) => {
    await page.goto("/news?skip=1");
    await page.waitForSelector('[data-testid="news-image"], [data-testid="news-image-placeholder"]', { timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    // Thumbnails below the fold are loading="lazy": scroll the first page into view so the browser actually fetches them.
    await page.evaluate(async () => {
      const step = Math.max(400, window.innerHeight * 0.8);
      for (let y = 0; y < Math.min(document.body.scrollHeight, 12_000); y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    // The fallback chain advances asynchronously (proxy 204 → logo → favicon → monogram → tile); poll until every img is settled and decodable.
    const sel = 'img[data-testid="news-image"], img[data-testid="news-image-placeholder"]';
    await expect
      .poll(async () => {
        const st = await imgStates(page, sel);
        return st.length > 0 && st.every((s) => s.naturalWidth > 0 || (s.complete && isFallbackTile(s)));
      }, { timeout: 45_000, message: "every first-page news thumbnail decodes (or has settled on the webp fallback tile)" })
      .toBe(true);
    const states = await imgStates(page, sel);
    const broken = states.filter((s) => !(s.naturalWidth > 0 || (s.complete && isFallbackTile(s))));
    const realCount = await page.locator('img[data-testid="news-image"]').count();
    const placeholderCount = await page.locator('[data-testid="news-image-placeholder"]').count();
    const monogramCount = await page.locator('article [data-testid="logo-monogram"]').count();
    const kinds = states.reduce<Record<string, number>>((acc, s) => { const k = s.kind ?? (isFallbackTile(s) ? "placeholder" : "unknown"); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    const total = realCount + placeholderCount + monogramCount;
    const nonPlaceholder = realCount + monogramCount;
    const summary = `news thumbs: ${states.length} measured, kinds=${JSON.stringify(kinds)}, real=${realCount} monogram=${monogramCount} placeholder=${placeholderCount}, broken=${broken.length}`;
    console.log(`[images] ${summary}`);
    testInfo.annotations.push({ type: "news-thumbs", description: summary });
    expect(broken.map((b) => b.src), "no broken news thumbnail (complete && naturalWidth===0 && not a fallback tile)").toEqual([]);
    expect(states.length, "at least one news thumbnail rendered on the first page").toBeGreaterThan(0);
    expect(nonPlaceholder / Math.max(1, total), "≥70 % of first-page thumbnails are a real image/logo/favicon/monogram, not the placeholder tile").toBeGreaterThanOrEqual(0.7);
  });

  test("Companies logos decode on /overview table", async ({ page }, testInfo) => {
    await page.goto("/overview?skip=1");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
    const table = page.locator('[data-testid="company-table"]');
    await expect(table).toBeVisible({ timeout: 30_000 });
    await table.scrollIntoViewIfNeeded();
    const rows = table.locator("tbody tr");
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const rowCount = Math.min(50, await rows.count());
    // Lazy logos: bring the first 50 rows through the viewport so they are fetched.
    for (let r = 0; r < rowCount; r += 10) await rows.nth(Math.min(r, rowCount - 1)).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle").catch(() => {});
    const scope = `[data-testid="company-table"] tbody tr:nth-child(-n+${rowCount})`;
    const logoSel = `${scope} img[data-testid="company-logo"]`;
    const swappedSel = `${scope} [data-testid="company-logo-fallback"]`;
    // Wait until every remaining <img> has decoded or been swapped to the monogram (the swap removes the <img> from the DOM).
    await expect
      .poll(async () => {
        const st = await imgStates(page, logoSel, 50);
        return st.every((s) => s.naturalWidth > 0);
      }, { timeout: 45_000, message: "every company-logo <img> in the first 50 rows decodes (or is swapped to the monogram)" })
      .toBe(true);
    const states = await imgStates(page, logoSel, 50);
    const decoded = states.filter((s) => s.naturalWidth > 0).length;
    const swapped = await page.locator(swappedSel).count();
    const brokenIcons = states.filter((s) => s.complete && s.naturalWidth === 0);
    const summary = `overview logos (first ${rowCount} rows): decoded=${decoded} swapped-to-monogram=${swapped} broken=${brokenIcons.length}`;
    console.log(`[images] ${summary}`);
    testInfo.annotations.push({ type: "company-logos", description: summary });
    expect(brokenIcons.map((b) => b.src), "no broken-image icon (img.complete && naturalWidth===0 && not swapped)").toEqual([]);
    expect(decoded + swapped, "every row shows either a decoded logo or a monogram").toBeGreaterThanOrEqual(rowCount);
    // Remote logos must come through the same-origin proxy — never a cross-origin hotlink that the browser could block.
    const hotlinked = states.filter((s) => /^https?:\/\//.test(s.src) && !s.src.startsWith(new URL(page.url()).origin));
    expect(hotlinked.map((h) => h.src), "no cross-origin (un-proxied) company logo").toEqual([]);
  });

  test("/api/img proxy: https image → image/*, http → 400, html page → 204", async ({ request }) => {
    const img = "https://fervoenergy.com/wp-content/uploads/2025/12/Fervo-Energy-Power-Plant-Construction-1.jpg";
    const ok = await request.get(`/api/img?u=${encodeURIComponent(img)}`, { timeout: 30_000 });
    expect(ok.status(), "https jpg proxied").toBe(200);
    expect(ok.headers()["content-type"] ?? "", "content-type image/*").toMatch(/^image\//);
    expect(ok.headers()["cache-control"] ?? "", "long-lived cache-control").toContain("max-age=86400");
    expect(["upstream", "cache"], "x-img-source header").toContain(ok.headers()["x-img-source"]);
    expect((await ok.body()).byteLength, "non-empty image body").toBeGreaterThan(1000);

    // Second hit is served from the in-memory LRU (same warm instance) or upstream again on a cold one — either is a 200 image.
    const again = await request.get(`/api/img?u=${encodeURIComponent(img)}`, { timeout: 30_000 });
    expect(again.status()).toBe(200);
    expect(again.headers()["content-type"] ?? "").toMatch(/^image\//);

    const probe = await request.get(`/api/img?u=${encodeURIComponent(img)}&probe=1`, { timeout: 30_000 });
    expect(probe.status()).toBe(200);
    const p = (await probe.json()) as { ok: boolean; status: number; contentType: string | null; bytes: number };
    expect(p.ok, "probe ok").toBe(true);
    expect(p.contentType ?? "").toMatch(/^image\//);
    expect(p.bytes).toBeGreaterThan(1000);

    const mixed = await request.get(`/api/img?u=${encodeURIComponent("http://example.com/a.jpg")}`);
    expect(mixed.status(), "http → 400 mixed content").toBe(400);
    expect((await mixed.text()).toLowerCase()).toContain("mixed content");

    // Non-image upstream: with fb=0 (what the client fallback chains request) the proxy answers 204 so onError advances.
    const html = await request.get(`/api/img?u=${encodeURIComponent("https://example.com/")}&fb=0`, { timeout: 30_000 });
    expect(html.status(), "html page + fb=0 → 204").toBe(204);
    expect((await html.body()).byteLength, "204 has no body").toBe(0);

    const missing = await request.get("/api/img");
    expect(missing.status(), "missing u → 400").toBe(400);
    const loopback = await request.get(`/api/img?u=${encodeURIComponent("https://127.0.0.1/x.png")}`);
    expect(loopback.status(), "loopback host → 400").toBe(400);
  });

  test("/api/img fallback: unreachable upstream → news-card asset (200 image/webp or 302 to /assets/news-card-*.webp)", async ({ request }) => {
    const res = await request.get(`/api/img?u=${encodeURIComponent("https://invalid.invalid/x.png")}`, { timeout: 30_000, maxRedirects: 0 });
    expect([200, 302], "fallback status").toContain(res.status());
    if (res.status() === 200) {
      expect(res.headers()["content-type"] ?? "", "fallback content-type image/webp").toBe("image/webp");
      expect(res.headers()["cache-control"] ?? "", "fallback long cache").toContain("max-age=86400");
      expect(res.headers()["x-img-source"], "x-img-source fallback").toBe("fallback");
      const body = await res.body();
      expect(body.byteLength, "non-empty webp body").toBeGreaterThan(100);
      expect(body.subarray(0, 4).toString("ascii"), "RIFF header").toBe("RIFF");
      expect(body.subarray(8, 12).toString("ascii"), "WEBP fourcc").toBe("WEBP");
    } else {
      expect(res.headers()["location"] ?? "", "302 → news-card asset").toMatch(/\/assets\/news-card-(256|512)\.webp$/);
    }
    // ≥320 px renders get the 512 variant.
    const big = await request.get(`/api/img?u=${encodeURIComponent("https://invalid.invalid/x.png")}&w=400`, { timeout: 30_000, maxRedirects: 0 });
    expect([200, 302]).toContain(big.status());
    expect(big.headers()["x-img-fallback"] ?? big.headers()["location"] ?? "", "w=400 → 512 asset").toContain("news-card-512.webp");
    // The asset the proxy points at is itself served.
    const asset = await request.get("/assets/news-card-256.webp");
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"] ?? "").toBe("image/webp");
  });
});
