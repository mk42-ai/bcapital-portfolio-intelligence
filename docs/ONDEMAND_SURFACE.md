# OnDemand Platform Surface — B Capital Portfolio Intelligence

**Source of truth:** the LIVE OnDemand public documentation, read on **2026-10-09 between 12:07:40Z and 12:09:10Z** via
`GET https://gateway.on-demand.io/config/v1/public/docs/categories` (8 services, 40 operation slugs) and
`GET https://gateway.on-demand.io/config/v1/public/docs/reference/api/<slug>` (one OpenAPI 3.0 document per slug, all 40 fetched).
Nothing below is from memory; where the live docs are silent the item is marked **NOT IN LIVE DOCS**. Prior integration
documents (`ONDEMAND_API_CONTRACTS.md`, `ondemand-runtime-skill-and-api-surface-inspection.md`,
`falkoneye-ondemand-integration-architecture.md`, `ondemand-custom-mcp-integration-guide.md`, `CAPABILITY_MATRIX.md`,
`erth-zayed-all-in-one-skill_v3.md`) were read first and are reconciled in §7.

## 0. Authentication, hosts and the `x-ondemand-key` proxy pattern
* Every documented operation authenticates with a plain **`apikey`** HTTP header (OpenAPI `securitySchemes.apikey` / `ApiKeyAuth`: `type: apiKey, in: header, name: apikey`). No Bearer scheme appears in any fetched spec.
* Hosts differ per service and are taken from each spec's `servers[0].url`: Chat & Media → `https://api.on-demand.io`; Agents Flow Builder → `https://api.on-demand.io/automation/api`; Projects → `https://api.on-demand.io/chat/v1`; Services → `https://api.on-demand.io/services/v1/public/service`; MQTT → `https://gateway-dev.on-demand.io` (dev host only — **NOT IN LIVE DOCS** for production).
* **Credential rule (carried over from the prior pattern):** the apikey lives only in the server environment variable `ON_DEMAND_API_KEY`; it is read once at boot, never logged, never returned by any route and never shipped to a browser. Browser/third-party callers hit *our* proxy and present their own tenant key in **`x-ondemand-key`**; the proxy validates/maps it and injects `apikey` on the outbound call. This repo's own API needs no apikey at all — its only write path is `POST /ingest` guarded by `X-Ingest-Secret` (env `INGEST_SECRET`).

## 1. Fable 5.1 endpointId — resolved from the live endpoint list
`GET /config/v1/public/endpoints` (MCP `config_v1_public_get_endpoints`, 2026-10-09T12:10Z, 92 endpoints) contains **exactly one** Fable 5.1 entry:

| endpoint_id | endpoint_name | model_id |
|---|---|---|
| **`predefined-claude-fable-5.1`** | `claude-fable-5-1` | `anthropic/claude-fable-5-1` |

Neighbours (do not substitute): `predefined-claude-fable-5` (Fable 5.0), `predefined-claude-sonnet-5.5`, `predefined-claude-opus-5.5`. The prior default `predefined-gpt-5.6-luna` is still present in the list but is **not** used anywhere in this project — every Flow Builder LLM node sets `model: "predefined-claude-fable-5.1"`.

## 2. Service / slug index (live categories, 2026-10-09)

* **Media API** — `fetchmedia`, `createmediaurl`, `deletemedia`
* **Services API** — `convertaudiototext`, `converttexttoaudio`, `translatetext`
* **MQTT User Management API** — `createmqttuser`, `deletemqttuser`
* **Projects Management API** — `post_public-projects`, `get_public-projects`, `get_public-projects-projectid`, `patch_public-projects-projectid`, `delete_public-projects-projectid`, `get_public-sessions`
* **Agents Flow Builder API** — `post_approvalgate-executionid-approval-nodekey-approve`, `post_approvalgate-executionid-approval-nodekey-reject`, `get_execution-executionid`, `get_execution-executionid-delivery-track-email`, `get_execution-executionid-logs`, `get_execution-executionid-node-outputs`, `post_execution-executionid-report-problem`, `get_execution-executionid-transcript`, `get_execution-list`, `post_workflow`, `get_workflow`, `get_workflow-id`, `patch_workflow-id`, `delete_workflow-id`, `post_workflow-id-activate`, `post_workflow-id-deactivate`, `post_workflow-id-execute`, `patch_workflow-id-name`, `post_workflow-upload-config`
* **Chat API** — `createchatsession`, `getchatsessions`, `getchatsession`, `getchatmessages`, `getchatmessage`, `submitquery`, `updatelivesessionsettings`

## 3. Chat API

### 3.1 Create chat session
*Doc slug:* `createchatsession` · **POST** `https://api.on-demand.io/chat/v1/sessions`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`) · `Content-Type: application/json`

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| — | | | | |

**Request schema** (`*` = required)

> The spec names the agent list `pluginIds`; the narrative docs' examples use `agentIds`. Both are accepted by the live API (prior docs §3.6); this project sends `pluginIds` as per the spec. Read the session id from `data.id`.

```json
{
  "externalUserId*": "string",
  "pluginIds": [
    "string"
  ]
}
```

**Response schema**

**200** → ```json
{
  "message": "string",
  "data": {
    "id": "string",
    "companyId": "string",
    "externalUserId": "string",
    "pluginIds": [
      "string"
    ],
    "title": "string",
    "createdBy": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```
**4XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```
**5XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/chat/v1/sessions' \
  -H 'apikey: <YOUR_API_KEY>' -H 'Content-Type: application/json' \
  -d '{"externalUserId": "bcap-analyst-01", "pluginIds": ["<portfolio-plugin-id>"]}'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/chat/v1/sessions", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({"externalUserId": "bcap-analyst-01", "pluginIds": ["<portfolio-plugin-id>"]}),
});
const json = await res.json();
```

### 3.2 Submit query — streaming (SSE) response mode
*Doc slug:* `submitquery` · **POST** `https://api.on-demand.io/chat/v1/sessions/{sessionId}/query`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`) · `Content-Type: application/json`

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `sessionId` | path | **yes** | string | ID of the session linked to this query |

**Request schema** (`*` = required)

> `responseMode` enum is `sync | stream | webhook`. With `stream` the connection stays open and the body is **Server-Sent Events** (`text/event-stream`); the SSE event shapes (`statusType: agents_retrieved / execution_completed`, `fulfillment` text chunks, `[DONE]` sentinel) come from the narrative docs, not the OpenAPI spec — see prior `ONDEMAND_API_CONTRACTS.md` §Streaming. The 200 JSON schema below is the **sync** response. `reasoningEffort`/`reasoningMode` are **NOT IN LIVE DOCS** (absent from the spec).

```json
{
  "query*": "string",
  "endpointId*": "string",
  "responseMode*": "string enum[\"sync\", \"stream\", \"webhook\"]",
  "pluginIds": [
    "string"
  ],
  "fulfillmentOnly": "boolean",
  "modelConfigs": {
    "fulfillmentPrompt": "string",
    "stopSequences": [
      "string"
    ],
    "temperature": "number",
    "topP": "number",
    "presencePenalty": "number",
    "frequencyPenalty": "number"
  }
}
```

**Response schema**

**200** → ```json
{
  "message": "string",
  "data": {
    "sessionId": "string",
    "messageId": "string",
    "answer": "string",
    "status": "string enum[\"processing\", \"completed\", \"failed\"]"
  }
}
```
**4XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```
**5XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/chat/v1/sessions/<SESSION_ID>/query' \
  -H 'apikey: <YOUR_API_KEY>' -H 'Content-Type: application/json' \
  -d '{"query": "Summarise this week's sentiment for Fervo Energy", "endpointId": "predefined-claude-fable-5.1", "responseMode": "stream", "pluginIds": ["<portfolio-plugin-id>"], "fulfillmentOnly": false}'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/chat/v1/sessions/<SESSION_ID>/query", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({"query": "Summarise this week's sentiment for Fervo Energy", "endpointId": "predefined-claude-fable-5.1", "responseMode": "stream", "pluginIds": ["<portfolio-plugin-id>"]}),
});
const json = await res.json();
```

**Node (fetch) — consuming the SSE stream**
```js
const res = await fetch(`https://api.on-demand.io/chat/v1/sessions/${sessionId}/query`, {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({ query, endpointId: "predefined-claude-fable-5.1", responseMode: "stream", pluginIds }),
});
const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
for (;;) {
  const { value, done } = await reader.read(); if (done) break;
  buf += dec.decode(value, { stream: true });
  let i; while ((i = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, i); buf = buf.slice(i + 2);
    const data = frame.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
    if (!data || data === "[DONE]") continue;
    try { const evt = JSON.parse(data); if (evt.answer) process.stdout.write(evt.answer); } catch { /* keep-alive */ }
  }
}
```

### 3.3 Get chat messages (verify which plugins fired)
*Doc slug:* `getchatmessages` · **GET** `https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `sessionId` | path | **yes** | string | ID of the chat session |
| `externalUserId` | query | no | string | Filter the chat messages based on external user |
| `sort` | query | no | string | Sort order of the messages based on its creation time |
| `cursor` | query | no | string | It acts as a pagination key and used to retrieve next results. For first iteration, this p |
| `limit` | query | no | integer | Specifies the total number of results to retrieve. If the provided value is less than  the |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → ```json
{
  "message": "string",
  "data": [
    {
      "id": "string",
      "sessionId": "string",
      "companyId": "string",
      "externalUserId": "string",
      "pluginIds": [
        "string"
      ],
      "endpointId": "string",
      "responseMode": "string enum[\"sync\", \"stream\", \"webhook\"]",
      "status": "string enum[\"processing\", \"completed\", \"failed\"]",
      "type": "string enum[\"text\", \"media\"]",
      "media": {
        "id": "string",
        "name": "string",
        "source": "string enum[\"document\", \"video\", \"audio\", \"youtube\", \"image\"]",
        "url": "string",
        "context": "string"
      },
      "query": "string",
      "answer": "string",
      "createdBy": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "pagination": {
    "next": "string",
    "limit": "integer"
  }
}
```
**4XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```
**5XX** → ```json
{
  "errorCode": "string",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/chat/v1/sessions/<SESSION_ID>/messages?limit=10&sort=desc' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/chat/v1/sessions/<SESSION_ID>/messages?limit=10&sort=desc", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```


## 4. Plugin / custom-tool registration (REST agent from an OpenAPI schema)

The live **categories index does not list** a plugin-management service (`createplugin`, `deleteplugin`, `listplugins` all return **400** from the reference endpoint on 2026-10-09). The registration contract therefore comes from the narrative docs mirrored in the prior guide (`ondemand-custom-mcp-integration-guide.md` §5.3–5.4) and from the MCP tool `plugin_v1_plugin_create`, whose argument list matches it field-for-field:

* **POST `https://api.on-demand.io/plugin/v1`** — body `{ name, identifier: "rest_api", description, category, logoUrl, type: "chat", source: "external", status: "private", fileSubType: "PRIMARYINGEST", chatSubType: "PRIMARYCHAT", privacyPolicy, conversationStarters?, action: { authentication: { type }, fields: [], schema: "<JSON-STRINGIFIED OpenAPI 3.0 document>" }, creatorPluginConfig: { active: true, fields: {} } }` → 200 "Plugin created successfully". **The 200 body schema is undocumented — do not assume `pluginId` is returned.**
* **GET `https://api.on-demand.io/plugin/v1/list?pluginIds=…&page=&limit=`** → `{ data: { plugins: [ { id, pluginId: "plugin-<digits>", name, identifier, status, … } ] } }`; 206 = partial ("plugin subscription not active"). Live check 2026-10-09T12:14Z: this account returns `{"data":{"total":0}}` for both the unfiltered list and a `pluginIds=` filter of known-good ids, so discovery is done through the suggest endpoint used by the MCP (`public_v1_suggest_plugins`), which does return `pluginId`/`agentId`.
* The OpenAPI document registered as the tool is this repo's `/openapi.json` with `openapi` downgraded to `3.0.3` (the importer validates 3.0.x); `operationId`s become the tool names. See `scripts/register-plugin.ts`.

```bash
curl -sS -X POST 'https://api.on-demand.io/plugin/v1' -H 'apikey: <YOUR_API_KEY>' -H 'Content-Type: application/json' \
  -d "$(node -e 'const s=require("./openapi.json");s.openapi="3.0.3";console.log(JSON.stringify({name:"Portfolio Plugin",identifier:"rest_api",description:"B Capital Portfolio Intelligence API",category:"research_and_insights",logoUrl:"https://b.capital/wp-content/uploads/2023/10/BCapital_Logo_XL.png",type:"chat",source:"external",status:"private",fileSubType:"PRIMARYINGEST",chatSubType:"PRIMARYCHAT",privacyPolicy:"https://b.capital/privacy-policy/",action:{authentication:{type:"none"},fields:[],schema:JSON.stringify(s)},creatorPluginConfig:{active:true,fields:{}}}))')"
curl -sS 'https://api.on-demand.io/plugin/v1/list?limit=100' -H 'apikey: <YOUR_API_KEY>'
```
```js
const spec = { ...(await (await fetch(`${PUBLIC_BASE_URL}/openapi.json`)).json()), openapi: "3.0.3" };
await fetch("https://api.on-demand.io/plugin/v1", { method: "POST", headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Portfolio Plugin", identifier: "rest_api", /* …as above… */ action: { authentication: { type: "none" }, fields: [], schema: JSON.stringify(spec) }, creatorPluginConfig: { active: true, fields: {} } }) });
```


## 5. Media API

### 5.1 Fetch media
*Doc slug:* `fetchmedia` · **GET** `https://api.on-demand.io/media/v1/public/file`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `sort` | query | no | string | Sorting order of media files. Users can choose to sort the media files based on two option |
| `page` | query | no | integer | Page number for pagination |
| `limit` | query | no | integer | Number of items per page |
| `plugins` | query | no | string | Filter to retrieve specific media corresponding to specific pluginId |
| `externalUserId` | query | no | string | Filter to retrieve media corresponding to specific externalUserId |
| `source` | query | no | string | Filter to retrieve media of a specific type |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → ```json
{
  "message": "string",
  "data": [
    {
      "id": "string",
      "companyId": "string",
      "sessionId": "string",
      "url": "string",
      "sourceUrl": "string",
      "name": "string",
      "source": "string",
      "mimeType": "string",
      "extension": "string",
      "plugins": [
        "string"
      ],
      "actionStatus": "string",
      "isDeleted": "boolean",
      "responseMode": "string",
      "transcriptionHours": "number",
      "externalUserId": "string",
      "createdBy": "string",
      "updatedBy": "string"
    }
  ],
  "pagination": {
    "page": "integer",
    "limit": "integer"
  }
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/media/v1/public/file?page=1&limit=10&source=document' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/media/v1/public/file?page=1&limit=10&source=document", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 5.2 Create media from URL
*Doc slug:* `createmediaurl` · **POST** `https://api.on-demand.io/media/v1/public/file`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`) · `Content-Type: application/json`

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| — | | | | |

**Request schema** (`*` = required)

> `responseMode` here is `sync | webhook` only (no `stream`). Rate limit per the narrative docs: 5 uploads/minute. The raw multipart upload has no OpenAPI schema (**NOT IN LIVE DOCS**).

```json
{
  "createdBy": "string",
  "updatedBy": "string",
  "sessionId": "string",
  "externalUserId": "string",
  "url*": "string",
  "name": "string",
  "plugins*": [
    "string"
  ],
  "sizeBytes": "integer",
  "responseMode*": "string enum[\"sync\", \"webhook\"]",
  "pluginInputs": [
    "object"
  ]
}
```

**Response schema**

**200** → ```json
{
  "message": "string",
  "data": {
    "id": "string",
    "companyId": "string",
    "sessionId": "string",
    "externalUserId": "string",
    "url": "string",
    "sourceUrl": "string",
    "extractedTextUrl": "string",
    "name": "string",
    "sizeBytes": "integer",
    "source": "string",
    "mimeType": "string",
    "extension": "string",
    "plugins": [
      "string"
    ],
    "context": "string",
    "extractedText": "string",
    "actionStatus": "string",
    "failedReason": "string",
    "isDeleted": "boolean",
    "responseMode": "string",
    "createdBy": "string",
    "updatedBy": "string",
    "pluginInputs": [
      "object"
    ],
    "transcriptionHours": "integer",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/media/v1/public/file' \
  -H 'apikey: <YOUR_API_KEY>' -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/brand-guidelines.pdf", "name": "brand-guidelines.pdf", "plugins": ["plugin-1713954536"], "responseMode": "sync", "externalUserId": "bcap-analyst-01"}'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/media/v1/public/file", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({"url": "https://example.com/brand-guidelines.pdf", "name": "brand-guidelines.pdf", "plugins": ["plugin-1713954536"], "responseMode": "sync"}),
});
const json = await res.json();
```

### 5.3 Delete media
*Doc slug:* `deletemedia` · **DELETE** `https://api.on-demand.io/media/v1/public/file/{fileId}`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `apikey`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `fileId` | path | **yes** | string | ID of the media file to be deleted |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → ```json
{
  "message": "string"
}
```

**curl**
```bash
curl -sS -X DELETE 'https://api.on-demand.io/media/v1/public/file/<FILE_ID>' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/media/v1/public/file/<FILE_ID>", {
  method: "DELETE",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```


## 6. Agents Flow Builder

### 6.1 Create workflow
*Doc slug:* `post_workflow` · **POST** `https://api.on-demand.io/automation/api/workflow/`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`) · `Content-Type: application/json`

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| — | | | | |

**Request schema** (`*` = required)

Component schemas (verbatim from the live spec): `CronConfig.expression` = *"CRON expression with 6 places… the left-most place represents seconds"* → 06:00 UTC daily is **`0 0 6 * * *`**. `LLMMeta` = `{ fulfillmentPrompt, prompt*, model*, plugins: [{ id }] }`. `Node.type` enum `llm | inputText | advancedVoiceMode | approvalGate` (the terminal `o_analyzer` sink used by the dashboard is **NOT IN LIVE DOCS** but accepted by the API). `Delivery.channel` enum `email | slack | webhook | phone`; `DeliveryChannelConfig.webhook = { url, method, basicAuth{username,password} }` — **there is no custom-header field**, so the ingest secret travels as Basic-auth password (and `?secret=`) and the API accepts `X-Ingest-Secret` / Basic / query interchangeably. The spec documents **201 `{ id }`** on success; the live API answers 200/201 with `{ data: { id } }` or `{ id }` — read both.

```json
{
  "name*": "string",
  "trigger*": {
    "type*": "string enum[\"cron\", \"webhook\"]",
    "cron": "any",
    "webhook": "any",
    "position*": "any",
    "measured": "any",
    "nextNodeKeys": [
      "string"
    ]
  },
  "nodes*": [
    {
      "key*": "string",
      "type*": "string enum[\"llm\", \"inputText\", \"advancedVoiceMode\", \"approvalGate\"]",
      "kind*": "string enum[\"source\", \"intermediate\", \"sink\", \"action\"]",
      "dependencies": [
        {
          "nodeKey": "string"
        }
      ],
      "nextNodeKeys": [
        "string"
      ],
      "llm": "any",
      "advancedVoiceMode": "any",
      "approvalGate": "any",
      "position": "any",
      "measured": "any"
    }
  ],
  "delivery*": [
    {
      "position": "any",
      "measured": "any",
      "channel": "string enum[\"email\", \"slack\", \"webhook\", \"phone\"]",
      "config": "any"
    }
  ],
  "enableMemory": "boolean"
}
```

**Response schema**

**201** → ```json
{
  "id": "string"
}
```
**400** → _Invalid request_
**500** → _Server error_

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/automation/api/workflow/' \
  -H 'apikey: <YOUR_API_KEY>' -H 'Content-Type: application/json' \
  -d '{"name": "bcap-focus-daily", "trigger": {"type": "cron", "cron": {"expression": "0 0 6 * * *", "type": "advanced"}, "nextNodeKeys": ["research"], "position": {"x": 0, "y": 0}, "measured": {"width": 300, "height": 500}}, "nodes": [{"key": "research", "kind": "source", "type": "llm", "dependencies": [], "nextNodeKeys": ["analyzer-0"], "llm": {"model": "predefined-claude-fable-5.1", "prompt": "\u2026", "fulfillmentPrompt": "\u2026", "plugins": [{"id": "plugin-1722260873"}]}, "position": {"x": 100, "y": 200}, "measured": {"width": 300, "height": 500}}, {"key": "analyzer-0", "kind": "sink", "type": "o_analyzer", "dependencies": [{"nodeKey": "research"}], "nextNodeKeys": ["add-delivery"], "position": {"x": 500, "y": 200}, "measured": {"width": 300, "height": 500}}], "delivery": [{"channel": "webhook", "config": {"webhook": {"url": "https://serverless.on-demand.io/apps/bcap-portfolio-api/ingest", "method": "POST", "basicAuth": {"username": "ingest", "password": "<INGEST_SECRET>"}}}, "position": {"x": 900, "y": 200}, "measured": {"width": 300, "height": 500}}], "enableMemory": true}'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/workflow/", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({"name": "\u2026", "trigger": {}, "nodes": [], "delivery": []}),
});
const json = await res.json();
```

### 6.2 Activate workflow
*Doc slug:* `post_workflow-id-activate` · **POST** `https://api.on-demand.io/automation/api/workflow/{id}/activate`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `id` | path | **yes** | string |  |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → _Workflow activated successfully_
**500** → _Server error_

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/activate' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/activate", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.3 Deactivate workflow
*Doc slug:* `post_workflow-id-deactivate` · **POST** `https://api.on-demand.io/automation/api/workflow/{id}/deactivate`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `id` | path | **yes** | string |  |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → _Workflow deactivated successfully_
**500** → _Server error_

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/deactivate' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/deactivate", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.4 Execute workflow (manual run)
*Doc slug:* `post_workflow-id-execute` · **POST** `https://api.on-demand.io/automation/api/workflow/{id}/execute`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `id` | path | **yes** | string |  |

**Request schema** (`*` = required)

> 400 = *"Invalid request or workflow inactive"* — activate first. Response `{ executionID }` (capital ID). The webhook-trigger variant `POST /automation/public/v1/webhook/workflow/{id}/execute` with `{ "payload": {…} }` is documented only in the narrative docs.

_No request body._

**Response schema**

**200** → ```json
{
  "executionID": "string"
}
```
**400** → _Invalid request or workflow inactive_
**404** → _Workflow not found_
**500** → _Server error_

**curl**
```bash
curl -sS -X POST 'https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/execute' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/workflow/<WORKFLOW_ID>/execute", {
  method: "POST",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.5 Execution record (completion signal)
*Doc slug:* `get_execution-executionid` · **GET** `https://api.on-demand.io/automation/api/execution/{executionID}`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `executionID` | path | **yes** | string |  |

**Request schema** (`*` = required)

> Response schema is untyped (`any`) in the spec. Observed fields (prior docs §6.11): `status`, `startedAtInMilliseconds`, `endedAtInMilliseconds`, `timeTakenInMilliseconds`. Terminal status enum is **NOT IN LIVE DOCS**; use `endedAtInMilliseconds != 0` as the completion signal.

_No request body._

**Response schema**

**200** → ```json
"any"
```
**401** → ```json
{
  "status": "integer",
  "message": "string"
}
```
**500** → ```json
{
  "status": "integer",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.6 Execution logs ("stream-logs")
*Doc slug:* `get_execution-executionid-logs` · **GET** `https://api.on-demand.io/automation/api/execution/{executionID}/logs`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `executionID` | path | **yes** | string |  |

**Request schema** (`*` = required)

> **There is no SSE/WebSocket log transport anywhere in the 40 live specs** — "stream logs" is a *polling* `GET` returning `{ message, data: [ { executionID, requestID, task, timestamp(ms), workflowID, nodeKey, message, fields } ] }`. Poll every 5-10 s, de-duplicate client-side (no cursor parameter), stop when §6.5 reports `endedAtInMilliseconds != 0`.

_No request body._

**Response schema**

**200** → ```json
"any"
```
**401** → ```json
{
  "status": "integer",
  "message": "string"
}
```
**500** → ```json
{
  "status": "integer",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>/logs' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>/logs", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.7 Node outputs (the LLM payload that was delivered)
*Doc slug:* `get_execution-executionid-node-outputs` · **GET** `https://api.on-demand.io/automation/api/execution/{executionID}/node/outputs`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `executionID` | path | **yes** | string |  |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → ```json
"any"
```
**500** → ```json
{
  "status": "integer",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>/node/outputs' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/execution/<EXECUTION_ID>/node/outputs", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```

### 6.8 List executions / list workflows
*Doc slug:* `get_execution-list` · **GET** `https://api.on-demand.io/automation/api/execution/list`

**Required headers:** `apikey: <YOUR_API_KEY>` (OpenAPI securityScheme `ApiKeyAuth`: type apiKey, in header, name `apikey`)

**Parameters**

| name | in | required | type | description |
|---|---|---|---|---|
| `workflowID` | query | **yes** | string |  |
| `afterID` | query | no | string |  |

**Request schema** (`*` = required)

_No request body._

**Response schema**

**200** → ```json
"any"
```
**400** → ```json
{
  "status": "integer",
  "message": "string"
}
```
**500** → ```json
{
  "status": "integer",
  "message": "string"
}
```

**curl**
```bash
curl -sS -X GET 'https://api.on-demand.io/automation/api/execution/list?workflowID=<WORKFLOW_ID>' \
  -H 'apikey: <YOUR_API_KEY>'
```
**Node (fetch)**
```js
const res = await fetch("https://api.on-demand.io/automation/api/execution/list?workflowID=<WORKFLOW_ID>", {
  method: "GET",
  headers: { apikey: process.env.ON_DEMAND_API_KEY },
});
const json = await res.json();
```


## 7. Serverless Application deployment (used for this project)

The serverless family is **absent from the public docs index** (0 of 40 slugs); it is reachable through the MCP server (`config_v1_public_serverless_*`) and the matching gateway REST paths `GET/POST https://api.on-demand.io/config/v1/public/serverless/{repo|application|endpoint}` (all `apikey`-authenticated; the list calls were confirmed live on 2026-10-09). The flow that was executed for this project, with timestamps:

| step | tool / endpoint | input | result | UTC |
|---|---|---|---|---|
| 1 | `serverless_repo_create` | `repoUrl=https://github.com/mk42-ai/bcapital-portfolio-intelligence, repoPlatform=github, isRepoPublic=true` | repo id `6ac8de2a1f7d82eff69ac0d8` | 12:29:30Z |
| 2 | `serverless_application_create` | `name=bcap-portfolio-api, serverlessRepo=<repo id>, branchName=main, dockerScriptPath=Dockerfile, appBuildMode=manual_build` | app id `6ac8de2d1f7d82eff69ac0d9` | 12:29:33Z |
| 3 | `serverless_application_trigger_build` | app id | ACR build run `chfbs` (59 s) then `chfbt` (1m1s) — *"Run ID … was successful"*, image `crairev.azurecr.io/ond-serverless/bcap-portfolio-api` | 12:29:34Z–12:30:37Z |
| 4 | `serverless_image_build_details_get` | app id | full docker log incl. in-image migrate+seed `db_record_count_spec: 136` | 12:30:55Z |
| 5 | `serverless_endpoint_create` | `application=<app id>, endpointName=bcap-portfolio-api, targetPortNumber=3000, compute_1x, min/max 1, environmentVariables[]` | endpoint id `6ac8de981f7d82eff69ac0df`, status `initializing` | 12:31:20Z |
| 6 | `serverless_endpoint_update` | env vars re-sent as `{name,value}` (the create call's `{key,value}` form was stored with empty names — **undocumented shape, use `name`**) | *"Serverless endpoint updated successfully!"* | 12:31:26Z |
| 7 | `serverless_endpoint_trigger_deploy` | endpoint id | **400 Bad Request** while status is `initializing` (the platform auto-deploys on create; re-deploy is only valid once an image is attached) | 12:31:30Z |

Public URL convention (observed on the 16 pre-existing endpoints): `https://serverless.on-demand.io/apps/<endpointName>`. Env vars confirmed stored: `PORT, PUBLIC_BASE_URL, INGEST_SECRET, ONDEMAND_DEFAULT_MODEL, DEFERRED_PLUGINS, EARLIEST_TEST_UTC, APP_VERSION`.

```bash
curl -sS 'https://api.on-demand.io/config/v1/public/serverless/endpoint' -H 'apikey: <YOUR_API_KEY>'   # list endpoints + status
```

## 8. Documentation gaps (live corpus, 2026-10-09) — reconciled with the prior gap lists
| # | Item | Status |
|---|---|---|
| 1 | **API-key CRUD** (`generateapikey` / `deleteapikey`) | **NOT IN LIVE DOCS** — not in the categories index today (the prior custom-MCP guide saw them; they have since been withdrawn or hidden). Dashboard only. |
| 2 | **Reasoning modes** (`reasoningMode` enum, `reasoningEffort`) | **NOT IN LIVE DOCS** — absent from `submitquery`; only reachable via MCP `config_v1_public_get_reasoning_modes`. |
| 3 | **Model / endpoint list** | **NOT IN LIVE DOCS** as a REST slug; resolved via MCP `config_v1_public_get_endpoints` (92 entries, §1). |
| 4 | **Chat batches** (`POST /chat/v1/batches`) | **NOT IN LIVE DOCS** today; prior memory notes creation returns 503 `resource_unavailable`. |
| 5 | **Log streaming** | Polling `GET /execution/{id}/logs` only — no SSE/WS (§6.6). |
| 6 | Plugin create/list/delete REST specs | Reference endpoint returns 400 for `createplugin`/`deleteplugin`; `GET /plugin/v1/list` returns `total: 0` for this account (§4). |
| 7 | Serverless application API | Entirely undocumented publicly; MCP + gateway paths only (§7). `environmentVariables` item shape (`name`/`value`) undocumented. |
| 8 | Webhook delivery payload / signature, custom headers | Payload shape and signature **NOT IN LIVE DOCS**; `DeliveryChannelConfig.webhook` has no headers field (§6.1). |
| 9 | Execution terminal `status` enum | **NOT IN LIVE DOCS** — use `endedAtInMilliseconds != 0`. |
| 10 | `o_analyzer` node type / `add-delivery` key | Required by the dashboard but not in `Node.type` enum. |
| 11 | SSE event schema for `responseMode: stream` | Narrative docs only (prior contracts doc); not in the OpenAPI spec. |
| 12 | MQTT production host | Spec declares `gateway-dev.on-demand.io` only. |

## 9. Portfolio plugin registration — SA6 findings (2026-10-10, see `web/proof/plugin-registration.log`)
| Channel | Attempt | Result |
|---|---|---|
| Public REST docs | `GET /config/v1/public/docs/categories` (apikey) | 200; 40 documented endpoints (Chat, Media, Workflow, Projects, MQTT, Agents Flow Builder). **No plugin/tool/agent creation endpoint** — registration is dashboard-only. |
| MCP `public_v1_suggest_plugins` | query "B Capital Portfolio Intelligence API" | No existing portfolio plugin (YouTube Captions, Chat Analytics, PitchBook Investor Finder, US Stock Fundamentals … only). |
| MCP `plugin_v1_plugin_create` | identifier `rest` then `rest_api`, type chat, source external, category finance, `action.schema` = stringified openapi.json with `servers[0].url=https://sb-3az18qgrrd3p.vercel.run` | Both calls returned **empty output** (no pluginId/agentId, no error body); a follow-up suggest query still shows no portfolio plugin. |
| MCP `public_v1_plugin_ai_generated_tool_create` (`isAutoSave: true`) | natural-language spec pointing at the backend `/openapi.json` | 1st: Cloudflare **524** origin timeout (120 s). 2nd after 120 s back-off: `{"message":"auto-save: create plugin: invalid agent category","errorCode":"invalid_request"}` — category is chosen server-side, not retryable. |

**Consequence:** `portfolio_plugin_id` stays `null`. The chat does not depend on it: `web/src/app/chat/page.tsx` fetches the live backend server-side (`listCompanies`, 120 s revalidate) and `chat-shell.tsx` builds a `systemContext` string (≤ 6000 chars, prefixed to the first turn by `/api/chat`) containing, per selected context company: name, sector, status, stage, sentiment score + label + delta (verbatim `company.sentiment.delta`, currently `null` for all 137 rows — no second scoring run yet) + `updated_at` + `basis` (131/137 rows are `seed placeholder — not yet scored by workflow`; the 5 focus companies are `seed (intelligence JSON research_timestamp 2026-10-09)`), news count, and the 3 latest headlines with date + source. A rendered sample is in `web/proof/chat-systemcontext-sample.txt`. The Portfolio Plugin row in Settings and the chat sidebar now shows a **built-in context** badge with no toggle; if `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` is ever set it flips back to an active, default-on plugin automatically.
