# Icons — glyph set, QA and registry (a39)

## Where things live

| Path | What |
| --- | --- |
| `public/icons/glyphs-src/<name>.png` | 10 step-4 glyph sources (1024×1024, white background, charcoal ink, green accent) — **inputs, not shipped UI** |
| `public/icons/glyphs/<name>.svg` | 10 hand-authored Lucide-style vectors (24×24 viewBox, 2px round stroke, `currentColor` ink, ONE `#0AC985` element) |
| `public/icons/empty/<name>.svg` | 4 empty-state vectors — **authored by a24**, registered here only |
| `public/icons/*.png` | the four earlier empty-state PNGs (`preview-unavailable`, `empty-artifacts`, `open-externally`, `version-history`) still referenced by the artifacts UI |
| `public/icons/icon-manifest.json` | 14 entries: `{name, kind, role, png_src, svg, size, stroke, accent, qa, fallback_lucide, vectorized}` |
| `public/icons/glyph-qa.json` | raw PIL QA output per PNG |
| `scripts/icon-qa.py` | the QA script (PIL + stdlib only) |
| `src/lib/icons.ts` | typed registry: `GLYPHS`, `GlyphName`, `glyphPath()`, `lucideFallback()`, `glyphPngSrc()` |

## Spec

* 24×24 viewBox, `stroke-width="2"`, `stroke-linecap/linejoin="round"`, `fill="none"` — matches Lucide so the glyphs sit next to lucide-react icons.
* Ink is `stroke="currentColor"` → inherits charcoal `#1F2937` (or whatever the theme sets). **Never** hard-code the ink.
* Exactly one element carries `stroke="#0AC985"` (brand green — the only accent allowed; no hue 190–260°).
* Vectorisation: `potrace` is not installed and `npm install` is forbidden, so every SVG is **hand-authored** from the PNG's visible shapes (`vectorized: "hand-authored (potrace unavailable)"` in the manifest). They are faithful simplifications, not traces.

## Using a glyph

```tsx
import { glyphPath, lucideFallback, type GlyphName } from "@/lib/icons";
import * as Lucide from "lucide-react";

export function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  // <img> keeps currentColor? No — an <img> cannot inherit colour. Inline the SVG (fetch once / build-time import) when the
  // ink must follow the theme; <img> is fine for decorative use on white.
  return <img src={glyphPath(name)} width={size} height={size} alt="" aria-hidden />;
}

// Fallback when the SVG is not available (e.g. before a24's empty-state SVGs land):
const Fallback = Lucide[lucideFallback("news-pulse") as keyof typeof Lucide] as Lucide.LucideIcon;
```

## QA — `python3 web/scripts/icon-qa.py`

Measured per PNG: size, background kind/ratio, dominant ink (nearest `#1F2937`?), accent share (% of non-background pixels within RGB distance 40 of `#0AC985`), connected accent components (4-neighbour flood fill on a 128px box-downscale), estimated stroke width (median horizontal ink-run length ÷ 42.67 = px@24) and pass/fail against **{stroke 1.6–2.6 px@24, accent components == 1, no foreign hue}**.

Result on the step-4 sources (2026-10-11):

| name | stroke@24 (1024→24) | stroke@24 if re-framed to 20px box | accent components | accent % | other hue | spec |
| --- | --- | --- | --- | --- | --- | --- |
| car-radar | 0.47 | 0.52 | 1 | 11.0 | no | fail |
| cmdk-key | 0.45 | 0.75 | 2 | 11.9 | no | fail |
| compare-cards | 0.30 | 0.42 | 2 | 11.1 | no | fail |
| geothermal-rig | 0.28 | 0.34 | 6 | 5.4 | no | fail |
| news-pulse | 0.42 | 0.66 | 1 | 7.8 | no | fail |
| payments-card | 0.54 | 0.75 | 1 | 5.8 | no | fail |
| pen-lines | 0.35 | 0.60 | 1 | 3.5 | no | fail |
| robot-bust | 0.35 | 0.52 | 1 | 4.5 | no | fail |
| search-bubble | 0.45 | 0.79 | 1 | 8.5 | no | fail |
| trend-cross | 0.45 | 0.73 | 1 | 9.9 | no | fail |

Reading: all ten PNGs are 1024², white (not transparent) background, charcoal ink (dominant ink within 25 RGB of `#1F2937`), and none contains a foreign/blue hue. **None meets the 2px@24 stroke** — the sources were drawn at roughly 12–20 px strokes on a 1024 canvas (≈0.3–0.5 px at 24), i.e. they are illustrations, not icon-weight artwork; rasterising them at 24px would produce hairlines. Three also break the single-accent rule (`cmdk-key` 2 components: K is two strokes; `compare-cards` 2; `geothermal-rig` 6: dotted steam). That is exactly why the shipped SVGs are hand-authored at the correct weight with a single accent element rather than traced.

## Adding a glyph

1. Drop the PNG source in `public/icons/glyphs-src/`, run `python3 web/scripts/icon-qa.py`.
2. Author `public/icons/glyphs/<name>.svg` to the spec above (one `#0AC985` element).
3. Add the entry to `src/lib/icons.ts` (`GLYPHS`) and to `public/icons/icon-manifest.json`.
4. Verify: `python3 -c "import xml.etree.ElementTree as ET,glob;[ET.parse(f) for f in glob.glob('web/public/icons/glyphs/*.svg')]"` and `grep -c 0AC985 web/public/icons/glyphs/*.svg` → `1` each.

## 2026-10-11 flat-line brand icon set (`/brand/icons/icon-*.png`)

Ten 1024² PNGs (2px charcoal `#1F2937` strokes on a 24px grid, ONE `#0AC985` accent each) delivered after the glyph pass above. They are
**shipped as-is** (PNG, rendered at 14–20 px with `object-fit: contain`) — unlike the glyph sources they are icon-weight artwork, so no
re-vectorisation was needed. Registry: `src/lib/brand-icons.ts` (`BRAND_ICONS`, `brandIconPath`, `brandIconForPlugin`,
`brandIconForOperation`, `brandIconForCompany`, `brandIconForStarter`, `EMPTY_STATE_BRAND_ICON`); component `src/components/ui/brand-icon.tsx`
(`<BrandIcon name slot/>` → `img[data-testid="brand-icon"][data-icon][data-slot]`); manifest entries `kind: "brand-icon"` in
`public/icons/icon-manifest.json` (sha256 per file); tests `npm run test:brand-icons` (62) + `test:plugin-icons` (28).

| file | plugin / feature slot | where it renders |
|---|---|---|
| icon-writer-compose.png | WRITER · write/compose/draft tools | welcome starter "LP update draft", status row while "Writing the answer", company card/inspector (WRITER) |
| icon-research-search.png | Perplexity, Internet, GPT Search, LinkedIn Search (name rule) | plugin favicon slots (status row, Working rows, Outputs rows, plugin panel, run header), "Latest Fervo news" starter, no-results empty state |
| icon-compare.png | PitchBook Investor Finder · compare | "Compare two" starter, no-selection empty state, compare operations |
| icon-stock-market.png | US Stock Fundamental / Technical, Quarterly financials | plugin favicon slots |
| icon-fervo-geothermal.png | Fervo Energy | company card sector chip, inspector context list |
| icon-portfolio-listing.png | Portfolio Plugin `listPortfolioCompanies` / company operations | Outputs step rows (`data-operation-id`), status row when that step runs |
| icon-agent.png | OnDemand agent / `executePrompt` · Apptronik | plugin favicon fallback by name rule, inspector/company glyph, no-plugins empty state |
| icon-autonomous-mobility.png | AIMotive | company card sector chip, inspector |
| icon-news-sentiment.png | `getPortfolioCompanySentiment`, news operations · News Pulse | Outputs rows, status row, no-news empty state (overview mini-feed + EmptyState) |
| icon-payments-fintech.png | Flutterwave · payments/fintech plugins | company card sector chip, inspector |

Precedence in `pluginIconFor()`: B Capital mark (Portfolio Plugin) → shipped SVG (Perplexity, OnDemand) → **brand icon** (this set) →
remote favicon chain → monogram. The Portfolio Plugin itself therefore still draws `/brand/b-capital-mark.png`.
