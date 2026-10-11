# Testing — how to run every suite

Last audited 2026-10-11 (pass 3, a42). Counts below are from that run on `t5/a42`.

| Suite | Command | Count | Needs network / key |
| --- | --- | --- | --- |
| Backend (in-process Hono, sql.js, read-only DB) | `node node_modules/tsx/dist/cli.mjs scripts/test.ts` (= `npm test`) | **22 cases** (was 14) | no |
| Backend PitchBook contract | `node node_modules/tsx/dist/cli.mjs scripts/test-pitchbook.ts` | – | no |
| eventMap / SSE adapter unit | `cd web && npm run -s test:eventmap` | **115 checks** (was 102) | no |
| Context payload unit | `cd web && npm run -s test:context` | 24 | no |
| Naming unit | `cd web && npm run -s test:naming` | 14 | no |
| Playwright default (desktop + mobile + qa projects) | `cd web && node node_modules/@playwright/test/cli.js test --workers=1 --project=desktop <spec>` | ~30 spec files in `web/e2e/` | `BASE_URL` (live frontend); live chat specs skip without the key |
| Playwright evidence config | `cd web && BASE_URL=… API_URL=… node node_modules/@playwright/test/cli.js test -c playwright.evidence.config.ts --workers=1` | evidence/upload-e2e/routes-clean/thinking-*/title-ellipsis/context-sync/pdf-inline-render/chip-overlap | `BASE_URL`, `API_URL`, key for live chat |
| Run-UX recorder | `cd web && RUN_LABEL=after BASE_URL=… node node_modules/@playwright/test/cli.js test -c playwright.ux.config.ts --workers=1` | 1 spec (HAR + trace + video under `web/artifacts/<label>/`) | `BASE_URL`, key |
| QA harness (Lane G) | `cd web && QA_LABEL=final node node_modules/@playwright/test/cli.js test --project=qa-final --workers=1` then `QA_LABEL=final node scripts/qa-summary.mjs` | writes `web/proof/qa-final/<label>/summary.{json,md}` | `BASE_URL`, key |
| Vitals / Lighthouse | `cd web && BASE_URL=… node scripts/lighthouse.mjs` (mobile + desktop × 5 screens, 15-min wall-clock cap, kills its own Chromium group) | budgets LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1 | `BASE_URL`, `CHROME_PATH` (default `chromium`) |
| Brand / logo / favicon audits | `cd web && node scripts/brand-audit.mjs`, `npm run logo:audit`, `npm run favicon:audit` | fails any hue 190–260° with sat/chroma > 0.15 | `BASE_URL` for brand-audit |
| Typecheck | root `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`; web `cd web && node node_modules/typescript/bin/tsc --noEmit` | 0 errors | no |

## The 1-CPU rules (shared pod)

- Always `--workers=1`, **one spec, one project** per Playwright invocation (`playwright.config.ts` defaults to `workers: 2` — override it).
- Never run `next build` in a worktree; the merge agent does it once.
- Never `npm install` / `npm ci` — `node_modules` are symlinks into the shared install. Use the binaries by path (`node node_modules/tsx/dist/cli.mjs`, `node web/node_modules/@playwright/test/cli.js`, `node node_modules/typescript/bin/tsc`).
- Any script that launches a browser itself (`lighthouse.mjs`, `record-*.mjs`) runs Chromium in its own process group and kills the group on exit/timeout. Do not hand-roll another browser driver.
- Backend tests set `DB_READONLY=1` and run everything through `app.request()` — no server, no port, no network. They are safe to run concurrently with anything else.

## Environment variables

| Var | Used by | Notes |
| --- | --- | --- |
| `BASE_URL` | all Playwright configs, `lighthouse.mjs`, `brand-audit.mjs` | live frontend, e.g. `https://sb-1gizcktepfgc.vercel.run`. Append `?skip=1` / `?e2e=1` to bypass onboarding (helpers.ts primes localStorage). |
| `API_URL` | `playwright.evidence.config.ts`, evidence/upload specs | live backend, e.g. `https://sb-3lo1xqgc9bdb.vercel.run` |
| `ON_DEMAND_API_KEY` (alias `ONDEMAND_API_KEY`) | live chat specs (`hasKey()` in `e2e/helpers.ts` → specs **skip** when absent), `record-upstream-sse.mjs`, QA harness | **Never print, log, echo or commit it.** Pass it only via the environment (header `apikey`). |
| `RUN_LABEL` | `playwright.ux.config.ts` | `before` / `after` artifact label |
| `QA_LABEL` | qa-final project + `qa-summary.mjs` | output folder under `web/proof/qa-final/` |
| `INGEST_SECRET` | backend tests set it to `test-secret` themselves | required header `X-Ingest-Secret` for `/ingest`, `/pitchbook/ingest`, `POST /artifacts` |
| `NODE_ENV=test`, `DB_READONLY=1` | set by `scripts/test.ts` | disables the request logger; writes stay in memory |

## What the backend suite covers (scripts/test.ts)

Original 14: health count, companies pagination/filters/role validation, focus filter, slug + name fallback, status changes, estimate
rationale, news/sentiment/portfolio/search, OpenAPI 3.1 paths, ingest auth + strict/LLM-text payloads + deltas, PitchBook routes, artifacts
signed-URL handling, artifacts `/versions`.

Added in pass 3 (a42):

1. `GET /news/summary` — `total == Σ by_company`, `raw_rows − dedup_removed − orphan_items == total`, same number as `/health.news_total` and `/companies.news_total`.
2. `GET /news/reconciliation` — `orphan_rows == 0`, per-row and totals invariants (`dedup_* ≤ raw`, `7d ≤ 30d ≤ raw`), `Σ summary_def == news_summary_total == /news/summary.total`, focus rows include the five owner companies, `as_of` validation.
3. `GET /sentiment/runs` — latest run `null_delta == 0`, `companies_with_null_delta_now == 0`, counts coherent, newest first.
4. `GET /companies/:slug` — `sentiment.scored_at` / `prior_run_at` / `prior_score` / `ingest_run_id` present and consistent with `/sentiment/runs` and `/companies/:slug/sentiment`; OpenAPI `Sentiment` schema declares them.
5. Artifacts 404s — `/versions`, `/signed-url`, `/:id`, `/content` on an unknown id → `404 {errorCode:"not_found", message}`.
6. `POST /artifacts` strips every SAS parameter (`sp, st, se, sv, sr, sig`) from `media_source_url`, keeps `media_url_expires_at`, never leaks via GET/list, 401 without the secret.
7. Headers — `access-control-allow-origin: *`, UUID `x-request-id` (unique per request), `x-timestamp-utc` on 200/404; `OPTIONS` preflight 204.
8. 404 shape — exactly `{errorCode, message}` for unknown routes, unknown company/pitchbook slugs, and through the `/apps/<x>/…` prefix rewrite.

> Note: the error envelope is `{errorCode, message}` (not `{code, message}`); the tests pin the current shape. Changing it is an API change — update `src/openapi.ts` and the frontend together.

## What the eventMap suite covers (web/tests/unit/eventmap.test.ts)

Fixture-driven checks of `parseFrame` / `classifyClientFrame` / `classifyThinkingDelta` / `pluginLabel` against the recorded SSE families.
The last block (a42) replays verbatim frames from `web/proof/stream-audit/upstream-multistep.sse` (session `6acb4743…`, 2026-10-11 08:22Z) and
the bridge CUSTOM names in `web/proof/unit1/stream-after3.ndjson`: heartbeat without `eventType`, `plugin_sources` with items (url-less
item dropped, `imageUrl` kept, `www.` stripped), `fulfillment` delta verbatim, `metricsLog` totals, `planning_output`/`step_output` → payload,
`planning_thinking` deltas → prose, every CUSTOM name → `known`, `isPlannerPayloadFrame` shape. Append new cases **at the end in a new `{ … }`
block** so parallel branches do not conflict.

## Coverage gaps (known, not yet automated)

- `/enrich/*`, `/pitchbook/run` happy path and `/artifacts/:id/signed-url` *OnDemand* branch need a live key → not covered in-process (fallback branch is).
- `POST /artifacts` size limit (25 MB) and MIME inference are unasserted.
- `/sentiment/portfolio` movers ordering and `/search` ranking are only smoke-tested.
- The bridge route `web/src/app/api/chat/route.ts` is covered only end-to-end (Playwright evidence config), not by a unit harness.
