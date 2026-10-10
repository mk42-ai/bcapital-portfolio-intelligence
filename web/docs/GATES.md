# Release gates (`web/scripts/gates.sh`)

One script, one line per gate, one JSON summary. `package.json` has no script entry for this on purpose — run it directly.

## Run

```bash
# full run (orchestrator, after merge; needs CPU for next build)
cd web && BASE_URL=https://<new-preview>.vercel.run bash scripts/gates.sh

# local dry-run (no next build)
cd web && SKIP_BUILD=1 BASE_URL=https://<preview>.vercel.run bash scripts/gates.sh

# individual pieces
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/next/dist/bin/next build
node scripts/secret-scan.mjs                       # local artefacts only
BASE_URL=https://… node scripts/secret-scan.mjs    # + live HTML and JS chunks
BASE_URL=https://… node node_modules/@playwright/test/cli.js test -c playwright.config.ts e2e/gates.spec.ts --project=desktop
```

Env knobs: `BASE_URL` (live origin — required for the browser gates and the live half of the secret scan; without it the
playwright gate is reported as SKIP), `SKIP_BUILD=1`, `SKIP_PLAYWRIGHT=1`, `CHROME_PATH` (default `/usr/bin/chromium`,
see `playwright.config.ts`), `GATES_LOG_DIR` (default `/tmp/bcap-gates`; deliberately **not** under `test-results/`,
which Playwright wipes on start). Exit code is `0` only when no gate FAILs; SKIP never fails.

## Gates and what each proves

| Gate | Command | Proves |
| --- | --- | --- |
| `tsc` | `tsc --noEmit -p tsconfig.json` | 0 type errors across `src/`, `e2e/`, `scripts/`. |
| `next_build` | `next build` | Production build (the one Share/Vercel runs) compiles: no missing deps, no server/client boundary errors, all routes prerender. SKIP with `SKIP_BUILD=1`. |
| `secret_scan` | `scripts/secret-scan.mjs` | `ONDEMAND_API_KEY` and `INGEST_SECRET` (read from `web/.env`, never printed) do not appear in `.next/static/**`, `.next/server/app/**/*.html`, `public/**`, nor — when `BASE_URL` is set — in the live HTML of `/`, `/chat`, `/settings` or any `/_next/static/*.js` chunk those pages reference. Also fails on `/sk-[A-Za-z0-9]{20,}/` and `/x-pitchbook-api-key/i` anywhere in those targets (the relay header must stay server-side). Output is counts only. |
| `broken_images` | `e2e/gates.spec.ts` | On `/news`, `/companies`, `/chat` (settings primed, networkidle + 1 s, window + every scroll container + the virtualised `[data-testid=companies-list]` scrolled to the end, `loading=lazy` forced to `eager`, decode awaited with a 5 s cap) the count of `<img>` with `complete && naturalWidth === 0` is **0**. Empty-`src` placeholders are ignored. Up to 20 offending URLs are recorded in the `broken_images_detail` annotation. |
| `rail_width` | `e2e/gates.spec.ts` | `[data-testid=nav-rail]` (fallback `aside[aria-label="Primary"]`) measures ≤ **224 px** wide at 1440×900. |
| `last_row` | `e2e/gates.spec.ts` | On `/companies`, `[data-testid=companies-list]` exposes `data-total`, and after window-scrolling the virtualised list `[data-testid=company-row][data-index=total-1]` is rendered and in the viewport — i.e. the last company is actually reachable. |

The browser gates use plain Playwright `test` (not the `helpers.ts` error-capturing fixture) so console noise can never
mask a gate number. They soft-skip **only** when the page itself returns HTTP 404.

## How the numbers travel

`gates.spec.ts` pushes annotations `broken_images=<n>`, `rail_width_px=<w>`, `last_row_reachable=true|false`
(plus `companies_total`, `broken_images_detail`, `skip-reason`). `gates.sh` runs the spec with `--reporter=json`
(`PLAYWRIGHT_JSON_OUTPUT_NAME=$GATES_LOG_DIR/gates.json`) and reads those annotations plus passed/total counts.

## Expected output

```
tsc            PASS (0 errors)
next_build     PASS                      # or: SKIP (SKIP_BUILD=1)
secret_scan    PASS (hits:0, files_scanned:60, live_chunks:22)
playwright     PASS (3/3)
broken_images  PASS (0)
rail_width     PASS (191px ≤ 224)
last_row       PASS
GATES_SUMMARY {"tsc":"pass","next_build":"pass","secret_scan":"pass","broken_images":0,"rail_width_px":191,"last_row_reachable":true,"playwright_passed":3,"playwright_total":3}
```

Summary field values: `tsc`/`next_build`/`secret_scan` ∈ `pass|fail|skip`; `broken_images`/`rail_width_px` are numbers
or `null` (gate did not run); `last_row_reachable` is `true|false|null`. Logs: `$GATES_LOG_DIR/{tsc,next-build,secret-scan,playwright}.log` and `gates.json`.

## Failure triage

- `secret_scan FAIL` → `hits_by_rule` in `secret-scan.log` names the rule (`ONDEMAND_API_KEY`, `INGEST_SECRET`, `sk-token`, `x-pitchbook-api-key`). A key hit means a server env var leaked through a `NEXT_PUBLIC_` alias or a client import of a server module. The header hit means a browser component is calling the backend relay directly instead of `/api/pitchbook/run`.
- `broken_images FAIL` → read `broken_images_detail` in `gates.json`; most often a remote/blob URL instead of `ASSET.*` from `lib/assets.ts`, or a retired `public/fallbacks/*` path.
- `rail_width FAIL` → `nav-rail.css` width/padding drifted off the 8 px grid budget (≤ 224 px expanded).
- `last_row FAIL` → the virtualiser's `scrollMargin`/`estimateSize` or the page footer is clipping the tail of the list; check `companies_total` vs the highest rendered `data-index`.
