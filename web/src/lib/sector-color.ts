/**
 * a18 — sector colour tokens. One palette entry per sector (fill / ink-on-white ≥4.5:1 / soft tint with ink ≥4.5:1 on it),
 * mirrored 1:1 by the `--sector-<slug>[-ink|-soft]` CSS variables appended to `styles/tokens.css`.
 * Brand rule: NO blue hue (HSL hue 190–260 with sat>0.15 & chroma>0.15 — see `hue-audit.ts`). Every hex below is audited by
 * `tests/unit/sector-color.test.ts` (isBlueHue === false, WCAG contrast). Consumers (a19/a22/a27/a29/a30/a31): `sectorColor(sector)`.
 */
import { SECTORS } from "./format";

export type SectorSwatch = { name: string; fill: string; ink: string; soft: string };

/** Named swatches — order matters: it is the deterministic hash → index table for unknown sectors. */
export const SECTOR_PALETTE: readonly SectorSwatch[] = [
  { name: "emerald", fill: "#0AC985", ink: "#047857", soft: "#E6FAF3" }, // brand green — primary / Technology
  { name: "plum",    fill: "#A21CAF", ink: "#701A75", soft: "#FAE8FF" }, // hue ~295° (outside the 190–260 band)
  { name: "amber",   fill: "#F59E0B", ink: "#92400E", soft: "#FEF3C7" },
  { name: "coral",   fill: "#F97316", ink: "#9A3412", soft: "#FFEDD5" },
  { name: "teal",    fill: "#0D9488", ink: "#115E59", soft: "#CCFBF1" }, // hue 174° (< 190°, allowed)
  { name: "olive",   fill: "#65A30D", ink: "#3F6212", soft: "#ECFCCB" },
  { name: "rose",    fill: "#E11D48", ink: "#9F1239", soft: "#FFE4E6" },
  { name: "slate",   fill: "#78716C", ink: "#44403C", soft: "#F5F5F4" }, // warm slate — "Other"
] as const;

/** Explicit sector → swatch assignment (SECTORS from format.ts + extra names seen in snapshot.json companies[].sector). */
export const SECTOR_SWATCH: Readonly<Record<string, SectorSwatch["name"]>> = {
  "Technology": "emerald",
  "Healthcare": "plum",
  "Energy & Resilience": "amber",
  "Opportunistic": "coral",
  "Venture Capital (firm)": "teal",
  "Other": "slate",
};

/** Sector names that have a dedicated CSS variable (`--sector-<slug>`) in tokens.css. */
export const SECTOR_NAMES: readonly string[] = [...SECTORS, "Venture Capital (firm)", "Other"];

export const sectorSlug = (sector: string): string =>
  sector.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other";

/** FNV-1a 32-bit — stable across runtimes, used for unknown-sector fallback. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const byName = new Map(SECTOR_PALETTE.map((p) => [p.name, p]));
/** Fallback pool for unknown sectors: every chromatic swatch except the brand emerald (reserved) and slate (reserved for "Other"). */
const FALLBACK_POOL = SECTOR_PALETTE.filter((p) => p.name !== "emerald" && p.name !== "slate");

export type SectorColor = {
  /** CSS `var(--sector-<slug>)` reference (fill). Known sectors resolve to their own variable; unknown ones to the fallback swatch's variable. */
  var: string;
  varInk: string;
  varSoft: string;
  fill: string;
  ink: string;
  soft: string;
  slug: string;
  swatch: SectorSwatch["name"];
  known: boolean;
};

/** Resolve a sector label to its colour set. Unknown / empty sectors get a deterministic, never-blue fallback. */
export function sectorColor(sector: string | null | undefined): SectorColor {
  const label = (sector ?? "").trim();
  const canonical = label === "" ? "Other" : label;
  const known = Object.prototype.hasOwnProperty.call(SECTOR_SWATCH, canonical);
  const swatch = known
    ? byName.get(SECTOR_SWATCH[canonical])!
    : FALLBACK_POOL[hash32(canonical.toLowerCase()) % FALLBACK_POOL.length];
  const slug = known ? sectorSlug(canonical) : swatch.name;
  return {
    var: `var(--sector-${slug})`,
    varInk: `var(--sector-${slug}-ink)`,
    varSoft: `var(--sector-${slug}-soft)`,
    fill: swatch.fill,
    ink: swatch.ink,
    soft: swatch.soft,
    slug,
    swatch: swatch.name,
    known,
  };
}

/** Inline style for a sector chip when a consumer cannot use the `.chip-sector[data-sector]` utility class. */
export const sectorChipStyle = (sector: string | null | undefined) => {
  const c = sectorColor(sector);
  return { background: c.soft, color: c.ink, border: `1px solid ${c.fill}66` } as const;
};
