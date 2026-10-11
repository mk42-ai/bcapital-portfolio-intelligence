# Data reconciliation — 2026-10-11 (Lane F)

Local backend `tsx src/server.ts` on 127.0.0.1:8787 against the committed `data/portfolio.sqlite` (the DB file is committed, so the rows written here ship with this commit). All timestamps UTC.

## F1 — Sentiment second scoring run (deltas non-null for every company)

`scripts/sentiment-pass2.ts` (rule `rule:news-mean-v1`) was run for **all 137 slugs** in three batches (50 / 50 / 37) through `POST /ingest` (`X-Ingest-Secret`). Ingest runs written:

| ingest_run_id | received_at | status | rows |
|---|---|---|---|
| `ing-2026-10-11T070405Z-241db2` | 2026-10-11T07:04:05Z | ok | 50 |
| `ing-2026-10-11T070406Z-c3dcca` | 2026-10-11T07:04:06Z | ok | 50 |
| `ing-2026-10-11T070407Z-c19e15` | 2026-10-11T07:04:07Z | ok | 37 |

Verification after the run:

- `GET /companies?limit=200` → **0 of 137** companies with `sentiment.delta == null` (was 132 of 137 before; only the five focus companies had a second row from `ing-2026-10-11T004631Z-b4adfa`).
- `sentiment_history`: 279 rows, **137 distinct companies with a non-null delta**.
- 124 of 137 companies moved (non-zero delta); the 13 that did not move include the five focus companies, whose pass-2 score already matched their news mean (`fervo-energy` 0.60 → 0.35 (−0.25, run 004631Z) → 0.35 (0.00, run 070405Z)).
- Largest moves this run: `turbine` +0.85, `vivacta` +0.85, `synapticure` +0.84, `insilico-medicine` +0.82, `chipagents` +0.80, `eeroq` +0.80, `linkmore` +0.80, `flourish-health` +0.76
- Focus companies (score, delta, run): `apptronik` 0.54 (+0.24, 04631Z-b4adfa); `apptronik` 0.54 (+0.00, 70405Z-241db2); `fervo-energy` 0.35 (-0.25, 04631Z-b4adfa); `fervo-energy` 0.35 (+0.00, 70405Z-241db2); `flutterwave` 0.44 (+0.04, 04631Z-b4adfa); `flutterwave` 0.44 (+0.00, 70405Z-241db2); `perplexity-ai` 0.34 (+0.69, 04631Z-b4adfa); `perplexity-ai` 0.34 (+0.00, 70406Z-c3dcca); `writer` 0.52 (+0.42, 04631Z-b4adfa); `writer` 0.52 (+0.00, 70407Z-c19e15)

News Pulse's "Δ vs previous run" aside (`web/src/components/news/news-feed.tsx`) lists companies with a non-null, non-zero delta, so it now shows the movers instead of "No deltas yet". Note the rule-based pass is deterministic; a third run without new scored news writes delta 0 for everyone.

## F2 — News count reconciliation

| Source | Value |
|---|---|
| `GET /health` → `news_total` | **2,104** |
| `select count(*) from news_items` | **2104** |
| News Pulse header | sums `GET /companies/{slug}/news` for all 137 companies (`web/src/lib/api.ts getAllNews()`, 16 in flight, ISR 120 s) and reports the backend `news_total` as `total` |
| Old figure 1,849 | the per-company fetch is best-effort: a company whose `/news` call fails falls back to its embedded `latest_news` (≤ 3 items) — on the earlier sandbox a burst of 6 s timeouts under load produced 1,849 (255 short). The header total now comes from `news_total` and the fetched list reports `Showing N of total`, so a partial fetch is visible instead of silent. |
| Old figure 182 / 197 | no remaining news-count assumption. `grep -rnE '\b(182|197|1849|1,849)\b' web/src src workflows scripts` → the only hits are **plugin directory counts** (`/api/plugins` paginates 182 chat plugins, `plugin-catalogue.ts`, `plugin-panel.tsx`), the workflow ids `6ac8e1849a…` in `workflows.json`, CSS colour `#111827`, and the explanatory comment in `api.ts:54`. The daily sentiment workflow bodies (`workflows/bodies/*`) carry no item-count literal. |

## F3 — Portfolio Plugin registration

`portfolio_plugin_id` is still **null**. Attempts this run (apikey from env, never logged):

| at | request | result |
|---|---|---|
| 2026-10-11T07:18:48Z | `scripts/register-plugin.ts` → `POST https://api.on-demand.io/plugin/v1`, `action.schema` = JSON-stringified OpenAPI 3.0.3 (full spec, 20 paths), `PUBLIC_BASE_URL=https://sb-4wg000bgek46.vercel.run` | **400** `{"message":"schema is required","errorCode":"invalid_request"}` |
| 2026-10-11T07:18:49Z | same body, `action.schema` as a JSON **object** | **400** `json: cannot unmarshal object into Go struct field PluginAction.action.schema of type string` — so the field IS a string, and the string we send is rejected as missing |
| 2026-10-11T07:19:02Z | minimal 2-path OpenAPI 3.0.3 string (1,032 bytes) | **500** empty body |
| `GET /plugin/v1/list` | account-owned agents | `{"total":0}` — nothing registered |
| `GET /plugin/v1/search?q=Portfolio` | marketplace (191) | no "Portfolio Plugin" |

**Blocker:** the public `POST /plugin/v1` rejects every `action.schema` string form we can produce ("schema is required" for a valid OpenAPI document, 500 for a minimal one) and the MCP `plugin_v1_plugin_create` returned an empty body on 2026-10-11T01:12Z. The remaining path is registering the REST tool through the OnDemand console (Plugins → Create → REST API → paste `openapi.json`, auth none) and setting `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` in `web/.env`; the UI already switches from built-in `systemContext` to the plugin as soon as that id is present (`web/src/lib/plugins.ts`).

## F4 — Data badge consistency ("live backend" vs "cached snapshot")

Two badges existed: the global one in the nav rail (`components/shell/backend-status.tsx`, `/health` ping **ISR-cached 60 s**) and the per-page "Data source" badge (`components/shell/page-header.tsx`, derived from the page's own data fetch, **ISR 120 s** with snapshot fallback in `lib/api.ts get()`). A stale negative in the 60 s health cache outlived a backend that had recovered (or one page's fetch timed out at 6 s while another's succeeded), so /chat could read "cached snapshot" while /news read "live backend" in the same minute.

**Fix shipped (this commit):** `lib/api.ts backendIsLive()` — one shared per-request probe (`cache: "no-store"`, 2 s budget, one retry) — and `BackendStatus` now uses it instead of its own cached fetch, so the rail badge reflects the backend as it is on the current request, the same thing the page's data fetch sees. Page-level badges keep reporting the actual source of *their* data (that is the honest signal when a single fetch falls back).


## 2026-10-11 10:03–10:19 UTC — UNIT 4a (branch t4/u4): reconciliation computed, pass 2 with prior-run dates, plugin registered, video flag

**Step-2 web search returned ZERO sources.** The owner's second-pass web search produced an empty `sourcesWithContent` for all five company queries
(aimotive, apptronik, fervo-energy, flutterwave, writer). Recorded here explicitly: **no article was fabricated**; the second sentiment pass below ran
over the backend's STORED `news_items` corpus only (rule `rule:news-mean-v1`).

### News reconciliation (computed by `scripts/news-reconciliation.ts` = `GET /news/reconciliation`, as_of 2026-10-11; proof/data-lane/news-reconciliation-2026-10-11.{json,md})

| company | raw | deduped(url) | deduped(title) | in-window-30d | in-window-7d | no-url | /news/summary definition |
|---|---|---|---|---|---|---|---|
| aimotive | 19 | 19 | 18 | 8 | 2 | 0 | 19 |
| apptronik | 33 | 33 | 32 | 0 | 0 | 0 | 33 |
| fervo-energy | 37 | 37 | 37 | 17 | 5 | 0 | 37 |
| flutterwave | 38 | 38 | 38 | 7 | 3 | 0 | 38 |
| writer | 23 | 23 | 16 | 0 | 0 | 0 | 23 |
| perplexity-ai | 34 | 34 | 29 | 8 | 5 | 0 | 34 |
| **all 137** | 2100 | 2100 | 1952 | 244 | 108 | 0 | 2100 |

- Orphan rows (company_slug not in companies): **0**. Rows without url: **0**. Undated rows: 678 (outside both windows). Rows with an item sentiment score: 585.
- **2,104 raw** = Σ `/companies/{slug}/news?limit=1000` before de-dup, i.e. raw `news_items` rows. Now **2100** — `scripts/dedupe-news.ts` removed the 4 exact (slug,url) duplicates (proof/data-lane/news-dedupe.json); `/news/summary.total` on the live backend = **2100** and the local `/news/reconciliation` agrees (verified 10:06Z).
- **182** does NOT reproduce from `latest_news`: Σ len(latest_news) over `/companies` = **2037** with an observed per-company cap of **25** (the `/ingest` merge `.slice(0,25)`). 182 is the chat-plugin directory page count (`/api/plugins`), not a news count — see F2 above.
- **150 = 19+33+37+38+23** reproduces exactly: current per-company counts under the `/news/summary` rule are aimotive 19, apptronik 33, fervo-energy 37, flutterwave 38, writer 23 → **150** (`owner_figures.focus_150.matches = true`). The inspector's news_count IS the backend `news_count` (same rule), so no discrepancy remains.
- `/news/summary` now also carries a `reconciliation` block (raw/dedup/window/no-url/embedded totals) and points at `/news/reconciliation`.

### Second sentiment pass with prior-run dates (proof/data-lane/sentiment-pass-2026-10-11.{json,md})

Backend additions: `sentiment.scored_at` (latest `sentiment_history.recorded_at`), `sentiment.prior_run_at` (the row before it — what the delta is measured against), `prior_score`, `model`, `ingest_run_id` on `/companies` and `/companies/{slug}`; `GET /sentiment/runs` lists distinct ingest runs with row/null-delta/mover counts. `scripts/sentiment-pass2.ts` now accepts `all`, records `prior_run_at` + rule + items per company and reads `scored_at`/delta back from the server.

| run | base | ingest_run_id | companies | rules R1/R2/R3 | null delta before → after |
|---|---|---|---|---|---|
| local (seed copy → committed as data/portfolio.sqlite) | http://localhost:4795 | `ing-2026-10-11T100803Z-42fde1` | 137 | 129/0/8 | 1 → **0** |
| live | https://sb-23wo7xiys7fz.vercel.run | `ing-2026-10-11T100811Z-ffd690` | 137 | 129/0/8 | 1 → **0** |

| company | score | delta vs prior | prior_run_at | scored_at (live) | rule | items used |
|---|---|---|---|---|---|---|
| aimotive | 0.56 | +0.00 | 2026-10-11T07:10:24Z | 2026-10-11T10:08:11Z | R1 news-mean | 5 |
| apptronik | 0.54 | +0.00 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | R1 news-mean | 5 |
| fervo-energy | 0.35 | +0.00 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | R1 news-mean | 4 |
| flutterwave | 0.44 | +0.00 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | R1 news-mean | 5 |
| writer | 0.52 | +0.00 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | R1 news-mean | 5 |
| perplexity-ai | 0.34 | +0.00 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | R1 news-mean | 5 |

The only company with a null delta before this pass was `b-capital` (single history row); after it 0 of 137 are null on both DBs. Deltas are 0 for the six because no new scored news arrived since the 07:10Z pass and the rule is deterministic.

### Portfolio Plugin — REGISTERED (proof/data-lane/plugin-registration-2026-10-11b.log.txt)

Schema authored from the live `GET /openapi.json` → OpenAPI 3.0.3, 8 GET no-secret paths, 6 schemas, 11,460 B, no `$ref` cycles (proof/data-lane/portfolio-plugin-openapi-3.0.3-2026-10-11.json). 11 attempts (cap 12):
MCP `plugin_v1_plugin_create` JSON string → empty; YAML string → empty; REST `POST /plugin/v1` nested `{plugin:…}` → 400 Name/Identifier/Description required (so nesting is wrong); flat + `openApiSchema`/`openapi_schema`/`apiSchema` → **500 ''**; flat with only `action.schema` → **500 ''** (last upstream status for the documented path); discovery `GET /plugin/v1/{schema,validate,import,openapi}` → 400 "Agent plugin not found" (they are treated as plugin ids), `POST /plugin/v1/{openapi,import}` → 404; `GET /plugin/v1/list` → total 0.
**`ondemandmcp__public_v1_plugin_ai_generated_tool_create` (isAutoSave) succeeded at 10:13:56Z → `plugin-1791713636` / `agent-1791713636` "B Capital Portfolio Intelligence"** (3 ops: GET /companies, /companies/{slug}/sentiment, /news/summary; auth none; servers[0] = the sandbox URL). `plugin_configuration_create active:true` → ok; `suggest_plugins` returns it first; chat session `6acb616f20a8b245e6aaaf0d` (predefined-deepseek-flash, sync) answered "Which B Capital portfolio companies have negative sentiment?" with **Bhanzu −0.625 very negative, Ninja Van −0.54 negative, DailyHunt −0.3 negative** — matching live `/companies?sort=sentiment` (score < 0 labelled negative: exactly those three). Id written to `config/plugins.json` and `web/.env.example` (`NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID=plugin-1791713636`). Caveat: the schema pins the sandbox URL; re-register when the backend moves (`scripts/register-plugin.ts --print-prompt`). `web/src/data/run-meta.json` is not in this unit's file list — orchestrator may set `portfolio_plugin_id` there.

### Video flag

`MEDIA_ALLOW_VIDEO` (default off): `web/src/lib/media/store.ts` adds `mp4`/`webm` to `ALLOWED` (kind "video"), `isVideoUploadEnabled()`, and `classify()` rejects video with the `unsupported_type` message "… video uploads are disabled …" when off. `/api/media` with the flag on skips the OnDemand media registration and persists a backend artifact with `mediaStatus "local"`, message "video stored in the backend only (no OnDemand video plugin)". Documented in `web/.env.example`, `.env.example`, `web/.env.test.example` (MEDIA_ALLOW_VIDEO=1 + INGEST_SECRET=test-secret, documentation only). What still needs the REAL secret: a direct `POST {live backend}/artifacts`; the relay path does not expose it to the user.
