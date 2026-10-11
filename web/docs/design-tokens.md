# Design tokens — B Capital Portfolio Intelligence (web)

Canonical token sheet, derived from the real CSS: `web/src/styles/tokens.css` (values), `web/src/app/globals.css`
(Tailwind `@theme inline` mapping, base layer, focus ring, reduced motion), `web/src/app/layout.tsx` (fonts) and
`web/src/components/shell/nav-rail.tsx` (`NAV_EXPANDED_PX = 224`). Contrast ratios and the "Open findings" section
are computed by `web/scripts/token-audit.mjs` → `web/proof/pass-3/token-audit.json` (re-run: `cd web && node scripts/token-audit.mjs`).

Hard rules in one line: **light-only · one accent (#0AC985 / ink #047857) · no blue hue · charcoal ink · Lucide 2px icons · nav rail ≤224px.**

---

## 1. Colour

### 1.1 Brand + semantic (from `tokens.css`)

| Token | Hex | Role | Contrast on #FFFFFF |
|---|---|---|---|
| `--brand-green` / `--ring` / `--chart-4` | `#0AC985` | The ONLY accent. Fills, focus ring, sparkline/positive mark, logo green. **Not for text** | 2.16:1 (non-text / ≥3:1 only with ≥2px stroke on tints) |
| `--brand-green-ink` / `--primary` | `#047857` | Accent as text/link/active nav/primary button fill (white text on it = 5.48:1) | **5.48:1 AA** |
| `--primary-soft` | `#065F46` | Accent text on tints (pressed state, link on `--brand-green-soft`) | 7.68:1 AAA |
| `--brand-green-strong` | `#089A66` | Hover of a `#0AC985` fill | — |
| `--brand-green-soft` | `#E6FAF3` | 10 % tint — hover washes, selected row, positive chip bg (ink on it 5.05:1) | — |
| `::selection` | `#C7F5E4` | Text selection bg with `#16181b` text | — |
| charcoal (owner spec) | `#1F2937` | Ink in charts / legacy CSS blocks (shell.css, artifacts.css, media.css) | 14.68:1 |
| `--foreground` | `#16181B` | Body ink (hue-neutral charcoal — tokens.css replaces slate greys) | 17.79:1 |
| `--accent` / `--accent-soft` / `--info-soft` | `#3B3F45` | Secondary emphasis, *never a glow, never blue* | 10.59:1 |
| `--info` / `--muted-2` | `#4B4F55` | Secondary text | 8.24:1 |
| `--muted` | `#5C6168` | Muted labels / captions (5.6:1 on `--surface-3`) | 6.24:1 |
| `--chart-2` / `--sentiment-neu` | `#6E7277` | Neutral series | 4.84:1 |
| `--chart-3` | `#9EA2A8` | Tertiary series / disabled ink (non-text) | 2.56:1 |
| `--border-strong` / `--chart-6` | `#C9CCD1` | Strong dividers, input borders | ≥3:1 vs ink |
| `--border` | `#E4E6E9` | 1 px decorative borders, card outline | — |
| `--surface-3` | `#F1F2F4` | Skeleton, code bg, table stripe | — |
| `--surface-2` | `#F7F8F9` | Page sections / rail bg | — |
| `--surface` / `--background` | `#FFFFFF` | Body, cards | — |
| amber ink (state) | `#B45309` | Warning text / "stale" / "pending" chip ink | **5.02:1 AA** |
| amber fill (state) | `#F59E0B` | Warning mark only (non-text) · soft `#FEF3C7` | 2.15:1 |
| red (state, owner spec) | `#EF4444` | Negative mark / error icon (non-text) · soft `#FECACA` | 3.76:1 (large text / UI only) |
| `--danger` / `--sentiment-neg` / `--chart-5` | `#B91C1C` | Negative delta text, error text | **6.47:1 AA** |
| `--danger-soft` | `#991B1B` | Danger text on `#FECACA` tint | — |
| `--chart-1` / `--sentiment-pos` | `#202327` | Primary series ink (positive sentiment is charcoal, green marks the *brand*, not "good") | 15.78:1 |

Charts: `--chart-1…6` = charcoal → grey → light grey → brand green → red → hairline. Series never pick from the Tailwind palette.

### 1.2 Sector tokens (a18 block — intended table, add to `tokens.css` as `--sector-<name>{,-ink,-soft}` at merge)

Ratios computed by `token-audit.mjs` (`tokenContrast.sectors`). Every row passes the blue gate (slate-warm sits at hue 216 but sat 0.054 / chroma 0.039 — neutral).

| Sector | Hex (mark) | Ink (text) | Soft (bg) | Hue | Ink on white | Ink on soft | Blue gate |
|---|---|---|---|---|---|---|---|
| emerald (default / brand) | `#0AC985` | `#047857` | `#E6FAF3` | 159° | 5.48:1 | 5.05:1 | pass |
| amber | `#F59E0B` | `#B45309` | `#FEF3C7` | 38° | 5.02:1 | 4.51:1 | pass |
| plum | `#A855F7` | `#6B21A8` | `#F3E8FF` | 271° | 8.72:1 | 7.39:1 | pass (271° is outside 190–260) |
| coral | `#FB7185` | `#BE123C` | `#FFE4E6` | 351° | 6.29:1 | 5.24:1 | pass |
| teal | `#14B8A6` | `#0F766E` | `#CCFBF1` | 173° | 5.47:1 | 4.86:1 | pass (173° — keep ≥17° clear of the 190° gate; never darken toward cyan) |
| olive | `#84CC16` | `#4D7C0F` | `#ECFCCB` | 84° | 4.99:1 | 4.60:1 | pass |
| rose | `#F472B6` | `#9D174D` | `#FCE7F3` | 329° | 7.88:1 | 6.71:1 | pass |
| slate-warm | `#9EA2A8` | `#3B3F45` | `#F1F2F4` | 216° | 10.59:1 | 9.45:1 | pass (neutral: chroma 0.039) |

Rules: the *mark* hex is for 8–12 px dots, treemap fills and chips' left bar only; all text uses the *ink*; the *soft* is the chip/row background.
Use sector colour **only** where a sector is being distinguished (companies list, treemap, legend). Elsewhere the UI stays monochrome + brand.

### 1.3 State-only colour rule

Colour carries **state or identity, never decoration**:
- green = brand / selected / primary action; amber = warning / stale / pending; red = error / negative delta; sector hue = sector identity.
- Positive numbers are charcoal (`--sentiment-pos` `#202327`), not green — green is reserved for the brand so "+0.69" and the logo don't compete.
- No gradients, glows, coloured shadows, tinted page backgrounds, or colour used to "make a card pop".

### 1.4 "No blue" rule — exact gate

A colour is **BLUE (violation)** when, in HSL:

```
190° ≤ hue ≤ 260°   AND   saturation > 0.15   AND   chroma (max(R,G,B) − min(R,G,B), 0–1) > 0.15
```

(`web/scripts/brand-audit.mjs` `isBlue`, `web/src/lib/hue-audit.ts`, `web/e2e/brand-hue.spec.ts`, and `token-audit.mjs` share this.)
The chroma gate lets cool charcoals through (`#1F2937` hue 215° / sat 0.28 / chroma 0.094 → neutral) but fails every Tailwind
`sky-*`, `blue-*`, `indigo-*`, `cyan-500+` and any `rgb()` with B dominant. Tailwind classes from those four families are flagged by
construction. Prefer the hue-neutral charcoals in `tokens.css` (`#16181B`, `#3B3F45`, `#4B4F55`, `#5C6168`, `#6E7277`, `#9EA2A8`, `#C9CCD1`, `#E4E6E9`) over Tailwind `gray/slate` so nothing drifts toward the gate when lightened.

### 1.5 Light-only rule

`html.light` only: `:root { color-scheme: light }`, `html { background:#fff }`. No `dark:` variants, no `prefers-color-scheme` media
queries, no theme toggle. The Settings "theme" value is fixed at `"light"`.

---

## 2. Spacing scale

4 px base: **4 · 8 · 12 · 16 · 24 · 32 · 48 · 64** (Tailwind `1 · 2 · 3 · 4 · 6 · 8 · 12 · 16`).
Component padding 12/16, card gap 16, section gap 24/32, page gutter 24 (desktop) / 16 (≤390 px). Tap targets ≥24×24 (`.tap`), primary controls 36–40 px tall.

## 3. Radius

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 4 | focus-ring corner, inline code, small chips' inner |
| `--radius` (`rounded-lg`) | 8 (`0.5rem`) | buttons, inputs, cards (`.card`) |
| `--radius-xl` | 12 (`calc(var(--radius) + .25rem)`) | panels, drawers, modal |
| large | 16 | hero / artifact preview frames |
| pill | 999 | `.chip`, avatars, toggles, favicons (`rounded-full`) |

Audit (real usage): 8px ×32, 999px ×26, `rounded-md` ×25, `rounded-lg` ×22, `rounded-full` ×16, then stragglers 10px ×14, 6px ×14, 9px ×7, 14px ×8, 3px ×4 — collapse 6/9/10 → 8, 14 → 12 or 16, 3 → 4 at merge.

## 4. Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | **150 ms** | hover / colour / opacity, chips, icon buttons |
| `--motion-base` | **250 ms** | panels, drawer slide, rail collapse (224 → 56 px), accordion |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | everything (ease-out-quint-ish; no `ease-in`, no bounce) |
| streaming pulse | 1.2 s linear infinite | skeleton / `animate-pulse` only |

Reduced motion (`globals.css` base layer, keep verbatim):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```

Audit: 160 ms ×8, 150 ms ×7, 200 ms ×6, 120 ms ×4, 180 ms ×2, 220 ms ×1 → normalise all to 150/250. No transition may animate `box-shadow`, `filter` or layout (`width/height` except the rail).

## 5. Type

| Role | Family | Size / line | Weight | Notes |
|---|---|---|---|---|
| Body | **Inter** (`--font-body`, self-hosted `inter-latin.woff2`, swap, fallback Yellix/system-ui) | **14 px / 20** (dense tables, chat) · **15 px / 22** (reading) | 400 | `font-sans` |
| Display | **Fraunces** (`--font-display`, `fraunces-latin.woff2`, fallback Reckless Neue/Georgia) | h1 28–30 / h2 20–22 / h3 16 | 400–600 | `letter-spacing:-.01em`; headings only, never UI chrome |
| Label | Inter | **11 px / 16, uppercase, tracking .06em** | 600 | section eyebrows, table headers, chip text (`text-xs` = 12 px for chips with mixed case) |
| Caption | Inter | 12 px / 16 | 400 | `--muted` |
| Numerals | Inter | inherits | 500 | **`font-variant-numeric: tabular-nums`** on every number column, KPI, delta and timestamp (`tabular-nums` class) |

Minimum text size 11 px (uppercase labels only); 10 / 10.5 / 11.5 / 12.5 px found in the audit are off-scale — snap to 11/12/13/14.
Line length ≤ 72ch in chat/reading panes. No letter-spacing on body text.

## 6. Elevation

| Level | Value | Use |
|---|---|---|
| 0 | none — `1px solid var(--border)` | default card (`.card`), table, rail |
| card hover | `0 1px 2px rgba(22,24,27,.06), 0 4px 12px -8px rgba(22,24,27,.16)` | hover on clickable cards / rows |
| popover / drawer | `0 8px 24px -16px rgba(0,0,0,.25)` (existing) | inspector drawer, menus, toasts |

Shadows are neutral black/charcoal at low alpha only — never tinted, never green. Tailwind `shadow-lg/xl` found ×6: keep only on the drawer/menu layer.

## 7. Focus ring

```css
:focus-visible { outline: 2px solid var(--ring); /* #0AC985 */ outline-offset: 2px; border-radius: 4px; }
```

Never `outline:none` without a replacement. `#0AC985` on white is 2.16:1 — below the 3:1 non-text target — so the ring relies on the 2 px offset gap (focus-appearance via contrast change against the unfocused state, WCAG 2.2 2.4.13 minimum); where a stronger ring is needed (inputs, chat composer) use `outline-color: var(--primary)` `#047857` (5.48:1). Inside a green-filled button use `box-shadow: inset 0 0 0 2px #fff` plus the outer ring.

## 8. Icons

Lucide only (`lucide-react`), 16 px in-text / 18 px nav / 20 px empty-state, `strokeWidth={2}`, `currentColor`. A single accent per surface:
one green icon (the active nav item or the primary action) — every other icon is `--muted` / `--foreground`. No filled icon fonts, no emoji in UI chrome, no coloured icon backgrounds (favicon tiles from `plugin-favicon.tsx` are the only exception and stay monochrome-bordered).

## 9. Nav rail

Expanded **≤ 224 px** (`NAV_EXPANDED_PX = 224`), collapsed **56 px** icon-only, toggle persists; bg `--surface-2`, active item `--brand-green-soft` bg + `--primary` text + 2 px left bar `--brand-green`; 250 ms collapse.

## 10. Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| `color: var(--primary)` / `text-primary` for links & active nav | `text-blue-600`, `text-sky-500`, `#2563EB`, `hsl(217 91% 60%)` |
| `bg-brand-green-soft` hover wash | `bg-blue-50`, gradients, coloured glows |
| `--danger` `#B91C1C` for negative deltas, `--sentiment-pos` charcoal for positive | green for "+", blue for "info" badges |
| `#16181B` / `#3B3F45` / `#5C6168` from tokens.css | Tailwind `gray-900 #111827`, `slate-700 #374151`, `gray-50 #F9FAFB` (cool-tinted; on the watchlist) |
| 8 / 12 / 999 px radii | 6, 9, 10, 14 px one-offs |
| `transition: color 150ms var(--ease)` | `transition: all .3s ease-in-out`, animating `box-shadow` |
| 11 px uppercase eyebrow, 14 px body, `tabular-nums` on numbers | 10 px body text, proportional digits in a KPI column |
| One Lucide icon in `--primary` per surface | multi-colour icon sets, emoji bullets |
| `outline: 2px solid var(--ring); outline-offset: 2px` | `outline: none`, `ring-blue-500` |

---

## Open findings (from `token-audit.mjs`, 2026-10-11, 161 files / 134 distinct colour literals)

**Blue-hue violations (hue 190–260, sat > .15, chroma > .15): 0 literals, 0 Tailwind `sky/blue/indigo/cyan` classes. No `file:value` stragglers to fix.**

Advisory (not violations — cool-tinted greys that are *inside the hue band* with sat > 0.15 but pass on chroma; they are off-token and drift toward the gate if lightened/saturated). Replace with the tokens.css charcoals at merge:

| Value | hue/sat/chroma | count | files |
|---|---|---|---|
| `#1f2937` (+ alpha variants `1a 14 1f 33 99 b3 f5`) | 215° / .28 / .094 | 35 (+8) | `src/components/artifacts/artifacts.css`, `src/components/chat/open-intelligent-ui/shell.css`, `src/components/media/media.css` — owner-spec charcoal; acceptable, but prefer `--foreground #16181b` for text |
| `#111827` (+ alpha `00 1a 99 b3 cc e6`) | 221° / .39 / .086 | 10 (+6) | `artifacts.css`, `media.css` → `#16181b` |
| `#f9fafb` | 210° / .20 / .008 | 15 | `artifacts.css`, `shell.css`, `media.css` → `--surface-2 #f7f8f9` |
| `#374151` | 217° / .19 / .102 | 2 | `shell.css` → `#3b3f45` |
| `#0b0f17` (+ `66`) | 220° / .35 / .047 | 2 (+1) | `media.css` (scrim) → `rgba(22,24,27,.4)` |

Off-token greys (44 distinct, pass the gate): heaviest are Tailwind `gray` leftovers `#e5e7eb` ×46, `#4b5563` ×24, `#6b7280` ×12, `#f3f4f6` ×10, `#9ca3af` ×8 in `artifacts.css` / `shell.css` / `attachments.css` / `media.css` → map to `--border`, `--muted-2`, `--muted`, `--surface-3`, `--chart-3`. Full list: `proof/pass-3/token-audit.json` → `offTokenGreys`.

Non-grey off-token chroma: `#15803d`/`#16a34a` (Tailwind green-700/600, 3 uses) → `--primary`; `#b7377c` ×1 (rose sector mark in a chart) → `#9D174D` ink; `#e02e2a`, `#c1322c`, `#dc2626` → `--danger`; `#946200`, `#e2ab23`, `#92400e` → amber `#B45309` / `#F59E0B`.

Scale stragglers: radii 6/9/10/14/3 px (47 uses); durations 120/160/180/200/220 ms (21 uses) → 150/250; font sizes 10 / 10.5 / 11.5 / 12.5 px (47 uses) → 11/12/13.
