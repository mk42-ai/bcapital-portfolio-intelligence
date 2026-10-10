# Perf recorder (`e2e/perf/record-run.mjs`)

Records one full chat streaming run (+ GROWTH grid hover/expand) in headless Chromium with video, HAR, Playwright trace,
SSE frame log and a metrics summary.

## Run

```bash
cd web
# node_modules/.bin is empty in this container → call playwright via node, ffmpeg must exist (system /usr/bin/ffmpeg).
# One-time (Playwright needs its own ffmpeg shim for video): node node_modules/playwright/cli.js install ffmpeg
node e2e/perf/record-run.mjs --label before --viewport desktop --url https://<host>
node e2e/perf/record-run.mjs --label before --viewport mobile  --url https://<host>
# optional: --prompt "…" --maxStreamMs 240000
```

Each run takes ~1–3 min (bounded: 240 s stream wait, 330 s hard timeout → partial outputs are still written).

## Outputs — `web/proof/perf/<label>-<viewport>/`

| file | what |
|---|---|
| `run.webm` / `run.mp4` | full-session video (viewport-sized, mp4 via ffmpeg libx264) |
| `trace.zip` | Playwright trace (screenshots + DOM snapshots + sources) → `node node_modules/playwright/cli.js show-trace trace.zip` |
| `run.har` | HAR with embedded bodies (`/api/chat` SSE included) |
| `sse-frames.json` | every `data:` line of the `/api/chat` stream: `{tMs, isoUtc, type, name, eventType, statusType, raw, parsed}` (copied to `web/proof/sse-frames-<label>-<viewport>.json`) |
| `metrics.json` | summary (see below) |
| `00-loaded.png` `01-plugins.png` `02-t0.5s.png` `03-t1s.png` `04-t3s.png` `05-t10s.png` `midstream-toolcard.png` `midstream-citations.png`* `step-summary.png`* `final.png` `growth-hover.png` `growth-expanded.png` | screenshots (*only when the element appears) |

## How it measures

`e2e/perf/init-script.js` is injected via `addInitScript` before navigation:
- `PerformanceObserver` → `layout-shift`, `longtask`, `paint`, `event` (≥16 ms) buffers
- rAF sampler active while `window.__rafOn` (set at send, cleared after stream) → dropped frames = delta > 34 ms
- `fetch` tap on `/api/chat`: records the proxy payload (api keys stripped), response headers, and clones the body to split SSE lines with `performance.now()` timestamps relative to `window.__sendT0`
- `MutationObserver` first-seen timestamps for `pending-row`, `plugin-activity` (+ states), `thinking-trace`, `citation-chip`, `step-summary`, `source-link`, `answer-badge`, `chat-error`, `.oiu-assistant p`
- 250 ms sampler of the thread scroller (`scrollTop/scrollHeight/clientHeight/atBottom`) plus whether assistant text / plugin card / pending row are visible → blank intervals > 1500 ms

Key `metrics.json` fields: `firstEventMs`, `firstTokenMs` (first `TEXT_MESSAGE_CONTENT`), `firstTokenPaintMs`, `firstPluginCardMs`, `firstCitationChipMs`, `firstStepSummaryMs`,
`streamEndMs`, `stopToSendResetMs` (DONE frame → submit button back to "Send message"), `frameToPaintLatencyMs`, `cls`, `longTasks`, `rafDroppedFrames`, `scrollAnchoring`,
`blankIntervalsOver1500ms`, `faviconFailures`, `consoleErrors`, `pageErrors`, `pluginCard`, `errorCode`, `sourcesCount`, `citationChips`, `stepSummaries`, `answerChars`, `sessionId`,
`growth {hoverLatencyMs, hoverColor, brandGreenVar, isBrandGreen, expandLatencyMs, reducedMotionOk}`, `cdpMetrics` (CDP `Performance.getMetrics`).

Plugin toggles (`[data-testid=plugin-toggle][data-plugin-id=…]`) are switched on when present; `pluginTogglesPresent` records whether the build had them.
The script never reads `.env` and strips any `apikey` / `x-ondemand-key` / `authorization` fields before writing.
