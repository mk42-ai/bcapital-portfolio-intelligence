# Refresh pipeline — live Perplexity news via the OnDemand Chat API

_Release 2026-10-09 (“live data”). Backend code: `src/refresh.ts`, routes in `src/app.ts`, scheduler in `src/server.ts`, CLI `scripts/refresh.ts`. Proof: `proof/refresh-run.json`._

The daily Flow Builder workflows (06:00 UTC → `POST /ingest`) remain the bulk path for sentiment. The **refresh pipeline** is a second,
direct path that pulls fresh news (with article images and published dates) for a set of companies **synchronously** from the
Perplexity plugin (`plugin-1722260873`) through the OnDemand Chat API — no Flow Builder round-trip — and writes them into the same
`news_items` table. It runs on demand (`POST /refresh`), on an in-process hourly schedule, or from the CLI.

## 1. How one run works

```
POST /refresh {slugs?, limit?, concurrency?}            (X-Ingest-Secret)
  │
  ├─ pick targets: body.slugs, else the `limit` (default 40, max 200) stalest companies by companies.updated_at (firm record excluded)
  │
  ├─ for each company, `concurrency` at a time (default 3, max 6):
  │    1. POST https://api.on-demand.io/chat/v1/sessions          {externalUserId, pluginIds:["plugin-1722260873"]}  → data.id
  │    2. POST https://api.on-demand.io/chat/v1/sessions/{id}/query
  │         {query:"Latest news about <name> (<website>) from the last 60 days. List up to 6 items, newest first,
  │                 each as: title — source — published date (YYYY-MM-DD) — URL.",
  │          endpointId: ONDEMAND_DEFAULT_MODEL (default predefined-claude-fable-5.1),
  │          responseMode:"stream", pluginIds:["plugin-1722260873"], modelConfigs:{temperature:0.1}}
  │       stream is parsed frame by frame (120 s abort):
  │         • eventType "plugin_sources" → sources.items[] {title,url,domain,imageUrl}  ← the news items
  │         • eventType "fulfillment"    → answer deltas concatenated                   ← used only to recover dates
  │         • data:[DONE]                → end of stream
  │    3. per source item:
  │         id            = "n-" + sha1(slug + "|" + url)[0:16]            (stable → upsert, no duplicates)
  │         published_at  = date found in the answer text within ±400 chars of the URL/title
  │                         ?? date parsed from the URL path (/2026/10/06/…)
  │                         ?? <meta article:published_time | datePublished | …> from the article page
  │         image_url     = plugin_sources imageUrl ?? og:image / twitter:image from the article page
  │                         (GET, 6 s timeout, ≤200 KB, browser UA; only fetched when something is missing)
  │         source        = sources.items[].domain ?? URL hostname
  │    4. upsert news_items (kind "news", ingest_run_id = this run); keep an existing published_at / image_url / summary
  │       when the new value is null; refresh companies.latest_news (newest first by published_at)
  │
  └─ one ingest_runs row: source "refresh", workflow_name "ondemand-refresh", model, companies_touched,
     news_upserted, status ok | partial | error, errors[] (per-company), raw_sample = {plugin, slugs, concurrency}
```

Only one run is in flight per process: a second `POST /refresh` (or a scheduler tick) that arrives while a run is active **joins** the
in-flight promise and receives the same result instead of starting a parallel run.

## 2. Endpoints

### `POST /refresh`
| | |
|---|---|
| Auth | `X-Ingest-Secret: <INGEST_SECRET>` — the same shared secret and the same three accepted forms as `/ingest` (header, HTTP Basic password with user `ingest`, or `?secret=`), timing-safe compared. 401 when missing/wrong, 503 when `INGEST_SECRET` is not configured. |
| Precondition | `ONDEMAND_API_KEY` set on the backend → otherwise 503 `resource_unavailable`. |
| Body (JSON, optional) | `{ "slugs"?: string[], "limit"?: number (1–200, default 40), "concurrency"?: number (1–6, default 3) }`. Non-JSON body → 400. |
| Response 200 | `{ ingest_run_id, status: "ok"\|"partial"\|"error", companies_touched, news_upserted, with_images, dated, errors[], companies[{slug,name,session_id,items,with_images,dated,ms,error?}], items[{id,company_slug,title,url,source,published_at,image_url,fetched_at}], started_at, finished_at }` |
| Duration | synchronous — roughly 60–120 s per company divided by `concurrency` (Perplexity research phase); the 5-company proof run below took ~2 min. Keep client timeouts ≥ 5 min for `limit: 40`. |

### `GET /refresh/status` (public, read-only)
```json
{
  "running": false,
  "last_run": { "id": "rf-…", "status": "ok", "companies_touched": 5, "news_upserted": 54, "errors": [], "started_at": "…", "finished_at": "…", "model": "predefined-claude-fable-5.1" },
  "last_result": { "ingest_run_id": "rf-…", "with_images": 54, "dated": 43, "companies": [ { "slug": "…", "items": 12, "with_images": 12, "dated": 9, "ms": 87686 } ] },
  "scheduler": { "enabled": true, "interval_minutes": 60, "batch_limit": 40, "next_scheduled_at": "2026-10-10T01:00:00Z" },
  "news_items_total": 0, "news_items_with_images": 0, "timestamp": "…"
}
```
`last_run` comes from `ingest_runs` (survives restarts); `last_result` is the in-memory detail of the last run in this process (session ids stripped). Both are documented in `openapi.json` (`/refresh`, `/refresh/status`).

## 3. Schedule
`src/server.ts` starts an in-process timer when **both** `REFRESH_CRON_MINUTES > 0` (default `60`) and `ONDEMAND_API_KEY` are set:
every tick calls `refreshCompanies({ limit: 40 })` — the 40 stalest companies by `updated_at` — so the whole 136-company portfolio cycles
every ~3–4 h. Start-up logs `{"msg":"refresh.scheduler","intervalMinutes":60,"batchLimit":40}` or `refresh.scheduler.disabled` with the
reason (`REFRESH_CRON_MINUTES=0` or `ONDEMAND_API_KEY not set`). Each tick logs `refresh.tick` (run id, status, counts) or `refresh.tick.error`.
`next_scheduled_at` is exposed in `/refresh/status`. Set `REFRESH_CRON_MINUTES=0` on hosts where the process may be duplicated (several
instances would otherwise all poll Perplexity).

## 4. Data model touched
| Table / column | Written by refresh |
|---|---|
| `news_items.id` | `n-<sha1(slug|url)[0:16]>` — deterministic, so re-runs upsert |
| `news_items.company_slug, title, url, source, kind="news"` | from `plugin_sources.items[]` |
| `news_items.published_at` | `YYYY-MM-DD`, from answer text → URL path → page meta, each candidate filtered by `plausibleDate()` (rejected when later than today + 1 day or older than 3 years — event listings otherwise surface as the newest news); existing value kept when none found |
| `news_items.image_url` | `plugin_sources.items[].imageUrl` → `og:image`/`twitter:image`; existing value kept when none found |
| `news_items.ingest_run_id, created_at` | run id, `fetched_at` |
| `news_items.summary, sentiment_score` | **not** set by refresh (summary preserved if present; sentiment stays for the daily workflow) |
| `companies.latest_news` | rebuilt newest-first for each touched company |
| `ingest_runs` | one row, `source = "refresh"` |

## 5. Failure handling
| Failure | Behaviour |
|---|---|
| Session create / query HTTP ≠ 2xx | that company gets `error: "session create failed: HTTP <n>"` / `"query failed: HTTP <n>"`; other companies continue; run status `partial` (or `error` if **no** company succeeded) |
| Stream exceeds 120 s | AbortController → `error: "stream timeout after 120s"` for that company |
| Article page unreachable (og:image / date backfill) | 6 s timeout, swallowed → item kept without image/date (`with_images`/`dated` counters show the gap) |
| Second call while running | joins the in-flight run (no double spend) |
| `ONDEMAND_API_KEY` missing | `POST /refresh` → 503; scheduler disabled at boot |
| Malformed `data:` frame | ignored (JSON parse failure is non-fatal) |
| Perplexity returns no `plugin_sources` frame | company counted as touched with 0 items; nothing deleted |

Nothing is ever deleted; a bad run can only leave rows unchanged. `errors[]` on the response and in `ingest_runs.errors` name the slug and reason.

## 6. Run it manually
```bash
# in the repo root; ONDEMAND_API_KEY must be in the environment (read it from a secret store — never paste it into a file)
export ONDEMAND_API_KEY=…            # server-only
DB_PATH=./data/portfolio.sqlite node node_modules/tsx/dist/cli.mjs scripts/refresh.ts --slugs fervo-energy,perplexity-ai --json /tmp/refresh.json
# options: --slugs a,b,c   --limit 40   --concurrency 3   --json <out>   (exit 1 when status is "error")

# or against a running backend
curl -s -X POST "$BACKEND/refresh" -H "X-Ingest-Secret: $INGEST_SECRET" -H 'content-type: application/json' \
     -d '{"slugs":["fervo-energy"]}' | jq '{status,companies_touched,news_upserted,with_images,dated,errors}'
curl -s "$BACKEND/refresh/status" | jq .
```
The CLI prints the summary (session ids stripped) and, with `--json`, writes the summary plus every item.

## 7. Recorded run (`proof/refresh-run.json`, local backend on 127.0.0.1:3301 against a DB copy, 2026-10-10)
| Slug | Items | With image | Dated | Wall time |
|---|---|---|---|---|
| fervo-energy | 12 | 12 | 9 | 87.7 s |
| perplexity-ai | 12 | 12 | 8 | 115.1 s |
| apptronik | 12 | 12 | 8 | 107.1 s |
| flutterwave | 12 | 12 | 12 | 100.7 s |
| writer | 6 | 6 | 6 | 56.1 s |
| **total** (`rf-2026-10-10T001147Z-965915`, status `ok`) | **54** | **54** (100 %) | **43** (80 %) | concurrency 3 |

Example item: *“2026 Climate Tech Companies to Watch: Fervo Energy …” — technologyreview.com — 2026-10-06 — image `wp.technologyreview.com/…/New-Fervo-Energy-Power-Plant-and-Drilling-Rig.jpg`.*
API key and session ids are redacted in the proof file (`<redacted>`, `<sid>`).

Deployed-backend figures after the first scheduled tick: DB on the deployed backend: 202 news items / 184 with image_url; last runs rf-2026-10-10T002013Z-0682e7 (23 companies, 91 items), rf-2026-10-10T004411Z-8edb67 (40 companies), rf-2026-10-10T011148Z-a5a309 (2 companies, 11 items, 8 with images, 9 dated); scheduler enabled every 60 min, batch 40, next 2026-10-10T02:24:27Z

## 8. Logos (same release, `scripts/resolve-logos.ts` + `scripts/apply-logos.ts`)
`resolve-logos.ts` verifies a real logo per company — existing `logo_url` → `https://logo.clearbit.com/{domain}` → homepage `og:image` → Google
favicon (`s2/favicons?sz=128`) → `<link rel="icon">` — accepting only HTTP 200 + `content-type: image/*` + >500 bytes (1×1 / flat images rejected),
and writes `proof/logo-resolution.json`; `apply-logos.ts` idempotently UPDATEs `companies.logo_url` from that file (`DB_PATH` selects the DB; the firm
record is never touched). `proof/image-coverage.json` (2026-10-10T00:06:55Z): **136 / 136 companies with a verified logo** — 110 existing URLs kept,
20 from `og:image`, 6 favicons, `missing: []`. The frontend renders them through `<CompanyLogo/>` (overview table, picker, sidebar, news cards) with a
Lucide fallback.
