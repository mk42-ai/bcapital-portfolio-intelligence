# unit1 e2e — BEFORE state (live main@04dd11d, https://sb-4o6djxojbfi1.vercel.run, 2026-10-11 10:08–10:10 UTC)
`BASE_URL=… node node_modules/@playwright/test/cli.js test e2e/thinking-pinned-working-row.spec.ts e2e/thinking-json-filter.spec.ts --project=desktop --workers=1`
4 tests (2 specs × desktop 1440×900 + mobile 390×844 describes) → 4 FAILED, all on the SAME, EXPECTED assertion:
`thinking text must not match /"pluginId"|api_request_parameters|chars each/` — the old build streams the planner / tool-definition JSON into the Thinking body.
In thinking-pinned-working-row.spec.ts every earlier assertion PASSED on the old build (run-header → thinking-block first; every working-row precedes
answer-block; thinking-block data-state collapsed/expanded after the answer; jump pill absent/not intersecting). Screenshots: *.png (Playwright failure captures).
The orchestrator re-runs both specs AFTER deploying t4/u1; the JSON assertion is expected to pass then (bridge routes payload deltas to ondemand.planner_payload).
