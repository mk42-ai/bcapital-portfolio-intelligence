/** WCAG 2.2 relative luminance / contrast helpers — used at build time (tokens) and at runtime (company theming). */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex); if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b); const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}
export const AA_TEXT = 4.5, AA_LARGE = 3, AA_NON_TEXT = 3;
export function bestInk(bg: string): "#16181b" | "#ffffff" { return contrast(bg, "#ffffff") >= contrast(bg, "#16181b") ? "#ffffff" : "#16181b"; }
export function aaBadge(ratio: number): { label: "AAA" | "AA" | "AA large" | "Fail"; ok: boolean } {
  if (ratio >= 7) return { label: "AAA", ok: true }; if (ratio >= 4.5) return { label: "AA", ok: true }; if (ratio >= 3) return { label: "AA large", ok: true }; return { label: "Fail", ok: false };
}
/** Derive a safe per-company accent set: company colours only when they clear AA; otherwise the neutral light tokens. */
export function companyTheme(tokens: { primary: string | null; secondary: string | null; background: string | null; text: string | null }) {
  const fallback = { primary: "#16181b", background: "#ffffff", text: "#16181b", accent: "#047857", source: "neutral" as const, checks: [] as { pair: string; ratio: number; ok: boolean }[] };
  const bg = tokens.background && hexToRgb(tokens.background) ? tokens.background : null;
  const text = tokens.text && hexToRgb(tokens.text) ? tokens.text : bg ? bestInk(bg) : null;
  const primary = tokens.primary && hexToRgb(tokens.primary) ? tokens.primary : null;
  if (!bg || !text || !primary) return fallback;
  const checks = [
    { pair: "text on background", ratio: contrast(text, bg), ok: contrast(text, bg) >= AA_TEXT },
    { pair: "primary on background (non-text)", ratio: contrast(primary, bg), ok: contrast(primary, bg) >= AA_NON_TEXT },
  ];
  if (checks.every((c) => c.ok)) return { primary, background: bg, text, accent: tokens.secondary && hexToRgb(tokens.secondary) ? tokens.secondary : primary, source: "company" as const, checks };
  return { ...fallback, checks, source: "neutral-fallback" as const };
}
