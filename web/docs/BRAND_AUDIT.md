# Brand audit — green only, zero blue (Agent 28)

Brand: `#0AC985` (brand), `#047857` (ink), `#E6FAF3` (soft tint). No blue anywhere. 8 px grid. Audited 2026-10-10.

## Tooling added
- `web/scripts/brand-audit.mjs` — static scan of `web/src` (155 files, 514 colour tokens). A colour is **blue** when HSL hue ∈ [195°, 260°] and saturation > 25 %, with a chroma guard (max−min ≥ 0.10, or a pale wash with l > 0.85 ∧ s > 0.6) so Tailwind neutrals such as `#111827` / `#1f2937` / `#cbd5e1` (hue 213–221°, but visually gray) are not false positives while `#1D4ED8`, `#2563eb`, `#3b82f6`, `#0285ff`, `#64748b`, `#edf5ff` are caught. Named CSS blues (`blue`, `navy`, `royalblue`, …) are flagged outside comments. Allowlist: `tokens.css` comments and `BLUES =` e2e negative-assertion constants. Exits 1 if any blue remains. Run: `cd web && node scripts/brand-audit.mjs [--json]`.
- `web/e2e/brand.spec.ts` — for `/overview`, `/companies`, `/news`, `/chat?skip=1`, `/settings`, `/company/1au` at **1440×900** and **390×844** (`setViewportSize`): walks up to 4000 elements and asserts no computed `color` / `background-color` / `border-*-color` / `outline-color` is blue-ish (`b > r+40 && b > g+40 && chroma ≥ 40`, plus the explicit legacy `BLUES` list), skipping `<img>/<svg>` content and the company-palette allowlist (`ul[aria-label="Palette swatches with WCAG contrast"]`, `[style*="co-accent"]`, `[data-testid="brand-swatches"]`, `.swatch`); `.oiu-md` links, if present, must be green; `document.scrollingElement.scrollWidth ≤ innerWidth` (no horizontal overflow).

## Findings — before
Static scan (strict hue/saturation rule, before the chroma guard): 66 hits, of which **7 real blues** and 59 neutral-gray false positives.

| Real blue | Where | Status |
|---|---|---|
| `#1D4ED8` (header comment claiming blue accent) | `styles/tokens.css:2` | fixed — header rewritten for green |
| `#64748b`, `#cbd5e1` (slate ramp) | `charts/heatmap-ssr.tsx:4` | fixed → `#6b7280`, `#d1d5db` |
| `#e2e8f0`, `#f1f5f9`, `#334155`, `#94a3b8`, `#cbd5e1` (slate bands/grid) | `charts/signal-bullet.tsx:8,42,46` | fixed → `#e5e7eb`, `#f3f4f6`, `#374151`, `#9ca3af`, `#d1d5db` |
| `#94a3b8` (palette) | `charts/treemap-ssr.tsx:6` | fixed → `#9ca3af` |
| `--iui-focus: #0285ff`, `--iui-blue: #0285ff` | `chat/open-intelligent-ui/response-theme.css:22-23` | **not in scope** — see requests |
| `infoBackground #edf5ff`, `textInfoPrimary #0068bc`, `borderInfoEmphasis #0285ff`, `purpleBackground #f4f0ff` | `chat/open-intelligent-ui/response-theme.ts:40,44,46,52` | **not in scope** — see requests |

Runtime sweep (old preview, 6 routes × 2 viewports): 1 blue-ish hit — the company `--co-accent` dot on `/company/1au` (`rgb(0,13,94)`, the company's own brand colour) → allowlisted as company brand content. No horizontal overflow at either viewport on any route.

## Findings — after
- `node scripts/brand-audit.mjs` → **7 blues remain, all in `response-theme.{css,ts}`** (outside Agent 28's file partition; exact replacements listed in the report). Once those land the script exits 0.
- `tokens.css`: `--primary #047857`, `--ring #0AC985`, header comment now documents green-only; focus ring (`:focus-visible` → `var(--ring)`), `::selection` (`#c7f5e4`), links (`text-primary-soft`), active nav (`#e6faf3`/`#047857`), `Badge tone="primary"` (`#E6FAF3`/`#065f46`/`#a7f3d0`), `Switch` checked (`#0AC985`) verified green.
- `badge.tsx`, `button.tsx`, `switch.tsx` already green — no change needed.
- `e2e/brand.spec.ts`: 12/12 pass against the old preview (desktop project, both viewports exercised in-test). tsc: 0 errors.

## Requests for files outside scope
- `response-theme.css:22-23` → `--iui-focus: #0AC985; --iui-accent: #047857;` (rename `--iui-blue`).
- `response-theme.ts:40,44,46,52` → `infoBackground: "#E6FAF3"`, `purpleBackground: "#f3f4f6"`, `textInfoPrimary: "#047857"`, `borderInfoEmphasis: "#0AC985"`.
