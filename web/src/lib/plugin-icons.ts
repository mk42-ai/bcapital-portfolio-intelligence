/**
 * plugin-icons.ts — pure, framework-free map from a plugin id/name to the icon the run-view chips should draw.
 *
 *   brand    → the 16px B Capital mark (our own Portfolio Plugin — never a grey "P")
 *   local    → a Lucide-style SVG we ship in /public/plugins (Perplexity, OnDemand agent) — no third-party bitmaps
 *   remote   → the catalogue favicon chain (live logoUrl → logoUrlBase → Google s2), resolved by <PluginFavicon/>
 *   monogram → first letter, charcoal on #F3F4F6 — the terminal fallback when a remote favicon fails to load
 *
 * Tests: web/tests/unit/plugin-icons.test.ts (`npm run test:plugin-icons`).
 */

import { brandIconForPlugin, brandIconPath } from "./brand-icons";

export type PluginIconKind = "brand" | "local" | "remote" | "monogram";

export type PluginIcon = {
  kind: PluginIconKind;
  /** Image URL for brand/local (absolute path under /public) or the first remote hop. */
  src?: string;
  alt: string;
  /** Chip background for the monogram tile. */
  bg?: string;
  /** Monogram letter (upper-case, single grapheme). */
  letter?: string;
};

export const PORTFOLIO_PLUGIN_ICON_ID = "plugin-1791713636";
export const PERPLEXITY_PLUGIN_ICON_ID = "plugin-1722260873";

export const BRAND_MARK_SRC = "/brand/b-capital-mark.png";
export const PERPLEXITY_ICON_SRC = "/plugins/perplexity.svg";
export const ONDEMAND_ICON_SRC = "/plugins/ondemand.svg";

export const MONOGRAM_BG = "#F3F4F6";
export const MONOGRAM_INK = "#1F2937";

const PORTFOLIO_RE = /portfolio/i;
const PERPLEXITY_RE = /perplexity/i;
const ONDEMAND_RE = /ondemand|on-demand|terminal agent|executeprompt/i;

/** Upper-cased first visible character of `s` (falls back to "?"). */
export function monogramLetter(s: string | undefined | null): string {
  const t = (s ?? "").trim().replace(/^plugin-/i, "");
  const ch = t[0];
  return (ch && /[a-z0-9]/i.test(ch) ? ch : t[0] ?? "?").toUpperCase();
}

export function monogramFor(label: string): PluginIcon {
  return { kind: "monogram", alt: label, bg: MONOGRAM_BG, letter: monogramLetter(label) };
}

/**
 * Resolve the icon for a plugin. `remoteSrc` is the first hop of the catalogue favicon chain (if any) — when absent the
 * result is a monogram straight away. Brand/local matches win regardless of any remote favicon.
 */
export function pluginIconFor(id: string | undefined | null, name?: string | null, remoteSrc?: string | null): PluginIcon {
  const pid = (id ?? "").trim();
  const label = (name ?? "").trim() || pid || "?";
  const hay = `${pid} ${name ?? ""}`;

  if (pid === PORTFOLIO_PLUGIN_ICON_ID || PORTFOLIO_RE.test(hay)) {
    return { kind: "brand", src: BRAND_MARK_SRC, alt: label || "Portfolio Plugin" };
  }
  if (pid === PERPLEXITY_PLUGIN_ICON_ID || PERPLEXITY_RE.test(hay)) {
    return { kind: "local", src: PERPLEXITY_ICON_SRC, alt: label || "Perplexity" };
  }
  if (pid === "executePrompt" || ONDEMAND_RE.test(hay)) {
    return { kind: "local", src: ONDEMAND_ICON_SRC, alt: label || "OnDemand agent" };
  }
  // 2026-10-11 brand icon set (/brand/icons/icon-*.png): every other catalogue tool that maps to a brand icon draws it locally
  // (stock/market, search, compare, news …) instead of a third-party favicon — no network, no grey monogram.
  const brandIcon = brandIconForPlugin(pid, name);
  if (brandIcon) return { kind: "local", src: brandIconPath(brandIcon), alt: label };
  if (remoteSrc) return { kind: "remote", src: remoteSrc, alt: label };
  return monogramFor(label);
}

/** True when the icon is served from /public and needs no network warm-up. */
export const isLocalIcon = (icon: PluginIcon): boolean => icon.kind === "brand" || icon.kind === "local";
