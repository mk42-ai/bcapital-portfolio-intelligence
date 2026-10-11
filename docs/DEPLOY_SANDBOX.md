# Sandbox deployment — B Capital Portfolio Intelligence (API + web)

How the pass-3 preview deployments were produced: **one ephemeral Vercel Sandbox per tier** (backend `node dist/server.js` on 4000,
frontend `next start` on 3000), or one sandbox publishing both ports. Never `vercel deploy` / `--prod`: the only target is `sandbox create`
and the preview URL is always `https://sb-<rand>.vercel.run`. Sandboxes are ephemeral (**≈2 h expiry**, see pitfalls) — redeploy, do not "fix" an expired one.

Current test targets (main @ 7c43344): frontend `https://sb-1gizcktepfgc.vercel.run`, backend `https://sb-3lo1xqgc9bdb.vercel.run`.

## 1. Create the sandbox

```bash
# Vercel credentials come from the environment: VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID (never hardcode them)
sandbox create --runtime node22 --publish-port 3000 --publish-port 4000     # → SANDBOX_ID + one preview URL per port
```

Record `SANDBOX_ID` and both URLs (`PREVIEW_URL` = port 3000 → frontend, port 4000 → backend). If you split tiers into two sandboxes,
create the **backend first** so its URL can be written into the web `.env` before the Next build (`NEXT_PUBLIC_*` values are inlined at build time).

## 2. Copy the tree (tarball, excluding caches)

```bash
cd <repo>
tar czf /tmp/bcap.tgz \
  --exclude=node_modules --exclude=.git --exclude=.next --exclude=proof --exclude=web/proof \
  --exclude=test-results --exclude=web/test-results --exclude=.ui-proof \
  .
sandbox copy /tmp/bcap.tgz $SANDBOX_ID:/vercel/sandbox/bcap.tgz
sandbox exec --workdir /vercel/sandbox $SANDBOX_ID bash -lc 'mkdir -p app && tar xzf bcap.tgz -C app && rm bcap.tgz'
```

`node_modules` in the worktrees are symlinks and `.next` is machine-specific — both must be rebuilt inside the sandbox. `proof/` is several
hundred MB of screenshots/logs and is never needed at runtime.

## 3. Write the `.env` files (never commit them)

Backend — `app/.env` (read by `src/config.ts`):

```dotenv
PORT=4000
PUBLIC_BASE_URL=https://sb-<backend>.vercel.run        # advertised in /openapi.json servers[]
INGEST_SECRET=<32-byte hex, openssl rand -hex 32>        # X-Ingest-Secret / basic password / ?secret= for POST /ingest
ONDEMAND_API_KEY=<owner key>                             # header `apikey` for api.on-demand.io (media re-sign, refresh, workflow relay)
ONDEMAND_BASE_URL=https://api.on-demand.io
ONDEMAND_DEFAULT_MODEL=predefined-deepseek-flash
ONDEMAND_REASONING_MODE=medium
# optional: ONDEMAND_NEWS_PLUGIN_IDS, ONDEMAND_ENRICH_PLUGIN_IDS, PITCHBOOK_WORKFLOW_ID, REFRESH_CRON_MINUTES, DB_PATH, DB_READONLY
```

Frontend — `app/web/.env` (same directory as `web/package.json`; `NEXT_PUBLIC_*` is inlined into the client bundle at `next build`):

```dotenv
NEXT_PUBLIC_PORTFOLIO_API_URL=https://sb-<backend>.vercel.run   # browser → API
PORTFOLIO_API_URL=https://sb-<backend>.vercel.run               # server components / route handlers → API
NEXT_PUBLIC_SITE_URL=https://sb-<frontend>.vercel.run           # canonical / OG URLs
NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID=plugin-1791713636               # Portfolio Plugin (Perplexity = plugin-1722260873)
ONDEMAND_API_KEY=<owner key>                                     # server-side only: /api/chat SSE bridge
INGEST_SECRET=<same value as the API>                            # server-side only: upload/ingest relay
```

Both `.env` files are gitignored. Export them into the process that starts each server (`set -a; . ./.env; set +a`) — a value exported only
in your own shell is lost on the next restart.

## 4. Install + build both tiers

```bash
sandbox exec --workdir /vercel/sandbox/app $SANDBOX_ID bash -lc 'npm ci && npm run build'                       # tsc → dist/ + openapi.json
sandbox exec --workdir /vercel/sandbox/app/web $SANDBOX_ID bash -lc 'set -a; . ./.env; set +a; npm ci && npm run build'   # next build → .next/
```

The web build takes 2–4 minutes on the sandbox CPU; run it with the `.env` exported or every `NEXT_PUBLIC_*` value is `undefined` in the bundle.
Confirm the outputs exist: `ls app/dist/server.js app/openapi.json` and `cat app/web/.next/BUILD_ID`.

## 5. Start the servers

```bash
# API
sandbox exec --workdir /vercel/sandbox/app $SANDBOX_ID bash -lc \
  'set -a; . ./.env; set +a; nohup node dist/server.js > /tmp/api.log 2>&1 &'
# web
sandbox exec --workdir /vercel/sandbox/app/web $SANDBOX_ID bash -lc \
  'set -a; . ./.env; set +a; nohup npm run start > /tmp/web.log 2>&1 &'      # next start -H 0.0.0.0 -p 3000
```

## 6. Poll until healthy

```bash
for i in $(seq 1 30); do curl -fsS "https://sb-<backend>.vercel.run/health" && break; sleep 2; done
for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w '%{http_code}' "https://sb-<frontend>.vercel.run/overview"); [ "$c" = 200 ] && break; sleep 3; done
```

`/health` returns `{status, db_record_count, db_record_count_total, news_total, …}`; `/overview` must be 200 (the onboarding gate is client-side,
so the document itself is always 200 — append `?skip=1` when you need to land past it in a browser).

## 7. Known pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| **Old `next-server` still running** after a rebuild | port 3000 serves the previous build, or `npm run start` dies with `EADDRINUSE` | `pkill -f next-server; pkill -f "next start"` (and `pkill -f "node dist/server.js"` for the API) **before** restarting; verify with `ps aux \| grep next` |
| **Stale build served** | UI does not reflect the pushed commit | compare `cat web/.next/BUILD_ID` before/after the build — the id must change; if it did not, the build failed silently — read the end of the build log |
| **`NEXT_PUBLIC_*` missing** | blank data / API calls to `undefined/...` | they are inlined at build time: write `web/.env` **before** `npm run build`, and rebuild after changing them |
| **Backend URL unknown at web build time** | same as above | create/start the backend first (or use one sandbox with both ports — its URLs are known at `sandbox create`) |
| **2 h sandbox expiry** | preview returns 5xx / connection refused for everything | sandboxes are ephemeral; do not debug — redeploy from step 1 and update the URLs in `T5-README.md` / test configs |
| `sandbox copy` of the whole repo | takes minutes / fills the disk | always copy the tarball from step 2 with the exclusions |
| Favicon / sourcemap / `_rsc` aborts in console | noise in Playwright runs | already allow-listed in `web/e2e/helpers.ts` and `web/scripts/smoke-routes.mjs` |
| Secrets | leaked in logs/commits | never echo `ONDEMAND_API_KEY` / `INGEST_SECRET`; `.env` files stay in the sandbox only |

## 8. Smoke the deployment (`web/scripts/smoke-routes.mjs`)

```bash
cd web
node scripts/smoke-routes.mjs --base https://sb-<frontend>.vercel.run --api https://sb-<backend>.vercel.run --label after
# optional: CHROME_PATH=/path/to/chromium  SMOKE_TIMEOUT_MS=60000  ONDEMAND_API_KEY=… (primes the key in localStorage like e2e/helpers.ts)
```

What it checks — `/overview /companies /news /chat?skip=1 /artifacts /settings` plus `/company/fervo-energy` and `/compare?slugs=fervo-energy,apptronik`
(a32; a 404 there is reported as *INFO not deployed*, never a failure) at **1440×900 and 390×844**, each in a fresh browser context with onboarding primed:

- main document HTTP **200**; **0** console errors / pageerrors / failed requests (favicon, sourcemap, `_rsc` aborts, ORB blocks ignored);
- no horizontal overflow (`scrollingElement.scrollWidth <= innerWidth + 1`);
- light-only: `html.light` present and `<body>` background `rgb(255, 255, 255)`;
- nav rail `[data-testid=nav-rail]` (`<aside>` in `nav-rail.tsx`) **≤ 224 px** at desktop; below the `lg` breakpoint the same element is the full-width top bar and is reported as `topbar` (info);
- **no blue hue** in `color` / `background-color` / `border-*-color` of the first 400 elements (hue 190–260°, sat > 0.15, chroma > 0.15 — the rule in `web/src/lib/hue-audit.ts`);
- backend `GET /health`, `/openapi.json`, `/news/summary`, `/companies?limit=1` → 200 + JSON.

Output: a PASS/FAIL table on stdout, the full record in `web/proof/pass-3/smoke/<label>.json`, exit code **1 on any hard failure**
(status ≠ 200, console/page errors, overflow, missing `html.light`/white body, blue hit, rail > 224 px, API non-200/non-JSON). Runs in ≈45 s on one CPU
(16 page loads + 4 fetches, sequential). Baseline: `web/proof/pass-3/smoke/before.json` (20/20 against the URLs above).
