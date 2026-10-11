# OnDemand artifact asset bundle

Generated 2026-10-11T08:22:20Z · 21 PNG assets · internal B Capital / OnDemand UI assets.

## Icon spec

| Token | Hex | Use |
|---|---|---|
| charcoal ink | `#1F2937` | glyph strokes, canvas outline |
| green accent | `#0AC985` | exactly one accent element per glyph (fold corner, play triangle, progress ring, check mark …) |
| red | `#EF4444` | **failed** state only — never used elsewhere |

* Grid: 24 px glyph, exported on a 512 px canvas (source PNGs are 1024 px / 1254 px renders — downscale, do not upscale).
* Stroke: 2 px on the 24 px grid, round caps and joins; corner radius 4 px on the 24 px grid.
* No blue hues anywhere (brand rule: hue 190–260°, sat > 0.15, chroma > 0.15 fails).
* White / transparent background; icons must read on both `#FFFFFF` and the charcoal side-pane.

### File-type set (13)

document · pdf · image · video · audio · spreadsheet · presentation · chart · code-web · json · archive · link · generic

### Upload states (4)

idle → in-progress → success | failed (retry → in-progress)

```
            ┌──────────── retry ─────────────┐
            ▼                                │
 idle ──► in-progress ──► success            │
                   └────► failed ────────────┘
```

| State | Icon | Accent |
|---|---|---|
| idle | `icons/upload-states/idle.png` | green upload arrow |
| in-progress | `icons/upload-states/in-progress.png` | green progress ring |
| success | `icons/upload-states/success.png` | green check mark |
| failed | `icons/upload-states/failed.png` | red cross (`#EF4444`), no green |

### Usage mapping — mime / extension → icon

| Icon | MIME types | Extensions |
|---|---|---|
| document | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`, `application/rtf` | .doc .docx .txt .md .rtf .odt |
| pdf | `application/pdf` | .pdf |
| image | `image/*` | .png .jpg .jpeg .gif .webp .svg .bmp .tiff |
| video | `video/*` | .mp4 .mov .webm .mkv .avi |
| audio | `audio/*` | .mp3 .wav .m4a .ogg .flac |
| spreadsheet | `text/csv`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | .csv .tsv .xls .xlsx .ods |
| presentation | `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` | .ppt .pptx .key .odp |
| chart | rendered chart artifacts (`image/png` tagged `kind=chart`, Graphs MCP output) | — |
| code-web | `text/html`, `text/css`, `text/javascript`, `application/javascript`, `text/x-python`, any `text/x-*` source | .html .css .js .ts .tsx .jsx .py .go .rs .java .sh |
| json | `application/json`, `application/x-ndjson`, `application/yaml` | .json .jsonl .yaml .yml |
| archive | `application/zip`, `application/gzip`, `application/x-tar`, `application/x-7z-compressed` | .zip .gz .tar .tgz .7z .rar |
| link | external URL artifacts (preview URLs, signed links, `text/uri-list`) | — |
| generic | anything not matched above (`application/octet-stream`) | * |

Resolution order: explicit artifact `kind` → MIME → extension → `generic`.

## Files

| Name | File | Role | Size (px) | Bytes | SHA-256 |
|---|---|---|---|---|---|
| document | `icons/file-types/document.png` | file-type icon | 1024×1024 | 662,780 | `384288e44db84f02a79f4c8bc1c124dc75391d763c475833b09bad89deac93f2` |
| pdf | `icons/file-types/pdf.png` | file-type icon | 1024×1024 | 605,916 | `df574e80b36fbbbcde37863d597b534a1d4c4823162925b37657648489ab1a03` |
| image | `icons/file-types/image.png` | file-type icon | 1024×1024 | 628,285 | `860e7a21cd674faba21b4479753b50275740232eb57e211b327f832d95f71087` |
| video | `icons/file-types/video.png` | file-type icon | 1024×1024 | 612,369 | `13d504bd503791fa7ee0b21f1742f89011aefcdc9052581a9eeb68ad45ffd458` |
| audio | `icons/file-types/audio.png` | file-type icon | 1024×1024 | 624,551 | `b8d67ddfe2dea7815d40f807e069a04d9a102ff4574f99a9c2546444d05d8418` |
| spreadsheet | `icons/file-types/spreadsheet.png` | file-type icon | 1024×1024 | 650,155 | `4dbbf4efbddc3a1c00bb9e5ca179969c3be31905953d161bd98a06da95e1dab3` |
| presentation | `icons/file-types/presentation.png` | file-type icon | 1024×1024 | 644,878 | `b679f2cbc1d99ecbb82b0361ba4d97349db8a474f8788fd3cdac5ff195058047` |
| chart | `icons/file-types/chart.png` | file-type icon | 1024×1024 | 635,947 | `391d5edfb342bee7065f2268c99d6cdbb2360bb83a1fb5655dc1bed0b0bdb80c` |
| code-web | `icons/file-types/code-web.png` | file-type icon | 1024×1024 | 629,359 | `7d39a8e4496f156219aa82c8f31faff02b8ebbf22929412c42dca50db4ebacc1` |
| json | `icons/file-types/json.png` | file-type icon | 1024×1024 | 634,319 | `1c137345c0bb2f91c71b6206c407616a4d9dcf38d3b46f01888d0e4ad6689095` |
| archive | `icons/file-types/archive.png` | file-type icon | 1024×1024 | 617,344 | `36ee8b9ba72c22c72ee08d92e4c163a2d3858aca5574707bf3cb12f29d49c5c1` |
| link | `icons/file-types/link.png` | file-type icon | 1024×1024 | 623,114 | `119b0e4a27f3648327cc68b05e7254ff8060e4ed59a9b522518ba0cf8eb96cab` |
| generic | `icons/file-types/generic.png` | file-type icon | 1024×1024 | 644,204 | `cf050f5beef6a902d70f7628c0883a15720c287aae6d22727fa460414e5af490` |
| idle | `icons/upload-states/idle.png` | upload-state icon | 1024×1024 | 615,484 | `50f0601c24afbc12b8d33dcc9fed8735f024b801bbb9fa389250e8766f7bd1ed` |
| in-progress | `icons/upload-states/in-progress.png` | upload-state icon | 1024×1024 | 616,884 | `d98a5afa16f1e57a30496beab9ee395fc8bb2cdd64da4a03e1d1294866ee908d` |
| success | `icons/upload-states/success.png` | upload-state icon | 1024×1024 | 613,390 | `1c3e1a117609af09c4e20385183e3cd2d173beda24a65a1901ce4766c40b297c` |
| failed | `icons/upload-states/failed.png` | upload-state icon | 1024×1024 | 636,010 | `3ea8fc0e7c66978d8408630dda22c2b3ff8b36dbadce72d482969fb3f0cc058c` |
| bar-chart-refined | `charts/bar-chart-refined.png` | chart | 1024×1024 | 757,990 | `f258943edc695ec9494a350973ca6bfd6b8aec4635a689038a6afa2c392f12d6` |
| bar-chart-original | `charts/bar-chart-original.png` | chart | 1254×1254 | 1,052,416 | `71bc83aa837d329828c1cd0446e968d66677b2e140ce3083f29651e5ae6dc2e3` |
| geothermal-a | `illustrations/geothermal-a.png` | illustration | 1254×1254 | 3,581,650 | `7bdb14e5323a8f2ba17a99ff081bc423fd13f5640827d9ecbed7cbb0bc9a7344` |
| geothermal-b | `illustrations/geothermal-b.png` | illustration | 1254×1254 | 3,583,090 | `2b629fcb02cc9b08faab5c9954d237652fed2999e9a549af2df436ab7b6fdc0a` |

## Empty-state icons

Added 2026-10-11 (commit 04dd11d → bundled by UNIT 3). 1024 px PNG, charcoal strokes + one green accent, same spec as the file-type set.
Served from `web/public/icons/<name>.png`; mirrored here under `icons/empty-state/`.

| name | file | role | size | bytes | sha256 |
|---|---|---|---|---|---|
| preview-unavailable | `icons/empty-state/preview-unavailable.png` | empty-state icon | 1024×1024 | 631,686 | `044dfb33dfd4ec7bff57252a5d792689ed89898026914e5c4bc255eaf57d1aab` |
| empty-artifacts | `icons/empty-state/empty-artifacts.png` | empty-state icon | 1024×1024 | 609,551 | `f74131b605b1ec1dc4f74c3f94f69437995d2557feebbf14bc328f7893949b20` |
| open-externally | `icons/empty-state/open-externally.png` | empty-state icon | 1024×1024 | 630,107 | `59c1ebbbdad879904a92c2da9bf6767d681661b6e6e043092d653077afdd0db1` |
| version-history | `icons/empty-state/version-history.png` | empty-state icon | 1024×1024 | 650,746 | `b2a81ec21702dc43ed7f8d0aff44c35cb753adce109c3adb611e7481bff5a3d4` |

Where the UI uses them: `preview-unavailable` → pdf.js / office fallback in the side pane and the Artifacts preview
(`PreviewUnavailable` in `web/src/components/artifacts/pdf-pages.tsx`); `empty-artifacts` → `ArtifactsEmpty` (`artifacts-empty`);
`open-externally` → the "Tab" action on the fallback; `version-history` (24 px) → the `vN · history` toggle (`artifact-versions-toggle`).

## How the app consumes them

* Icons live in the Next.js app at `web/public/icons/artifacts/<name>.png` (file-type icons by name; upload states as
  `upload-idle.png`, `upload-progress.png`, `upload-success.png`, `upload-failed.png`; `code-web` is served as `code.png`)
  and are picked by `iconFor()` in `web/src/components/artifacts/artifact-icon.tsx`.
* Optimised WebP variants for the running UI live under `web/public/assets/artifacts/` (and `artifacts-ui/`).
* This bundle (PNG masters + `manifest.json` + this README) is mirrored to `web/public/assets/bundle/` so the manifest
  (sha256, measured colours, source URLs) can be fetched at `/assets/bundle/manifest.json`.
* `manifest.json` schema: top-level `bundle`, `generated_at_utc`, `brand`, `icon_spec`, `count`, `assets[]`; each asset
  has `name, file, role, accent_element, colours{charcoal, green, red, measured_non_white[]{hex, share}}, width, height,
  bytes, sha256, source_url, downloaded_at_utc`. `measured_non_white` is a 6-colour median-cut quantisation of the
  non-white, non-transparent pixels (shares are fractions of those pixels). `source_url` values are signed Azure blob
  URLs that expire 2026-10-17T23:21:08Z.

## Licence

Internal B Capital / OnDemand UI assets. Not for redistribution outside the B Capital Portfolio Intelligence project.
