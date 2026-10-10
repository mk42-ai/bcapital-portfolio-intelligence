# Parallel work ledger — 2026-10-10

Generated `2026-10-10T17:15:41.636Z` at commit `d6479aa` by `web/scripts/ledger.mjs` (seed — no reports yet).
30 agents, one worktree each (`/tmp/wt-NN`, branch `wt/NN`, branched from `d6479aa`). Summary: pending: 30.

Columns: **files** = files touched (explicit paths), **tests** = tests added/run with results, **result** = pass | partial | fail (+why), **start/end** = UTC, **commit** = sha on `wt/NN`.

| Agent | Scope | Files | Tests | Result | Start | End | Commit | Notes |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | asset pipeline, manifest, retire /fallbacks | pending | pending | pending | pending | pending | pending | pending |
| 2 | /api/img news fallback uses the news-card asset | pending | pending | pending | pending | pending | pending | pending |
| 3 | company logo avatars fall back to the company-logo asset | pending | pending | pending | pending | pending | pending | pending |
| 4 | PitchBook financial empty-state per unavailable field | pending | pending | pending | pending | pending | pending | pending |
| 5 | voice orb states idle / listening / thinking with the orb assets | pending | pending | pending | pending | pending | pending | pending |
| 6 | composer drop-zone + Attach with the upload-dropzone asset | pending | pending | pending | pending | pending | pending | pending |
| 7 | empty-thread new-chat canvas | pending | pending | pending | pending | pending | pending | pending |
| 8 | synced badge + freshness stamp component | pending | pending | pending | pending | pending | pending | pending |
| 9 | inline citation chips rendered live from SSE source events | pending | pending | pending | pending | pending | pending | pending |
| 10 | Sources list → compact publisher-first chip row ABOVE the answer | pending | pending | pending | pending | pending | pending | pending |
| 11 | awaiting_input interactive card | pending | pending | pending | pending | pending | pending | pending |
| 12 | require_creds interactive card (server-side credential post only) | pending | pending | pending | pending | pending | pending | pending |
| 13 | awaiting_browser_action interactive card | pending | pending | pending | pending | pending | pending | pending |
| 14 | session-resume for interactive cards via the OnDemand API | pending | pending | pending | pending | pending | pending | pending |
| 15 | voice plugin parity: pluginIds + sessionId through STT → submit-query → TTS | pending | pending | pending | pending | pending | pending | pending |
| 16 | voice parity automated test | pending | pending | pending | pending | pending | pending | pending |
| 17 | Playwright record → analyse → fix loop artifacts under docs/proof/ | pending | pending | pending | pending | pending | pending | pending |
| 18 | Perplexity status banner in Settings, remove red cards | pending | pending | pending | pending | pending | pending | pending |
| 19 | 8 px grid; remove nested card layout, serif header, subtitle, data-source line, footer on /chat | pending | pending | pending | pending | pending | pending | pending |
| 20 | 52 px top bar: thread title, model pill, Plan/Run toggle, inspector toggle, freshness dot | pending | pending | pending | pending | pending | pending | pending |
| 21 | collapsible nav rail ≤224/64 px with persisted state + thread list under Chat; delete the "Portfolio analyst" column | pending | pending | pending | pending | pending | pending | pending |
| 22 | conversation column full width/height, messages ≤800 px centred, bounded/virtualised thread | pending | pending | pending | pending | pending | pending | pending |
| 23 | composer pinned bottom with Attach, textarea, mic, send on ONE row + floating scroll-to-bottom | pending | pending | pending | pending | pending | pending | pending |
| 24 | inspector slide-over drawer ≤360 px, ONE details reveal, plan rendered once | pending | pending | pending | pending | pending | pending | pending |
| 25 | PitchBook synchronous initial render (server data), remove Run now / execution id / executing | pending | pending | pending | pending | pending | pending | pending |
| 26 | PitchBook freshness stamp, provenance kept, per-field ask-in-chat into the EXISTING composer, empty-state per field, manual refresh in Settings behind a reveal | pending | pending | pending | pending | pending | pending | pending |
| 27 | PitchBook zero-network-on-first-paint test + drawer initial-content test | pending | pending | pending | pending | pending | pending | pending |
| 28 | brand audit: #0AC985 green only, zero blue, clean whitespace, responsive 1440×900 / 390×844 | pending | pending | pending | pending | pending | pending | pending |
| 29 | gates: tsc, next build, secret scan, headless broken-image count, rail width ≤224, last company row reachable | pending | pending | pending | pending | pending | pending | pending |
| 30 | screenshot proof spec + ledger scaffolding + merge/redeploy runbook | pending | pending | pending | pending | pending | pending | pending |

## Merge order & gates

See `docs/RUNBOOK_MERGE_REDEPLOY.md` — merge each `wt/NN` with `--no-ff` in numeric order, re-run the gates (tsc, eventmap unit test, Playwright against the NEW deploy, Agent 29 gates), then deploy and record `BUILD_ID` below.

- Merged main sha: pending
- FE BUILD_ID: pending
- Preview URL: pending
