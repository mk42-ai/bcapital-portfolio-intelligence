import { test, expect } from "./helpers";

/**
 * Brand audit: B Capital is GREEN only (#0AC985 / #047857 / #E6FAF3). No computed colour on any element may be blue-ish,
 * and no route may overflow horizontally, at desktop 1440×900 and mobile 390×844.
 * Blue-ish = parsed rgb where b > r+40 && b > g+40 and the colour has visible chroma (max−min ≥ 40) — neutral slates/grays pass.
 */
const ROUTES = ["/overview", "/companies", "/news", "/chat?skip=1", "/settings", "/company/1au"];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
/** Legacy blues that must never appear (kept as explicit negative assertions, same as growth.spec.ts). */
const BLUES = ["rgb(29, 78, 216)", "rgb(37, 99, 235)", "rgb(59, 130, 246)", "rgb(2, 133, 255)"];
/** Company palette swatches + the single `--co-accent` dot on /company/[slug] legitimately show the company's own colours
 *  (src/components/company/brand-theme.tsx Swatches + CompanyThemeScope; src/app/company/[slug]/page.tsx accent dot). */
const SWATCH_ALLOW = '[data-testid="brand-swatches"], .swatch, ul[aria-label="Palette swatches with WCAG contrast"], [style*="co-accent"]';

type Offender = { tag: string; cls: string; prop: string; value: string };

async function sweep(page: import("@playwright/test").Page) {
  return page.evaluate(({ allow, blues }) => {
    const parse = (v: string) => { const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null; };
    const isBlue = (v: string) => { const c = parse(v); if (!c || c.a === 0) return false; const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b); return c.b > c.r + 40 && c.b > c.g + 40 && chroma >= 40; };
    const props = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color"];
    const all = Array.from(document.querySelectorAll("body *")).slice(0, 4000);
    const bad: Offender[] = []; const mdLinks: { value: string; green: boolean }[] = [];
    for (const el of all) {
      if (el.closest("img, svg, picture, video, canvas") || el.tagName === "IMG" || el.tagName === "SVG") continue;
      if (el.closest(allow)) continue;
      const cs = getComputedStyle(el);
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (p === "outline-color" && cs.outlineStyle === "none") continue;
        if (blues.includes(v) || isBlue(v)) bad.push({ tag: el.tagName.toLowerCase(), cls: String((el as HTMLElement).className).slice(0, 60), prop: p, value: v });
      }
      if (el.tagName === "A" && el.closest(".oiu-md")) { const c = parse(cs.color); mdLinks.push({ value: cs.color, green: !!c && c.g > c.r + 20 && c.g > c.b - 10 }); }
    }
    const overflow = { scrollWidth: document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth, innerWidth: window.innerWidth };
    return { bad, mdLinks, scanned: all.length, overflow };
  }, { allow: SWATCH_ALLOW, blues: BLUES });
}

for (const vp of VIEWPORTS) {
  test.describe(`brand @ ${vp.width}×${vp.height}`, () => {
    for (const route of ROUTES) {
      test(`${route}: zero blue, no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize(vp);
        const res = await page.goto(route, { waitUntil: "domcontentloaded" });
        test.skip(!res || res.status() >= 500, `route ${route} unavailable (${res?.status()})`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(500);
        const r = await sweep(page);
        expect(r.scanned, "page rendered something").toBeGreaterThan(5);
        const uniq = Array.from(new Map(r.bad.map((o) => [`${o.tag}.${o.cls}|${o.prop}|${o.value}`, o])).values());
        expect(uniq, `blue-ish computed colours on ${route}: ${uniq.map((o) => `${o.tag}.${o.cls} ${o.prop}=${o.value}`).join("; ")}`).toEqual([]);
        for (const l of r.mdLinks) expect(l.green, `.oiu-md link colour should be brand green, got ${l.value}`).toBe(true);
        expect(r.overflow.scrollWidth, `horizontal overflow on ${route}: scrollWidth ${r.overflow.scrollWidth} > innerWidth ${r.overflow.innerWidth}`).toBeLessThanOrEqual(r.overflow.innerWidth);
      });
    }
  });
}
