## Run-UX record → analyse → fix → re-record

Edits land on `main` in `160392c` (direct commit + push as requested); this branch carries the PR report so the work is reviewable here.

### Before / after smoothness (formula: start 10; −1 per dead-air gap >800 ms between consecutive VISIBLE DOM changes with no filler/progress element changing a…)
| Metric | Before | After | Δ |
|---|---|---|---|
| Smoothness overall | 6.75 | 8.75 | +2 |
| Smoothness desktop | 7 | 10 | +3 |
| Smoothness mobile | 6.5 | 7.5 | +1 |
| score (desktop T1) | 7 | 10 | 3 |
| CLS (desktop T1) | 0.0173 | 0.0307 | 0 |
| dead-air gaps >800 ms (desktop T1) | 0 | 0 | 0 |
| long frames >50 ms (desktop T1) | 1 | 2 | 1 |
| console errors (desktop T1) | 3 | 0 | -3 |
| favicon failures (desktop T1) | 3 | 0 | -3 |
| first answer token ms (desktop T1) | 33530.6 | 15969.5 | -17561.1 |
| total ms (desktop T1) | 39821 | 22716 | -17105 |
| score (desktop T2) | 7 | 10 | 3 |
| CLS (desktop T2) | 0.2294 | 0.0251 | -0.2 |
| dead-air gaps >800 ms (desktop T2) | 0 | 0 | 0 |
| long frames >50 ms (desktop T2) | 0 | 0 | 0 |
| console errors (desktop T2) | 0 | 0 | 0 |
| favicon failures (desktop T2) | 0 | 0 | 0 |
| first answer token ms (desktop T2) | 28344.1 | 29387.8 | 1043.7 |
| total ms (desktop T2) | 34563 | 36101 | 1538 |
| score (mobile T1) | 6 | 7 | 1 |
| CLS (mobile T1) | 0.6693 | 0.1705 | -0.5 |
| dead-air gaps >800 ms (mobile T1) | 0 | 0 | 0 |
| long frames >50 ms (mobile T1) | 1 | 4 | 3 |
| console errors (mobile T1) | 1 | 0 | -1 |
| favicon failures (mobile T1) | 1 | 0 | -1 |
| first answer token ms (mobile T1) | 19545.1 | 44109.9 | 24564.8 |
| total ms (mobile T1) | 26125 | 49794 | 23669 |
| score (mobile T2) | 7 | 8 | 1 |
| CLS (mobile T2) | 0.8054 | 0.2115 | -0.6 |
| dead-air gaps >800 ms (mobile T2) | 0 | 0 | 0 |
| long frames >50 ms (mobile T2) | 0 | 0 | 0 |
| console errors (mobile T2) | 0 | 0 | 0 |
| favicon failures (mobile T2) | 0 | 0 | 0 |
| first answer token ms (mobile T2) | 40985.5 | 43585.5 | 2600 |
| total ms (mobile T2) | 48469 | 50028 | 1559 |

GROWTH keyboard/colour assertions: before failed `Escape collapses the expanded tile and keeps focus` → after `all pass` (tile/border rgb(10, 201, 133), chevron rgb(4, 120, 87), focus ring, Tab order G→R→O→W→T→H, Enter/Space/Escape/Shift+Tab).

### Observed summarisation event
**None exists upstream.** Raw SSE probe (two turns, 812 frames, `web/proof/upstream-probe/`): event names `thinking|message|heartbeat`; eventTypes `fulfillment, fulfillment_thinking, metricsLog, planning_output, planning_thinking, plugin_sources, step_output, step_thinking`; zero `statusLog` / `summarize_history.*` / `plan_created`. The step boundary is `plugin_sources` (stepId N, stepTitle) → `step_thinking` (stepId N+1), 1247 ms apart. `eventMap.ts` now binds this as `STEP_BOUNDARY`; the bridge derives the Summarising checkpoint from it (`ondemand.summary {derived:true}`) and the documented `summarize_history.*` pair stays bound. eventMap coverage of every observed eventType: 100 %.

### Perplexity
`plugin-1722260873` returned real sources on every turn of both runs (status ok, 8–10 items per step) — no "Not enough credits" this session; the honest red error card path is unchanged.

### Code changes (on main, 160392c)
- `web/src/components/chat/open-intelligent-ui/chat-shell.tsx` — Jump-to-latest pill portalled out of the thread flow (root cause of the CLS: the in-flow sibling shrank OpenUI's flex row by 128 px per toggle); follow-to-bottom in `useLayoutEffect`; pending row until first token; `WorkingBand` in a reserved 34 px slot; reserved plan slot; markdown throttle 90 ms; favicons via `/api/favicon`
- `web/src/components/chat/open-intelligent-ui/shell.css` — reserved heights (activity cards 58 px, plan 78 px, slot 34 px), bounded sources rail with `content-visibility`, absolute jump pill, dot-matrix animation off, tabular-nums widths
- `web/src/app/api/chat/route.ts` — 600 ms stall watchdog (`ondemand.filler` on/tick/off), derived step-boundary summary frames
- `web/src/app/api/favicon/route.ts` — same-origin favicon proxy (204 for unknown hosts)
- `web/src/lib/ondemand/eventMap.ts`, `sse-adapter.ts` — `STEP_BOUNDARY`, stepId/stepTitle on sources
- `web/src/components/shell/growth-values.tsx`, `web/e2e/growth.spec.ts` — Escape collapses the focused tile
- `web/tests/e2e/run-ux.spec.ts`, `ux-init.js`, `score.mjs`, `compare.mjs`, `web/playwright.ux.config.ts` — the recorder/scorer
- `web/proof/run-ux/*.json` — timelines, smoothness before/after, comparison, summarisation-event-observed; `web/docs/HANDOFF.md` §13

### Artifacts
Timelines / comparison / smoothness JSON: `web/proof/run-ux/`. Traces (trace.zip with embedded HAR, screenshots, snapshots), standalone `.har`, videos (webm+mp4), named screenshots at 1440×900 and 390×844, and the Playwright HTML report are attached to the run that produced this PR (artifact bundle `run-ux-artifacts.zip`).
