/**
 * brand-icons.ts — the 10 flat-line brand icons (1024² PNG, 2px charcoal #1F2937 strokes, ONE #0AC985 accent) delivered 2026-10-11
 * and shipped under /public/brand/icons/icon-<slug>.png. Pure, framework-free: this module only maps plugin ids / operation ids /
 * feature slots to a local public path, so every surface (run status row, Working rows, Outputs step rows, Inspector, plugin panel,
 * empty states, welcome starters) draws the same asset. The B Capital mark (/brand/b-capital-mark.png) stays the Portfolio Plugin's
 * own icon — these icons are for the TOOLS the plugin exposes and for feature/empty-state slots.
 *
 * Tests: web/tests/unit/brand-icons.test.ts (`npm run test:brand-icons`).
 */

export const BRAND_ICON_DIR = "/brand/icons";

export type BrandIconName =
  | "writer-compose" | "research-search" | "compare" | "stock-market" | "fervo-geothermal"
  | "portfolio-listing" | "agent" | "autonomous-mobility" | "news-sentiment" | "payments-fintech";

export interface BrandIconEntry {
  readonly file: string;          // file name under /brand/icons
  readonly label: string;         // human label for alt/title
  readonly role: string;          // where it is meant to be used
  readonly accent: string;        // which stroke carries the single green accent
}

export const BRAND_ICONS: Record<BrandIconName, BrandIconEntry> = {
  "writer-compose":      { file: "icon-writer-compose.png",      label: "Writer / compose",        role: "WRITER company glyph · 'LP update draft' starter · write/compose tools", accent: "pen tip" },
  "research-search":     { file: "icon-research-search.png",     label: "Research / search",       role: "Perplexity & GPT/Internet search plugins · 'Latest news' starter · no-results empty state", accent: "lens dot" },
  "compare":             { file: "icon-compare.png",             label: "Compare",                 role: "'Compare two' starter · /compare strip · no-selection empty state", accent: "divider" },
  "stock-market":        { file: "icon-stock-market.png",        label: "Stock / market",          role: "US Stock fundamental/technical plugins · Overview sentiment delta", accent: "trend arrow" },
  "fervo-geothermal":    { file: "icon-fervo-geothermal.png",    label: "Fervo / geothermal",      role: "Fervo Energy company glyph", accent: "steam curl" },
  "portfolio-listing":   { file: "icon-portfolio-listing.png",   label: "Portfolio listing",       role: "Portfolio Plugin operations listPortfolioCompanies / getPortfolioCompany* (Outputs step rows, run status row)", accent: "list marker" },
  "agent":               { file: "icon-agent.png",               label: "Agent",                   role: "OnDemand agent / executePrompt tool rows · Apptronik company glyph", accent: "eye" },
  "autonomous-mobility": { file: "icon-autonomous-mobility.png", label: "Autonomous mobility",     role: "AIMotive company glyph", accent: "radar arc" },
  "news-sentiment":      { file: "icon-news-sentiment.png",      label: "News sentiment",          role: "getPortfolioCompanySentiment / news operations · News Pulse · no-news empty state", accent: "pulse line" },
  "payments-fintech":    { file: "icon-payments-fintech.png",    label: "Payments / fintech",      role: "Flutterwave company glyph · payments plugins", accent: "card chip" },
};

export const BRAND_ICON_NAMES = Object.keys(BRAND_ICONS) as readonly BrandIconName[];

export function brandIconPath(name: BrandIconName): string {
  return `${BRAND_ICON_DIR}/${BRAND_ICONS[name].file}`;
}

/** Plugin id → brand icon (catalogue ids are stable; names are matched as a fallback in `brandIconForPlugin`). */
export const PLUGIN_BRAND_ICON: Record<string, BrandIconName> = {
  "plugin-1722260873": "research-search",  // Perplexity
  "plugin-1713924030": "research-search",  // Internet
  "plugin-1741871229": "research-search",  // GPT Search
  "plugin-1716429542": "stock-market",     // US Stock Fundamental Analysis
  "plugin-1716434059": "stock-market",     // US Stock Technical Analysis
  "plugin-1770369833": "stock-market",     // Quarterly financial report data tool
  "plugin-1777018662": "compare",          // PitchBook Investor Finder (deal comparison)
  executePrompt: "agent",
};

const NAME_RULES: readonly [RegExp, BrandIconName][] = [
  [/perplexity|search|internet|research|google|bing|tavily|exa/i, "research-search"],
  [/stock|market|ticker|financ|quarterly|fundamental|technical/i, "stock-market"],
  [/pitchbook|crunchbase|investor|compare/i, "compare"],
  [/ondemand|on-demand|terminal agent|executeprompt|\bagent\b/i, "agent"],
  [/news|sentiment|pulse/i, "news-sentiment"],
  [/payment|fintech|stripe|flutterwave/i, "payments-fintech"],
  [/writer|compose|draft|email|mail/i, "writer-compose"],
];

/** Brand icon for a plugin/tool id or name, or null when none fits (the caller then falls back to the favicon chain / monogram). */
export function brandIconForPlugin(id: string | null | undefined, name?: string | null): BrandIconName | null {
  const pid = (id ?? "").trim();
  if (pid && PLUGIN_BRAND_ICON[pid]) return PLUGIN_BRAND_ICON[pid];
  const hay = `${pid} ${name ?? ""}`.trim();
  if (!hay) return null;
  for (const [re, icon] of NAME_RULES) if (re.test(hay)) return icon;
  return null;
}

/** Portfolio Plugin operations (operationIds from the registered OpenAPI tool) → brand icon. */
export function brandIconForOperation(operationId: string | null | undefined): BrandIconName | null {
  const op = (operationId ?? "").trim();
  if (!op) return null;
  if (/sentiment|news|movers|pulse/i.test(op)) return "news-sentiment";
  if (/list|companies|company|search|portfolio|signal/i.test(op)) return "portfolio-listing";
  if (/compare|synergy/i.test(op)) return "compare";
  return null;
}

/** Context-company slug → brand icon (sector glyph), null when the company has no dedicated icon. */
export function brandIconForCompany(slug: string | null | undefined, sector?: string | null): BrandIconName | null {
  const s = (slug ?? "").toLowerCase();
  if (/fervo/.test(s)) return "fervo-geothermal";
  if (/flutterwave/.test(s)) return "payments-fintech";
  if (/aimotive/.test(s)) return "autonomous-mobility";
  if (/writer/.test(s)) return "writer-compose";
  if (/apptronik/.test(s)) return "agent";
  if (/perplexity/.test(s)) return "research-search";
  const sec = (sector ?? "").toLowerCase();
  if (/fintech|payment/.test(sec)) return "payments-fintech";
  if (/energy|climate/.test(sec)) return "fervo-geothermal";
  if (/mobility|automotive/.test(sec)) return "autonomous-mobility";
  return null;
}

/** Empty-state slot → brand icon. */
export const EMPTY_STATE_BRAND_ICON: Record<"no-results" | "no-news" | "no-selection" | "offline" | "no-plugins", BrandIconName | null> = {
  "no-results": "research-search",
  "no-news": "news-sentiment",
  "no-selection": "compare",
  offline: null, // keep the dedicated offline vector
  "no-plugins": "agent",
};

/** Welcome starter prompt → brand icon. */
export function brandIconForStarter(displayText: string): BrandIconName {
  if (/compare/i.test(displayText)) return "compare";
  if (/mover|sentiment/i.test(displayText)) return "news-sentiment";
  if (/draft|update|write/i.test(displayText)) return "writer-compose";
  return "research-search";
}
