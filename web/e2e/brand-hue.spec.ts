import { test, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";
import { isBlueHue } from "../src/lib/hue-audit";

/**
 * Brand hue audit — "B Capital green #0AC985 primary, charcoal text, white/neutral surfaces — computed colours must contain NO blue hues."
 * QA definition: for every element, computed color / background-color / border-*-color / outline-color / SVG fill & stroke must NOT have
 * an HSL hue in [190, 260] with saturation > 0.15 (fully transparent values ignored; `[data-hue-audit-ignore]` subtrees skipped).
 *
 * playwright.config.ts routes this file to the "desktop" project only (the "mobile" project is testMatch /mobile\.spec\.ts/), so both
 * viewports — desktop 1440×900 and mobile 390×844 — are exercised here explicitly via page.setViewportSize.
 */
const ROUTES = ["/overview", "/companies", "/news", "/chat?skip=1", "/settings", "/company/apptronik"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type Hit = { selector: string; prop: string; value: string };

/** Runs in the browser. Mirrors src/lib/hue-audit.ts (inlined: page.evaluate cannot import app modules). */
function auditInBrowser(limit: number): Hit[] {
  const PROPS = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke"];
  const parse = (input: string): [number, number, number, number] | null => {
    const s = input.trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let h = m[1]; if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      const n = parseInt(h.slice(0, 6), 16); const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
    m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
    if (m) {
      const ch = (v: string) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
      const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [ch(m[1]), ch(m[2]), ch(m[3]), Number.isFinite(a) ? a : 1];
    }
    return null;
  };
  const isBlue = (css: string) => {
    const c = parse(css); if (!c || c[3] <= 0) return false;
    const R = c[0] / 255, G = c[1] / 255, B = c[2] / 255; const max = Math.max(R, G, B), min = Math.min(R, G, B);
    if (max === min) return false;
    const l = (max + min) / 2, d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number; if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60; else if (max === G) h = ((B - R) / d + 2) * 60; else h = ((R - G) / d + 4) * 60;
    return h >= 190 && h <= 260 && s > 0.15;
  };
  const describe = (el: Element) => {
    const parts: string[] = []; let node: Element | null = el;
    while (node && parts.length < 4 && node !== document.documentElement) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`${s}#${node.id}`); break; }
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) s += "." + cls.join("."); const dt = node.getAttribute("data-testid"); if (dt) s += `[data-testid="${dt}"]`;
      parts.unshift(s); node = node.parentElement;
    }
    return parts.join(" > ");
  };
  const hits: Hit[] = []; const els = document.querySelectorAll("*");
  for (let i = 0; i < els.length && hits.length < limit; i++) {
    const el = els[i]; if (el.tagName === "SCRIPT" || el.closest("[data-hue-audit-ignore]")) continue;
    const cs = getComputedStyle(el);
    for (const prop of PROPS) {
      const value = cs[prop as keyof CSSStyleDeclaration] as string | undefined;
      if (value && typeof value === "string" && isBlue(value)) { hits.push({ selector: describe(el), prop, value }); if (hits.length >= limit) break; }
    }
  }
  return hits;
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(300); // let client-side theming (brand vars, chat theme) apply
}

test.describe("Brand rule: no blue hues in computed colours", () => {
  test("isBlueHue predicate sanity (node-side)", () => {
    expect(isBlueHue("#1D4ED8")).toBe(true);           // tailwind blue-700
    expect(isBlueHue("rgb(15, 23, 42)")).toBe(true);    // slate-900
    expect(isBlueHue("#1f2937")).toBe(true);            // gray-800, hue 215 sat .28 → fails rule
    expect(isBlueHue("#94a3b8")).toBe(true);            // slate-400, hue 215 sat .20
    expect(isBlueHue("#0285ff")).toBe(true);            // vendored openui info blue
    expect(isBlueHue("rgba(29, 78, 216, 0)")).toBe(false); // transparent is ignored
    expect(isBlueHue("#0AC985")).toBe(false);           // brand green
    expect(isBlueHue("#047857")).toBe(false);
    expect(isBlueHue("#16181b")).toBe(false);           // deep ink, sat .10
    expect(isBlueHue("#202327")).toBe(false);
    expect(isBlueHue("#5c6168")).toBe(false);
    expect(isBlueHue("#e4e6e9")).toBe(false);
    expect(isBlueHue("#f7f8f9")).toBe(false);
    expect(isBlueHue("#b91c1c")).toBe(false);           // danger red
    expect(isBlueHue("#f59e0b")).toBe(false);           // amber
    expect(isBlueHue("transparent")).toBe(false);
    expect(isBlueHue("currentcolor")).toBe(false);
  });

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${vp.name} ${vp.width}×${vp.height} · ${route}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await primeSettings(page);
        await page.goto(route);
        await settle(page);
        const hits = await page.evaluate(auditInBrowser, 20);
        if (hits.length) {
          testInfo.annotations.push({ type: "blue-hue-offenders", description: `${route} @${vp.name}: ` + hits.map((h) => `${h.selector} {${h.prop}: ${h.value}}`).join(" | ") });
        }
        expect(hits, `${route} @${vp.name}: ${hits.length} element(s) with blue-hued computed colours:\n` + hits.map((h) => `  ${h.selector} → ${h.prop}: ${h.value}`).join("\n")).toEqual([]);
      });
    }
  }
});
