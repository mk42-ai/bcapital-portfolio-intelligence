# B Capital Portfolio Intelligence — Backend

Full backend for the **B Capital Portfolio Intelligence** product: a TypeScript API (Hono) over a Drizzle-ORM SQLite
database seeded from the 135-company brand matrix (+ the B Capital firm record = **136 records**), fed every day at
06:00 UTC by **OnDemand Flow Builder** workflows that call OnDemand plugins (Perplexity, LinkedIn, Reddit, X, GPT Search),
score sentiment with `predefined-claude-fable-5.1`, and write back through `POST /ingest`.

```
 OnDemand Flow Builder (cron 0 0 6 * * *)             This repo
 ┌──────────────────────────────────────────┐          ┌────────────────────────────────────────────┐
 │ bcap-focus-daily (5 focus companies)     │  HTTP    │ Hono API  ── Drizzle ORM ── SQLite (sql.js) │
 │ bcap-portfolio-daily-batch-1…6 (~25 ea.) │ ───────► │ POST /ingest  (X-Ingest-Secret)            │
 │  llm nodes: plugins → score → roll-ups   │  (Fable) │ GET /companies … /sentiment/portfolio …    │
 └──────────────────────────────────────────┘          └────────────────────────────────────────────┘
                                                        registered on OnDemand as 'Portfolio Plugin'
```

## Layout
| Path | Purpose |
|---|---|
| `src/db/schema.ts` | Drizzle schema: `companies`, `news_items`, `sentiment_history`, `sector_rollups`, `ingest_runs` |
| `src/db/client.ts` | sql.js-backed SQLite (pure WASM; no native build), persisted to `DB_PATH` |
| `src/app.ts` | All routes (`/companies`, `/companies/{slug}`, `/news`, `/sentiment`, `/sentiment/portfolio`, `/search`, `/ingest`, `/openapi.json`, `/health`) |
| `src/openapi.ts` | OpenAPI **3.1** document (served live; a 3.0.3 copy is registered as the OnDemand plugin schema) |
| `scripts/generate_seed.py` | XLSX → `data/seed.json` (136 spec records + 1 flagged extra, see below) |
| `scripts/migrate.ts`, `scripts/seed.ts` | Drizzle migration + seed (verifies the count) |
| `scripts/smoke.ts`, `scripts/test.ts` | Endpoint smoke test / in-process test suite |
| `scripts/register-plugin.ts` | Registers the deployed API as the OnDemand custom tool 'Portfolio Plugin' |
| `workflows/` | Flow Builder workflow bodies + the script that creates/activates/executes them |
| `config/plugins.json` | Plugin wiring; `plugin-1777018662` is **DEFERRED** |
| `docs/ONDEMAND_SURFACE.md` | Live-documented OnDemand API surface used by this project |
| `docs/DEPLOYMENT_NOTES.md` | Deployment record, platform decision and smoke-test results |

## Run locally
```bash
npm ci
npm run seed:json        # python3 + openpyxl; regenerates data/seed.json from data/brand-matrix.xlsx
npm run db:reset         # migrate + seed → data/portfolio.sqlite (prints db_record_count)
npm test                 # 11 in-process tests
INGEST_SECRET=$(openssl rand -hex 32) npm run dev
```

## Data notes
* **136 spec records** = 135 Brand_Matrix rows + B Capital. One extra record (`flutterwave`, `in_brand_matrix=false`)
  is included because it is one of the five focus companies in the intelligence JSON but is absent from the matrix;
  `/health.db_record_count` reports the 136 spec records and `db_record_count_total` the 137 physical rows.
* Status changes applied: Capital Rx → **Judi Rx**, Fervo Energy → public (Nasdaq: FRVO), Meesho → public, Code Metal → unicorn.
  Synack, BlackBuck, Geek+ and Bird are **not** in the 135-row matrix; they are recorded in `seed.json.unmatched_status_changes`.
* Every unknown ticket/ownership is an explicit `ESTIMATE:` with the rule used (lead ≈15-25 % of round, participant ≈2-5 %).

## Security
* The OnDemand `apikey` is **never** stored or needed by this service; it lives only in the environment of the
  machine that runs `scripts/register-plugin.ts` / `workflows/build.ts`. Browser clients must go through a
  server-side proxy that injects `apikey` from a header such as `x-ondemand-key` → never ship the key to the client.
* `POST /ingest` is protected by the `X-Ingest-Secret` header; the secret is generated at build (`openssl rand -hex 32`)
  and stored only in the env var **`INGEST_SECRET`** (server) and the workflow HTTP step.

## Frontend (`web/`)
A Next.js 15 dashboard (overview · company detail · news pulse · OnDemand chat · settings) lives in [`web/`](web/README.md).
Live preview: https://sb-3h35jqofd2sz.vercel.run · hand-off notes: [`web/docs/HANDOFF.md`](web/docs/HANDOFF.md).
