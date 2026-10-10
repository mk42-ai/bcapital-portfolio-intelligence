/**
 * Brand hue audit — B Capital rule: computed colours must contain NO blue hues.
 * QA definition: a colour FAILS when its HSL hue is in [190, 260] and saturation > 0.15 (fully transparent values are ignored).
 * Used by e2e/brand-hue.spec.ts (inlined into page.evaluate) and available for unit sanity checks / dev-time audits.
 */
export const BLUE_HUE_MIN = 190;
export const BLUE_HUE_MAX = 260;
export const BLUE_SAT_MIN = 0.15;

export type HueAuditHit = { selector: string; prop: string; value: string };

export type ParsedColor = { r: number; g: number; b: number; a: number };

/** Parse `#rgb[a]`, `#rrggbb[aa]`, `rgb()`/`rgba()` (comma or space syntax, optional `/ alpha`). Returns null for anything else (named colours, `transparent`, `currentcolor`, `none`, hsl()). */
export function parseCssColor(input: string): ParsedColor | null {
  const s = input.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const ch = (v: string) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a: Number.isFinite(a) ? a : 1 };
  }
  if (/^transparent$/i.test(s)) return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

/** HSL (hue 0–360, saturation and lightness 0–1) from 0–255 RGB. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60;
  else if (max === G) h = ((B - R) / d + 2) * 60;
  else h = ((R - G) / d + 4) * 60;
  return [h, s, l];
}

/** true when the colour has a blue hue (190–260) with saturation > 0.15 and is not fully transparent. */
export function isBlueHue(cssColor: string): boolean {
  const c = parseCssColor(cssColor);
  if (!c || c.a <= 0) return false;
  const [h, s] = rgbToHsl(c.r, c.g, c.b);
  return h >= BLUE_HUE_MIN && h <= BLUE_HUE_MAX && s > BLUE_SAT_MIN;
}

export const HUE_AUDIT_PROPS = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke"] as const;

function describe(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && parts.length < 4 && node !== document.documentElement) {
    let s = node.tagName.toLowerCase();
    if (node.id) { parts.unshift(`${s}#${node.id}`); break; }
    const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += "." + cls.join(".");
    const dt = node.getAttribute("data-testid"); if (dt) s += `[data-testid="${dt}"]`;
    parts.unshift(s);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/** Walk every element under `root`, check the computed colour properties, and return up to `limit` offenders.
 *  Elements inside `[data-hue-audit-ignore]` (third-party favicons/logos) are skipped; images are never computed colours anyway. */
export function auditBlueHues(root: ParentNode = document, limit = 20): HueAuditHit[] {
  const hits: HueAuditHit[] = [];
  const view = (root instanceof Document ? root.defaultView : root.ownerDocument?.defaultView) ?? window;
  const els = root.querySelectorAll("*");
  for (let i = 0; i < els.length && hits.length < limit; i++) {
    const el = els[i];
    if (el.closest("[data-hue-audit-ignore]")) continue;
    if (el instanceof HTMLElement && el.tagName === "SCRIPT") continue;
    const cs = view.getComputedStyle(el);
    for (const prop of HUE_AUDIT_PROPS) {
      const value = cs[prop as keyof CSSStyleDeclaration] as string | undefined;
      if (!value || typeof value !== "string") continue;
      if (isBlueHue(value)) { hits.push({ selector: describe(el), prop, value }); if (hits.length >= limit) break; }
    }
  }
  return hits;
}
