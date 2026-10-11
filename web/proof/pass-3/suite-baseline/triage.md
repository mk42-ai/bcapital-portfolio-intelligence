Reduced set, 28 tests × 2 projects (evidence-desktop 1440×900, evidence-mobile 390×844). **0 failures, 0 flaky.** The 12 skips are all deliberate `test.skip(...)` guards, not failures:

| spec | skipped tests | class | evidence |
|---|---|---|---|
| chip-overlap.spec.ts (×2 projects) | 3 + 3 | **environment** (empty data, not a regression) | guard `test.skip(n === 0, "no artifacts in this backend")` — frontend `GET /api/artifacts` on sb-1gizcktepfgc returns `{"data":[],"total":0}` (200), so there is no `artifact-card` to measure; the page itself renders `artifacts-empty` fine. |
| pdf-inline-render.spec.ts (×2 projects) | 3 + 3 | **environment** (empty data) | same guard `test.skip(!card, "no PDF artifact in this backend")` — no artifacts exist on the live deployment until a chat run produces one. |

Run-1 note (not recorded as the baseline): the very first invocation failed 28/28 with `browserContext.newPage: Executable doesn't exist at …/ms-playwright/ffmpeg-1013/ffmpeg-linux` — **environment** (the evidence config records video; the agent sandbox's Playwright cache has no ffmpeg). `run-suite.mjs` now symlinks the system `/usr/bin/ffmpeg` into the cache before launching (`ffmpegShim` in summary.json); after that the identical run went 16 passed / 12 skipped / 0 failed.

Timing: thinking-json-filter is the only slow spec (21–28 s per test — it drives a live OnDemand chat turn via the SSE bridge; the 28 s mobile run is OnDemand latency, not a hang). routes-clean 1.7–4.7 s per route, title-ellipsis ~2.5 s. Whole reduced set: 335 s wall on the shared CPU.
