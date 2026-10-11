# Suite run — suite-baseline

> REDUCED SET (grep routes-clean|chip-overlap|title-ellipsis|pdf-inline-render|thinking-json-filter) run on a CPU shared by ~50 agents; the merge agent runs the full evidence set after deploy.

- started 2026-10-11T12:07:12.978Z · finished 2026-10-11T12:12:48.007Z · wall 335.0s · cap 13 min
- config `playwright.evidence.config.ts` · grep `routes-clean|chip-overlap|title-ellipsis|pdf-inline-render|thinking-json-filter` · exit 0 · source: results.json
- frontend https://sb-1gizcktepfgc.vercel.run · backend https://sb-3lo1xqgc9bdb.vercel.run
- totals: **20 passed / 0 failed (0 timed out) / 0 flaky / 12 skipped** of 32

| spec | project | passed | failed | flaky | skipped | duration |
|---|---|---:|---:|---:|---:|---:|
| chip-overlap.spec.ts | evidence-desktop | 0 | 0 | 0 | 3 | 46.5s |
| chip-overlap.spec.ts | evidence-mobile | 0 | 0 | 0 | 3 | 46.8s |
| pdf-inline-render.spec.ts | evidence-desktop | 0 | 0 | 0 | 3 | 41.1s |
| pdf-inline-render.spec.ts | evidence-mobile | 0 | 0 | 0 | 3 | 41.4s |
| routes-clean.spec.ts | evidence-desktop | 6 | 0 | 0 | 0 | 16.0s |
| routes-clean.spec.ts | evidence-mobile | 6 | 0 | 0 | 0 | 16.9s |
| thinking-json-filter.spec.ts | evidence-desktop | 2 | 0 | 0 | 0 | 45.2s |
| thinking-json-filter.spec.ts | evidence-mobile | 2 | 0 | 0 | 0 | 51.4s |
| title-ellipsis.spec.ts | evidence-desktop | 2 | 0 | 0 | 0 | 4.8s |
| title-ellipsis.spec.ts | evidence-mobile | 2 | 0 | 0 | 0 | 5.3s |

## Failures (0)

none

## Triage

Reduced set, 28 tests × 2 projects (evidence-desktop 1440×900, evidence-mobile 390×844). **0 failures, 0 flaky.** The 12 skips are all deliberate `test.skip(...)` guards, not failures:

| spec | skipped tests | class | evidence |
|---|---|---|---|
| chip-overlap.spec.ts (×2 projects) | 3 + 3 | **environment** (empty data, not a regression) | guard `test.skip(n === 0, "no artifacts in this backend")` — frontend `GET /api/artifacts` on sb-1gizcktepfgc returns `{"data":[],"total":0}` (200), so there is no `artifact-card` to measure; the page itself renders `artifacts-empty` fine. |
| pdf-inline-render.spec.ts (×2 projects) | 3 + 3 | **environment** (empty data) | same guard `test.skip(!card, "no PDF artifact in this backend")` — no artifacts exist on the live deployment until a chat run produces one. |

Run-1 note (not recorded as the baseline): the very first invocation failed 28/28 with `browserContext.newPage: Executable doesn't exist at …/ms-playwright/ffmpeg-1013/ffmpeg-linux` — **environment** (the evidence config records video; the agent sandbox's Playwright cache has no ffmpeg). `run-suite.mjs` now symlinks the system `/usr/bin/ffmpeg` into the cache before launching (`ffmpegShim` in summary.json); after that the identical run went 16 passed / 12 skipped / 0 failed.

Timing: thinking-json-filter is the only slow spec (21–28 s per test — it drives a live OnDemand chat turn via the SSE bridge; the 28 s mobile run is OnDemand latency, not a hang). routes-clean 1.7–4.7 s per route, title-ellipsis ~2.5 s. Whole reduced set: 335 s wall on the shared CPU.
