# Asset bundle (`ondemand-artifact-asset-bundle`)

Generated 2026-10-11T08:22:20Z — 21 PNG assets (13 file-type icons, 4 upload-state icons, 2 charts, 2 illustrations).

## Where it lives

| What | Path |
|---|---|
| Bundle mirror (PNG masters + manifest + README) | `web/public/assets/bundle/` → served at `/assets/bundle/…` |
| Zip deliverable (owner download, not committed) | `ondemand-artifact-asset-bundle.zip` (14.6 MB, 23 entries, top-level folder `ondemand-artifact-asset-bundle/`) |
| Icons the UI actually renders | `web/public/icons/artifacts/<name>.png` (`code-web` → `code.png`, upload states → `upload-idle/-progress/-success/-failed.png`); verified byte-identical (sha256) to the bundle |
| WebP variants | `web/public/assets/artifacts/`, `web/public/assets/artifacts-ui/` |
| Icon spec, mime→icon mapping, state machine | `web/public/assets/bundle/README.md` |

## Manifest schema (`manifest.json`)

```jsonc
{
  "bundle": "ondemand-artifact-asset-bundle",
  "generated_at_utc": "…Z",
  "brand": { "charcoal": "#1F2937", "green": "#0AC985", "red": "#EF4444" },
  "icon_spec": { "grid": "24px glyph on 512px canvas", "corner_radius": "…", "stroke": "…", "states": ["idle","in-progress","success","failed"] },
  "count": 21,
  "assets": [
    {
      "name": "document",
      "file": "icons/file-types/document.png",
      "role": "file-type icon" | "upload-state icon" | "chart" | "illustration",
      "accent_element": "fold corner (centre of canvas)",      // what the green accent marks; region measured with PIL
      "colours": {
        "charcoal": "#1F2937", "green": "#0AC985", "red": "#EF4444",
        "measured_non_white": [ { "hex": "#1F2A3B", "share": 0.2855 }, … ],   // 6-colour median-cut of non-white pixels
        "non_white_share_note": "…"
      },
      "width": 1024, "height": 1024, "bytes": 662780,
      "sha256": "…",
      "source_url": "https://airevdev.blob.core.windows.net/… (signed, expires 2026-10-17T23:21:08Z)",
      "downloaded_at_utc": "…Z"
    }
  ]
}
```

## SHA-256 table

| Name | File | SHA-256 |
|---|---|---|
| document | `icons/file-types/document.png` | `384288e44db84f02a79f4c8bc1c124dc75391d763c475833b09bad89deac93f2` |
| pdf | `icons/file-types/pdf.png` | `df574e80b36fbbbcde37863d597b534a1d4c4823162925b37657648489ab1a03` |
| image | `icons/file-types/image.png` | `860e7a21cd674faba21b4479753b50275740232eb57e211b327f832d95f71087` |
| video | `icons/file-types/video.png` | `13d504bd503791fa7ee0b21f1742f89011aefcdc9052581a9eeb68ad45ffd458` |
| audio | `icons/file-types/audio.png` | `b8d67ddfe2dea7815d40f807e069a04d9a102ff4574f99a9c2546444d05d8418` |
| spreadsheet | `icons/file-types/spreadsheet.png` | `4dbbf4efbddc3a1c00bb9e5ca179969c3be31905953d161bd98a06da95e1dab3` |
| presentation | `icons/file-types/presentation.png` | `b679f2cbc1d99ecbb82b0361ba4d97349db8a474f8788fd3cdac5ff195058047` |
| chart | `icons/file-types/chart.png` | `391d5edfb342bee7065f2268c99d6cdbb2360bb83a1fb5655dc1bed0b0bdb80c` |
| code-web | `icons/file-types/code-web.png` | `7d39a8e4496f156219aa82c8f31faff02b8ebbf22929412c42dca50db4ebacc1` |
| json | `icons/file-types/json.png` | `1c137345c0bb2f91c71b6206c407616a4d9dcf38d3b46f01888d0e4ad6689095` |
| archive | `icons/file-types/archive.png` | `36ee8b9ba72c22c72ee08d92e4c163a2d3858aca5574707bf3cb12f29d49c5c1` |
| link | `icons/file-types/link.png` | `119b0e4a27f3648327cc68b05e7254ff8060e4ed59a9b522518ba0cf8eb96cab` |
| generic | `icons/file-types/generic.png` | `cf050f5beef6a902d70f7628c0883a15720c287aae6d22727fa460414e5af490` |
| idle | `icons/upload-states/idle.png` | `50f0601c24afbc12b8d33dcc9fed8735f024b801bbb9fa389250e8766f7bd1ed` |
| in-progress | `icons/upload-states/in-progress.png` | `d98a5afa16f1e57a30496beab9ee395fc8bb2cdd64da4a03e1d1294866ee908d` |
| success | `icons/upload-states/success.png` | `1c3e1a117609af09c4e20385183e3cd2d173beda24a65a1901ce4766c40b297c` |
| failed | `icons/upload-states/failed.png` | `3ea8fc0e7c66978d8408630dda22c2b3ff8b36dbadce72d482969fb3f0cc058c` |
| bar-chart-refined | `charts/bar-chart-refined.png` | `f258943edc695ec9494a350973ca6bfd6b8aec4635a689038a6afa2c392f12d6` |
| bar-chart-original | `charts/bar-chart-original.png` | `71bc83aa837d329828c1cd0446e968d66677b2e140ce3083f29651e5ae6dc2e3` |
| geothermal-a | `illustrations/geothermal-a.png` | `7bdb14e5323a8f2ba17a99ff081bc423fd13f5640827d9ecbed7cbb0bc9a7344` |
| geothermal-b | `illustrations/geothermal-b.png` | `2b629fcb02cc9b08faab5c9954d237652fed2999e9a549af2df436ab7b6fdc0a` |
| preview-unavailable | `icons/empty-state/preview-unavailable.png` | `044dfb33dfd4ec7bff57252a5d792689ed89898026914e5c4bc255eaf57d1aab` |
| empty-artifacts | `icons/empty-state/empty-artifacts.png` | `f74131b605b1ec1dc4f74c3f94f69437995d2557feebbf14bc328f7893949b20` |
| open-externally | `icons/empty-state/open-externally.png` | `59c1ebbbdad879904a92c2da9bf6767d681661b6e6e043092d653077afdd0db1` |
| version-history | `icons/empty-state/version-history.png` | `b2a81ec21702dc43ed7f8d0aff44c35cb753adce109c3adb611e7481bff5a3d4` |

### Empty-state icons (2026-10-11)

`preview-unavailable`, `empty-artifacts`, `open-externally`, `version-history` — four 1024 px PNGs under `icons/empty-state/` (source:
`web/public/icons/<name>.png`, commit 04dd11d). Manifest `count` is now 25. They drive the pdf.js / office preview fallback, the Artifacts
empty state, the "Tab" (open externally) action and the version-history toggle. The zip was NOT regenerated for this addition.
