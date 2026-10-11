# QA final — baseline

Generated 2026-10-11T07:20:20.529Z · frontend https://sb-7dj6w8wasj6f.vercel.run · backend https://sb-51xmkpgnapk5.vercel.run

## SSE recordings (scripts/record-sse.mjs)

| run | first event | first token | total | [DONE] | heartbeats | frames | artifact chain |
|---|---|---|---|---|---|---|---|
| report | 184 ms | 23502 ms | 31278 ms | yes | 3 | 564 | file_written/agent→creating@30430 → ready@31276 → [DONE]@31276 (ready before [DONE]: yes) |
| news | 46 ms | 28707 ms | 35137 ms | yes | 3 | 481 | file_written/agent→creating@n/a → ready@n/a → [DONE]@35136 (ready before [DONE]: no) |

Artifact list: listed (write-a-short-portfolio-report-on-report.pdf, 14968 B, media stored) · content HTTP 200 %PDF=true · signed-url: n/a (not in baseline build — Lane C adds /signed-url)

## Console / page errors per route (real = after allow-list: favicon, ERR_ABORTED, ORB, 404 resources)

- **1440x900**: /overview=0, /company/1au=0, /news=0, /chat=0, /artifacts=0, /settings=0
- **1440x900:chat-flow**: real=0
- **390x844**: /overview=0, /company/1au=0, /news=0, /chat=0, /artifacts=0, /settings=0
- **390x844:chat-flow**: real=0

## Brand audit (no blue hues)

**Total hits: 1996** — /overview @1440x900: 5 · /company/1au @1440x900: 6 · /news @1440x900: 5 · /chat?skip=1 @1440x900: 1 · /artifacts @1440x900: 976 · /settings @1440x900: 5 · /overview @390x844: 5 · /company/1au @390x844: 6 · /news @390x844: 5 · /chat?skip=1 @390x844: 1 · /artifacts @390x844: 976 · /settings @390x844: 5

- /overview @1440x900: `div.flex.min-h-dvh[data-testid="app-shell"] > aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"]` color: rgb(17, 24, 39)
- /overview @1440x900: `div.flex.min-h-dvh[data-testid="app-shell"] > aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"]` outlineColor: rgb(17, 24, 39)
- /overview @1440x900: `aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"] > img` color: rgb(17, 24, 39)
- /overview @1440x900: `aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"] > img` outlineColor: rgb(17, 24, 39)
- /overview @1440x900: `aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"] > span.art-toggle-badge[data-testid="artifacts-toggle-shell-count"]` backgroundColor: rgb(31, 41, 55)
- /company/1au @1440x900: `div.flex.min-h-dvh[data-testid="app-shell"] > aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"]` color: rgb(17, 24, 39)
- /company/1au @1440x900: `div.flex.min-h-dvh[data-testid="app-shell"] > aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"]` outlineColor: rgb(17, 24, 39)
- /company/1au @1440x900: `aside.sticky.top-0[data-testid="nav-rail"] > div.flex.shrink-0 > button.art-toggle.art-root[data-testid="artifacts-toggle-shell"] > img` color: rgb(17, 24, 39)

## Smoothness (run-ux score /10)

Formula: run-ux score(): skeleton(≤1000ms:2, ≤2500ms:1) + cls(≤0.05:2, ≤0.1:1) + jank(longTasks ≤8:2, ≤20:1) + order(thinking→working→answer→sources:2) + errors(0:1) + artifact(card present:1) = /10

- **1440x900**: overall 8 — turn1 8 ({"skeleton":2,"cls":0,"jank":2,"order":2,"errors":1,"artifact":1}, first token 20444 ms, CLS 0.1365, long tasks 3) · turn2 8 ({"skeleton":2,"cls":0,"jank":2,"order":2,"errors":1,"artifact":1}, first token 499 ms, CLS 0.1365, long tasks 3)
- **390x844**: overall 9.5 — turn1 10 ({"skeleton":2,"cls":2,"jank":2,"order":2,"errors":1,"artifact":1}, first token 16612 ms, CLS 0.0387, long tasks 2) · turn2 9 ({"skeleton":2,"cls":1,"jank":2,"order":2,"errors":1,"artifact":1}, first token 35086 ms, CLS 0.0984, long tasks 2)
- **overall**: 8.75

## Screenshots (53)

- answer-streaming-1440x900.png
- answer-streaming-390x844.png
- artifact-pending-1440x900.png
- artifact-pending-390x844.png
- artifacts-card-1440x900.png
- artifacts-card-390x844.png
- artifacts-filled-1440x900.png
- artifacts-filled-390x844.png
- artifacts-panel-1440x900.png
- artifacts-panel-390x844.png
- data-gap-390x844.png
- doc-preview-1440x900.png
- doc-preview-390x844.png
- done-row-1440x900.png
- done-row-390x844.png
- lightbox-1440x900.png
- lightbox-390x844.png
- plan-stepper-1440x900.png
- plan-stepper-390x844.png
- route-artifacts-1440x900.png
- route-artifacts-390x844.png
- route-chat-1440x900.png
- route-chat-390x844.png
- route-company_1au-1440x900.png
- route-company_1au-390x844.png
- route-news-1440x900.png
- route-news-390x844.png
- route-overview-1440x900.png
- route-overview-390x844.png
- route-settings-1440x900.png
- route-settings-390x844.png
- run-skeleton-1440x900.png
- run-skeleton-390x844.png
- sources-expanded-1440x900.png
- sources-expanded-390x844.png
- sources-strip-1440x900.png
- sources-strip-390x844.png
- thinking-collapsed-1440x900.png
- thinking-collapsed-390x844.png
- thinking-streaming-1440x900.png
- thinking-streaming-390x844.png
- thread-settled-1440x900.png
- thread-settled-390x844.png
- upload-failed-1440x900.png
- upload-failed-390x844.png
- upload-idle-1440x900.png
- upload-idle-390x844.png
- upload-progress-1440x900.png
- upload-progress-390x844.png
- upload-success-1440x900.png
- upload-success-390x844.png
- working-row-1440x900.png
- working-row-390x844.png

### Not available

- run-header @1440x900: n/a (not in baseline build — Lane B adds run-header)
- run-timer @1440x900: n/a (not in baseline build — Lane B adds run-timer)
- run-footer @1440x900: n/a (not in baseline build — Lane B adds run-footer)
- video-side-pane @1440x900: n/a — no video artifact in this thread (honest: none produced by the report run)
- data-gap @1440x900: data-gap not reproducible — bridge resolvePluginIds() silently drops unknown ids (plugin-0000000000 injected=true); no failed call in this run
- artifacts-empty @1440x900: n/a — list never empty (23 artifacts; /artifacts has no thread filter in this build)
- run-header @390x844: n/a (not in baseline build — Lane B adds run-header)
- run-timer @390x844: n/a (not in baseline build — Lane B adds run-timer)
- run-footer @390x844: n/a (not in baseline build — Lane B adds run-footer)
- sources-strip @390x844: no sources-list in this run
- sources-expanded @390x844: no sources-list in this run
- video-side-pane @390x844: n/a — no video artifact in this thread (honest: none produced by the report run)
- artifacts-empty @390x844: n/a — list never empty (25 artifacts; /artifacts has no thread filter in this build)
