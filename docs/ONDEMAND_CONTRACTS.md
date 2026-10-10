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
