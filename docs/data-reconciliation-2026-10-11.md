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
