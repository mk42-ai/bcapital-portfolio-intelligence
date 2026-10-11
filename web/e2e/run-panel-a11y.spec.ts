/**
 * a10 — run-panel accessibility: keyboard focus rings on disclosure heads, AA contrast on the
 * thinking head, and prefers-reduced-motion disabling the spinner. Desktop project only (1440×900).
 *
 *   BASE_URL=https://sb-1gizcktepfgc.vercel.run node node_modules/@playwright/test/cli.js test e2e/run-panel-a11y.spec.ts --project=desktop --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { primeSettings } from "./helpers";

const HEAD_SEL = [
  ".oiu-think__head",
  ".oiu-outputs__head",
  ".oiu-srcs__head",
  ".oiu-summary__head",
  ".oiu-thinking__head",
  ".oiu-payload__sum",
  ".chat-shell details > summary",
].join(", ");

/** Relative luminance (WCAG 2.x) from an "rgb(a)(...)" string. */
function lum(rgb: number[]) {
  const [r, g, b] = rgb.slice(0, 3).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: number[], b: number[]) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function openChat(page: Page, opts: { reducedMotion?: "reduce" | "no-preference" } = {}) {
  await primeSettings(page);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: opts.reducedMotion });
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await page.locator(".chat-shell").first().waitFor({ state: "visible", timeout: 30_000 });
  // Trigger a run so the thinking/outputs/sources heads render (works with or without a key: the
  // skeleton "Thinking" head + working list appear immediately).
  const box = page.locator("textarea, [contenteditable='true']").first();
  if (await box.isVisible().catch(() => false)) {
    await box.fill("Summarise portfolio sentiment");
    await box.press("Enter");
  }
  await page.locator(HEAD_SEL).first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
}

test.describe("run-panel a11y (a10)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every visible disclosure head is a focusable <button>/<summary> with a brand-green focus ring", async ({ page }) => {
    await openChat(page);
    const heads = page.locator(HEAD_SEL);
    const n = await heads.count();
    const report: string[] = [];
    const nonInteractive: string[] = [];
    let visible = 0;
    for (let i = 0; i < n; i++) {
      const h = heads.nth(i);
      if (!(await h.isVisible().catch(() => false))) continue;
      visible++;
      const info = await h.evaluate((el) => ({ tag: el.tagName.toLowerCase(), cls: el.className, tabIndex: (el as HTMLElement).tabIndex, toggle: el.hasAttribute("aria-expanded") || el.tagName === "SUMMARY" }));
      // Keyboard-reachability: a disclosure head must be a real button or a <summary> (focusable by default).
      const keyboardable = info.tag === "button" || info.tag === "summary" || info.tabIndex >= 0;
      if (!keyboardable) {
        // Non-interactive placeholder heads (e.g. the skeleton "Thinking" <p> with no aria-expanded) are reported, not failed.
        (info.toggle ? report : nonInteractive).push(`${info.cls}: <${info.tag}>${info.toggle ? " is a toggle but not keyboard-focusable" : " (static, no aria-expanded)"}`);
      }
      // Simulate keyboard focus (focus() from a key-driven context → :focus-visible matches in Chromium).
      await page.keyboard.press("Tab"); // put the page in keyboard-modality so :focus-visible applies
      await h.focus();
      const cs = await h.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle, cursor: s.cursor, focused: document.activeElement === el };
      });
      if (!keyboardable) continue; // already reported
      expect.soft(cs.focused, `${info.cls} receives focus`).toBe(true);
      expect.soft(cs.outline, `${info.cls} outline colour is brand green`).toContain("10, 201, 133");
      expect.soft(cs.style, `${info.cls} outline style`).not.toBe("none");
      expect.soft(parseFloat(cs.width), `${info.cls} outline width ≥2px`).toBeGreaterThanOrEqual(2);
      expect.soft(cs.cursor, `${info.cls} cursor`).toBe("pointer");
    }
    test.info().annotations.push({ type: "heads", description: `${visible} visible of ${n}; non-button toggles: ${report.length ? report.join("; ") : "none"}; static heads: ${nonInteractive.length ? nonInteractive.join("; ") : "none"}` });
    expect(visible, "at least one disclosure head rendered").toBeGreaterThan(0);
    // Non-button heads are reported (not refactored here — owned by other agents) but must still be focusable.
    expect(report, "disclosure heads that are not keyboard-focusable").toEqual([]);
  });

  test("Tab order reaches the disclosure heads with the green ring", async ({ page }) => {
    await openChat(page);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate((sel) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.matches(sel)) return null;
        const s = getComputedStyle(el);
        return { cls: el.className, outline: s.outlineColor, width: s.outlineWidth };
      }, HEAD_SEL);
      if (hit) {
        seen.add(hit.cls);
        expect.soft(hit.outline, `${hit.cls} ring colour`).toContain("10, 201, 133");
        expect.soft(parseFloat(hit.width), `${hit.cls} ring width`).toBeGreaterThanOrEqual(2);
      }
    }
    test.info().annotations.push({ type: "tab-order", description: [...seen].join(" | ") || "no head reached by Tab" });
    expect(seen.size, "Tab reaches at least one disclosure head").toBeGreaterThan(0);
  });

  test(".oiu-think__head text contrast vs effective background ≥ 4.5:1", async ({ page }) => {
    await openChat(page);
    const head = page.locator(".oiu-think__head").first();
    await expect(head).toBeVisible({ timeout: 30_000 });
    const colours = await head.evaluate((el) => {
      const parse = (c: string) => {
        const m = c.match(/[\d.]+/g)?.map(Number) ?? [];
        return m.length >= 3 ? m : null;
      };
      const fg = parse(getComputedStyle(el).color)!;
      // Walk up until a non-transparent background (alpha > 0) — gradients count as painted (sample the first stop).
      let node: Element | null = el;
      let bg: number[] | null = null;
      while (node && !bg) {
        const s = getComputedStyle(node);
        const img = s.backgroundImage;
        if (img && img !== "none") {
          const stop = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0];
          if (stop) {
            const hex = stop.startsWith("#") ? stop.slice(1) : null;
            const p = hex
              ? (hex.length <= 4 ? hex.slice(0, 3).split("").map((h) => parseInt(h + h, 16)) : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)))
              : parse(stop);
            if (p && (p.length < 4 || p[3] > 0)) bg = p;
          }
        }
        if (!bg) {
          const p = parse(s.backgroundColor);
          if (p && (p.length < 4 || p[3] > 0)) bg = p;
        }
        node = node.parentElement;
      }
      return { fg, bg: bg ?? [255, 255, 255], text: (el.textContent || "").trim().slice(0, 40) };
    });
    const ratio = contrast(colours.fg, colours.bg);
    test.info().annotations.push({ type: "contrast", description: `fg rgb(${colours.fg.slice(0, 3)}) on rgb(${colours.bg.slice(0, 3)}) = ${ratio.toFixed(2)}:1 ("${colours.text}")` });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test("Working band (mint gradient) text is ≥ 4.5:1 when present", async ({ page }) => {
    await openChat(page);
    const band = page.locator(".oiu-slot--on, .oiu-working").first();
    if (!(await band.isVisible().catch(() => false))) test.skip(true, "no Working… band rendered (no live run)");
    const parts = band.locator(".oiu-working__label, .oiu-working__phase, .oiu-working__tick, span, p");
    const n = await parts.count();
    for (let i = 0; i < Math.min(n, 6); i++) {
      const p = parts.nth(i);
      if (!(await p.isVisible().catch(() => false))) continue;
      const fg = await p.evaluate((el) => getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number));
      const ratio = contrast(fg, [0xe6, 0xfa, 0xf3]);
      expect.soft(ratio, `band part ${i} on #E6FAF3`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("prefers-reduced-motion: .oiu-spin has no animation", async ({ page }) => {
    await openChat(page, { reducedMotion: "reduce" });
    const spin = page.locator(".oiu-spin").first();
    if ((await spin.count()) === 0) {
      // No spinner on screen → inject one to assert the stylesheet rule itself.
      await page.evaluate(() => {
        const s = document.createElement("span");
        s.className = "oiu-spin";
        (document.querySelector(".chat-shell") ?? document.body).appendChild(s);
      });
    }
    const anim = await page.locator(".oiu-spin").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
    const chev = page.locator(".oiu-thinking__chev").first();
    if ((await chev.count()) > 0) {
      const dur = await chev.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect.soft(dur.split(",").every((d) => parseFloat(d) <= 0.001), `chevron transition-duration ${dur}`).toBe(true);
    }
  });
});
