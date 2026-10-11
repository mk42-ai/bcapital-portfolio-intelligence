# SSE fixtures (a13)

Real recordings of ONE 2-plugin run — question *"Which of my context companies moved most since the last sentiment run, and why?"*,
`pluginIds: ["plugin-1722260873" (Perplexity), "plugin-1791713636" (Portfolio Plugin)]`, `externalUserId: INV-001`, recorded 2026-10-11 against
the pass-3 deployment (`https://sb-1gizcktepfgc.vercel.run`, main @ 7c43344). No secrets: `grep -c apikey` → 0 in both files.

| File | What it is | Shape |
| --- | --- | --- |
| `portfolio-movers.bridge.ndjson` | Every `data:` frame the browser receives from `POST /api/chat` (the AG-UI bridge, `web/src/app/api/chat/route.ts`) | one JSON per line: `{ms, data}` — `ms` relative to request start, `data` the raw `data:` payload (JSON string or `[DONE]`); nothing stripped. 680 frames, 31.3 s |
| `portfolio-movers.upstream.sse` | The RAW OnDemand stream for the same question (bypasses the bridge; recorded via `scripts/record-upstream-sse.mjs` with both pluginIds, endpoint `predefined-deepseek-flash`) | one raw SSE line per line, `+<ms> ` prefix (same format as `web/proof/stream-audit/`). 169 data frames, 35.8 s. Different session than the bridge run — ground truth for `parseFrame`, not a frame-for-frame twin |

## Replay harness

```
cd web
node scripts/replay-sse-fixture.mjs tests/fixtures/sse/portfolio-movers.bridge.ndjson     # bridge → classifyClientFrame (+ a7 frame guard if exported)
node scripts/replay-sse-fixture.mjs tests/fixtures/sse/portfolio-movers.upstream.sse      # upstream → parseFrame
node scripts/replay-sse-fixture.mjs <file> --json                                          # machine-readable summary
npm run -s test:sse-replay                                                                 # unit test (tsx), tests/unit/sse-replay.test.ts
```

The reducer lives in `chat-shell.tsx` (React), so the harness replays through the pure pieces in `src/lib/ondemand/sse-adapter.ts` and prints:
counts per kind, first-seen order, tool rows (TOOL_CALL_START ↔ TOOL_CALL_RESULT pairing, pluginId from TOOL_CALL_ARGS), `ondemand.planner_payload`
frames vs `ondemand.thinking` frames, JSON-looking thinking deltas (same regex as `scripts/record-run-check.mjs`), `ondemand.plan` objective
(flagged if it looks like JSON), first answer token vs last tool result, terminal state (`RUN_FINISHED`, `[DONE]`, `RUN_ERROR`).
The script re-execs itself under tsx when started with plain `node` (it imports the `.ts` adapter) and is importable from tests (`loadFixture`, `replayBridge`, `replayUpstream`).

## What the recording shows (unit test expectations)

- Both plugins start (`TOOL_CALL_START` Perplexity @2.2 s, Portfolio Plugin @6.1 s); both get a `TOOL_CALL_RESULT` (Perplexity → `status:error`
  "returned no sources", Portfolio Plugin → `ok`).
- 286 `ondemand.thinking` deltas, **0** JSON-looking; the planner JSON travels in 199 `ondemand.planner_payload` frames.
- 3 `ondemand.plan` frames (2 provisional, 1 final), objective `"I'll find which of my context companies moved most since the last sentiment run and why."`
- `RUN_FINISHED` then `[DONE]` last.
- **Known defect (test item marked `todo`)**: both `TOOL_CALL_RESULT` frames are emitted at stream close (31 279 ms), *after* the first
  `TEXT_MESSAGE_CONTENT` (25 627 ms) — tool rows stay "running" while the answer is already streaming. The assertion is kept; promote `todo` → `check`
  once the bridge closes tool calls before the fulfillment starts.

## Re-recording

Bridge: POST the body above to `<frontend>/api/chat` with `accept: text/event-stream`, split on `\n\n`, keep `data:` lines (see `scripts/record-sse.mjs` for the
shape). Upstream: `ON_DEMAND_API_KEY=… node scripts/record-upstream-sse.mjs <label> "<question>"` (edit `PLUGIN` → both ids), then copy the `.sse`.
Keep both runs ≤ 120 s and re-run `grep -c apikey` before committing.
