# Brand assets — provenance

All files under `public/brand/` are the **official B Capital assets served by https://b.capital**, downloaded unaltered
(byte-identical, see sha256). Nothing here was drawn, traced, re-coloured or generated.

| File | Source URL (official site) | HTTP | Content-Type | Bytes | sha256 | Downloaded (UTC) |
|---|---|---|---|---|---|---|
| `b-capital-logo.svg` | https://b.capital/wp-content/uploads/2023/08/logo-1.svg — the `<img>` the b.capital header uses | 200 | image/svg+xml | 4 981 | `9e9e9af2450ccd993328beaedd5ebf3e65ec3fe02d0324d353a7f85a5eeab8ad` | 2026-10-09T19:20:47Z |
| `b-capital-mark.png` | https://b.capital/wp-content/uploads/2023/10/BCapital_Logo_XL.png — the mark the site uses for its favicon / apple-touch-icon (also the `logo_url` stored for the B Capital record in the portfolio DB) | 200 | image/png | 3 557 | `ab881de7f2133135f0ccdfb103f12928187ac6fa9f294352adf5454c3525e3ca` | 2026-10-09T19:20:47Z |

Notes
* `logo-1.svg` is **the site's own SVG file** (intrinsic 211×43, green angled-square glyph + dark-navy "B Capital" wordmark).
  Inspecting it shows the vector container embeds the artwork as a base64 PNG `<image>` inside a `<pattern>` — i.e. b.capital does
  not publish true vector paths for the logo. We ship that file exactly as served; we did **not** vectorise it.
* `b-capital-mark.png` is 512×512, palette PNG (the square glyph only). Kept unaltered for any place a square mark is needed.
* `logo-white.svg` (https://b.capital/wp-content/uploads/2023/08/logo-white.svg) exists on the site for dark backgrounds; not used
  because the app is light-theme only.
* Usage: `src/components/brand/logo.tsx` → `<BrandLogo height={28}/>` renders `b-capital-logo.svg` with `alt="B Capital"` and
  width = round(height × 211 / 43), so the intrinsic ratio is preserved (verified: naturalWidth 211, rendered 137×28, ratio 4.89 vs 4.91).
* Re-verified 2026-10-09T19:25:54Z: `curl -sI https://b.capital/wp-content/uploads/2023/08/logo-1.svg` → 200, 4 981 bytes, sha256 identical.
