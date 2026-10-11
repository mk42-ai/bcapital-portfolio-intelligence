# Event → UI contract (OnDemand submit-query v1 SSE → RunView blocks)

Generated 2026-10-11 from: `docs/reference/ondemand/submit-query-v1-sse-reference.pdf` (1 page, PyMuPDF text layer), `docs/reference/ondemand/OnDemand-Platform-Architecture.pdf` (knowledge & media / object-storage sections), `docs/reference/ondemand/OnDemand-Outputs-Panel-Spec.pdf` (outputs panel §6–§9), `docs/reference/ondemand/OnDemand-Run-UX-Before-After.html` (tags stripped; "Proposed draws" + prompt addenda), `docs/ONDEMAND_SSE_FRAMES.md`, `docs/ONDEMAND_CONTRACTS.md` (live OpenAPI, fetched 2026-10-10/11), `web/src/lib/ondemand/eventMap.ts`, `web/src/components/chat/open-intelligent-ui/chat-shell.tsx` (RunView block-order comment, lines ~418–432), `src/app.ts` / `src/openapi.ts` (backend `/artifacts` routes), `web/src/app/api/**` (web proxies).

Source legend used below: **P** = SSE reference PDF · **U** = Run-UX Before/After HTML · **T** = repo traces quoted in `eventMap.ts` / `ONDEMAND_SSE_FRAMES.md` · **C** = `ONDEMAND_CONTRACTS.md` / `ONDEMAND_SSE_FRAMES.md` endpoint tables. Where a source does not say, this doc writes "not specified in the reference".

---

## 1. Per-turn block order (top → bottom, identical live and settled)

One RunView per assistant turn. The order is fixed so the live→final swap moves nothing (chat-shell.tsx comment, UX doc rollout step 1: "one reducer for the stream, the new run view, the Outputs card, the Agent panel").

| # | Block | Behaviour |
|---|---|---|
| 1 | **Run header** | model · reasoning mode · plugin chips (`suggestedPlugins[].logoUrl`, logos only, name on hover — U) · live timer. When the first answer token lands the steps fold into the header, which keeps time and tokens (U: "One live line, then it folds away"). |
| 2 | **Thinking** (pinned at top) | ONE block per turn with phase labels **Planning / Step n / Answer** (`planning_thinking` / `step_thinking` + `stepId` / `fulfillment_thinking`). Streams live; collapses to a single line on the first `fulfillment` token; **no character cap**. U: "Thinking is one word… the text is one click away"; memory status lines go to the Agent panel, not the feed. |
| 3 | **Plan checklist** | Rendered once from `planning_output` (`output.delta`, plan JSON: `title`/`objective`, steps `user_query`) and confirmed by `plan_created.queryPlan` when present. Objective = opening sentence; each step shows a short label, never the instruction text or `stepQuery` verbatim (U). |
| 4 | **Working row** | Immediately **before** the action it precedes: favicon chips + action label (e.g. "Searching the web", `LABEL.searching(plugin)`) → done row "8 sources · 18.2 s" (`LABEL.searched(plugin, n)`). Drawn while `step_output` is still streaming the call JSON (U: "Calls appear while the model is still writing them, pulse while they run and tick when they return"). **Never an empty `{}` box.** A failed call stays visible ("14 of 15 calls", `LABEL.failed(plugin)`). |
| 5 | **Between-step summary card** | `summarize_history.initialized` → `LABEL.summarising(n)` checkpoint; `summarize_history.completed` closes it. On this account it is **derived** from the `plugin_sources` → next `step_thinking`/`step_output` boundary (`STEP_BOUNDARY`, frames marked `derived:true`). |
| 6 | **Interactive cards** (inline) | `awaiting_input` (input/choice card), `require_creds` (credential form), `awaiting_browser_action` (banner with live-browser link), `clarification_request` (question card). Stream stays open while the user responds (P). |
| 7 | **Streamed answer** | `fulfillment.answer` chunks appended in arrival order, with publisher-first inline citation chips (+N overflow) built from the markdown links; exactly **one red "Data gap" sentence** when a call failed (U answer addendum; detected via `PLUGIN_ERROR_PATTERNS` or `execution_failed`). |
| 8 | **Sources strip** | Numbered, **collapsed** list under the answer with a count — union of `plugin_sources.sources.items[]` and links cited in the answer (U: "4 chips and '+6' in the feed, all 10 in Sources"). |
| 9 | **Artifacts card** | Inline media (image grid + lightbox, video) and artifact cards from `file_written` / `artifact_ready` / `preview_ready` / report PDF; mirrored in the right-rail Outputs card (Outputs-panel spec: status pill `writing | ready | final | partial`, 500 ms per-artifact debounce, atomic write before `ready`). |
| 10 | **Footer** | first event / first token / total / tokens (`metricsLog.publicMetrics`: `inputTokens`, `outputTokens`, `totalTokens`, `ragTimeSec`, `fulfillmentTimeSec`, `totalTimeSec`). **Heartbeat keeps the timer alive until `[DONE]`**; a disconnect alone is not completion (P). |

> chat-shell.tsx numbers the same blocks slightly differently (Outputs card = 5, Data-gap sentence = 10); the visual top-to-bottom order above is the one implemented and is the contract.

---

## 2. Event → UI block map

Wire format (P): each frame = `event: <channel>` + `data: <payload>` + blank line. Channels: `message`, `thinking`, `agent`, `heartbeat` (`SSE_EVENT`). JSON `eventType` selects the subtype; structured frames carry `sessionId`, `messageId`, `eventIndex` (gaps allowed), `status` (usually `processing`). Heartbeats and terminal markers have no index. Check the literal `[DONE]` / `[ERROR]:` strings **before** `JSON.parse` (`TERMINAL`). Listen to all four names and tolerate unknown subtypes (`UPSTREAM_UNKNOWN_POLICY` = fallthrough → `CE.unknown` → dev disclosure).

| SSE channel (`event:`) | eventType / statusType / agent subtype | Payload fields read | UI block # | UI behaviour | `eventMap.ts` binding |
|---|---|---|---|---|---|
| thinking | `planning_thinking` | `thinking.delta` | 2 | Thinking block, phase label **Planning**; streams live | `EVENT_TYPE.planning_thinking = "thinking"`, `THINKING_CHANNEL` `{field:"thinking", channel:"planning"}` |
| thinking | `step_thinking` (upstream `plugin_thinking` maps here — P) | `thinking.delta`, `stepId` (T) | 2 (+ opens 5 when `stepId` increments) | Thinking block, phase label **Step n**; first frame of step N+1 closes the derived summary checkpoint | `EVENT_TYPE.step_thinking`, `THINKING_CHANNEL.step`, `STEP_BOUNDARY.startOfNextStep` |
| thinking | `fulfillment_thinking` | `thinking.delta` | 2 | Thinking block, phase label **Answer** ("Writing the answer" live line — U) | `EVENT_TYPE.fulfillment_thinking`, `THINKING_CHANNEL.fulfillment` |
| thinking | `planning_output` (mapped from `planning_answer` — P) | `output.delta` (plan JSON as text: `title`/`objective`, steps with `user_query`) | 3 | Parse progressively; objective → opening sentence; steps → checklist + Agent panel | `EVENT_TYPE.planning_output = "thinking"`, `THINKING_CHANNEL.plan` (`field:"output"`) |
| thinking | `step_output` (mapped from `plugin_answer` — P) | `output.delta`, `stepId` (plugin-calls JSON: `pluginId`, `name`, `api_request_parameters`) | 4, 9 | One logo chip per call as it closes (Working row); long params title the Outputs card draft; `CE.stepOutput {stepId,title,plugins[],raw}` | `EVENT_TYPE.step_output`, `THINKING_CHANNEL.step_output`, `STEP_BOUNDARY.startOfNextStep` |
| message | `statusLog` → `plan` / `planning` | `currentStatusLog.{statusType,statusMessage,time}` | 1 | Generic status line ("Thinking"). `planning` is a **bridge-side CUSTOM** status, not an upstream statusType (T) | not in `STATUS_TYPE` → falls to `EVENT_TYPE.statusLog = "status"` |
| message | `statusLog` → `plan_created` | `+ queryPlan` (`STATUS_FIELDS.plan = ["queryPlan","plan"]`) | 3 | Confirms the objective sentence, lists the steps (U) | `STATUS_TYPE.plan_created = "plan"` |
| message | `statusLog` → `analyzing` | `statusMessage` "Analyzing the prompt…"; `+ stepQuery` at each step start (`STATUS_FIELDS.stepQuery`, `stepId = ["stepId","step_id"]`) | 4 | With `stepQuery`: new short step label (never printed verbatim). Without: no line | `STATUS_TYPE.analyzing = "step_start"` |
| message | `statusLog` → `agents_retrieved` (plugin retrieved) | `+ retrievedAgents[]` (`STATUS_FIELDS.retrievedAgents`) | 4 | Chips become the confirmed call list | `STATUS_TYPE.agents_retrieved = "agents_retrieved"` |
| message | `statusLog` → `executing` | `+ executedAgents[]` (`STATUS_FIELDS.executedAgents`) | 4 | Chips pulse, "N calls running" | `STATUS_TYPE.executing = "executing"` |
| message | `statusLog` → `execution_completed` | `+ executedAgents[]` with `response` | 4, 8 | Chips tick → done row; favicons from `executedAgents[].response` (U) | `STATUS_TYPE.execution_completed = "execution_done"` |
| message | `statusLog` → `execution_failed` | `+ statusCode` (e.g. 429), `errorResponse.message` (U) | 4, 7 | "14 of 15 calls" stays visible; error detail in Agent panel; feeds the single "Data gap" sentence | `STATUS_TYPE.execution_failed = "execution_done"` |
| message | `statusLog` → `fulfilling` | `statusMessage` "Fulfilling the prompt…" | 1 | Live line "Writing the answer" | `STATUS_TYPE.fulfilling = "status"` |
| message | `statusLog` → `fulfillment_completed` | `currentStatusLog.answer` (complete answer — P; `STATUS_FIELDS.answer`) | 7 | Replace streamed text with the full answer | `STATUS_TYPE.fulfillment_completed = "answer_complete"` |
| message | `statusLog` → `summarize_history.initialized` | `statusType` only (P lists the name; payload beyond `statusType,statusMessage,time` not specified in the reference) | 5 | Open "Summarising step n" checkpoint | `STATUS_TYPE["summarize_history.initialized"] = "summary_start"` |
| message | `statusLog` → `summarize_history.completed` | `statusType`; summary text read from `STATUS_FIELDS.summaryText = ["summary","answer","statusMessage"]`, index from `summaryIndex = ["stepIndex","index"]` (defensive; not specified in the reference) | 5 | Close the checkpoint, show the card | `STATUS_TYPE["summarize_history.completed"] = "summary_done"` |
| message | `statusLog` → `plugin_suggestion.initialized` / `.completed`, `initializing`, `execution_log_created` | `suggestedPlugins[{name,logoUrl}]` (`STATUS_FIELDS.suggestedPlugins`) | 1 | "Finding plugins" → logo row; `initializing`/`execution_log_created` not drawn | `STATUS_TYPE` → `plugins_suggested` / `status` |
| message | `plugin_sources` (**T only, not in P**) | `stepId`, `stepTitle`, `sources.{agentId,pluginId,pluginName,operationId,items[{title,url,domain,imageUrl}]}` | 4 (done row), 8, 5 | Favicon chips + Sources list; **last frame of a step** → derived summarising checkpoint | `EVENT_TYPE.plugin_sources = "sources"`, `STEP_BOUNDARY.endOfStep = "plugin_sources"` |
| message | `fulfillment` | `answer` (chunk) | 7 (collapses 2, folds 1) | Append in arrival order; first token collapses Thinking and folds steps into the header | `EVENT_TYPE.fulfillment = "answer"` |
| message | `metricsLog` | `publicMetrics{inputTokens,outputTokens,totalTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}` | 10 | Footer time + tokens | `EVENT_TYPE.metricsLog = "metrics"` |
| message | `clarification_request` | `clarificationRequest.queries[{query,options}]` | 6 | Question card; keep stream open; reply `POST {userResponse:[{question,answer}]}` → `/v1/client/sessions/{sessionId}/messages/{messageId}/plan-clarification` (P) | `EVENT_TYPE.clarification_request = "clarification"` |
| agent | `ondemand_agent.awaiting_input` | envelope `agent{id,name}`, `data` (exact keys not specified in the reference; adapter reads `prompt\|content\|question\|message`, `options`) | 6 | Input / choice card | `AGENT_SUBTYPE.awaiting_input = "awaiting_input"` |
| agent | `ondemand_agent.require_creds` | `data{pluginId, service, fields[]}` (P) | 6 | Credential form; reply `pluginId` + `fields:[{key,value}]` (or `cancelled:true`) → client `.../messages/{messageId}/tool-credentials` (P) | `AGENT_SUBTYPE.require_creds = "require_creds"` |
| agent | `ondemand_agent.awaiting_browser_action` | `data` (not specified in the reference; adapter reads `action`, `message\|content`, `novncUrl\|url`) | 6 | Banner with live-browser link | `AGENT_SUBTYPE.awaiting_browser_action = "awaiting_browser_action"` |
| agent | `ondemand_agent.file_written` | `data` — **no field list in P**; bridge reads `name\|fileName\|filename`, `url\|fileUrl\|downloadUrl\|signedUrl`, `path\|filePath`, `mime\|mimeType\|contentType`, `size\|sizeBytes` | 9 | Outputs row "writing/pending"; persisted via backend `/artifacts` + Media API, then `CE.artifact {phase:"creating"}` | generic `agent` (comment in `AGENT_SUBTYPE`) |
| agent | `ondemand_agent.artifact_ready` | same defensive `data` keys as above | 9 | Upgrade the same row (match on path/name/id) to downloadable; `CE.artifact {phase:"ready"}` | generic `agent` |
| agent | `ondemand_agent.preview_ready` | `data` — not specified in the reference (bridge reads the same `url` keys) | 9 | Preview link on the artifact card | generic `agent` |
| agent | `ondemand_agent.filler_start` / `filler_end` | no `data` (P) | 1 | Show / hide filler indicator on the live line | `AGENT_SUBTYPE.filler_start/filler_end = "filler"` |
| agent | `ondemand_agent.thinking` / `.error` | `content` (P common shape) | 2 / 7 | Agent reasoning into Thinking; error → error banner | `AGENT_SUBTYPE.thinking = "thinking"`, `.error = "error"` |
| agent | other `ondemand_agent.*` (before_init, no_init, initiated, progress, completed, stopped, token_usage, tool_call, tool_result, tool_details, terminal, skills_used, todo, subagent_status, code_generation_init, code_generated, sandbox_created, novnc_ready, novnc_ended, graphs_ready, graphs_ended) | `content`; `name`/`inputParams` (tool_call); `output`/`error` (tool_result); `language`/`title`/`delta`/`final` (code_generated); `novnc_ended`, `graphs_ended` omit `data` (P) | Agent rail | Rail log only; agent `completed` ≠ query end (P) | generic `agent` → `CE.agent` |
| heartbeat | (none — no `eventType`) | `sessionId`, `messageId`, `time`; every 3 s (P) | 1, 10 | Nothing drawn; keeps the live timer alive until `[DONE]`; never treated as answer content | `SSE_EVENT.heartbeat` → `CE.heartbeat` |
| message | literal `[DONE]` | — | 1, 10 | Successful end: stop → send, settle the run | `TERMINAL.done` → kind `done` |
| message | literal `[ERROR]:` + JSON | P: "followed by JSON" (keys not specified; adapter parses `message`, `errorCode`) | 7 | Failure / cancellation: error banner, end the run | `TERMINAL.errorPrefix` → kind `error` |
| message | `error` eventType | not specified in the reference | 7 | Error banner | `EVENT_TYPE.error = "error"` |

Client-side CUSTOM frame names the shell binds to are `CLIENT_EVENT` (`ondemand.status`, `.plan`, `.step`, `.summary`, `.thinking`, `.sources`, `.metrics`, `.clarification`, `.require_creds`, `.awaiting_input`, `.awaiting_browser_action`, `.filler`, `.agent`, `.heartbeat`, `.answer_complete`, `.unknown`, `.attachments`, `.artifact`, `.step_output`, …). `MEDIA_EVENT` (`media.created|extracted|failed`) is raised by the upload relay, **not** by upstream SSE.

---

## 3. Prompt addenda (from the Before/After doc)

Text-only additions; no schema, key or event changes (U: "Three prompt addenda for the wording").

**Planner** (writes `planning_output`, forwarded as `plan_created.queryPlan`)
- `objective` = **one first-person sentence starting "I'll"**, **max 22 words**, no plugin names, no operation IDs, no JSON. Example: `"I'll pull the latest news, prices and indicators for AAPL, TSLA and AMZN, then email you the report."`
- Each `user_query` starts with a short action-style **`[label]`**, then the instruction unchanged. Example: `"[Gathering news, prices and indicators] Fetch the latest stock news (earnings reports, …"`. The label is what block 4 shows; the instruction is never printed.

**Step executor** (writes `step_output`, the plugin-calls JSON)
- **Fixed key order per call** so a chip can be drawn before the parameters finish.
- **Short parameters first** (`to`, `subject`, `symbol`), long text last, so the Outputs card can title a draft at once.
- **Never copy the `[label]` into a parameter.**

**Answer** (writes `fulfillment`)
- **Cite each external fact with a markdown link** to the exact page the plugin returned — Sources and favicons are built from these links.
- **Start with the result**; the steps are already on screen.
- **One "Data gap" sentence when a call failed**, e.g. `**Data gap:** The Amazon news request failed because the data provider's rate limit was exceeded …`.

---

## 4. Media / storage endpoints (pinned)

Base host `https://api.on-demand.io`, header `apikey` (server-side only — the key never reaches the browser). Architecture PDF: uploads go to object storage through short-lived signed URLs; object storage holds "uploaded media, generated files and reports" with "signed, time-limited access; versioning, soft delete". Outputs-panel spec: drafts served through signed URLs with the run's read permission, **TTL 10 min**, no public links.

### OnDemand Media API (C — live OpenAPI)

| Op | Method + path | Request | Response (`data`) |
|---|---|---|---|
| **Create** (`createmediaurl`) | `POST /media/v1/public/file` (`application/json` in the OpenAPI; the app's relay posts multipart to its own `/api/media` and forwards JSON) | required `url`, `plugins[]`, `responseMode` (`sync` \| `webhook`); optional `name`, `sizeBytes`, `sessionId`, `externalUserId`, `createdBy`, `updatedBy`, `pluginInputs[]`. App sends `plugins:[<file-type plugin id>]` (document `plugin-1713954536`, image `plugin-1713958591`, audio `plugin-1713958830`), `responseMode:"sync"` | `id`, `companyId`, `sessionId`, `externalUserId`, `url`, `sourceUrl`, `extractedTextUrl`, `name`, `sizeBytes`, `source`, `mimeType`, `extension`, `plugins`, `context`, `extractedText`, `actionStatus`, `failedReason`, `isDeleted`, `responseMode` |
| **Fetch** (`fetchmedia`) | `GET /media/v1/public/file` — the fetched OpenAPI documents this as a **list** (query `sort`, `page`, `limit`, `plugins`, `externalUserId`, `source`). A by-id form `GET /media/v1/public/file/{mediaId}` is what the app's re-sign path targets; it is **not in the fetched OpenAPI** — field name per docs: the object shape is the list item shape | `id`, `companyId`, `sessionId`, `url`, `sourceUrl`, `name`, `source`, `mimeType`, `extension`, `plugins`, `actionStatus`, `isDeleted`, `responseMode`, `transcriptionHours`, `externalUserId`, `createdBy`, `updatedBy` (+ `pagination{page,limit}`) |
| **Delete** (`deletemedia`) | `DELETE /media/v1/public/file/{fileId}` (path param documented as `fileId` = the `mediaId`) | — | `message` |

Signed vs unsigned: the OpenAPI returns **both `url` and `sourceUrl`** and does not label either as signed. The live probes (`web/proof/upload/media-create.json`) are recorded with "SAS query strings redacted", i.e. the returned `url` carried a time-limited SAS signature. Working rule — **field name per docs: `url` = signed (expiring), `sourceUrl` = unsigned**. Signed URLs captured for this account expire **14 Oct 2026** and **17 Oct 2026**, so anything persisted from them is dead within the week.

**Persistence rule**
1. Persist **`mediaId` (`data.id`) + the UNSIGNED `sourceUrl`** per file — never the signed `url`.
2. **Re-sign on open**: call fetch-by-id with the stored `mediaId` and hand the user the fresh signed `url` from that response.
3. If `media_id` is null (`media_status` `local`/`failed`), fall back to the app's own bytes (`/content`).

### App routes

| Layer | Route | Purpose |
|---|---|---|
| backend (`src/app.ts`) | `POST /artifacts` | Create artifact (`kind`, `source`, `media_id`, `media_status` `stored|local|failed`, `media_message`, `thread_id`, `session_id`, `origin_event`) |
| backend | `GET /artifacts` | List (paginated, soft-deleted rows excluded) |
| backend | `GET /artifacts/{id}` | Metadata |
| backend | `GET /artifacts/{id}/content` | Raw bytes, `content-type = mime`; `?download=1` ⇒ attachment |
| backend | `DELETE /artifacts/{id}` | Soft delete (`deletedAt`) |
| web proxy | `/api/artifacts`, `/api/artifacts/{id}`, `/api/artifacts/{id}/content` | Pass-through to the backend routes above |
| web proxy | `POST /api/media` (multipart `file`, `sessionId?`, `externalUserId?`), `GET /api/media/blob/{token}/{name}`, `DELETE /api/media?id=` | Upload relay → Media API create; 2 h blob URL; delete (`local-…` ids are a no-op) |
| web proxy (implemented 2026-10-11, commit aea689a) | `GET /api/artifacts/{id}/open` → backend `GET /artifacts/{id}/open` | **Re-sign on open**: when the artifact has `media_id`, look the object up in the Media API (fetch-by-id answered 404 for this account, so the documented list endpoint is scanned) and return `{url, signed, resign, sourceUrl, contentUrl}` — a fresh SAS-signed `url` when the API hands one back, else the same-origin `/content` copy. The row persists `media_url` = UNSIGNED `sourceUrl` only. Verified live: `signed:true, resign:"ok"` for media `6acb35b3cf3ee6ce347391b1`. |

---

## 5. Observed vs documented

- **No `statusLog` frames on this account.** `eventMap.ts` records two traces (session `6ac9eaad…`, 812 frames over two turns; session `6aca0a89…`, 259 frames / 28.4 s, endpoint `predefined-deepseek-flash`, reasoningMode medium): **zero** `message/statusLog` frames — no `summarize_history.initialized/completed`, no `plan_created`, `analyzing`, `agents_retrieved`, `executing`, `execution_completed`, `fulfilling` or `fulfillment_completed`. Observed names were only `planning_thinking`, `planning_output`, `step_thinking`, `step_output`, `fulfillment_thinking`, `fulfillment`, `metricsLog`, `plugin_sources` (first trace only), `heartbeat`, `[DONE]`.
- **Summaries are derived.** The step boundary is visible only as the last frame of step N (`plugin_sources`, `stepId` N, `stepTitle`) followed by the first frame of step N+1 (`step_thinking` / `step_output`, `stepId` N+1), gap ≈ 1.25 s. The bridge builds the "Summarising step N" card from that pair (`STEP_BOUNDARY = {endOfStep:"plugin_sources", startOfNextStep:["step_thinking","step_output"], summaryTextFrom:"stepTitle+sources"}`), marks it `derived:true`, and keeps the documented `summarize_history.*` binding so a real frame takes over the moment it ships.
- **Plugin failures arrive only inside thinking/answer deltas.** OnDemand never emitted an error frame or `execution_failed` for them; the bridge matches `PLUGIN_ERROR_PATTERNS` (`not enough credits`, `"error": "internal server error"`, `tool returned an error`, `insufficient credits`, `rate limit exceeded`, case-insensitive) in `thinking.delta` / `answer` text to flip the Working row to `LABEL.failed(plugin)` and emit the single "Data gap" sentence.
- **`plugin_sources` is not in the SSE reference PDF** but is observed and bound; `summarize_history.*` is in the PDF but never observed. `file_written`, `artifact_ready`, `preview_ready`, `require_creds`, `awaiting_*`, `clarification_request`, `[ERROR]:` are documented only — no trace in the repo contains them, so their `data` keys stay defensive until a live agent run is captured.
- Bridge-side `statusType` values `planning`, `summarising`, `plan_created` seen in `frames-*.jsonl` are the app's own CUSTOM frames, not upstream frames.
