# Stream contract — OnDemand submit-query v1 SSE → run view

**Status:** normative for `web/` (lane A, 2026-10-11). This is the single map from every upstream SSE frame to the UI block that renders it, plus the Media API endpoints and the artifact persistence rule. Nothing here is invented: every row cites its source.

Sources (all in the repo):

| Tag | Source |
|---|---|
| **P** | `docs/reference/submit-query-v1-sse-reference.pdf` (1 page) — event names, payload fields, terminal markers |
| **U** | `docs/reference/OnDemand-Run-UX-Before-After.pdf` / `.html` — the 22 recorded frame signatures (p. 21) and the proposed run view |
| **O** | `docs/reference/OnDemand-Outputs-Panel-Spec.pdf` — register-at-write-time Outputs panel (`artifact.created`, refresh-safe, before run end) |
| **L** | Live OpenAPI fragments fetched 2026-10-11T06:55Z: `docs/reference/doc-submitquery.json`, `doc-createchatsession.json`, `doc-fetchmedia.json`, `doc-createmediaurl.json`, `doc-deletemedia.json` |
| **T** | Repo traces 2026-10-10 (`web/proof/team-a/sse-event-families.json`, `web/artifacts/summarisation-event-observed.json`), summarised in `docs/ONDEMAND_SSE_FRAMES.md` §(e) |
| **Code** | `web/src/lib/ondemand/eventMap.ts` (name tables + `CLIENT_EVENT`), `sse-adapter.ts` (parser), `web/src/app/api/chat/route.ts` (bridge → AG-UI `CUSTOM` frames), `web/src/components/chat/open-intelligent-ui/chat-shell.tsx` (`RunView`), `web/src/components/chat/run-rail.tsx` |

Pipeline: upstream SSE → `parseFrame()` (`sse-adapter.ts`, every name lookup through `eventMap.ts`) → `/api/chat` bridge → AG-UI frames (`TEXT_MESSAGE_CONTENT` for the answer, `CUSTOM {name,value}` for everything else, names from `CLIENT_EVENT`, abbreviated **CE** below) → chat shell stream store → `RunView`.

---

## 1. Wire format recap (P)

- Request: `POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query` with body `{query*, endpointId*, responseMode*:"stream", pluginIds?, fulfillmentOnly?, modelConfigs?}`, header `apikey` (L `doc-submitquery.json`). The session comes from `POST /chat/v1/sessions` `{externalUserId*, pluginIds?}` → `data.id` (L `doc-createchatsession.json`). Response is `text/event-stream; charset=utf-8`.
- Each frame is `event: <name>` + one or more `data:` lines + a blank line. Multi-line `data:` payloads are joined before parsing (the reference example splits one JSON object over two `data:` lines).
- **Four `event:` names:** `message`, `thinking`, `agent`, `heartbeat`. "Listen to all four event names and tolerate unknown subtypes."
- The SSE name selects the **channel**; the JSON `eventType` selects the **subtype**. For `message/statusLog` the subtype is refined by `currentStatusLog.statusType`; for `agent` it is `ondemand_agent.<subtype>`.
- Structured frames share `sessionId`, `messageId`, `eventIndex`, `status` (usually `"processing"`). **Event indexes may have gaps; heartbeats and terminal markers have no index.** Never use `eventIndex` as a completeness check.
- Terminal markers arrive on `event: message` as **literal strings, checked BEFORE `JSON.parse`** (`TERMINAL` in eventMap.ts):
  - `[DONE]` — the query ended successfully.
  - `[ERROR]:` + JSON — the query ended with failure or cancellation (e.g. `{"message":"…","errorCode":"…"}`; P only says "followed by JSON", the key names are what the adapter reads).
- A disconnect alone does not prove completion. Agent events and intermediate status logs are never terminal. Agent completion does not end the query.
- Heartbeat every ~3 s: `{sessionId, messageId, time}`, **no `eventType`**. Never treat it as answer content.
- Pauses keep the stream open: clarification answers go to `POST /v1/client/sessions/{sessionId}/messages/{messageId}/plan-clarification` `{userResponse:[{question,answer}]}`; credentials go to the client `…/messages/{messageId}/tool-credentials` route with `pluginId` + `fields:[{key,value}]` (or `cancelled:true`).
- Unknown names never throw and are never dropped: `parseFrame → {kind:"unknown"} → CE `ondemand.unknown` → developer disclosure (`UPSTREAM_UNKNOWN_POLICY`).

---

## 2. Event → UI block table

Columns: SSE event name · eventType / statusType / agent subtype · payload fields read · bridge CUSTOM frame (`CLIENT_EVENT` key → wire name) · UI block + position in the turn (block numbers refer to §3) · `data-testid`. "Src" = where the frame is attested.

### 2a. `thinking` channel

| SSE event | eventType | Payload fields read | Bridge frame | UI block + position | data-testid | Src |
|---|---|---|---|---|---|---|
| `thinking` | `planning_thinking` | `thinking.delta` | `thinking` → `ondemand.thinking` `{kind:"planning", delta, stepId}` | Block 2 **Thinking** (pinned top), phase label *Planning*; streams live, no cap | `thinking-block` (`data-state=streaming\|collapsed`, `data-chars`) | P, U, T |
| `thinking` | `planning_output` (upstream `planning_answer`) | `output.delta` — plan JSON as text: `title`/`objective`, `steps[].user_query` | `thinking` → `ondemand.thinking` `{kind:"plan"}` **and**, parsed progressively, `plan` → `ondemand.plan` `{objective, steps[{id,title}]}` (+ `step` start frames per step title) | Block 2 Thinking (raw text) **and** block 3 **Plan checklist** (objective + steps, `data-state=provisional` until `plan_created`) | `thinking-block`, `plan-stepper`, `plan-step` | P, U, T |
| `thinking` | `step_thinking` (upstream `plugin_thinking`) | `thinking.delta`, `stepId` | `thinking` → `ondemand.thinking` `{kind:"step", delta, stepId}` | Block 2 Thinking, phase label *Step n*; the matching plan step shimmers (`plan-step[data-state=running]`) | `thinking-block`, `plan-step` | P, U, T |
| `thinking` | `step_output` (upstream `plugin_answer`) | `output.delta`, `stepId` — plugin-calls JSON `{title, plugins[{pluginId,name,api_request_parameters}]}` | `thinking` → `ondemand.thinking` `{kind:"step_output"}`; when the JSON closes: `step` → `ondemand.step` `{phase:"start", stepId, label, source:"step_output"}` and `stepOutput` → `ondemand.step_output` `{stepId, title, plugins[{pluginId,name,params}], raw}` | Block 4 **Working row** opens for that step (favicon chips + label, e.g. "Searching the web") directly above where the result will land; the call params title the Outputs card | `working-row` (`data-state=running`, `data-plugin`), `working-chips`, `outputs-card`, `output-step` | P, U, T |
| `thinking` | `fulfillment_thinking` | `thinking.delta` | `thinking` → `ondemand.thinking` `{kind:"fulfillment"}` | Block 2 Thinking, phase label *Answer*; the live line reads "Writing the answer" | `thinking-block` | P, U, T |

### 2b. `message` channel — `statusLog`

All read `currentStatusLog.{statusType, statusMessage, time}` plus the extra field listed. Every statusLog also emits `status` → `ondemand.status` `{phase, statusType, statusMessage, elapsedMs}` which drives the live line / skeleton (`run-skeleton[data-phase]`, `pending-row`). **T: zero statusLog frames were observed on this account/endpoint (`predefined-deepseek-flash`); the rows below are the P/U binding and remain bound so a real frame takes over the moment it ships.**

| statusType | Extra payload fields | Bridge frame | UI block + position | data-testid | Src |
|---|---|---|---|---|---|
| `initializing` | `statusMessage` "Initializing the process…" | `status` → `ondemand.status` `{phase:"planning"}` | **No new line.** Block 1 live timer starts; block 2 Thinking header reads "Thinking" | `run-skeleton`, `thinking-block` | U |
| `plugin_suggestion.initialized` | — | `plugins` → `ondemand.plugins` `{phase:"initialized", plugins:[]}` + `status` | Live line "Finding plugins" in the pending Working skeleton | `working-row[data-state=queued]`, `pending-row` | U |
| `plugin_suggestion.completed` | `suggestedPlugins[{name, logoUrl, …}]` | `plugins` → `ondemand.plugins` `{phase:"completed", plugins[{id,name,logoUrl}]}` | Block 1 **run header plugin chips** (logos only, name on hover) and the chips of the queued Working row | `run-plugins`, `working-chips` | U |
| `plan_created` | `queryPlan` (`objective`, `steps[]`) | `plan` → `ondemand.plan` `{objective, steps}` + `status {statusType:"plan_created"}` | Block 3 **Plan checklist** confirmed (`data-state=ready`); objective sentence + steps. Never duplicated in the right rail (`rail-plan` is the same data behind the developer disclosure only) | `plan-stepper[data-state=ready]`, `plan-step` | U |
| `analyzing` (no `stepQuery`) | `statusMessage` "Analyzing the prompt…" | `status` | **No new line** | — | U |
| `analyzing` + `stepQuery` | `stepQuery`, `stepId` | `step` → `ondemand.step` `{phase:"start", stepId, index, label, query}`; for step ≥ 2 also `summary` `{phase:"start", optimistic:true}` | Block 4 **Working row** for the step with a short label (never `stepQuery` verbatim); marks the previous step's summary card as pending (block 5) | `working-row`, `plan-step[data-state=running]`, `step-summary` | U |
| `agents_retrieved` | `retrievedAgents[]` | `agents` → `ondemand.agents` `{phase:"retrieved", stepId, plugins}` | Block 4 — the Working row's chips become the confirmed call list; **no new row** | `working-row`, `working-chips` | U |
| `executing` | `executedAgents[]` | `agents` → `ondemand.agents` `{phase:"executing"}` | Block 4 — chips pulse, label reads "N calls running" | `working-row[data-state=running]` | U |
| `execution_completed` | `executedAgents[]` with `response` | `step` → `ondemand.step` `{phase:"done", stepId, message}` | Block 4 — the same row turns into a **done row** ("8 sources · 18.2 s"); favicons of returned pages appear | `working-row[data-state=done]` | U |
| `execution_failed` | `statusCode` (e.g. 429), `errorResponse.message` | `step` → `ondemand.step` `{phase:"failed", stepId, message}` | Block 4 — the row turns **red/failed** ("14 of 15 calls"); the failure is carried into block 7's single **Data gap** sentence. Never a green tick | `working-row[data-state=failed]`, `data-gap` | U |
| `execution_log_created` | `statusMessage` | `status` | **Not drawn** (developer disclosure only) | `dev-disclosure` | U |
| `summarize_history.initialized` | statusType only (P documents no further field) | `summary_start` → `ondemand.summary` `{phase:"start", index, stepId, optimistic:false}` | Block 5 **between-step summary card** opens: "Summarising step N" | `step-summary[data-state=running]` | P only |
| `summarize_history.completed` | statusType (+ text if present; adapter reads `summary\|answer\|statusMessage`, index from `stepIndex\|index`) | `summary_done` → `ondemand.summary` `{phase:"done", index, stepId, text, at}` | Block 5 summary card closes with its text | `step-summary[data-state=done]` | P only |
| `fulfilling` | `statusMessage` "Fulfilling the prompt…" | `status` → `ondemand.status` `{phase:"answering"}` | Live line "Writing the answer"; block 2 Thinking shows the *Answer* phase | `thinking-block` | U |
| `fulfillment_completed` | `currentStatusLog.answer` (complete answer) | `answer_complete` → `ondemand.answer_complete` `{chars}` | Block 7 — the streamed text is replaced by the full answer, caret removed; **not drawn as a row** | `answer-block` | P, U |

**Between-step summarisation — explicit statement.** P names exactly one pair, `summarize_history.initialized` / `summarize_history.completed`, as `message/statusLog` statusType values and documents no other summarisation frame. U lists the pair as "named in the SSE reference but absent from the recordings". T (812 + 259 raw frames, two sessions): `summarize_history.initialized:false`, `completed:false`, `anyBetweenStepSummarisationFrame:false` — **no raw between-step summarisation frame of any name differs from, or exists besides, the documented pair.** On this account the step boundary is only visible as `plugin_sources` (stepId N) followed by `step_thinking`/`step_output` (stepId N+1). The bridge therefore derives the block 5 card from that pair (`STEP_BOUNDARY` in eventMap.ts) and marks those frames `derived:true, source:"plugin_sources"`; the documented pair stays bound and wins when it arrives.

### 2c. `message` channel — other eventTypes

| eventType | Payload fields read | Bridge frame | UI block + position | data-testid | Src |
|---|---|---|---|---|---|
| `plugin_sources` | `stepId`, `stepTitle`, `sources.{agentId, pluginId, pluginName, operationId, items[{title,url,domain,imageUrl}]}` | `sources` → `ondemand.sources` `{messageId, pluginId, pluginName, partial, sources[]}`; also derived `summary {phase:"start", derived:true}` + `step {phase:"done", message:"N sources", derived:true}` | Closes the step's block 4 Working row ("N sources · t s"); feeds block 7 citation chips and block 8 collapsed sources strip | `working-row[data-state=done]`, `sources-list`, `source-link`, `source-favicon` | T only (not in P) |
| `fulfillment` | `answer` (chunk) — append in arrival order | AG-UI `TEXT_MESSAGE_CONTENT {messageId, delta}` (not CUSTOM). First chunk = first token (collapses Thinking, hides the stall band) | Block 7 **streamed answer** with inline citation chips; links in the markdown build the favicon strip | `answer-block`, `answer-markdown`, `citation-chip`, `citation-overflow` | P, U, T |
| `metricsLog` | `publicMetrics{inputTokens, outputTokens, totalTokens, ragTimeSec, fulfillmentTimeSec, totalTimeSec}` | `metrics` → `ondemand.metrics` `{publicMetrics, firstTokenMs, pluginIds}` | Block 10 **footer timings** (first event / first token / total / tokens) and `rail-metrics` | `answer-badge` (`data-first-event-ms`, `data-first-token-ms`, `data-total-ms`), `rail-metrics` | P, U, T |
| `clarification_request` | `clarificationRequest.queries[{query, options[]}]` | `clarification` → `ondemand.clarification` `{messageId, queries}` + `status {phase:"awaiting-input"}` | Block 6 **interactive card** (question form inline, stream stays open); answer is POSTed to `…/plan-clarification` | `clarification-form`, `prompt-done` | P |
| literal `[DONE]` | — | bridge ends the AG-UI run (`RUN_FINISHED`); any still-open derived summary/step frames are closed first | Live timer stops, Stop → Send, Thinking header becomes "Thought for N s", block 10 footer renders | `run-view[data-live=false]`, `answer-badge` | P, U, T |
| literal `[ERROR]:` + JSON | `message`, `errorCode` (parsed from the JSON after the prefix) | `error` → `ondemand.error` `{code, message, raw}` (also raised as `UpstreamError` 502 by the bridge) | Red error banner ends the run; block 7 shows one **Data gap** sentence; raw frame behind a toggle | `chat-error` (`data-error-code`), `chat-error-raw`, `data-gap` | P |

### 2d. `agent` channel — `ondemand_agent.*`

Envelope (P): `agent{id,name}` + subtype-specific `data`, `status:"processing"`. Common `data` shapes: `content` (text); `name`/`inputParams` (tool_call); `output`/`error` (tool_result); `language`/`title`/`delta`/`final` (code_generated); `pluginId`/`service`/`fields` (require_creds). `novnc_ended`, `graphs_ended` and the filler toggles omit `data`. `unknown` is reserved and not emitted. **None of these appeared in U or T; the bindings are P-only.**

| Subtype(s) | Payload fields read | Bridge frame | UI block + position | data-testid | Src |
|---|---|---|---|---|---|
| Lifecycle: `before_init`, `no_init`, `initiated`, `progress`, `completed`, `stopped`, `token_usage` | `agent{id,name}`, `data.content` | `agent` → `ondemand.agent` `{subtype, agent, data}` | Agent log inside the developer disclosure; `completed` does **not** end the run | `dev-disclosure` | P |
| `thinking` | `data.content` / `data.delta` | `thinking` → `ondemand.thinking` | Block 2 Thinking (agent phase) | `thinking-block` | P |
| `error` | `data.error` / `data.content` | `error` → `ondemand.error` | Block 7 Data gap sentence + failed state; not terminal by itself | `data-gap` | P |
| Execution: `tool_call`, `tool_result`, `tool_details`, `terminal`, `skills_used`, `todo`, `subagent_status` | `data.name`, `data.inputParams` (call); `data.output`, `data.error` (result) | `agent` → `ondemand.agent` | `tool_call` opens a block 4 Working row (label from `name`); `tool_result` closes it done/failed; `todo`/`terminal`/`skills_used` go to the agent log | `working-row`, `dev-disclosure` | P |
| Outputs: `code_generation_init`, `code_generated`, `preview_ready`, `sandbox_created` | `language`, `title`, `delta`, `final`; `url` | `agent` → `ondemand.agent` | Agent log; `preview_ready` url rendered as a link row in block 9 | `dev-disclosure`, `inline-artifacts` | P |
| **`file_written`**, **`artifact_ready`** | P gives no field list. Bridge reads first non-empty of `name\|fileName\|filename\|title\|basename(path)`, `url\|fileUrl\|downloadUrl\|signedUrl\|publicUrl\|artifactUrl`, `path\|filePath`, `mime\|mimeType\|contentType`, `size\|sizeBytes`, `content` | `agent` → `ondemand.agent` **and** `artifact` → `ondemand.artifact` `{phase:"creating"\|"ready"\|"failed", key, name, mime, artifact?, media?{status,id}, message?, origin}` | Block 9 **Artifacts card** — `file_written` adds a pending row immediately (O: "<2 s after the write", refresh-safe via `GET /artifacts`), `artifact_ready` upgrades the same row (match on path/name/id) to downloadable. **Rendered before `[DONE]`**, never on run end. No url and no content → `phase:"failed"` with a message, never a fake success | `artifact-pending[data-state=creating\|failed]`, `inline-artifacts`, artifact card | P, O |
| `awaiting_input` | `data.prompt\|content\|question\|message`, `data.options[]` | `awaitingInput` → `ondemand.awaiting_input` `{prompt, options, agent}` + `status {phase:"awaiting-input"}` | Block 6 interactive card (text / choice) inline; timer keeps running | `approval-card` / `clarification-form`, `prompt-done` | P |
| `require_creds` | `data.pluginId`, `data.service`, `data.fields[{key,label?,type?}]` | `requireCreds` → `ondemand.require_creds` `{pluginId, service, fields, agent}` + `status` | Block 6 **credential form** inline; POST to `…/tool-credentials` (`fields:[{key,value}]` or `cancelled:true`) | `creds-form`, `prompt-done` | P |
| `awaiting_browser_action` | `data.action`, `data.message\|content`, `data.novncUrl\|url` | `awaitingBrowserAction` → `ondemand.awaiting_browser_action` `{action, message, url, agent}` + `status` | Block 6 banner with the live-browser link | `approval-card` | P |
| `novnc_ready` / `novnc_ended`, `graphs_ready` / `graphs_ended` | `data.url` (ready); no `data` (ended) | `agent` → `ondemand.agent` | Link row in block 9 while ready; removed on ended | `inline-artifacts` | P |
| `filler_start` / `filler_end` | no `data` | `filler` → `ondemand.filler` `{on:true\|false}` (the bridge also emits a `derived:true` filler after 600 ms of silence, with `tick`) | Stall band directly under the Working rows ("+0.3 s" ticks) — keeps block 1 timer honest; nothing already painted moves | `working-band[data-on]`, `stall-tick` | P |

### 2e. `heartbeat` channel

| SSE event | Payload | Bridge frame | UI block | data-testid | Src |
|---|---|---|---|---|---|
| `heartbeat` | `sessionId`, `messageId`, `time` (no `eventType`, no `eventIndex`) | `heartbeat` → `ondemand.heartbeat` `{t, elapsedMs, sinceLastFrameMs}` | Nothing is drawn. It **keeps the block 1 live timer and the connection alive until `[DONE]`**, and resets the "stream stalled" detector | `run-view[data-live=true]` | P, U, T |

### 2f. Client-side frames that are NOT upstream SSE (listed so nobody looks for them in P)

`ondemand.session` (sessionId/endpoint/reasoningMode → block 1 header), `ondemand.request` (the upstream request body → developer disclosure `request-body`), `ondemand.attachments` (Media API uploads grounded in the turn → `attachment-live`), `ondemand.voice`, `media.created|extracted|failed` (`MEDIA_EVENT`), and the `derived:true` variants of `ondemand.summary` / `ondemand.step` / `ondemand.filler`.

---

## 3. Run-view block order per assistant turn (U pp. 10–21, O §6)

Top to bottom, one `RunView` (`data-testid=run-view`) per assistant turn. Later blocks only ever **append below**; nothing already painted moves.

| # | Block | Fed by | Rules | data-testid |
|---|---|---|---|---|
| 1 | **Run header** | `ondemand.session`, `plugin_suggestion.completed`, heartbeat | Model label (e.g. "DeepSeek Flash v4.1") · reasoning mode ("medium") · plugin logo chips · **live timer** ("Working for 25s") that runs in the browser and is kept alive by heartbeats until `[DONE]`/`[ERROR]` | `run-model` (`data-model-id`), `run-plugins`, `chat-footer[data-reasoning]` |
| 2 | **Thinking — pinned at the top** | all five `thinking/*` subtypes (+ `ondemand_agent.thinking`) | Exactly **one block per turn**, phase labels *Planning / Step n / Answer*, streams live, **collapses to a one-line summary ("Thought for N s") on the first answer token**, reopens with one chevron, **never moves**, **NO character cap** (the full reasoning text is retained and shown when expanded) | `thinking-block[data-state]`, `thinking-trace` |
| 3 | **Plan checklist** | `planning_output` (provisional) → `plan_created` (ready) | Objective sentence + steps; states pending/running/done/failed per step. Reserved shimmer while planning so nothing jumps | `plan-stepper[data-state]`, `plan-step[data-state]` |
| 4 | **Working rows** | `step_output` / `analyzing+stepQuery` / `agents_retrieved` / `executing` / `tool_call` → `execution_completed` / `execution_failed` / `plugin_sources` / `tool_result` | A row appears **only immediately before an action fires**, directly above where that action's result will land: favicon chips + label like "Searching the web"; it turns into a **done row** "8 sources · 18.2 s" or a red failed row. **Never an empty `{}` output box.** Stall band (filler) sits directly under the list | `working-list`, `working-row[data-state=queued\|running\|done\|failed]`, `working-chips`, `working-band` |
| 5 | **Between-step summary card** | `summarize_history.initialized/completed` (or derived from `plugin_sources` → next `step_*`) | "Summarising step N" → closes with the summary text | `step-summary[data-index][data-state]` |
| 6 | **Interactive cards** | `clarification_request`, `awaiting_input`, `require_creds`, `awaiting_browser_action` | Inline at the point of the pause; stream and timer keep running; replaced by a "done" line after submit | `clarification-form`, `creds-form`, `approval-card`, `prompt-done` |
| 7 | **Streamed answer** | `fulfillment` chunks → `fulfillment_completed` | Markdown with **inline citation chips (publisher-first, `+N` overflow)**; on any failed call **exactly one red "Data gap:" sentence** — never a fake green check | `answer-block`, `answer-markdown`, `citation-chip`, `citation-overflow`, `data-gap` |
| 8 | **Collapsed sources strip** | `plugin_sources` + links in the answer | Favicons + count, collapsed by default, expandable; mounts once the answer finished streaming (avoids CLS) | `sources-list[data-count]`, `sources-toggle`, `source-link`, `source-favicon` |
| 9 | **Artifacts card** | `file_written` → `artifact_ready` (and `preview_ready`, uploads) | Rendered **as soon as the frame arrives, before `[DONE]`** (O: within 2 s of the write, refresh-safe from `GET /artifacts`); pending → ready → failed states, download via `/api/artifacts/{id}` | `inline-artifacts`, `artifact-pending[data-state]` |
| 10 | **Footer timings** | `metricsLog` + bridge timestamps | first event / first token / total / tokens; appears only after the run ended | `answer-badge` (`data-first-event-ms`, `data-first-token-ms`, `data-total-ms`), `rail-metrics` |

Current-code deviations to reconcile (documentation only — no `.tsx` was changed in lane A):
- `RunView` passes `thinkingShown = r.thinking.slice(-4000)` to the Thinking block; the contract says **no character cap**. Follow-up: keep the throttle, drop the slice (render cost is bounded by collapsing, not by truncating).
- `RunView` currently renders `inline-artifacts` (block 9) *before* `CollapsedSources` (block 8) and an `OutputsCard` between blocks 5 and 6; the contract order above is the target.
- The run header (model · reasoning · plugin chips) lives in `run-rail.tsx` (`run-model`, `run-plugins`) and `chat-footer`; the plan in `rail-plan` sits behind the developer disclosure and must not be shown as a second plan.

---

## 4. Media / storage endpoints (L — copied from the live OpenAPI fragments, servers[0] = `https://api.on-demand.io`, security `apikey` header on every operation)

### 4.1 Create media — `POST /media/v1/public/file` (`doc-createmediaurl.json`, operation "Create Media URL")

Request `application/json` (`*` = required):

| Field | Type | Notes (from the fragment) |
|---|---|---|
| `url`* | string (uri) | "url which contains the media data" — OnDemand fetches the bytes from this URL; there is no multipart upload |
| `plugins`* | string[] | plugin ids required for processing (e.g. `plugin-1713954536`); the repo's `/api/media` passes the file-type plugin id (`plugins:[]` → upstream 500) |
| `responseMode`* | `"sync"` \| `"webhook"` | |
| `name` | string | |
| `sizeBytes` | integer | |
| `sessionId` | string | chat session the file belongs to |
| `externalUserId` | string | |
| `createdBy`, `updatedBy` | string | |
| `pluginInputs` | object[] | per-plugin inputs, e.g. `{ "<knowledge-ingest pluginId>": { postProcess: { chatPluginId } } }` |

Response `200` `{ message: "Media Created", data: {…} }` — `data` fields: `id`, `companyId`, `sessionId`, `externalUserId`, **`url`** (uri — the servable/signed location), **`sourceUrl`** (uri — "original url of source which contains the media data"), `extractedTextUrl` (uri), `name`, `sizeBytes`, `source` (e.g. `document`), `mimeType`, `extension`, `plugins[]`, `context`, `extractedText` (nullable), `actionStatus` (e.g. `completed`), `failedReason` (nullable), `isDeleted`, `responseMode`, `createdBy`, `updatedBy`, `pluginInputs[]`, `transcriptionHours`, `createdAt`, `updatedAt`. Only `200` is documented for this operation.

### 4.2 Fetch media — `GET /media/v1/public/file` (`doc-fetchmedia.json`, "Fetch Media")

Query parameters (all optional):

| Param | Type | Notes |
|---|---|---|
| `sort` | string, default `-createdAt` | `createdAt` or `updatedAt`, `-` prefix = descending |
| `page` | integer, default 1 | |
| `limit` | integer, default **1** | set explicitly — the default returns a single item |
| `plugins` | string | filter by pluginId |
| `externalUserId` | string | filter by external user |
| `source` | enum `document\|audio\|video\|youtube\|image` | |

Response `200` `{ message, data: [...], pagination: { page, limit } }` — `data[]` fields: `id`, `companyId`, `sessionId`, **`url`**, **`sourceUrl`**, `name`, `source`, `mimeType`, `extension`, `plugins[]`, `actionStatus` (e.g. `processing`), `isDeleted`, `responseMode`, `transcriptionHours`, `externalUserId`, `createdBy`, `updatedBy`. (No `extractedTextUrl`, `sizeBytes`, `createdAt`/`updatedAt` in the list item schema.)

**There is no documented GET-by-id.** The live Media API fragments expose exactly three operations (create, fetch-list, delete). "Fetch by id" therefore = **list + filter by `id` client-side**, narrowing the page with the available filters (`externalUserId`, `plugins`, `source`) and a sufficient `limit`; paginate (`page`) until the id is found or the list is exhausted.

### 4.3 Delete media — `DELETE /media/v1/public/file/{fileId}` (`doc-deletemedia.json`, "Delete Media")

Path param `fileId`* (string). Response `200` `{ message: "Media Deleted!" }`.

---

## 5. Persistence rule — artifacts ↔ OnDemand media

Backend table `artifacts` (`src/db/schema.ts`, `/artifacts` routes in `src/app.ts`) already holds `media_id`, `media_status`, `media_message`, `session_id`, `origin_event` and the inline `bytes` BLOB (≤ 25 MB). The rule:

1. **Store `mediaId` (= create-media `data.id`) and the UNSIGNED `sourceUrl`.** Before persisting, strip any SAS/signature query string (`?se=…&sig=…`, `sv=`, `sp=`, `sr=`, `st=`, `spr=`, `X-Amz-*`, `token=`, `expires=`): persist `origin + pathname` only.
2. **Never persist the signed `url`** (nor any signed `extractedTextUrl`) — it expires, and a stored copy is both a dead link and a leaked credential. The same rule already applies to plugin logo URLs (`plugin-catalogue.ts`: "SAS-signed CDN URL … never persisted").
3. **Re-sign on open/download:** call fetch media (§4.2, filter by `externalUserId`/`plugins`, locate the row whose `id === mediaId`) and read the **fresh `url`** from that response; stream it to the browser. Never hand the browser a URL older than the request that is serving it.

Sequence:

```
browser ──upload──▶ /api/media (park bytes on our origin, public tokenised URL)
        ──POST /media/v1/public/file {url, plugins, responseMode:"sync", sessionId, externalUserId, name, sizeBytes}──▶ OnDemand
        ◀── 200 {data:{id, url(signed), sourceUrl, mimeType, …}}
        ──POST /artifacts {name, kind, mime, sizeBytes, bytes, mediaId:id, mediaStatus, sessionId, originEvent, sourceUrl:UNSIGNED}──▶ backend
        (stream CE ondemand.artifact {phase:"ready"} → block 9 card, before [DONE])

open / download:
browser ──GET /api/artifacts/{id}──▶ web
        ──GET /media/v1/public/file?externalUserId=…&plugins=…&limit=N──▶ OnDemand  (find data[].id === mediaId)
        ◀── fresh signed data[].url
        ──stream bytes from the signed url──▶ browser   (Content-Disposition from the stored name/mime)
```

Failure behaviour: if the media fetch fails (network, 4xx/5xx, id not found, `isDeleted:true`, or the signed URL does not answer 2xx), **serve the backend BLOB copy** (`/artifacts/{id}/content`) and show a **"stored locally" badge** on the artifact (`attachment-local-badge` precedent) with the upstream message in `media_message`. A failed media call is never presented as a successful OnDemand fetch, and a file that could not be stored anywhere is a red `artifact-pending[data-state=failed]` row with a message — **never a fake success**.

---

## 6. What the client must never do

- **No character cap on Thinking.** Throttle the paint, collapse the block, but keep and show the whole reasoning text; never truncate `thinking.delta`/`output.delta` accumulation.
- **No empty `{}` output boxes** — a Working row exists only once an action is known (label + chips); a step whose output JSON is still streaming shows a shimmer, not an empty object.
- **No fake green checks on failures** — `execution_failed`, `ondemand_agent.error`, `tool_result.error`, a failed artifact save, or an `[ERROR]:` marker always render red/failed plus exactly one "Data gap:" sentence in the answer.
- **No duplicate plan in the right rail** — the plan checklist is block 3 in the turn; `rail-plan` stays behind the developer disclosure.
- No second Thinking card per turn (fulfillment_thinking joins the pinned block as the *Answer* phase); no status rows for `initializing`, `analyzing` without `stepQuery`, `execution_log_created`, `fulfillment_completed`.
- No treating heartbeat as content, agent `completed` as run end, a disconnect as success, or `eventIndex` gaps as loss.
- No `JSON.parse` before the `[DONE]` / `[ERROR]:` literal check; no dropping unknown names (they go to `ondemand.unknown`).
- No persisting signed media URLs; no serving a stale signed URL; no "fetched from OnDemand" claim when the bytes came from the local blob.
- No artifacts collected at run end — every `file_written` / `artifact_ready` is rendered the moment it arrives.
