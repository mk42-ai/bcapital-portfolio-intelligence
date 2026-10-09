# Backend verification — S8 (health, API contract, OnDemand/Perplexity SSE smoke test)

All timestamps UTC. Run window: **2026-10-09T19:21:20Z → 2026-10-09T19:24:10Z** (end timestamp of the last network call; document written immediately after).

| Item | Target | Result |
|---|---|---|
| Backend sandbox | `https://sb-1gek6bq0m1au.vercel.run` (sbx_s2v1UAKFK3gFbzPBGdyxZoZfIuAC) | **alive — HTTP 200**, no redeploy needed |
| Companies | `GET /companies?limit=200` | **137 rows** returned (`db_record_count` 136 + firm record; `db_record_count_total` 137) |
| News total | Σ `GET /companies/<slug>/news?limit=200` | **197 items** (user expected 182 — measured value is higher, see §2) |
| Ingest runs | `GET /ingest/runs` | workflow batches present, latest `ing-2026-10-09T163236Z-eb08d5` |
| Contract test | `scripts/contract-test.ts` vs `openapi.json` | **9 passed / 0 failed** |
| OnDemand stream | plugin `plugin-1722260873` (Perplexity), endpoint `predefined-claude-fable-5.1` | 1158 log lines, 386 SSE frames, `data:[DONE]` received after **74.1 s** |

---

## 1. Health — 2026-10-09T19:21:20Z

```
$ curl -s -w '\n%{http_code}' https://sb-1gek6bq0m1au.vercel.run/health
{"status":"ok","db_record_count":136,"db_record_count_total":137,
 "last_ingest":{"id":"ing-2026-10-09T163236Z-eb08d5","source":"workflow","received_at":"2026-10-09T16:32:36Z","status":"ok"},
 "model":"predefined-claude-fable-5.1","deferred_plugins":["plugin-1777018662"],
 "earliest_test_utc":"2026-10-09T12:37:25Z","version":"1.0.0","timestamp":"2026-10-09T19:21:20Z"}
200
```

Status 200 with `db_record_count: 136` as expected → **no redeploy performed, no sandbox/vercel CLI run**.

## 2. Counts — 2026-10-09T19:21:2xZ

* `GET /companies?limit=200` → envelope `{data, pagination, filters, timestamp}`; `data.length = 137`.
  The 137 = 135 portfolio companies + the B Capital firm record + 1 extra row that `/health` counts in `db_record_count_total` (137) but not in `db_record_count` (136). Not investigated further (outside scope) — note for the orchestrator: a UI that says "136 companies" should filter on whatever flag separates the 137th row, or use `pagination.total`.
* News: iterated all 137 slugs, `GET /companies/<slug>/news?limit=200` (envelope `{company,name,data,timestamp}`), summed `data.length`:
  **197 news items**. Top: evenup 7, fervo-energy 7, overstory 7, accacia 6, flutterwave 6. **71 companies have 0 news items.**
  The user's expectation was 182; the live DB returns 197 (the 16:32Z workflow batches upserted additional news after the earlier count — `/ingest/runs` shows e.g. batch-4 `newsUpserted: 59`). Report the live number (197) rather than 182.
* `GET /ingest/runs` → `{data:[…]}`; each run carries `id, source, workflowId, workflowName, executionId, model, companiesTouched, newsUpserted, sentimentRows, status, errors, receivedAt, finishedAt`. Latest run: `bcap-portfolio-daily-batch-4`, 25 companies touched, 59 news upserted, 25 sentiment rows, status ok. Note: `/ingest/runs` is **not documented in openapi.json** (only `POST /ingest` is) — documentation gap.

## 3. API contract test — `scripts/contract-test.ts` — 2026-10-09T19:22:39Z

Script: `scripts/contract-test.ts` (repo root). Reads `openapi.json`, iterates every **GET** path (POST `/ingest` is never executed), substitutes `{slug}=fervo-energy` and required query `q=fervo`, and asserts (1) status ∈ documented statuses, (2) `content-type: application/json`, (3) top-level body matches the documented response schema (`required` keys present, JSON types of documented properties, one level into `data[]` / nested objects via `$ref` resolution). An extra negative case checks `GET /companies/__contract_test_missing__` → documented 404 with the `Error` schema (`message`, `errorCode`).

Run (the `tsx` binary is not linked in `node_modules/.bin`, so `npx tsx` fails with "tsx: not found"; the package itself is present, so the equivalent invocation is):

```
$ node node_modules/tsx/dist/cli.mjs scripts/contract-test.ts https://sb-1gek6bq0m1au.vercel.run
PASS  GET /health  [HTTP 200]
PASS  GET /openapi.json  [HTTP 200]
PASS  GET /companies  [HTTP 200]
PASS  GET /companies/{slug}  [HTTP 200]
PASS  GET /companies/{slug} (unknown slug → 404)  [HTTP 404]
PASS  GET /companies/{slug}/news  [HTTP 200]
PASS  GET /companies/{slug}/sentiment  [HTTP 200]
PASS  GET /sentiment/portfolio  [HTTP 200]
PASS  GET /search  [HTTP 200]

9 passed, 0 failed (9 cases) against https://sb-1gek6bq0m1au.vercel.run
```

(`npx tsx …` works as documented once `tsx` is linked into `.bin`; until then use the `node node_modules/tsx/dist/cli.mjs` form above.)

## 4. OnDemand / Perplexity streaming smoke test

Key read from `web/.env` (`ONDEMAND_API_KEY`), used only inside curl headers; **redacted everywhere below**.

| Step | UTC |
|---|---|
| `POST /chat/v1/sessions` (externalUserId INV-001, pluginIds [plugin-1722260873]) | 19:22:53.688Z → session created 19:22:54.136Z (`agentIds:["agent-1722260873"]`, `status:"draft"`) |
| `POST /chat/v1/sessions/<sid>/query` sent (query "What did Fervo Energy announce recently?", endpointId `predefined-claude-fable-5.1`, responseMode `stream`) | 19:22:54.195Z |
| First SSE frame (`event:heartbeat`) | 19:22:59.185Z (+5.0 s) |
| First `planning_thinking` | 19:22:59.364Z |
| First `plugin_sources` (Perplexity results, stepId 1) | 19:23:26.499Z |
| First `"eventType":"fulfillment"` (answer token) | **19:23:57.075Z (+62.9 s after query)** |
| `metricsLog` | 19:24:06.321Z — `ragTimeSec 48.88, fulfillmentTimeSec 21.25, totalTimeSec 70.13, inputTokens 15692, outputTokens 1993` |
| `data:[DONE]` (completion) | **19:24:08.332Z** |
| curl exit | 19:24:08.337Z — **total 74.1 s** (well under the 280 s cap) |

Stream volume: 1158 log lines = 386 SSE frames (`event:` + `data:` + blank line each): **209 `event:message`, 153 `event:thinking`, 24 `event:heartbeat`** → far more than the required ≥3 chunks. Completion confirmed by `data:[DONE]`. Note: **no frame ever carried `status:"completed"`** — every JSON frame has `status:"processing"`; the only completion signal in stream mode is the `data:[DONE]` sentinel (and, shortly before it, the `metricsLog` frame).

### Redacted excerpt (first 10 + last 6 lines of `/tmp/s8/ondemand.log`, 140-char truncation)

```
2026-10-09T19:22:59.185Z event:heartbeat
2026-10-09T19:22:59.186Z data:{"sessionId":"<sid>","messageId":"6ac93f10f7979c7d562adcc4","time":"2026-10-09T19:22:59Z"}
2026-10-09T19:22:59.188Z 
2026-10-09T19:22:59.362Z event:thinking
2026-10-09T19:22:59.364Z data:{"sessionId":"<sid>","messageId":"6ac93f10f7979c7d562adcc4","eventIndex":1,"eventType":"planning_thinking","status":
2026-10-09T19:22:59.365Z 
2026-10-09T19:22:59.587Z event:thinking
2026-10-09T19:22:59.589Z data:{"sessionId":"<sid>","messageId":"6ac93f10f7979c7d562adcc4","eventIndex":2,"eventType":"planning_thinking","status":
2026-10-09T19:22:59.590Z 
2026-10-09T19:22:59.649Z event:thinking
... (1142 lines omitted) ...
2026-10-09T19:24:08.184Z event:heartbeat
2026-10-09T19:24:08.186Z data:{"sessionId":"<sid>","messageId":"6ac93f10f7979c7d562adcc4","time":"2026-10-09T19:24:08Z"}
2026-10-09T19:24:08.187Z 
2026-10-09T19:24:08.330Z event:message
2026-10-09T19:24:08.332Z data:[DONE]
2026-10-09T19:24:08.333Z 
```

Representative mid-stream frames (sessionId redacted, truncated):

```
event:message
data:{"sessionId":"<sid>","messageId":"…","eventIndex":74,"eventType":"plugin_sources","stepId":"1","stepTitle":"Searching Fervo Energy announcements","status":"processing","sources":{"agentId":"agent-1722260873","pluginId":"plugin-1722260873","pluginName":"Perplexity","operationId":"perplexity","items":[{"title":"Fervo Energy Achieves First Power at Cape Station …","url":"https://fervoenergy.com/…","domain":"fervoenergy.com","imageUrl":"…"}, …]}}

event:message
data:{"sessionId": "<sid>", "messageId": "…", "answer": "Fervo", "status": "processing", "eventIndex":154, "eventType": "fulfillment"}

event:message
data:{"sessionId":"<sid>","messageId":"…","eventIndex":361,"eventType":"metricsLog","status":"processing","publicMetrics":{"inputTokens":15692,"outputTokens":1993,"totalTokens":17685,"ragTimeSec":48.88,"fulfillmentTimeSec":21.25,"totalTimeSec":70.13}}
```

(Observed quirk: `fulfillment` frames are serialised with spaces after `:`/`,` whereas all other frames are compact JSON — harmless for `JSON.parse`, but a regex-based parser must not rely on `"eventType":"fulfillment"` without optional whitespace.)

### Live docs reference — `GET /config/v1/public/docs/reference/api/submitquery` (fetched 2026-10-09T19:24:2xZ)

Returns `{data: <OpenAPI 3.0.3 "Chat API">}` with a single operation `POST /chat/v1/sessions/{sessionId}/query` (`operationId: submitQuery`, security `apikey` header):

* **Request** (required `query`, `endpointId`, `responseMode`): `responseMode ∈ {sync, stream, webhook}`; `pluginIds` (max 20 — overrides the session's plugin list; if empty at every level the RAG step is bypassed and only fulfillment runs); `fulfillmentOnly` (bool, skips RAG/plugins); `modelConfigs` (`fulfillmentPrompt`, `stopSequences`, `temperature` 0–2 default 0.7, `topP`, `presencePenalty`, `frequencyPenalty`, …); `endpointId` e.g. `predefined-openai-gpt4o`.
* **Response 200 (documented for sync mode only)**: `{message, data:{sessionId, messageId, answer, status ∈ [processing, completed, failed]}}`. 4XX/5XX → `{errorCode, message}`.
* **Not documented** in this reference: the SSE event names (`heartbeat`/`thinking`/`message`), the `eventType` taxonomy, `fullAnswer`, `sources`, `citations`, `metadata`, or the `[DONE]` sentinel — grep counts over the 6 KB document: `fullAnswer 0, sources 0, metadata 0, event 0, heartbeat 0, thinking 0, DONE 0, citations 0`. The stream shape therefore has to be taken from observation (below), not from the public reference.

## 5. Stream inventory (feeds the chat-bridge design)

### Distinct SSE `event:` names
`heartbeat` (24), `thinking` (153), `message` (209). `[DONE]` arrives as an `event:message` frame with `data:[DONE]`.

### Distinct `eventType` values (JSON frames), count, first-seen UTC
| eventType | SSE event | count | first seen | payload keys |
|---|---|---|---|---|
| *(none — heartbeat)* | heartbeat | 24 | 19:22:59.186Z | `sessionId, messageId, time` |
| `planning_thinking` | thinking | 5 | 19:22:59.364Z | `eventIndex, eventType, status, thinking.delta` |
| `planning_output` | message | 44 | 19:23:02.884Z | `eventIndex, eventType, status, output.delta` |
| `step_output` | message | 60 | 19:23:11.245Z | `eventIndex, eventType, status, stepId, output.delta` |
| `step_thinking` | thinking | 7 | 19:23:13.797Z | `eventIndex, eventType, status, stepId, thinking.delta` |
| `plugin_sources` | message | 2 | 19:23:26.499Z | `eventIndex, eventType, status, stepId, stepTitle, sources{agentId, pluginId, pluginName, operationId, items[{title,url,domain,imageUrl}]}` |
| `fulfillment_thinking` | thinking | 37 | 19:23:48.336Z | `eventIndex, eventType, status, thinking.delta` |
| `fulfillment` | message | 205 | 19:23:57.075Z | `eventIndex, eventType, status, answer` (token delta) |
| `metricsLog` | message | 1 | 19:24:06.321Z | `eventIndex, eventType, status, publicMetrics{inputTokens, outputTokens, totalTokens, ragTimeSec, fulfillmentTimeSec, totalTimeSec}` |

### Full distinct key inventory (dotted paths, number of frames carrying each)
```
answer 205                    publicMetrics.totalTimeSec 1
eventIndex 361                publicMetrics.totalTokens 1
eventType 361                 sessionId 385
messageId 385                 sources 2
output 104                    sources.agentId 2
output.delta 104              sources.items 2
publicMetrics 1               sources.items[].domain 2
publicMetrics.fulfillmentTimeSec 1   sources.items[].imageUrl 2
publicMetrics.inputTokens 1   sources.items[].title 2
publicMetrics.outputTokens 1  sources.items[].url 2
publicMetrics.ragTimeSec 1    sources.operationId 2
                              sources.pluginId 2
status 361                    sources.pluginName 2
stepId 69                     stepTitle 2
thinking 49                   thinking.delta 49
time 24
```

### Answers to the design questions
* **Explicit plugin/tool-call events?** Yes. Besides `fulfillment`/`*_thinking` the stream carries `planning_output`, `step_output`, `step_thinking` (agent plan + per-step output, keyed by `stepId`) and — the one that matters for citations — **`plugin_sources`**, emitted once per plugin invocation (2 Perplexity calls here, stepId 1 "Searching Fervo Energy announcements" and stepId 2 "Verifying Fervo news coverage").
* **`pluginId` present?** Yes — only inside `plugin_sources.sources.pluginId` (`plugin-1722260873`), together with `pluginName: "Perplexity"`, `agentId: "agent-1722260873"`, `operationId: "perplexity"`.
* **`sources` / `citations` / `metadata`?** `sources` yes (`plugin_sources` frames, `items[] = {title,url,domain,imageUrl}`). **No frame carries a `citations` or `metadata` key, and no `fullAnswer` key**; the final text must be assembled by concatenating `answer` deltas of the 205 `fulfillment` frames. The fulfillment text itself contains inline URLs (e.g. `…fervoenergy.com/fervo/`), so a bridge can additionally link them to the `plugin_sources.items` list.
* **Completion:** `data:[DONE]`; no `status:"completed"` frame in stream mode. Use `metricsLog` as the "answer finished" signal if metrics are wanted before `[DONE]`.
* **Heartbeats** arrive roughly every ~3 s during silent periods (`{sessionId,messageId,time}` without `eventType`) — the bridge must tolerate JSON frames lacking `eventType`.
* **Latency profile for UI:** ~5 s to first byte, ~63 s to first answer token (RAG/plugin phase 48.9 s), ~21 s of token streaming. The chat UI needs a "researching…" state fed from `planning_output`/`step_output`/`plugin_sources` to cover the first minute.

## Files

* `scripts/contract-test.ts` — new (contract test, 9 cases).
* `docs/BACKEND_VERIFICATION.md` — this document.
* Scratch (not in repo): `/tmp/s8/ondemand.full.log` (raw, un-truncated), `/tmp/s8/ondemand.log` (140-char, sessionId redacted), `/tmp/s8/contract.log`, `/tmp/s8/counts.json`, `/tmp/s8/docref.raw`.
* No `.env` changes were necessary (backend URL unchanged).
