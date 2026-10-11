# QA-final harness (Lane G)

Reusable, fully parameterised QA run against any deployment. Everything writes to `web/proof/qa-final/<QA_LABEL>/` (default label `baseline`).

```bash
cd web
QA_LABEL=final BASE_URL=https://<frontend>.vercel.run API_URL=https://<backend>.vercel.run \
  node scripts/record-sse.mjs \
  && npx playwright test e2e/qa-final.spec.ts --workers=1 \
  && node scripts/brand-audit.mjs \
  && node scripts/qa-summary.mjs
```

| step | script | outputs |
|---|---|---|
| 1 | `scripts/record-sse.mjs` — POST `/api/chat` twice (report + news), every SSE frame with relative ms; verifies `/api/artifacts` list → `/content` (`%PDF`) → `/signed-url` (404 recorded as n/a in the baseline) | `sse-report.ndjson`, `sse-news.ndjson`, `sse-summary.json` |
| 2 | `e2e/qa-final.spec.ts` — projects `qa-final` (1440×900) + `qa-final-mobile` (390×844 Pixel 7); route console/page errors; upload idle/progress/success/failed(.exe); report turn → thinking-streaming, working-row, thinking-collapsed, done-row, sources-strip/expanded, artifacts-card, doc-preview, lightbox; news turn with an injected unknown plugin id (data-gap attempt); artifacts panel / page; CLS + long tasks + first token → run-ux `score()` | `<state>-<WxH>.png`, `qa-log.ndjson`, `console-errors.json`, `smoothness.json`, `states-<WxH>.json` |
| 3 | `scripts/brand-audit.mjs` — 6 routes × 2 viewports, `isBlue` over computed color/background/border/outline/fill/stroke (same algorithm as `e2e/brand-hue.spec.ts`) | `brand-audit.json` |
| 4 | `scripts/qa-summary.mjs` — merge | `summary.json`, `summary.md` |

Env: `QA_LABEL` (output dir), `BASE_URL` (frontend), `API_URL` (backend), `CHROME_PATH` (default `/usr/bin/chromium`), optional `ON_DEMAND_API_KEY`
(only injected into the browser's local settings, never written to disk). Run with ONE worker — chat turns take 20–90 s each; the whole spec is ≈6–10 min.

States that a build does not render are recorded as `screenshot-na` lines in `qa-log.ndjson` (and in `summary.json → screenshots.notAvailable`) with the
reason — e.g. `run-header`/`run-timer`/`run-footer` (Lane B), `side-pane`/`video-poster` (Lane E), `/signed-url` (Lane C) are "n/a (not in baseline build)".
