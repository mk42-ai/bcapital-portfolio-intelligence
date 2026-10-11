/**
 * Icon registry — typed map of the hand-authored glyph SVGs under /public/icons/glyphs/ and the four empty-state
 * SVGs under /public/icons/empty/ (authored by a24), each with its Lucide fallback (lucide-react is installed).
 *
 * Source of truth for metadata: /public/icons/icon-manifest.json (written by a39; QA from web/scripts/icon-qa.py).
 * Every SVG is 24×24, 2px round stroke, charcoal via `currentColor` and exactly ONE `#0AC985` accent element.
 */

export const GLYPH_ACCENT = "#0AC985";
export const GLYPH_INK = "#1F2937";

export interface GlyphEntry {
  /** Public path of the hand-authored SVG (24×24 viewBox). */
  readonly path: string;
  /** Original 1024px PNG the vector was drawn from (glyphs only). */
  readonly pngSrc?: string;
  /** Lucide icon name to render when the SVG is unavailable (e.g. `import { Flame } from "lucide-react"`). */
  readonly lucide: string;
  /** Where the glyph is meant to be used. */
  readonly role: string;
  /** Which element carries the single #0AC985 accent. */
  readonly accent: string;
  readonly kind: "glyph" | "empty-state";
}

export const GLYPHS = {
  "geothermal-rig": { path: "/icons/glyphs/geothermal-rig.svg", pngSrc: "/icons/glyphs-src/geothermal-rig.png", lucide: "Flame", role: "Fervo Energy — geothermal", accent: "steam curl", kind: "glyph" },
  "payments-card": { path: "/icons/glyphs/payments-card.svg", pngSrc: "/icons/glyphs-src/payments-card.png", lucide: "CreditCard", role: "Flutterwave — payments", accent: "chip", kind: "glyph" },
  "robot-bust": { path: "/icons/glyphs/robot-bust.svg", pngSrc: "/icons/glyphs-src/robot-bust.png", lucide: "Bot", role: "Apptronik — humanoid robotics", accent: "right eye", kind: "glyph" },
  "search-bubble": { path: "/icons/glyphs/search-bubble.svg", pngSrc: "/icons/glyphs-src/search-bubble.png", lucide: "MessageSquareMore", role: "Perplexity AI — answer engine", accent: "lens dot", kind: "glyph" },
  "pen-lines": { path: "/icons/glyphs/pen-lines.svg", pngSrc: "/icons/glyphs-src/pen-lines.png", lucide: "PenLine", role: "WRITER — enterprise writing", accent: "ink tip", kind: "glyph" },
  "car-radar": { path: "/icons/glyphs/car-radar.svg", pngSrc: "/icons/glyphs-src/car-radar.png", lucide: "Car", role: "AIMotive — automotive AI", accent: "outer radar arc", kind: "glyph" },
  "trend-cross": { path: "/icons/glyphs/trend-cross.svg", pngSrc: "/icons/glyphs-src/trend-cross.png", lucide: "TrendingUp", role: "Overview — sentiment delta", accent: "up-line arrow end", kind: "glyph" },
  "news-pulse": { path: "/icons/glyphs/news-pulse.svg", pngSrc: "/icons/glyphs-src/news-pulse.png", lucide: "Newspaper", role: "News — live pulse", accent: "pulse line", kind: "glyph" },
  "compare-cards": { path: "/icons/glyphs/compare-cards.svg", pngSrc: "/icons/glyphs-src/compare-cards.png", lucide: "Columns2", role: "Companies — compare / synergy", accent: "divider", kind: "glyph" },
  "cmdk-key": { path: "/icons/glyphs/cmdk-key.svg", pngSrc: "/icons/glyphs-src/cmdk-key.png", lucide: "Command", role: "Shell — ⌘K palette hint", accent: "K", kind: "glyph" },
  // Empty-state SVGs are authored by a24 under /icons/empty/ — registered here, PNG originals remain under /icons/.
  "preview-unavailable": { path: "/icons/empty/preview-unavailable.svg", pngSrc: "/icons/preview-unavailable.png", lucide: "FileX2", role: "Artifacts — preview could not render", accent: "cross", kind: "empty-state" },
  "empty-artifacts": { path: "/icons/empty/empty-artifacts.svg", pngSrc: "/icons/empty-artifacts.png", lucide: "FolderOpen", role: "Artifacts panel — nothing yet", accent: "folder tab", kind: "empty-state" },
  "open-externally": { path: "/icons/empty/open-externally.svg", pngSrc: "/icons/open-externally.png", lucide: "ExternalLink", role: "Artifacts — open in new tab", accent: "arrow", kind: "empty-state" },
  "version-history": { path: "/icons/empty/version-history.svg", pngSrc: "/icons/version-history.png", lucide: "History", role: "Artifact card — version history", accent: "clock hand", kind: "empty-state" },
} as const satisfies Record<string, GlyphEntry>;

export type GlyphName = keyof typeof GLYPHS;

export const GLYPH_NAMES = Object.keys(GLYPHS) as readonly GlyphName[];

export function isGlyphName(name: string): name is GlyphName {
  return Object.prototype.hasOwnProperty.call(GLYPHS, name);
}

/** Public URL of the SVG for `name` (e.g. `<img src={glyphPath("news-pulse")} />` or `<use href>`). */
export function glyphPath(name: GlyphName): string {
  return GLYPHS[name].path;
}

/** Lucide icon name to use when the SVG cannot be loaded; resolve with `import * as Lucide from "lucide-react"`. */
export function lucideFallback(name: GlyphName): string {
  return GLYPHS[name].lucide;
}

/** Original PNG source (1024px glyph source or the earlier empty-state PNG), if any. */
export function glyphPngSrc(name: GlyphName): string | undefined {
  return GLYPHS[name].pngSrc;
}
