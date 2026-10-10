# B Capital Portfolio Intelligence — Backend

Full backend for the **B Capital Portfolio Intelligence** product: a TypeScript API (Hono) over a Drizzle-ORM SQLite
database seeded from the 135-company brand matrix (+ the B Capital firm record = **136 records**), fed every day at
06:00 UTC by **OnDemand Flow Builder** workflows that call the OnDemand Perplexity plugin (`plugin-1722260873`, the only plugin wired anywhere),
score sentiment with `predefined-deepseek-flash` (DeepSeek Flash v4.1, endpoint_name deepseek-v4.1-flash), and write back through `POST /ingest`. Since the **live-data release (2026-10-09)**
the API also refreshes news itself: `POST /refresh` / an hourly in-process scheduler stream one Perplexity query per company through the
OnDemand Chat API and persist article images and published dates (see [`web/docs/REFRESH_PIPELINE.md`](web/docs/REFRESH_PIPELINE.md)).

```
 OnDemand Flow Builder (cron 0 0 6 * * *)             This repo
 ┌──────────────────────────────────────────┐          ┌────────────────────────────────────────────┐
 │ bcap-focus-daily (5 focus companies)     │  HTTP    │ Hono API  ── Drizzle ORM ── SQLite (sql.js) │
 │ bcap-portfolio-daily-batch-1…6 (~25 ea.) │ ───────► │ POST /ingest  (X-Ingest-Secret)            │
 │  llm nodes: plugins → score → roll-ups   │  (Fable) │ GET /companies … /sentiment/portfolio …    │
 └──────────────────────────────────────────┘          └────────────────────────────────────────────┘
                                                        │ POST /refresh · GET /refresh/status        │
                                                        │  └─(apikey)─► OnDemand Chat API + Perplexity│
                                                        │     plugin-1722260873, every REFRESH_CRON_  │
                                                        │     MINUTES (40 stalest companies)          │
                                                        └────────────────────────────────────────────┘
                                 'Portfolio Plugin' registration: no public endpoint exists (web/proof/plugin-registration.log)
```

## Layout
| Path | Purpose |
|---|---|
| `src/db/schema.ts` | Drizzle schema: `companies`, `news_items`, `sentiment_history`, `sector_rollups`, `ingest_runs` |
| `src/db/client.ts` | sql.js-backed SQLite (pure WASM; no native build), persisted to `DB_PATH` |
| `src/app.ts` | All routes (`/companies`, `/companies/{slug}`, `/companies/{slug}/news`, `/news`, `/sentiment`, `/sentiment/portfolio`, `/search`, `/ingest`, `/refresh`, `/refresh/status`, `/openapi.json`, `/health`) |
| `src/refresh.ts` | Refresh pipeline: OnDemand session + streamed query per company, `plugin_sources` → `news_items` (`image_url`, `published_at`), og:image/date backfill, `ingest_runs` row (`source:"refresh"`) |
| `src/server.ts` | HTTP server + the in-process refresh scheduler (`REFRESH_CRON_MINUTES`) |
| `src/openapi.ts` | OpenAPI **3.1** document (served live; a 3.0.3 copy is registered as the OnDemand plugin schema) |
| `scripts/generate_seed.py` | XLSX → `data/seed.json` (136 spec records + 1 flagged extra, see below) |
| `scripts/migrate.ts`, `scripts/seed.ts` | Drizzle migration + seed (verifies the count) |
| `scripts/smoke.ts`, `scripts/test.ts` | Endpoint smoke test / in-process test suite |
| `scripts/register-plugin.ts` | Attempts to register the deployed API as the OnDemand custom tool 'Portfolio Plugin' (no public endpoint exists as of 2026-10-10 — see `web/proof/plugin-registration.log`) |
| `scripts/refresh.ts` | CLI for the refresh pipeline: `--slugs a,b` `--limit 40` `--concurrency 3` `--json out.json` (needs `ONDEMAND_API_KEY`) |
| `scripts/resolve-logos.ts` | Resolves + HTTP-verifies a real logo per company (existing → clearbit → og:image → Google favicon → `<link rel=icon>`; 200 + `image/*` + >500 B) → `proof/logo-resolution.json` |
| `scripts/apply-logos.ts` | Idempotently UPDATEs `companies.logo_url` from `proof/logo-resolution.json` (`DB_PATH` selects the DB; firm record untouched) |
| `proof/` | `refresh-run.json` (recorded `/refresh` run), `logo-resolution.json`, `image-coverage.json` (136/136 logos), `health-probe.log` |
| `workflows/` | Flow Builder workflow bodies + the script that creates/activates/executes them |
| `config/plugins.json` | Plugin wiring; Perplexity is the only ACTIVE plugin (others `removed` 2026-10-10) |
| `docs/ONDEMAND_SURFACE.md` | Live-documented OnDemand API surface used by this project |
| `docs/DEPLOYMENT_NOTES.md` | Deployment record, platform decision and smoke-test results |
| `web/docs/REFRESH_PIPELINE.md` | How `/refresh` works: auth, schedule, data model, failure handling, manual runs |

## Run locally
```bash
npm ci
npm run seed:json        # python3 + openpyxl; regenerates data/seed.json from data/brand-matrix.xlsx
npm run db:reset         # migrate + seed → data/portfolio.sqlite (prints db_record_count)
npm test                 # 11 in-process tests
INGEST_SECRET=$(openssl rand -hex 32) npm run dev
# refresh pipeline (optional — needs the OnDemand key in the environment, never in a file):
ONDEMAND_API_KEY=… node node_modules/tsx/dist/cli.mjs scripts/refresh.ts --slugs fervo-energy --json /tmp/refresh.json
curl -s -X POST localhost:3000/refresh -H "X-Ingest-Secret: $INGEST_SECRET" -d '{"slugs":["fervo-energy"]}'
curl -s localhost:3000/refresh/status
# logos:
PORTFOLIO_API_URL=http://localhost:3000 node node_modules/tsx/dist/cli.mjs scripts/resolve-logos.ts && node node_modules/tsx/dist/cli.mjs scripts/apply-logos.ts
```

## Refresh endpoints (live-data release)
| Endpoint | Auth | Body / query | Returns |
|---|---|---|---|
| `POST /refresh` | `X-Ingest-Secret` (or Basic password / `?secret=`, same as `/ingest`); 503 if `ONDEMAND_API_KEY` is unset | `{ slugs?: string[], limit?: 1–200 (default 40 stalest), concurrency?: 1–6 (default 3) }` | `{ ingest_run_id, status: ok\|partial\|error, companies_touched, news_upserted, with_images, dated, errors[], companies[], items[], started_at, finished_at }` — synchronous, ~1–2 min per company ÷ concurrency; a concurrent call joins the in-flight run |
| `GET /refresh/status` | none | — | `{ running, last_run (from ingest_runs), last_result, scheduler: { enabled, interval_minutes, batch_limit: 40, next_scheduled_at }, news_items_total, news_items_with_images, timestamp }` |

Recorded run (`proof/refresh-run.json`, 2026-10-10, 5 focus companies, local backend): `rf-2026-10-10T001147Z-965915` status `ok` — 54 items upserted,
**54 with images (100 %)**, **43 dated (80 %)**, 0 errors, 56–115 s per company at concurrency 3. Deployed status after the first tick:
runs rf-2026-10-10T002013Z-0682e7 (23 companies, 91 items), rf-2026-10-10T004411Z-8edb67 (40 companies), rf-2026-10-10T011148Z-a5a309 (2 companies, 11 items, 8 images); DB 202 news items / 184 with image_url; scheduler enabled, 60 min, batch 40, next 2026-10-10T02:24:27Z

## Environment (`.env.example`)
| Variable | Default | Purpose |
|---|---|---|
| `PORT`, `BASE_PATH`, `PUBLIC_BASE_URL`, `DB_PATH` | `3000`, ``, ``, `./data/portfolio.sqlite` | server / DB location |
| `INGEST_SECRET` | *(generate: `openssl rand -hex 32`)* | guards `POST /ingest` **and** `POST /refresh` |
| `ONDEMAND_API_KEY` | *(secret, server only)* | `apikey` header for `/refresh` and the scheduler; never logged, never committed — redact as `<redacted>` in any proof |
| `ONDEMAND_BASE_URL` | `https://api.on-demand.io` | upstream for the refresh pipeline |
| `ONDEMAND_DEFAULT_MODEL` | `predefined-deepseek-flash` | `endpointId` used by refresh queries — DeepSeek Flash v4.1 (endpoint_name deepseek-v4.1-flash) |
| `ONDEMAND_REASONING_MODE` | `medium` | `reasoningMode` sent with every refresh query |
| `ONDEMAND_NEWS_PLUGIN_ID` / `ONDEMAND_NEWS_PLUGIN_IDS` | `plugin-1722260873` | Perplexity — the only plugin used for news (no fallback plugins) |
| `REFRESH_CRON_MINUTES` | `60` | in-process scheduler interval; `0` disables (also disabled when `ONDEMAND_API_KEY` is absent). Run only one instance with it enabled |
| `EARLIEST_TEST_UTC` | `` | legacy; PitchBook plugin removed 2026-10-10 |

## Data notes
* **136 spec records** = 135 Brand_Matrix rows + B Capital. One extra record (`flutterwave`, `in_brand_matrix=false`)
  is included because it is one of the five focus companies in the intelligence JSON but is absent from the matrix;
  `/health.db_record_count` reports the 136 spec records and `db_record_count_total` the 137 physical rows.
* Status changes applied: Capital Rx → **Judi Rx**, Fervo Energy → public (Nasdaq: FRVO), Meesho → public, Code Metal → unicorn.
  Synack, BlackBuck, Geek+ and Bird are **not** in the 135-row matrix; they are recorded in `seed.json.unmatched_status_changes`.
* Every unknown ticket/ownership is an explicit `ESTIMATE:` with the rule used (lead ≈15-25 % of round, participant ≈2-5 %).

## Security
* The OnDemand `apikey` is needed by this service **only** for the refresh pipeline (`ONDEMAND_API_KEY`, server env). It is never
  returned by any endpoint, never logged (session ids are stripped from `/refresh/status`), and never committed; the read endpoints
  work without it. Browser clients must go through a server-side proxy that injects `apikey` → never ship the key to the client.
* `POST /ingest` and `POST /refresh` are protected by the `X-Ingest-Secret` header (HTTP Basic password / `?secret=` accepted for the
  Flow Builder webhook); the secret is generated at build (`openssl rand -hex 32`) and stored only in the env var **`INGEST_SECRET`**
  (server) and the workflow HTTP step. The frontend's `/api/portfolio/*` pass-through blocks both routes.

## Frontend (`web/`)
A Next.js 15 dashboard (overview · company detail · news pulse · OnDemand chat · settings) lives in [`web/`](web/README.md).
Live preview: https://sb-1z9qy0mx48sk.vercel.run (backend: https://sb-7d0g7nrod31w.vercel.run) · hand-off notes: [`web/docs/HANDOFF.md`](web/docs/HANDOFF.md) (§9 = live-data release 2026-10-09).

## 2026-10-10 additions (see CHANGELOG.md)

* `GET /pitchbook`, `GET /pitchbook/:slug`, `POST /pitchbook/ingest`, `POST /pitchbook/run` — PitchBook Investor Finder (`plugin-1777018662`) records with per-field provenance; weekly workflow `6aca3d3faeef8927baa25a05` (Mon 06:00 UTC). Env: `PITCHBOOK_WORKFLOW_ID`.
* Frontend: `/companies` virtualized list, `/api/img` image proxy, `/api/media` document upload relay, `/api/voice/{tts,stt}` voice relays, `/api/pitchbook/*` relays (`INGEST_SECRET` on the frontend server only for "Run now").
* Contracts used: `docs/ONDEMAND_CONTRACTS.md` (fetched live from the OnDemand docs API).
