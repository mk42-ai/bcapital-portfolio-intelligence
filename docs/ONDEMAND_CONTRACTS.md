# OnDemand public API contracts used by this product

Fetched LIVE from `GET https://api.on-demand.io/config/v1/public/docs/categories` and `GET …/config/v1/public/docs/reference/api/<slug>` with the `apikey` header on **2026-10-10T13:13:07Z**. Nothing below is from memory; the OpenAPI documents are the source of truth. Auth on every call: header `apikey: <YOUR_API_KEY>` (server-side only in this product — the key never reaches the browser).


## Media API — Create Media (file/document upload)  (`createmediaurl`)

- **POST `https://api.on-demand.io/media/v1/public/file`**
  - body (`application/json`), required = `['url', 'plugins', 'responseMode']`:
    - `createdBy` *string* — Name of the creator who creates media
    - `updatedBy` *string* — Name of the creator who updates media
    - `sessionId` *string* — Id of the session in which the user uploads their media file
    - `externalUserId` *string* — external User ID of the user who uploads their media file
    - `url` *string* — url which contains the media data
    - `name` *string* — name of the media uploaded by user
    - `plugins` *array* items=string — Plugin Ids required for processing of media that is uploaded by user
    - `sizeBytes` *integer* — size in bytes of the media uploaded by user
    - `responseMode` *string* enum ['sync', 'webhook'] — Mode in which the user decides to recieve the responses from media
    - `pluginInputs` *array* items=object — Inputs passed for plugins for specific functionalities like uploading media in a knowledge plugin
  - 200 `data` fields: `id`, `companyId`, `sessionId`, `externalUserId`, `url`, `sourceUrl`, `extractedTextUrl`, `name`, `sizeBytes`, `source`, `mimeType`, `extension`, `plugins`, `context`

## Media API — Fetch Media  (`fetchmedia`)

- **GET `https://api.on-demand.io/media/v1/public/file`**
  - params: `sort` (query), `page` (query), `limit` (query), `plugins` (query), `externalUserId` (query), `source` (query)

## Media API — Delete Media  (`deletemedia`)

- **DELETE `https://api.on-demand.io/media/v1/public/file/{fileId}`**
  - params: `fileId` (path, required)

## Services API — audio → text  (`convertaudiototext`)

- **POST `https://api.on-demand.io/services/v1/public/service/execute/speech_to_text`**
  - params: `apikey` (header, required)
  - body (`application/json`), required = `['audioUrl']`:
    - `audioUrl` *string* — The URL of the audio file
  - 200 `data` fields: `text`

## Services API — text → audio  (`converttexttoaudio`)

- **POST `https://api.on-demand.io/services/v1/public/service/execute/text_to_speech`**
  - params: `apikey` (header, required)
  - body (`application/json`), required = `['model', 'input', 'voice']`:
    - `model` *string* enum ['tts-1', 'tts-1-hd'] — The model to be used for the conversion
    - `input` *string* — The text to be converted to audio
    - `voice` *string* enum ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] — Voice in which the text should be converted
  - 200 `data` fields: `audioUrl`

## Chat API — Submit Query (attachment / plugin fields)  (`submitquery`)

- **POST `https://api.on-demand.io/chat/v1/sessions/{sessionId}/query`**
  - params: `sessionId` (path, required)
  - body (`application/json`), required = `['query', 'endpointId', 'responseMode']`:
    - `query` *string* — Actual query
    - `endpointId` *string* — Endpoint ID of the fulfillment model selected to fulffil query. This can be a predefined, BYOI or BYOM model endpoint. You can get a list of all predefined models at [Fulfilllment Models](https://docs.on-demand.io/docs/f
    - `responseMode` *string* enum ['sync', 'stream', 'webhook'] — Response mode to get the query answer
    - `pluginIds` *array* items=string — A list of plugin IDs to be made accessible to RAG to answer the query. A maximum of  20 plugins are allowed. This list can be empty. If specified, it will replace the  plugin IDs set during session creation. If not speci
    - `fulfillmentOnly` *boolean* — If set to true, skips the RAG and only executes the fulfillment even if `pluginIds`  parameter is set at any level. Skipping RAG will also skip the plugins execution so the RAG  dependent queries will not be answered cor
    - `modelConfigs` *object* — Sets fulfillment model configuration. If not passed, default configuration will  be used to configure the fulfillment model referenced by `endpointId` parameter.
  - 200 `data` fields: `sessionId`, `messageId`, `answer`, `status`

## Agents Flow Builder — Create workflow  (`post_workflow`)

- **POST `https://api.on-demand.io/automation/api/workflow/`**

## Agents Flow Builder — Activate workflow  (`post_workflow-id-activate`)

- **POST `https://api.on-demand.io/automation/api/workflow/{id}/activate`**
  - params: `id` (path, required)

## Agents Flow Builder — Execute workflow  (`post_workflow-id-execute`)

- **POST `https://api.on-demand.io/automation/api/workflow/{id}/execute`**
  - params: `id` (path, required)

## Agents Flow Builder — Execution logs  (`get_execution-executionid-logs`)

- **GET `https://api.on-demand.io/automation/api/execution/{executionID}/logs`**
  - params: `executionID` (path, required)

## Chat API — Update live session settings (voice/realtime)  (`updatelivesessionsettings`)

- **PUT `https://api.on-demand.io/chat/v1/sessions/{sessionId}/live-settings`**
  - params: `sessionId` (path, required)

## How this product uses them (verified 2026-10-10)

* **Document upload (chat attachments)** — the browser posts the file to our relay `POST /api/media` (multipart, ≤25 MB, allow-list pdf/docx/xlsx/csv/txt/md/png/jpg/webp/mp3/wav/m4a). The relay stores the bytes under a signed one-time URL served by `GET /api/media/blob/<token>` and calls **`POST https://api.on-demand.io/media/v1/public/file`** with `{url, name, sizeBytes, sessionId, externalUserId, plugins:[], responseMode:"sync"}`; the response `data.id` is the OnDemand media id and `data.extractedTextUrl` the text extraction. **The documented Submit Query body has NO attachment/media-id field** (`query`, `endpointId`, `responseMode`, `pluginIds`, `fulfillmentOnly`, `modelConfigs` only) — media is bound to the session by `sessionId` at upload time, and our bridge additionally prepends the extracted text (capped) to the query so the answer is grounded in the document. This is the documented path; any `mediaIds`-style field would be undocumented and is not used.
* **Voice** — `POST /api/voice/stt` relays the recorded clip (uploaded to a short-lived URL) to **`POST https://api.on-demand.io/services/v1/public/service/execute/speech_to_text`** `{audioUrl}` → `data.text`; `POST /api/voice/tts` relays sentence chunks to **`…/execute/text_to_speech`** `{model:"tts-1", input, voice:"alloy"}` → `data.audioUrl`. There is no documented streaming/realtime STT/TTS endpoint in the public reference; the live-session settings endpoint (`updatelivesessionsettings`) is listed above for completeness but is not used because its documented scope is session settings, not audio frames. Sentence-chunked TTS over the SSE answer is therefore the streaming strategy.
* **Plugins** — `GET https://api.on-demand.io/plugin/v1/search?query=…&limit=100&page=N` (marketplace catalogue, `isSubscribed`, `pluginConfiguration.active`) and `GET /plugin/v1/list` (account-owned, 0 for this account).
* **Workflows** — `POST https://api.on-demand.io/automation/api/workflow/` (slug `post_workflow`) → `POST …/workflow/{id}/activate` → cron trigger; `POST …/workflow/{id}/execute` is what the UI 'Run now' relay calls; `GET …/execution/{id}/logs` for the run log.

## Voice — verified flow (fetched 2026-10-10T13:26:08Z, live probe `web/proof/voice/probe.json`)

There is **no documented streaming / realtime audio endpoint** in the public reference, so voice is: record (MediaRecorder, webm/opus) → park the clip on our origin → STT; answer SSE text → sentence-chunked TTS queue. The API key is used only inside the three server routes (`serverApiKey()`); no audio is ever faked — a `400 "Please subscribe to the service"` is surfaced verbatim as `code:"not_subscribed"` and the UI reports **BLOCKED_BY_EXTERNAL_DEPENDENCY (service subscription)**.

| Step | Exact call | Live result |
| --- | --- | --- |
| TTS | `POST https://api.on-demand.io/services/v1/public/service/execute/text_to_speech` · headers `apikey`, `content-type: application/json` · body `{"model":"tts-1","input":"Fervo Energy achieved first power at Cape Station.","voice":"alloy"}` | **HTTP 200** in 1 789 ms → `{message:"Service executed successfully", data:{audioUrl:"https://airevprod.blob.core.windows.net/…/2026-10-10-13-25-56.mp3?se=…&sig=…"}}` (SAS URL, valid ~4 days). Downloaded: `ffprobe` → `mp3`, 24 kHz mono 128 kbps, **duration 3.19 s** (`web/proof/voice/tts-sample.mp3`, `ffprobe.json`). |
| STT (round trip) | `POST https://api.on-demand.io/services/v1/public/service/execute/speech_to_text` · same headers · body `{"audioUrl":"<the TTS audioUrl above>"}` | **HTTP 200** in 867 ms → `{message:"Service executed successfully", data:{text:"Fervo Energy achieved first power at Cape Station."}}` — transcript **identical** to the synthesised sentence (`web/proof/voice/stt.json`). |

Status: **voice path LIVE on this account** (both services subscribed; neither returned the `400 Please subscribe to the service` form). If that 400 ever comes back the relays answer `{ok:false, code:"not_subscribed", message:<verbatim>}` with HTTP 400 and the dock shows "Voice service is not enabled on this OnDemand account".

Our relays (Next.js route handlers, `web/src/app/api/voice/*`, shared client `web/src/lib/voice/ondemand-audio.ts`):

* `POST /api/voice/tts` `{text (≤600 chars), voice?: alloy|echo|fable|onyx|nova|shimmer}` → `{ok:true, audioUrl, chars, voice, ms}` | `{ok:false, code:"not_subscribed"|"upstream"|"no_key"|"bad_request", message}` (400 / 502 / 503). Model fixed to `tts-1`.
* `POST /api/voice/stt` multipart `audio` (webm/ogg/wav/m4a/mp3, ≤ 8 MB) → clip stored in a `globalThis` map (TTL 10 min, `web/src/lib/voice/clip-store.ts`), exposed as `${NEXT_PUBLIC_SITE_URL ?? request origin}/api/voice/clip/<token>` and passed as `audioUrl` → `{ok:true, text, ms, bytes, type}` | same failure shape. The clip is deleted 5 s after the STT answer.
* `GET /api/voice/clip/[token]` → the parked bytes with their `content-type` (404 after TTL). The STT service must be able to reach the deployed origin — on `localhost` the relay still answers but upstream cannot fetch the clip (expected `upstream` failure, not a code bug).
* Client: `use-voice-capture.ts` (MediaRecorder + AnalyserNode RMS VAD: speech > 0.02 RMS for ≥120 ms, end after 900 ms silence, 30 s cap; modes `ptt` / `hands-free`), `tts-queue.ts` (sentence split on `. ! ?` + whitespace, ≥20 chars, markdown/citations/URLs stripped, ≤2 TTS requests in flight, one `<audio>` through a Web Audio gain for ducking; barge-in = `stop()` + `cancelMessage()`), `voice-dock.tsx` (mic in the composer action bar, brand-green orb, `aria-live` caption, mode toggle, voice select). A voice turn is `processMessage({role:"user", content: transcript})` in the same thread/session/plugins; it is only marked with the `via voice` chip.

## Media upload — verified flow  (`POST /media/v1/public/file`, fetched_at 2026-10-10T13:27Z)

Live probes in `web/proof/upload/media-create.json` (apikey + SAS query strings redacted). Our relay `POST /api/media` (multipart `file`, `sessionId?`, `externalUserId?`, optional `publicUrl`) validates (allow-list + 25 MB → 400 `unsupported_type` / 413 `too_large`), publishes the bytes for 2 h at `GET /api/media/blob/<token>/<name>` and calls OnDemand with **exactly this body**:

```json
{ "url": "https://<our-origin>/api/media/blob/<token>/<name>", "name": "<file name>", "sizeBytes": 13264,
  "sessionId": "<thread session id, when known>", "externalUserId": "INV-001",
  "plugins": ["<file-type plugin id by kind>"], "responseMode": "sync" }
```

* **plugins by kind** (live `GET /plugin/v1/search` type `file`, all subscribed+active on this account): document → `plugin-1713954536`, image → `plugin-1713958591`, audio → `plugin-1713958830`.
* **HTTP 500 findings**: `plugins: []` (the array is documented as required but an empty array is accepted by the schema) → HTTP 500 `errors.no.executable.plugin.found` (pdf) / `errors.server_error` (txt). With the document plugin, `dummy.pdf`, `demo.docx` and `README.md` → 200 `Media Created` (`data.id`, `data.sessionId`, `data.extractedTextUrl`, `data.context`); `alphatest.png` with the image plugin → 200. `iso_8859-1.txt` (document plugin) and `BabyElephantWalk60.wav` (audio plugin) → HTTP 500 `errors.server_error` upstream.
* **Relay result codes**: 400 `bad_request`/`unsupported_type`, 413 `too_large`, 401 (upstream 401/403), 502 `upstream_http`/`upstream_fetch_failed`, 504 `upstream_timeout` (60 s), 503 `no_key`.
* **Local-grounding fallback** (plain-text kinds only: `.txt`, `.csv`, `.md`): the relay always tries the document plugin first; if OnDemand answers HTTP 500, the bytes ARE the text, so the relay keeps the utf-8 text (≤40 KB) in its server store under a locally generated id `local-<24 hex>` and returns `{ok:true, media:{id:"local-…", kind:"document", grounded:"local"}, note:"OnDemand media create failed upstream (HTTP 500) — grounded locally from the uploaded text"}`. The chip shows a `local` badge; no media object exists upstream for these ids and `DELETE /api/media?id=local-…` is a no-op. `/api/chat` accepts ids matching `/^[A-Za-z0-9_-]{6,64}$/`, which `local-…` satisfies. Successful upstream creates return `grounded:"ondemand"`.
* **Grounding = sessionId binding + extracted-text prefix.** The documented Submit Query body (`POST /chat/v1/sessions/{id}/query`: `query`, `endpointId`, `responseMode`, `reasoningMode`, `pluginIds`, `fulfillmentOnly`, `modelConfigs`, `stopSequences`…) has **no attachment / mediaIds field**. Media is bound to the chat session only through the `sessionId` passed at create time, and our bridge additionally prepends the extracted text (≤12 000 chars per attachment, `ATTACHMENT_TEXT_CHARS`) to the query and emits a `CUSTOM ondemand.attachments {items:[{mediaId,name,kind,extractedChars,grounded}]}` frame so the UI can show what was used. Verified by `web/e2e/upload.spec.ts` (zephyr-7.md → answer contains `41.7`).
