# Pass-3 visual snapshots of the run panel (a14)

Spec: `web/e2e/run-panel-visual.spec.ts`. Captures element screenshots of `[data-testid=run-view]` during one short
chat turn per viewport ("In one sentence, what does Fervo Energy do?") at **1440×900** (Desktop Chrome) and
**390×844** (Pixel 7, touch), plus per-state layout metrics.

## Output layout

```
web/proof/pass-3/visual/<VISUAL_LABEL>/
  first-frame-<WxH>.png         ≤3 s after send (run-view first visible)
  first-working-row-<WxH>.png   first [data-testid=working-row] visible
  answer-streaming-<WxH>.png    first non-empty [data-testid=answer-block] text
  settled-<WxH>.png             [data-testid=run-footer] attached (+500 ms)
  settled-fullpage-<WxH>.png    full-page viewport screenshot of the settled state
  metrics-<WxH>.json            per-state metrics (see below)
```

`metrics-<WxH>.json` → `states[]`, one entry per captured state:
`runViewHeight`, `workingRows` + `workingRowHeights[]` + `workingRowStates[]`, `runStatusHeader {exists, offsetTop}`,
`thinkingBlockState` (data-state of `thinking-block`), `childTestids[]` (data-testids of run-view's direct children, in DOM
order), `answerChars`, `runFooter`, `scrollHeight`, `tSinceSendMs`. The same line is printed to stdout as
`[visual <label> <WxH>] <state> …` so the merge agent can read it straight from the Playwright list output.

The spec never fails on pixels: `toHaveScreenshot` is only invoked (soft) when a committed baseline exists under
`web/e2e/run-panel-visual.spec.ts-snapshots/`; otherwise it writes plain `page/locator.screenshot` images.
It fails only if the run-view never appears within 3 s of send or the run never settles (no `run-footer`).
Missing intermediate states (e.g. a run without tool rows) are recorded as annotations, not failures.

## Re-run against a new deployment (merge agent)

```bash
cd web
BASE_URL=https://<new-deployment>.vercel.run VISUAL_LABEL=after \
  ON_DEMAND_API_KEY=$ON_DEMAND_API_KEY \
  node node_modules/@playwright/test/cli.js test e2e/run-panel-visual.spec.ts --project=desktop --workers=1
```

- `--project=desktop` is enough: the spec sets both viewports itself via `test.use` in its two `describe`s (2 chat turns total,
  ~50 s wall-clock on the shared CPU). Do not add `--project=mobile` (its `testMatch` excludes this spec anyway).
- The key is read by `e2e/helpers.ts primeSettings` from `ONDEMAND_API_KEY`/`ON_DEMAND_API_KEY`; never commit it.
- Output lands in `web/proof/pass-3/visual/after/`. Compare with `before/` side by side (same file names), and diff the
  `metrics-*.json` `childTestids` / `workingRowHeights` / `runStatusHeader` fields — those encode the a-series layout changes
  (status header present, row heights, thinking-block collapse, child order).
- To turn the `after` set into a pixel baseline for future runs:
  `node node_modules/@playwright/test/cli.js test e2e/run-panel-visual.spec.ts --project=desktop --workers=1 --update-snapshots`
  (this creates `e2e/run-panel-visual.spec.ts-snapshots/`; subsequent runs then soft-assert `toHaveScreenshot` with 2 % tolerance).

## `before` set — main @ 7c43344 on https://sb-1gizcktepfgc.vercel.run (2026-10-11)

| viewport | state | t+ms | run-view h | working rows (h) | status header | thinking | run-view children (order) |
|---|---|---|---|---|---|---|---|
| 1440×900 | first-frame | 3884 | 570 | 1 (58) running | none | streaming | run-header › thinking-block › plan-stepper › working-list › working-band |
| 1440×900 | first-working-row | 4288 | 570 | 1 (58) running | none | streaming | same |
| 1440×900 | answer-streaming | 16513 | 487 | 1 (58) done | none | collapsed | run-header › thinking-block › plan-stepper › working-list › outputs-card › answer-block |
| 1440×900 | settled | 19248 | 553 | 1 (58) done | none | collapsed | … › outputs-card › answer-block › sources-list › run-footer |
| 390×844 | first-frame | 3900 | 604 | 1 (73) running | none | streaming | run-header › thinking-block › plan-stepper › working-list › working-band › outputs-card |
| 390×844 | first-working-row | 4289 | 604 | 1 (73) running | none | streaming | same |
| 390×844 | answer-streaming | 16141 | 714 | 1 (73) done | none | collapsed | run-header › thinking-block › plan-stepper › working-list › outputs-card › answer-block |
| 390×844 | settled | 18816 | 795 | 1 (73) done | none | collapsed | … › outputs-card › answer-block › sources-list › run-footer |

Observations for the merge agent: `run-status-header` does not exist in the baseline; the single working-row is 58 px
(desktop) / 73 px (mobile, wraps); the run-view *shrinks* 570→487 px on desktop when the thinking block collapses as the
answer starts (a candidate layout-shift source); on mobile the `outputs-card` is already present at first-frame.
