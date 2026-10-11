# OnDemand API endpoints & submit-query v1 SSE frames

## (a) Fetch timestamp and method
- **Fetched (UTC):** 2026-10-11T00:42:58Z (live, not from memory).
- **Method:** Python `requests`; base = `$ON_DEMAND_BASE_URL` (resolved to `https://gateway.on-demand.io`, trailing slash stripped), header `apikey: <ON_DEMAND_API_KEY>` (not reproduced). `GET /config/v1/public/docs/categories`, then `GET /config/v1/public/docs/reference/api/<slug>` for every slug of Media API, Chat API, Services API, Agents Flow Builder API (all returned HTTP 200, OpenAPI 3 in `data`; `$ref`s resolved against `components.schemas`). Host for every operation = `data.servers[0].url` = `https://api.on-demand.io`.
- **SSE sources:** `.media/submit-query-v1-sse-reference.pdf` (1 page, PyMuPDF text layer), `.media/OnDemand-Run-UX-Before-After.pdf` (26 pages), `.media/OnDemand-Run-UX-Before-After.html` (tags stripped), repo `web/src/lib/ondemand/eventMap.ts`, `sse-adapter.ts`, `web/proof/team-a/sse-event-families.json` (+ `sse-trace.meta.txt`; **`sse-trace.raw.log` is NOT present in the repo**), `web/artifacts/summarisation-event-observed.json`.
- Other categories exist but were out of scope: MQTT User Management API (2 slugs), Projects Management API (6 slugs).

## (b) Endpoints (live OpenAPI)
All require header `apikey`. Submit Query with `responseMode:"stream"` returns `text/event-stream` (section c).

### Media (Media API)

| Method | URL | Path/query params | Body (`*` = required) | Success response | Slug |
|---|---|---|---|---|---|
| GET | `https://api.on-demand.io/media/v1/public/file` | sort(query), page(query), limit(query), plugins(query), externalUserId(query), source(query) | — | 200[application/json] message:string, data:array{[id:string, companyId:string, sessionId:string, url:string, sourceUrl:string, name:string, source:string, mimeType:string, extension:string, plugins:array, actionStatus:string, isDeleted:boolean, responseMode:string, transcriptionHours:number, externalUserId:string, createdBy:string, updatedBy:string]}, pagination:object{page:integer, limit:integer} | `fetchmedia` |
| POST | `https://api.on-demand.io/media/v1/public/file` | — | [application/json] createdBy:string, updatedBy:string, sessionId:string, externalUserId:string, url*:string, name:string, plugins*:array{[]}, sizeBytes:integer, responseMode*:string, pluginInputs:array{[]} | 200[application/json] message:string, data:object{id:string, companyId:string, sessionId:string, externalUserId:string, url:string, sourceUrl:string, extractedTextUrl:string, name:string, sizeBytes:integer, source:string, mimeType:string, extension:string, plugins:array, context:string, extractedText:string, actionStatus:string, failedReason:string, isDeleted:boolean, responseMode:string, createdB | `createmediaurl` |
| DELETE | `https://api.on-demand.io/media/v1/public/file/{fileId}` | fileId(path,req) | — | 200[application/json] message:string | `deletemedia` |

### Chat & Agent Tools (Chat API)

| Method | URL | Path/query params | Body (`*` = required) | Success response | Slug |
|---|---|---|---|---|---|
| POST | `https://api.on-demand.io/chat/v1/sessions` | — | [application/json] externalUserId*:string, pluginIds:array{[]} | 200[application/json] message:string, data:ref{id:string, companyId:string, externalUserId:string, pluginIds:array, title:string, createdBy:string, createdAt:string, updatedAt:string} | `createchatsession` |
| GET | `https://api.on-demand.io/chat/v1/sessions` | externalUserId(query), sort(query), cursor(query), limit(query) | — | 200[application/json] message:string, data:array{[id:string, companyId:string, externalUserId:string, pluginIds:array, title:string, createdBy:string, createdAt:string, updatedAt:string]}, pagination:ref{next:string, limit:integer} | `getchatsessions` |
| GET | `https://api.on-demand.io/chat/v1/sessions/{sessionId}` | sessionId(path,req) | — | 200[application/json] message:string, data:ref{id:string, companyId:string, externalUserId:string, pluginIds:array, title:string, createdBy:string, createdAt:string, updatedAt:string} | `getchatsession` |
| GET | `https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages` | sessionId(path,req), externalUserId(query), sort(query), cursor(query), limit(query) | — | 200[application/json] message:string, data:array{[id:string, sessionId:string, companyId:string, externalUserId:string, pluginIds:array, endpointId:string, responseMode:string, status:string, type:string, media:object, query:string, answer:string, createdBy:string, createdAt:string, updatedAt:string]}, pagination:ref{next:string, limit:integer} | `getchatmessages` |
| GET | `https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages/{messageId}` | sessionId(path,req), messageId(path,req) | — | 200[application/json] message:string, data:ref{id:string, sessionId:string, companyId:string, externalUserId:string, pluginIds:array, endpointId:string, responseMode:string, status:string, type:string, media:object, query:string, answer:string, createdBy:string, createdAt:string, updatedAt:string} | `getchatmessage` |
| POST | `https://api.on-demand.io/chat/v1/sessions/{sessionId}/query` | sessionId(path,req) | [application/json] query*:string, endpointId*:string, responseMode*:string, pluginIds:array{[]}, fulfillmentOnly:boolean, modelConfigs:object{fulfillmentPrompt:string, stopSequences:array, temperature:number, topP:number, presencePenalty:number, frequencyPenalty:number} | 200[application/json] message:string, data:object{sessionId:string, messageId:string, answer:string, status:string} | `submitquery` |
| PUT | `https://api.on-demand.io/chat/v1/sessions/{sessionId}/live-settings` | sessionId(path,req) | [application/json] enabled*:boolean, mode*:string, destinations:object{email:object, slack:object} | 200[application/json] message:string, data:ref{enabled*:boolean, mode*:string, destinations:object} | `updatelivesessionsettings` |

### Services (Services API)

| Method | URL | Path/query params | Body (`*` = required) | Success response | Slug |
|---|---|---|---|---|---|
| POST | `https://api.on-demand.io/services/v1/public/service/execute/speech_to_text` | apikey(header,req) | [application/json] audioUrl*:string | 200[application/json] message:string, data:object{text:string} | `convertaudiototext` |
| POST | `https://api.on-demand.io/services/v1/public/service/execute/text_to_speech` | apikey(header,req) | [application/json] model*:string, input*:string, voice*:string | 200[application/json] message:string, data:object{audioUrl:string} | `converttexttoaudio` |
| POST | `https://api.on-demand.io/services/v1/public/service/execute/language_translation` | apikey(header,req) | [application/json] input*:string, languageCode*:string | 200[application/json] message:string, data:object{translatedText:string} | `translatetext` |

### Flow Builder (Agents Flow Builder API)

| Method | URL | Path/query params | Body (`*` = required) | Success response | Slug |
|---|---|---|---|---|---|
| POST | `https://api.on-demand.io/automation/api/approvalgate/{executionID}/approval/{nodeKey}/approve` | executionID(path,req), nodeKey(path,req) | — | 200 Approval gate approved successfully | `post_approvalgate-executionid-approval-nodekey-approve` |
| POST | `https://api.on-demand.io/automation/api/approvalgate/{executionID}/approval/{nodeKey}/reject` | executionID(path,req), nodeKey(path,req) | — | 200 Approval gate rejected successfully | `post_approvalgate-executionid-approval-nodekey-reject` |
| GET | `https://api.on-demand.io/automation/api/execution/{executionID}` | executionID(path,req) | — | 200[application/json] data:object{}, message:string; data:ref{id:string, workflowId:string, trigger:ref, status:string, startedAtInMilliseconds:integer, endedAtInMilliseconds:integer, timeTakenInMilliseconds:integer} | `get_execution-executionid` |
| GET | `https://api.on-demand.io/automation/api/execution/{executionID}/delivery/track/email` | executionID(path,req), afterID(query), limit(query) | — | 200[application/json] data:object{}, message:string; data:array{[id:string, email:string, executionID:string, status:string, timestamps:array]} | `get_execution-executionid-delivery-track-email` |
| GET | `https://api.on-demand.io/automation/api/execution/{executionID}/logs` | executionID(path,req) | — | 200[application/json] data:object{}, message:string; data:array{[executionId:string, requestId:string, task:string, timestamp:integer, workflowId:string, nodeKey:string, message:string, fields:object]} | `get_execution-executionid-logs` |
| GET | `https://api.on-demand.io/automation/api/execution/{executionID}/node/outputs` | executionID(path,req) | — | 200[application/json] data:object{}, message:string; data:ref{outputs:object} | `get_execution-executionid-node-outputs` |
| POST | `https://api.on-demand.io/automation/api/execution/{executionID}/report-problem` | executionID(path,req) | [application/json] type*:string, message*:string | 200 Problem reported successfully | `post_execution-executionid-report-problem` |
| GET | `https://api.on-demand.io/automation/api/execution/{executionID}/transcript` | executionID(path,req) | — | 200[application/json] data:object{}, message:string; data:array{[executionId:string, workflowId:string, content:string, responseId:string, eventId:string, itemId:string, author:string, createdAtInMilliseconds:integer]} | `get_execution-executionid-transcript` |
| GET | `https://api.on-demand.io/automation/api/execution/list` | workflowID(query,req), afterID(query) | — | 200[application/json] data:object{}, message:string; data:array{[id:string, workflowId:string, trigger:ref, status:string, startedAtInMilliseconds:integer, endedAtInMilliseconds:integer, timeTakenInMilliseconds:integer]} | `get_execution-list` |
| POST | `https://api.on-demand.io/automation/api/workflow/` | — | [application/json] name*:string, trigger*:ref{type*:string, cron:ref, webhook:ref, position*:ref, measured:ref, nextNodeKeys:array}, nodes*:array{[key*:string, type*:string, kind*:string, dependencies:array, nextNodeKeys:array, llm:ref, advancedVoiceMode:ref, approvalGate:ref, position:ref, measured:ref]}, delivery*:array{[position:ref, measured:ref, channel:string, config:ref]}, enableMemory:boolean | 201[application/json] id:string | `post_workflow` |
| GET | `https://api.on-demand.io/automation/api/workflow/` | after(query), limit(query), keyword(query) | — | 200[application/json] [id:string, name:string, companyID:string, createdByUserID:string, isActive:boolean, enableMemory:boolean, createdAtInMilliseconds:integer, lastModifiedAtInMilliseconds:integer, trigger:ref{type*:string, cron:ref, webhook:ref, position*:ref, measured:ref, nextNodeKeys:array}, nodes:array{[key*:string, type*:string, kind*:string, dependencies:array, nextNodeKeys:array, llm:ref | `get_workflow` |
| GET | `https://api.on-demand.io/automation/api/workflow/{id}` | id(path,req) | — | 200[application/json] id:string, name:string, companyID:string, createdByUserID:string, isActive:boolean, enableMemory:boolean, createdAtInMilliseconds:integer, lastModifiedAtInMilliseconds:integer, trigger:ref{type*:string, cron:ref, webhook:ref, position*:ref, measured:ref, nextNodeKeys:array}, nodes:array{[key*:string, type*:string, kind*:string, dependencies:array, nextNodeKeys:array, llm:ref, | `get_workflow-id` |
| PATCH | `https://api.on-demand.io/automation/api/workflow/{id}` | id(path,req) | [application/json] trigger*:ref{type*:string, cron:ref, webhook:ref, position*:ref, measured:ref, nextNodeKeys:array}, nodes*:array{[key*:string, type*:string, kind*:string, dependencies:array, nextNodeKeys:array, llm:ref, advancedVoiceMode:ref, approvalGate:ref, position:ref, measured:ref]}, delivery*:array{[position:ref, measured:ref, channel:string, config:ref]}, enableMemory:boolean | 200 Workflow updated successfully | `patch_workflow-id` |
| DELETE | `https://api.on-demand.io/automation/api/workflow/{id}` | id(path,req) | — | 200 Workflow deleted successfully | `delete_workflow-id` |
| POST | `https://api.on-demand.io/automation/api/workflow/{id}/activate` | id(path,req) | — | 200 Workflow activated successfully | `post_workflow-id-activate` |
| POST | `https://api.on-demand.io/automation/api/workflow/{id}/deactivate` | id(path,req) | — | 200 Workflow deactivated successfully | `post_workflow-id-deactivate` |
| POST | `https://api.on-demand.io/automation/api/workflow/{id}/execute` | id(path,req) | — | 200[application/json] executionID:string | `post_workflow-id-execute` |
| PATCH | `https://api.on-demand.io/automation/api/workflow/{id}/name` | id(path,req) | [application/json] name*:string | 200 Workflow name updated successfully | `patch_workflow-id-name` |
| POST | `https://api.on-demand.io/automation/api/workflow/upload/config` | — | [multipart/form-data] file:string | 200 Configuration uploaded successfully | `post_workflow-upload-config` |

## (c) Frame catalogue

**Wire format.** Each frame = `event: <channel>` + `data: <payload>` + blank line. Four channels: `message`, `thinking`, `agent`, `heartbeat`. JSON `eventType` selects the subtype. Structured frames share `sessionId`, `messageId`, `eventIndex` (gaps allowed), `status` (usually `"processing"`). Heartbeats and terminal markers have no index. Check literal `[DONE]` / `[ERROR]:` **before** `JSON.parse`. Tolerate unknown subtypes. A disconnect is not completion.

Src: P = SSE reference PDF; U = Run-UX PDF/HTML (two recordings, 5 Oct 2026); T = repo traces (2026-10-10). "Not seen in T" means the frame is only documented.

| # | `event:` | eventType / statusType / subtype | Key payload fields | When it fires | UI rendering | Src |
|---|---|---|---|---|---|---|
| 1 | thinking | `planning_thinking` | `thinking.delta` | Planner reasoning, first frames (T: 1.5 s) | Collapsed behind one word, "Thinking"; text one click away | P,U,T |
| 2 | thinking | `planning_output` | `output.delta` (plan JSON as text: `title`/`objective`, steps with `user_query`) | After planning thinking (upstream name `planning_answer`) | Parse progressively; the objective becomes the opening sentence; steps go to the Agent panel | P,U,T |
| 3 | thinking | `step_thinking` | `thinking.delta`, `stepId` | Per plan step (upstream `plugin_thinking` maps here) | Hidden; the step label shimmers | P,U,T |
| 4 | thinking | `step_output` | `output.delta`, `stepId` (plugin calls JSON: `pluginId`, `name`, `api_request_parameters`) | Step writes its plugin calls (upstream name `plugin_answer`) | One logo chip per call as it closes; long params (e.g. email body) fill the Outputs card | P,U,T |
| 5 | thinking | `fulfillment_thinking` | `thinking.delta` | Before the first answer token | Shown behind "Writing the answer" | P,U,T |
| 6 | message | `plugin_sources` | `stepId`, `stepTitle`, `sources.{agentId,pluginId,pluginName,operationId,items[{title,url,domain,imageUrl}]}` | Last frame of a plugin step | Favicon chips + Sources list. Also marks the end of the step (derived summarising checkpoint) | T only (not in P) |
| 7 | message | `statusLog` → `plugin_suggestion.initialized` | `currentStatusLog.{statusType,statusMessage,time}` | t≈0, plugin lookup starts | Live line "Finding plugins" | U |
| 8 | message | `statusLog` → `plugin_suggestion.completed` | `+ suggestedPlugins[{name,logoUrl,…}]` | ~3 s | "Suggested plugins" + a row of logos (name on hover) | U |
| 9 | message | `statusLog` → `initializing` | statusMessage "Initializing the process…" | Start | No new line; the live line reads "Thinking" | U |
| 10 | message | `statusLog` → `analyzing` | statusMessage "Analyzing the prompt…"; with `stepQuery` at the start of each step | Prompt analysis / step start | Without stepQuery: no line. With stepQuery: a new short step label (never print stepQuery verbatim) | U |
| 11 | message | `statusLog` → `plan_created` | `+ queryPlan` | After planning_output | Confirms the sentence; lists the steps | U |
| 12 | message | `statusLog` → `agents_retrieved` | `+ retrievedAgents[]` | Before execution | Chips become the confirmed call list | U |
| 13 | message | `statusLog` → `executing` | `+ executedAgents[]` | Plugins running | Chips pulse, "N calls running" | U |
| 14 | message | `statusLog` → `execution_completed` | `+ executedAgents[]` with `response` | Calls returned | Chips tick; favicons from responses appear | U |
| 15 | message | `statusLog` → `execution_failed` | `+ statusCode` (e.g. 429), `errorResponse.message` | A call failed | "14 of 15 calls"; error detail in the Agent panel | U |
| 16 | message | `statusLog` → `execution_log_created` | statusMessage | After execution | Not drawn (Logs button) | U |
| 17 | message | `statusLog` → `summarize_history.initialized` | statusType only (documented) | Between steps, history summary starts | "Summarising step N" checkpoint | P only |
| 18 | message | `statusLog` → `summarize_history.completed` | statusType (+ possible summary text; not specified) | Summary done | Close the checkpoint | P only |
| 19 | message | `statusLog` → `fulfilling` | statusMessage "Fulfilling the prompt…" | Answer generation starts | Live line "Writing the answer" | U |
| 20 | message | `statusLog` → `fulfillment_completed` | `currentStatusLog.answer` (full answer) | End of answer | Replace the streamed text with the full answer | P,U |
| 21 | message | `fulfillment` | `answer` (chunk) | Answer streaming | Append in arrival order; fold the steps into the header | P,U,T |
| 22 | message | `metricsLog` | `publicMetrics{inputTokens,outputTokens,totalTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}` | After the answer | Header: time and tokens | P,U,T |
| 23 | message | `clarification_request` | `clarificationRequest.queries[{query,options}]` | Planner needs input; stream stays open | Question card; POST `{userResponse:[{question,answer}]}` to `/v1/client/sessions/{sessionId}/messages/{messageId}/plan-clarification` | P |
| 24 | agent | `ondemand_agent.<subtype>` (see below) | `agent{id,name}`, `data{…}`, status `processing` | Agent runs | Terminal/to-do/files view; agent completion ≠ query end | P |
| 25 | agent | `ondemand_agent.require_creds` | `data{pluginId,service,fields[]}` | Tool needs credentials | Credential form; POST `pluginId`+`fields:[{key,value}]` (or `cancelled:true`) to client `.../messages/{messageId}/tool-credentials` | P |
| 26 | agent | `ondemand_agent.awaiting_input` | `data` (prompt/options. Exact keys not specified in P; adapter reads `prompt\|content\|question\|message`, `options`) | Agent pauses for input | Input/choice card | P |
| 27 | agent | `ondemand_agent.awaiting_browser_action` | `data` (adapter reads `action`, `message\|content`, `novncUrl\|url`) | Agent hands off the live browser | Banner with a live-browser link | P |
| 28 | agent | `ondemand_agent.filler_start` / `filler_end` | no `data` | Filler toggles | Show/hide the filler indicator | P |
| 29 | heartbeat | (none) | `sessionId,messageId,time` | Every ~3 s | Nothing (the browser runs its own timer) | P,U,T |
| 30 | message | literal `[DONE]` | — | Success end | Stop → Send | P,U,T |
| 31 | message | literal `[ERROR]:` + JSON | e.g. `message`, `errorCode` | Failure/cancel end | Error banner, end the run | P |

**Agent subtypes (all `ondemand_agent.`; P):** Lifecycle `before_init, no_init, initiated, progress, thinking, completed, stopped, error, token_usage`. Execution `tool_call, tool_result, tool_details, terminal, skills_used, todo, subagent_status`. Outputs `code_generation_init, code_generated, file_written, artifact_ready, preview_ready, sandbox_created`. Interaction/UI `require_creds, awaiting_input, awaiting_browser_action, novnc_ready, novnc_ended, graphs_ready, graphs_ended, filler_start, filler_end`. `unknown` is reserved and not emitted. Common data shapes: `content` for text; `name`/`inputParams` (tool_call); `output`/`error` (tool_result); `language`/`title`/`delta`/`final` (code_generated); `pluginId`/`service`/`fields` (require_creds). `novnc_ended`, `graphs_ended` and the filler toggles omit `data`.

### Example payloads (real ones come from T; P gives the one envelope example)
```text
event: thinking
data: {"sessionId":"…","messageId":"…","eventIndex":1,"eventType":"planning_thinking","status":"processing","thinking":{"delta":"The user wants to compare the latest"}}

event: thinking
data: {"sessionId":"…","messageId":"…","eventIndex":61,"eventType":"planning_output","status":"processing","output":{"delta":"{\n  \"title\": \"I'll look up the"}}

event: thinking
data: {"sessionId":"…","messageId":"…","eventIndex":99,"eventType":"step_output","stepId":"1","status":"processing","output":{"delta":"{\"title\":\"Searching Fervo Energy"}}

event: message
data: {"sessionId":"…","messageId":"…","eventIndex":336,"eventType":"plugin_sources","stepId":"1","stepTitle":"Searching latest financing news","status":"processing","sources":{"agentId":"agent-1722260873","pluginId":"plugin-1722260873","pluginName":"Perplexity","operationId":"perplexity","items":[{"title":"…","url":"https://cleantech.com/…","domain":"cleantech.com","imageUrl":"https://…png"}]}}

event: message
data: {"sessionId":"…","messageId":"…","answer":"## Fervo Energy vs. Ormat Technologies","status":"processing","eventIndex":182,"eventType":"fulfillment"}

event: message
data: {"sessionId":"…","messageId":"…","eventIndex":249,"eventType":"metricsLog","status":"processing","publicMetrics":{"inputTokens":6485,"outputTokens":743,"totalTokens":7228,"ragTimeSec":22.47,"fulfillmentTimeSec":3.34,"totalTimeSec":25.81}}

event: heartbeat
data: {"sessionId":"…","messageId":"…","time":"2026-10-10T09:51:09Z"}

event: message
data: [DONE]
```
Shape-only examples (field names from P/U, values illustrative, **not captured in T**):
```json
{"eventType":"statusLog","status":"processing","currentStatusLog":{"statusType":"plugin_suggestion.completed","statusMessage":"Plugin suggestions completed","time":"…","suggestedPlugins":[{"name":"…","logoUrl":"https://…"}]}}
{"eventType":"statusLog","currentStatusLog":{"statusType":"analyzing","statusMessage":"Analyzing the prompt…","stepQuery":"Fetch the latest stock news …"}}
{"eventType":"statusLog","currentStatusLog":{"statusType":"execution_failed","statusCode":429,"errorResponse":{"message":"rate limit exceeded"}}}
{"eventType":"statusLog","currentStatusLog":{"statusType":"summarize_history.initialized","statusMessage":"…","time":"…"}}
{"eventType":"clarification_request","clarificationRequest":{"queries":[{"query":"Which ticker?","options":["AAPL","TSLA"]}]}}
{"eventType":"ondemand_agent.require_creds","status":"processing","agent":{"id":"…","name":"…"},"data":{"pluginId":"plugin-…","service":"…","fields":[{"key":"api_key"}]}}
{"eventType":"ondemand_agent.tool_call","agent":{"id":"…","name":"…"},"data":{"name":"…","inputParams":{}}}
{"eventType":"ondemand_agent.filler_start","agent":{"id":"…","name":"…"}}
```
`[ERROR]: {"message":"…","errorCode":"…"}` (key names are what the adapter parses. P only says "followed by JSON".)

## (d) `file_written` / `artifact_ready` → artifact mapping
**Evidence status:** the live SSE reference lists `ondemand_agent.file_written` and `ondemand_agent.artifact_ready` under "Outputs" but gives **no field list** for either. The Run-UX PDF/HTML do not cover them ("Files show only in agent runs"). **No recorded trace in the repo contains either subtype** (grep over `web/artifacts`, `web/proof` found zero). The only guaranteed envelope fields are `eventType`, `status`, `sessionId`, `messageId`, `eventIndex`, `agent{id,name}`, `data{…}`. The exact `data` keys are **UNVERIFIED** until a live agent run is captured. The adapter currently passes both through as a generic `{kind:"agent", subtype, agent, data}`.

Defensive mapping to use until captured (read the first non-empty value):

| Artifact field | Read from `data.` (in order) | Note |
|---|---|---|
| name | `name`, `fileName`, `filename`, `title`, basename(`path`) | |
| path | `path`, `filePath` | sandbox/workspace path. file_written usually has a path, possibly no URL |
| url | `url`, `downloadUrl`, `fileUrl`, `previewUrl` | accept only `https?://` |
| mime | `mime`, `mimeType`, `contentType`, else infer from the extension | Media API uses `mimeType` (precedent) |
| size | `size`, `sizeBytes`, `bytes` | Media API uses `sizeBytes` (precedent) |
| artifact id | `artifactId`, `id`, `fileId` | dedupe key. Otherwise `messageId`+path |

Rendering: `file_written` → an "Outputs" row (file written, pending). `artifact_ready` → upgrade the same row (match on path/name/id) to downloadable with a link. Never treat either as terminal.

## (e) PDF vs. traces
1. **statusLog frames absent in T.** P and U (Playground recordings) document 15+ statusTypes. Both repo traces (session `6ac9eaad…` 812 frames over two turns; session `6aca0a89…` 259 frames / 28.4 s, endpoint `predefined-deepseek-flash`, reasoningMode medium) contain **zero** `message/statusLog` frames: no plan_created, analyzing, agents_retrieved, executing, execution_*, fulfilling, fulfillment_completed, plugin_suggestion.*, summarize_history.*.
2. **summarize_history verdict.** P: "Includes summarize_history.initialized / completed as statusType values" (message/statusLog). U: lists it as a "history summary" frame "named in the SSE reference but absent from the recordings… still need a test fixture". T: `summarisation-event-observed.json` → `found_structural_summarisation_frame:false`. `sse-event-families.json` → `summarize_history.initialized:false, completed:false, anyBetweenStepSummarisationFrame:false`. **No raw between-step summarisation frame of any other name was observed either**, so nothing differs from the documented pair. There is simply no frame on this account/path. The step boundary is visible only as `plugin_sources` (stepId N, stepTitle) followed by `step_thinking`/`step_output` (stepId N+1), gap ≈1.25 s. The repo derives "Summarising step N" from that pair (`STEP_BOUNDARY`, `derived:true`) and keeps the documented `summarize_history.*` binding.
3. **`plugin_sources`** is not in P but was observed in T (session `6ac9eaad…`, Perplexity). It was absent in the second trace (GPT Search cited inline only).
4. **Thinking-channel volume.** U: 385/1,033 frames on thinking, 242 `step_output`. T: 183/259 thinking. Both agree that thinking dominates.
5. **Heartbeat** has no `eventType` in both P and T (repo families list it as pseudo-type `heartbeat`).
6. **Agent channel / interaction frames** (clarification_request, require_creds, awaiting_*, file_written, artifact_ready, filler_*, `[ERROR]:`) appear in neither U nor T. They are documented only.
7. Repo artifacts `frames-*.jsonl` contain `statusType` values `planning`, `summarising`, `plan_created`. These are the **bridge's client-side** CUSTOM frames, not upstream frames.

## (f) Legacy slug probes
`GET /config/v1/public/docs/reference/api/<slug>`. All 5 return 400 (no longer published):
| Slug | HTTP | Body |
|---|---|---|
| `streamworkflowlogs` | 400 | `{"message":"invalid request","error":"Invalid request sent to server"}` |
| `createchatbatch` | 400 | `{"message":"invalid request","error":"Invalid request sent to server"}` |
| `getreasoningmodes` | 400 | `{"message":"invalid request","error":"Invalid request sent to server"}` |
| `getallendpointspublic` | 400 | `{"message":"invalid request","error":"Invalid request sent to server"}` |
| `generateapikey` | 400 | `{"message":"invalid request","error":"Invalid request sent to server"}` |

## 2026-10-11 raw upstream audit (turn3/stream)
Recorded with `web/scripts/record-upstream-sse.mjs` **directly against `https://api.on-demand.io`** (no bridge): session `6acb474320a8b245e6aaad9e`, `POST /chat/v1/sessions/{id}/query` with `endpointId predefined-deepseek-flash`, `responseMode stream`, `reasoningMode medium`, `pluginIds [plugin-1722260873]`, query "Compare the latest news about Fervo Energy and Flutterwave this month, then summarise which has more positive momentum, with cited sources." → 3-step plan, 2,097 raw lines, 699 data frames, 47.96 s to `[DONE]`. Raw lines: `web/proof/stream-audit/upstream-multistep.sse`; index: `web/proof/stream-audit/upstream-summary.json`.

| first-seen ms | `event:` | `eventType` | top-level `status` | fields |
|---|---|---|---|---|
| 2164 | thinking | `planning_thinking` ×91 | processing | sessionId, messageId, eventIndex, eventType, status, `thinking.delta` |
| 3745 | heartbeat | — ×15 | — | sessionId, messageId, time |
| 4780 | thinking | `planning_output` ×49 | processing | …, `output.delta` |
| 7025 | thinking | `step_thinking` ×109 (stepId 1/2/3) | processing | …, stepId, `thinking.delta` |
| 7303 | thinking | `step_output` ×170 (stepId 1/2/3) | processing | …, stepId, `output.delta` |
| 17575 | message | `plugin_sources` ×2 (stepId 1, 2) | processing | stepId, stepTitle, `sources.{agentId,pluginId,pluginName,operationId,items[{title,url,domain,imageUrl}]}` |
| 37356 | thinking | `fulfillment_thinking` ×39 | processing | `thinking.delta` |
| 38741 | message | `fulfillment` ×222 | processing | `answer` |
| 45946 | message | `metricsLog` ×1 | processing | `publicMetrics` |
| 47957 | message | `[DONE]` | — | — |

**Summarisation finding (verbatim):** statusTypes seen → **none**; the only status-like field is the top-level `status:"processing"` on every frame (683/683). **Zero `message/statusLog` frames**, therefore **no `summarize_history.initialized`, no `summarize_history.completed`**, and no other summarisation-looking `eventType`/`statusType`. `grep -i summar` hits 15 frames, all of them LLM prose inside `planning_thinking` / `planning_output` / `step_output` / `fulfillment_thinking` deltas (e.g. "then a summary of which"). Consequently the field names of a real `summarize_history.completed` frame (whether it carries summary text and under which key) **could not be observed** in this run; `STATUS_FIELDS.summaryText = ["summary","answer","statusMessage"]` stays as documented-only guesswork and was **not changed**. The step boundary is visible only as `plugin_sources(stepId N)` → first `step_thinking/step_output(stepId N+1)` (gap 1,067 ms and 1,204 ms in this run). The bridge's "Summarising step N" checkpoint is therefore **bridge-derived** (`derived:true`), exactly as the 2026-10-10 verdict above; this run confirms it with a third independent session. Comparison with the submit-query v1 reference: the reference lists `summarize_history.*` under `message/statusLog`; this account/endpoint never emits that family. `eventMap.ts` verdict: every observed `eventType` is already bound → no rebind; a regression assertion built from this recording was added to `web/tests/unit/eventmap.test.ts`.
