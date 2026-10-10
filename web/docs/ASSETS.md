# Illustration assets

`web/public/assets/` is the **single source** of illustration assets. Twelve names × two sizes (256, 512) × two formats (WebP, PNG) = 48 files
plus `manifest.json`. All paths are referenced through `web/src/lib/assets.ts` (`ASSET.*`, `asset(name, size, ext)`, `assetSrcSet(name)`).

## Rule

**Local paths only — no runtime blob URLs.** Never point an `<img>` at `*.blob.core.windows.net`, a CDN, a data: URL built at runtime, or the
retired `/public/fallbacks/` directory (deleted). If an illustration is needed, add it to the pipeline, regenerate, and reference it via `ASSET.*`.
`e2e/assets.spec.ts` enforces this: every asset file answers 200 with the right `content-type`, the manifest lists exactly 12 entries, and the
`/chat` and `/` HTML contain neither `blob.core.windows.net` nor `/fallbacks/`.

## The 12 assets

Sizes are bytes on disk (from `manifest.json`); “Transparent %” is the share of alpha-0 pixels in the emitted (cropped) image.

| Asset | `ASSET.*` key | Used in | Transparent % | webp 256 | png 256 | webp 512 | png 512 |
|---|---|---|---:|---:|---:|---:|---:|
| `news-card` | `ASSET.newsCard` | `/api/img` fallback tile + news thumbnails (img-proxy `FALLBACK_NEWS_TILE`) | 12.8 | 3,178 | 38,664 | 7,170 | 142,183 |
| `company-logo` | `ASSET.companyLogo` | company avatars / logo tile fallback (img-proxy `FALLBACK_LOGO_TILE`) | 12.5 | 3,328 | 47,146 | 5,576 | 182,522 |
| `financial-empty` | `ASSET.financialEmpty` | PitchBook `NOT_AVAILABLE_FROM_PLUGIN` fields (`FieldEmptyState`, pb-empty-state, pitchbook-view) | 82.5 | 6,968 | 20,893 | 13,450 | 64,124 |
| `voice-orb-idle` | `ASSET.voiceIdle` | voice panel orb — idle / error | 35.9 | 7,902 | 47,670 | 16,472 | 172,611 |
| `voice-orb-listening` | `ASSET.voiceListening` | voice panel orb — listening | 33.2 | 11,256 | 57,579 | 24,034 | 195,456 |
| `voice-orb-thinking` | `ASSET.voiceThinking` | voice panel orb — thinking | 62.5 | 15,396 | 45,113 | 31,372 | 137,488 |
| `upload-dropzone` | `ASSET.dropzone` | composer attachment dropzone (attachments.tsx) | 95.2 | 11,460 | 19,574 | 23,640 | 53,080 |
| `awaiting-input` | `ASSET.awaitingInput` | AWAITING_INPUT interactive card | 80.0 | 4,312 | 16,860 | 8,700 | 48,750 |
| `require-creds` | `ASSET.requireCreds` | REQUIRE_CREDS interactive card | 73.5 | 13,952 | 40,977 | 28,474 | 120,621 |
| `browser-action` | `ASSET.browserAction` | AWAITING_BROWSER_ACTION interactive card | 31.6 | 3,926 | 28,821 | 8,176 | 100,554 |
| `synced-badge` | `ASSET.syncedBadge` | PitchBook “synced” stamp (synced-badge.tsx) | 57.4 | 14,594 | 47,640 | 30,994 | 138,577 |
| `new-chat` | `ASSET.newChat` (512) | empty thread / new-chat hero (chat-welcome) | 85.0 | 3,776 | 11,335 | 7,284 | 35,721 |

Total on disk: 2,119,349 bytes (2070 KiB) for all 48 files. Default `ASSET.*` entries are 256 WebP (≈3–15 KB each); use `assetSrcSet(name)`
for 2× displays, and the PNGs only where WebP is unsupported (e.g. e-mail, OG images).

## Pipeline

Source: `/tmp/assets-src/<name>.png` — 1024² RGB illustrations on a white background (brand green only; never blue).

```bash
cd web
python3 scripts/assets-pipeline.py /tmp/assets-src   # regenerate 48 files + manifest.json, then runs the halo verifier
python3 scripts/assets-pipeline.py --verify          # verifier only (no sources needed; exits 1 on any halo / border alpha)
```

Requires Python 3 with `numpy`, `Pillow`, `scipy`. Deterministic, no network.

What it does, per asset:

1. **White → alpha by connectivity, not by colour.** Pixels with min(R,G,B) ≥ 232 are labelled as connected components; only components that
   touch the image border are background. White *inside* a shape (card faces, dialog bodies, the orb highlight) stays fully opaque.
2. **Soft rim.** The 2 px band next to the background gets alpha from its luminance (`(255 − min) · 255 / 60`), so anti-aliased outlines keep a
   clean edge on tinted surfaces instead of a white halo.
3. **Square crop with 24 px padding** around the opaque bounding box, so every icon shares one box and centres the same way.
4. **Resize (Lanczos) to 256 and 512**, save WebP (quality 86, method 6) and PNG (optimised).
5. **Manifest.** `manifest.json` records the four paths, byte sizes, `transparent_pct` (emitted image) and `source_bg_pct` (source image).
6. **Verify.** Every emitted PNG is reopened: all border pixels must be alpha 0, and no near-white pixel with alpha ≥ 200 may touch the
   transparent region (= halo). Current state: `verify: all clean` for all 24 PNGs; interior whites (e.g. `news-card` 52 k px at 256) are
   preserved as intended.

## Adding an asset

1. Drop `<name>.png` (1024², white background) into `/tmp/assets-src/`.
2. Add `<name>` to `NAMES` in `scripts/assets-pipeline.py` **and** to `AssetName` + `ASSET_NAMES` (+ an `ASSET.*` key) in `src/lib/assets.ts`.
3. Run the pipeline; commit the 4 new files + `manifest.json`; update the table above and the `12` counts in `e2e/assets.spec.ts`.
