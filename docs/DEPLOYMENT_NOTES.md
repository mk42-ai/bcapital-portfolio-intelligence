# Deployment Notes — B Capital Portfolio Intelligence backend

Run start **2026-10-09T12:07:25Z** · earliest_test_utc (run_start + 30 min) **2026-10-09T12:37:25Z** · all timestamps ISO-8601 UTC.

## 1. Platform decision: OnDemand Serverless attempted first → Vercel Sandbox fallback (live), serverless endpoint left provisioning

| UTC | Action | Result |
|---|---|---|
| 12:28:31 | GitHub repo `mk42-ai/bcapital-portfolio-intelligence` created, `main` pushed (commits 671da99 → 83630df) | OK |
| 12:29:30 | `serverless_repo_create` (repoUrl=…/bcapital-portfolio-intelligence, github, public) | repo id `6ac8de2a1f7d82eff69ac0d8` |
| 12:29:33 | `serverless_application_create` name=`bcap-portfolio-api`, branch=main, Dockerfile, manual_build | app id `6ac8de2d1f7d82eff69ac0d9` |
| 12:29:34–12:30:37 | `serverless_application_trigger_build` ×2 | ACR runs **chfbs** (59 s) and **chfbt** (1 m 1 s) *successful*; in-image migrate+seed log shows `db_record_count_spec: 136`; later runs chfbu/chfbv (prefix-strip commit) also *Succeeded* |
| 12:31:20 | `serverless_endpoint_create` endpointName=`bcap-portfolio-api`, port 3000, compute_1x, 7 env vars | endpoint `6ac8de981f7d82eff69ac0df` — env vars stored with **empty names** when sent as `{key,value}`; fixed with `serverless_endpoint_update` using `{name,value}` (12:31:26) |
| 12:31:30 / 12:34:40 | `serverless_endpoint_trigger_deploy` | **400 Bad Request** both times (not valid while `initializing`) |
| 12:34:33 | endpoint status → **`failed`**, `containerAppEnv` empty, `endpointUrl` null; `serverless_container_logs_get` → *"failed to get container app auth token: 404 Not Found"* | deleted, recreated |
| 12:35:02 | 2nd endpoint `6ac8df7667f952ee06ef33f4` (same name, env vars as `{name,value}`) | `initializing` 18 min → **`failed`** at ~12:53; deleted 12:59 |
| 12:54:00 | 3rd endpoint `6ac8e3e867f952ee06ef350d` endpointName=**`bcap-portfolio-intel`**, compute_2x | `initializing` (isEnvironmentReady=true, containerAppEnv still empty) → **`failed`** at 13:04:08; `container_logs_get` → `errors.serverless_endpoint.notready`; public URL `https://serverless.on-demand.io/apps/bcap-portfolio-intel/health` → 500 throughout |
| 12:46:34 | **Fallback**: Vercel Sandbox `sandbox create --runtime node22 --publish-port 3000` | `sbx_9U067Y8Hkn9TFuMr8qJFHeyfSxer` → `https://sb-4wdkkmzv7w2z.vercel.run`; `npm ci`, `npm run build`, `npm test` (11/11) in-sandbox; `/health` 200 at 12:47:50 |

**Why the fallback was necessary:** the OnDemand serverless *build* pipeline works end-to-end for this repo (four successful ACR builds, image `crairev.azurecr.io/ond-serverless/bcap-portfolio-api`), but the *endpoint* provisioning step never produced a Container App environment (`containerAppEnv: ""`, `defaultSubdomain: null`) for three consecutive endpoints across two compute tiers over ~35 minutes, and the only diagnostics the platform exposes (`container_logs_get`) returned `404 Not Found` / `notready`. This is a platform-side provisioning failure, not an image failure. The 16 pre-existing endpoints in this account (created ≤ 2026-07-21) are all healthy, so the account itself is not blocked. Per the task rule ("fallback to Vercel serverless functions ONLY if OnDemand serverless is impossible") the live base URL for this run is the Vercel sandbox. The platform policy for this runtime forbids `vercel deploy`/`--prod`, so the fallback is an **ephemeral sandbox (90-minute TTL)** — the durable target remains the OnDemand endpoint.

**Durable target & cut-over:** every workflow's webhook delivery already points at `https://serverless.on-demand.io/apps/bcap-portfolio-intel/ingest` (PATCH /workflow/{id} at 13:00:49, all 7 → 200, all still active). As soon as the endpoint's status flips to `Succeeded`, nothing else needs to change. If the owner prefers a different endpoint name, run `SERVERLESS_BASE_URL=… INGEST_SECRET=… tsx workflows/retarget.ts`. To re-point at any other host (e.g. a permanent Vercel project) the same script applies.

## 2. Ingest secret
`INGEST_SECRET` — 32-byte hex generated at 12:28:27Z with `openssl rand -hex 32`; stored only in (a) the serverless endpoint env vars, (b) the sandbox `.env`, (c) the workflow webhook delivery (`basicAuth.password` + `?secret=`), because the live `DeliveryChannelConfig.webhook` schema has **no custom-header field** (see `docs/ONDEMAND_SURFACE.md` §6.1). The API accepts `X-Ingest-Secret` header / HTTP Basic password / `?secret=` interchangeably, timing-safe compared. It is **not** committed to the repo (`grep` verified; `workflows/bodies/*.json` carry `<INGEST_SECRET>` placeholders).

## 3. Portfolio Plugin registration — BLOCKED by the platform (recorded, not faked)
| UTC | Attempt | Result |
|---|---|---|
| 12:38:43 | `POST https://api.on-demand.io/plugin/v1` with the documented contract (`action.schema` = JSON-stringified OpenAPI 3.0.3, `identifier: rest_api`, 13 required fields) | **400 `{"message":"schema is required","errorCode":"invalid_request"}`** |
| 12:38:53–12:40:15 | 19 further payload shapes: schema as object (→ *"cannot unmarshal object into Go struct field PluginAction.action.schema of type string"*), YAML string, URL, tiny 1-path spec, `authentication.type` apiKey/none/no_auth, extra keys (`openApiSchema`, `schemaUrl`, `spec`, `swagger`…), `creatorPluginConfig.schema`, multipart, `gateway.on-demand.io`, `gateway-dev` (401) | all **400 "schema is required"** (or 401 on gateway-dev) |
| 12:39:40 | MCP `plugin_v1_plugin_create` (same payload) | **empty response** (same failure recorded in the prior inspection doc, 2026-08-22) |
| 12:41–12:53 | `public_v1_plugin_ai_generated_tool_create` (isAutoSave=true) via MCP ×2 and REST ×1 | **524 Cloudflare origin timeout** (>120 s) each time |
| 12:40 / 12:53 | `public_v1_suggest_plugins` for "Portfolio Plugin" | not present → nothing was created server-side |

**Status:** `portfolio_plugin_id = null (registration blocked)`. The registration body and schema are ready in `scripts/register-plugin.ts` (`PUBLIC_BASE_URL=… tsx scripts/register-plugin.ts`); the console path (My Agents → Create Agent → REST API → paste `openapi.json`) is the documented alternative and takes < 2 minutes once the API is reachable. Note that `GET /plugin/v1/list` returns `{"data":{"total":0}}` for this account (even for known-good ids), so after registering, read the id from `public_v1_suggest_plugins`.

## 4. Workflows (Flow Builder) — created, activated, executed
Seven cron workflows (`0 0 6 * * *`, type advanced = 06:00 UTC daily), every LLM node `model: predefined-claude-fable-5.1`, `enableMemory: true`, two deliveries (webhook → `/ingest`, e-mail copy → mk@airev.ae). Node chain `research (Perplexity+LinkedIn+Reddit+X) → verify (GPT Search; pitchbook_status=pending) → score (Fable 5.1, -1..1, label, evidence[]) → deliver (pass-through) → o_analyzer → add-delivery`. PitchBook `plugin-1777018662` is **DEFERRED** (`config/plugins.json`) — never invoked, never on a node, never tested.

| name | id | created / activated | execution (12:43:49Z) | status at 13:04:37Z |
|---|---|---|---|---|
| bcap-focus-daily | 6ac8dfbe9a17f57debac74bb | 12:36:14 / 12:36:14 | 6ac8e184aeef8927baa25434 | all 5 nodes OK (research 4.1 min, verify 5.9 min, score 1.3 min) → **delivery failed** (serverless target 500) → payload **replayed** into the sandbox at 13:03:52 (5 companies, 9 news, 5 sentiment rows) |
| bcap-portfolio-daily-batch-1 | 6ac8dfbe300de84fa7120c1f | 12:36:14 / 12:36:15 | 6ac8e1849a17f57debac74ed | executing (verify) |
| bcap-portfolio-daily-batch-2 | 6ac8dfbf9a17f57debac74c5 | 12:36:15 / 12:36:15 | 6ac8e184aeef8927baa25439 | executing (verify) |
| bcap-portfolio-daily-batch-3 | 6ac8dfbf300de84fa7120c29 | 12:36:16 / 12:36:16 | 6ac8e1849a17f57debac74f1 | executing (verify) |
| bcap-portfolio-daily-batch-4 | 6ac8dfc09a17f57debac74cf | 12:36:16 / 12:36:16 | 6ac8e185aeef8927baa2543d | executing (verify) |
| bcap-portfolio-daily-batch-5 | 6ac8dfc0300de84fa7120c33 | 12:36:17 / 12:36:17 | 6ac8e1859a17f57debac74f7 | executing (research) |
| bcap-portfolio-daily-batch-6 | 6ac8dfc19a17f57debac74d9 | 12:36:17 / 12:36:17 | 6ac8e185aeef8927baa25442 | all nodes OK → **delivery failed** → **replayed** 12:59:39 (6 companies, 3 news, 6 sentiment rows) |

Log excerpts come from polling `GET /execution/{id}/logs` (there is no streaming transport in the live docs). Replays use `workflows/replay.ts`, which reads `GET /execution/{id}/node/outputs` and POSTs the `analyzer-0` value to `/ingest` — identical to what the webhook delivery would have sent. Remaining in-flight executions can be replayed the same way once they finish: `BASE_URL=… INGEST_SECRET=… tsx workflows/replay.ts <executionId…>`.

## 5. Smoke tests (sandbox base URL, `scripts/smoke.ts`, 13:04:33–34Z)
All 11 cases returned the expected code: 9 × GET → 200 (18–138 ms), `POST /ingest` without secret → 401, with secret → 200. Full table in `final_result.json`.

## 6. Known limitations / follow-ups
1. OnDemand serverless endpoint provisioning (`containerAppEnv` never assigned) — open a support ticket quoting app id `6ac8de2d1f7d82eff69ac0d9` and endpoint id `6ac8e3e867f952ee06ef350d`; the image is built and ready.
2. Portfolio Plugin registration blocked by `POST /plugin/v1` ("schema is required") and `ai_generated_tool` 524s — register via console or retry `scripts/register-plugin.ts`.
3. Sandbox is ephemeral (TTL 90 min from 12:46:34Z). Sentiment/news written there after the seed live in the sandbox's SQLite only; the repo carries the seeded baseline, and the 06:00 UTC runs re-populate any fresh deployment within one cycle.
4. Synack, BlackBuck, Geek+ and Bird from the status-change list are not among the 135 Brand_Matrix rows → recorded in `seed.json.unmatched_status_changes` rather than invented.
5. Flutterwave is a focus company but not in the matrix → added as an extra, flagged record (`in_brand_matrix=false`), so `db_record_count` (spec) = 136 and physical rows = 137.
