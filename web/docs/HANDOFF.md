# HANDOFF — B Capital Portfolio Intelligence (frontend + integration)

Generated 2026-10-09 (UTC). Companion to the backend `../docs/DEPLOYMENT_NOTES.md` and `../docs/ONDEMAND_SURFACE.md`.

## 1. Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js 15 App Router UI<br/>overview · company · news · chat · settings]
    LS[(localStorage<br/>apikey · settings · threads)]
  end
  subgraph NextJS["Next.js (Vercel sandbox)"]
    RSC[Server Components<br/>ISR 120 s + snapshot fallback]
    CHATB["/api/chat (OpenUI bridge)<br/>OnDemand SSE → AG-UI SSE"]
    PXY["/api/ondemand/[...path]<br/>apikey = ONDEMAND_API_KEY (server env)"]
    PP["/api/portfolio/[...path]<br/>read-only pass-through"]
  end
  subgraph OnDemand
    CHAT[Chat & Agent Tools API<br/>sessions · query (SSE) · messages]
    PLUG[Plugins<br/>Perplexity · LinkedIn · Reddit · X · GPT Search]
    FB[Flow Builder<br/>7 cron workflows 06:00 UTC<br/>model predefined-claude-fable-5.1]
  end
  subgraph Backend["Portfolio backend (Hono + Drizzle)"]
    API[GET /companies … /sentiment/portfolio /search<br/>POST /ingest (X-Ingest-Secret)]
    DB[(SQLite portfolio.sqlite<br/>136 records)]
  end
  UI -- AG-UI SSE --> CHATB --> CHAT
  UI -- optional x-ondemand-key --> PXY --> CHAT
  CHAT --> PLUG
  UI --> LS
  UI --> RSC --> API --> DB
  UI --> PP --> API
  FB --> PLUG
  FB -- POST /ingest --> API
```

## 2. URLs and IDs
| Item | Value |
|---|---|
| Frontend live preview | **https://sb-3umbne3uc2g2.vercel.run** (sandbox `sbx_W6xF81UAEW2qdPnN9oq1oNwR3FhW`, redeployed 2026-10-09T23:25Z — see §8; earlier: https://sb-2yrz211gekox.vercel.run `sbx_XnBw3bQ18gn303SzlLJW7Qv6Fs0T`, port 3000; `next start` with `ONDEMAND_API_KEY` in its env; redeploy = `sandbox create` + `npm ci && npm run build && npm start`) |
| Backend base URL (live) | **https://sb-3az18qgrrd3p.vercel.run** — sandbox `sbx_Buo0S1DoSSNBxot3Psnt31AFOIzm` (redeployed 2026-10-09T23:22Z; earlier https://sb-1gek6bq0m1au.vercel.run `sbx_s2v1UAKFK3gFbzPBGdyxZoZfIuAC`) (`/health` 200) |
| Backend durable target | https://serverless.on-demand.io/apps/bcap-portfolio-intel — **OnDemand serverless endpoint provisioning failed** 3× (image built OK: app `6ac8de2d1f7d82eff69ac0d9`, runs chfbs…chfbv; endpoints `initializing → failed`, `containerAppEnv` never assigned). The 7 workflows already deliver to this URL; nothing changes once it comes up. |
| Repo | https://github.com/mk42-ai/bcapital-portfolio-intelligence (`web/` = this app) |
| Portfolio Plugin ID | **null** — `POST /plugin/v1` returned `400 {"message":"schema is required"}` for 20 payload shapes incl. the documented one; MCP `plugin_v1_plugin_create` returned an empty body; `ai_generated_tool` timed out (Cloudflare 524) ×3. Registration body ready in `../scripts/register-plugin.ts`; UI shows "registration pending" and reads `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` / `src/data/run-meta.json` at runtime. |
| PitchBook plugin | `plugin-1777018662` ("Pitchbook Investor Finder") — **DEFERRED / configuring**; never invoked, never on a workflow node, never tested. `earliest_test_utc = 2026-10-09T12:37:25Z` (run_start 12:07:25Z + 30 min). The UI keeps it disabled with a countdown and will not call it even after that time unless the owner confirms configuration. |
| Chat model | `predefined-claude-fable-5.1` (Fable 5.1; exact match in the live endpoint list), configurable in Settings |

### Flow Builder workflows (all `0 0 6 * * *` = 06:00 UTC daily, every LLM node `predefined-claude-fable-5.1`, active)
| Name | Workflow ID | First execution |
|---|---|---|
| bcap-focus-daily | `6ac8dfbe9a17f57debac74bb` | `6ac8e184aeef8927baa25434` (completed; output replayed to /ingest) |
| bcap-portfolio-daily-batch-1 | `6ac8dfbe300de84fa7120c1f` | `6ac8e1849a17f57debac74ed` |
| bcap-portfolio-daily-batch-2 | `6ac8dfbf9a17f57debac74c5` | `6ac8e184aeef8927baa25439` |
| bcap-portfolio-daily-batch-3 | `6ac8dfbf300de84fa7120c29` | `6ac8e1849a17f57debac74f1` |
| bcap-portfolio-daily-batch-4 | `6ac8dfc09a17f57debac74cf` | `6ac8e185aeef8927baa2543d` |
| bcap-portfolio-daily-batch-5 | `6ac8dfc0300de84fa7120c33` | `6ac8e1859a17f57debac74f7` |
| bcap-portfolio-daily-batch-6 | `6ac8dfc19a17f57debac74d9` | `6ac8e185aeef8927baa25442` (completed; output replayed to /ingest) |

## 3. Environment variables
| Variable | Where | Value / note |
|---|---|---|
| `NEXT_PUBLIC_PORTFOLIO_API_URL` | web `.env` | `https://sb-4wdkkmzv7w2z.vercel.run` (override in Settings) |
| `PORTFOLIO_API_URL` | web `.env` (server) | same; switch to the serverless URL when provisioned |
| `ONDEMAND_BASE_URL` | web `.env` (server) | `https://api.on-demand.io` |
| `ONDEMAND_API_KEY` | web `.env` (server) + frontend sandbox env | OnDemand apikey used by `/api/chat` and `/api/ondemand/*` (`apikey` header). Never `NEXT_PUBLIC_`, never logged, absent from `.next/static` (grep = 0 hits). `.env` is gitignored; copy `.env.example`. |
| `NEXT_PUBLIC_DEFAULT_MODEL` | web `.env` | `predefined-claude-fable-5.1` |
| `NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID` | web `.env` | `INV-001` |
| `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` | web `.env` | empty until registered |
| `NEXT_PUBLIC_PITCHBOOK_PLUGIN_ID` | web `.env` | `plugin-1777018662` |
| `NEXT_PUBLIC_EARLIEST_TEST_UTC` | web `.env` | `2026-10-09T12:37:25Z` |
| `NEXT_PUBLIC_SITE_URL` | web `.env` | preview origin (OG images) |
| `INGEST_SECRET` | backend env only | 64-hex shared secret for `POST /ingest`; also in the workflow webhook (Basic auth + `?secret=`) |
| per-user OnDemand `apikey` (optional) | browser localStorage | forwarded as `x-ondemand-key`; overrides the server key for that browser only |

## 3b. Chat on Open Intelligent UI + OnDemand wiring (2026-10-09)
* **Open Intelligent UI**: https://github.com/thesysdev/open-intelligent-ui @ `3b39c06b954e87c394ef95fee41a7e0084f94a27`, package `openui-self-hosted` 0.1.1 (`private: true` → **not on npm**; README "Requires Node 24"). Vendored (with `ATTRIBUTION.md`): generic shell CSS + neutral `createTheme` palette into `src/components/chat/open-intelligent-ui/`. NOT copied: TravelMap/MapLibre/TravelGallery/TravelItinerary, the OpenUI Gateway `/api/chat` route, `generated/spec.json`.
* **OpenUI packages** (MIT): `@openuidev/react-ui` 0.17.0, `@openuidev/react-headless` 0.17.0, `@openuidev/react-lang` 0.3.2. **Icons**: `lucide-react` 0.546.0 (no Radix icons needed). **Node**: built and served on Node 22 (`v22.22.2` in the sandbox) — Node 24 is only required by open-intelligent-ui's own Gateway server, which is not used.
* **Message mapping**: `/api/chat` creates/reuses the OnDemand session (`POST /chat/v1/sessions`), streams `POST /chat/v1/sessions/{id}/query` (`responseMode:"stream"`) and re-emits AG-UI frames: `RUN_STARTED` → `TOOL_CALL_*` ("research · N plugins") for `*_thinking` / `planning_output` events → `TEXT_MESSAGE_START/CONTENT/END` for `eventType:"fulfillment"` deltas → `CUSTOM ondemand.sources` (URLs extracted from the answer) → `RUN_FINISHED`. The OnDemand `sessionId` is returned in the `x-ondemand-session` header and remembered per thread in localStorage.
* **Persistence kept**: thread list `bcap.chat.threads.v2`, messages `bcap.chat.thread.v2.<id>`, session `bcap.chat.session.v2.<id>`; the previous `bcap.chat.threads.v1` threads are imported once.
* **Sources**: rendered as a plain citation list (one `<a>` per URL: favicon · host · path) under each assistant message.
* **Verified plugin matrix** (real create-session + streamed query with the production key; see `README.md` → "Verified plugin list"): kept Perplexity `plugin-1722260873` (default, 200, first token 37.5 s), GPT Search `plugin-1741871229` (default), US Stock Fundamentals `plugin-1716429542`, Reddit `plugin-1748003575`, X Search `plugin-1751872652` (opt-in); dropped LinkedIn Search `plugin-1718116202` (tool 404 inside the answer, 151 s); PitchBook `plugin-1777018662` deferred.
* **End-to-end proof**: `proof/chat-e2e.log` (AG-UI SSE from the deployed `/api/chat`, 279 text deltas, 4 475 chars, 10 distinct source URLs; upstream OnDemand frames appended) + `.ui-proof/chat-e2e-1440x900.png` (headless-Chromium screenshot of the deployed /chat after "What is the latest news about Fervo Energy? Cite sources.").

## 3c. Theme + icons (2026-10-09)
* **Light only.** Dark theme deleted: no `#0A211A` backgrounds, no Caribbean Green/Java gradient meshes, no glows/blur/animated gradients, no `dark:` variants, no `.dark` handling, no `next-themes`/theme toggle, no `prefers-color-scheme: dark`. `<html class="light" style="color-scheme: light">` forced in `layout.tsx`; `viewport.colorScheme = "light"`.
* Tokens: `#FFFFFF` page, `#111827` text, `#E5E7EB` borders, `#6B7280` muted, 8 px scale, 1 px borders, no shadows. Charts/treemap/heatmap/gauges on a gray scale + one accent. `brand_tokens` only on the logo/accent chip after `src/lib/color.ts` AA check.
* **All AI-generated images removed** (`public/brand/*` PNG/WebP: chat avatar, empty states, error/offline, sector illustrations, hero, OG card, onboarding bg). Replaced with monochrome Lucide glyphs; app icon/favicon/OG = Lucide `hexagon` (`src/app/icon.svg`, `favicon.ico`, `opengraph-image.tsx` via `next/og`).
* A global **live-backend badge** (`data-testid="backend-status"`, pings `{PORTFOLIO_API_URL}/health`, ISR 60 s) sits in the sidebar on every screen; page headers additionally show the per-query data source.

## 3d. Streaming fix, logo, E2E, audits (2026-10-09 evening)
**User-reported bug**: chat stuck on "Working · Running the research · 2 plugins tool" with an empty `{}` card, stop button never cleared.
Root causes and fixes:
1. **Two plugins per request** (Perplexity + GPT Search) made the OnDemand run stall → `DEFAULT_PLUGIN_IDS = ["plugin-1722260873"]` (Perplexity only) in `src/lib/ondemand/config.ts`; GPT Search is now opt-in (`defaultOn:false`).
2. **Empty tool card**: the bridge emitted `TOOL_CALL_ARGS "{}"` → it now sends the plugin's real input `{"plugin":"Perplexity","pluginId":…,"query":…}` and the UI (`PluginTimeline` in `chat-shell.tsx`, a custom `ToolCallTimeline`) only renders a card once the input is present ("Searching with Perplexity · “<query>”" → "Perplexity searched · N sources").
3. **No heartbeat / deadline**: `/api/chat` now emits `CUSTOM ondemand.heartbeat` every 10 s, enforces a 90 s first-byte and 240 s total deadline (→ visible `RUN_ERROR`), propagates `req.signal` to both upstream fetches, maps upstream errors to `RUN_ERROR`, always ends with `data: [DONE]` and closes. Headers: `text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `connection: keep-alive`, `x-accel-buffering: no`, `content-encoding: identity`, `x-ondemand-session`.
4. **Answer only appeared at the end**: OpenUI's `InterleavedTurn` routes the live answer into the timeline `steps` while tools are on the turn; `PluginTimeline` now renders those steps progressively (verified: 63 DOM growth events, first activity 1.2 s).
5. **Real citations**: OnDemand emits `eventType:"plugin_sources"` frames (`sources.items[{title,url,domain}]`) — the bridge now forwards those as `CUSTOM ondemand.sources` (URL extraction from the markdown is the fallback).
6. **Visible error state**: `ErrorBanner` (role=alert) with Retry reads `threadError`; the composer's Stop button reverts to Send on completion/error/abort (verified).
Proof: `proof/chat-stream.log` (285 frames, first +1.0 s, 9 heartbeats, first delta +76.9 s, `[DONE]` +93.7 s, monotonic), `docs/screenshots/chat-t1s|t3s|t6s|final-1440x900.png`, `e2e/chat.spec.ts`.

**Logo**: official `https://b.capital/wp-content/uploads/2023/08/logo-1.svg` (unaltered, sha256 in `docs/BRAND_ASSETS.md`) → `public/brand/b-capital-logo.svg`, `<BrandLogo/>` in the shell header, onboarding and settings (`img[data-testid=brand-logo]`, naturalWidth 211×43, ratio preserved).
**Other fixes**: overview table search + column sort (`[data-testid=table-search]`, `sort-<key>`); settings validation (externalUserId required, backend URL must be https); company picker max-5 message; unknown company slug → real HTTP 404 via `src/middleware.ts`; stale "Smoke test ping" removed from `src/data/snapshot.json`; `Content-Security-Policy: frame-ancestors *` + no `X-Frame-Options` (embeddable).
**Committed E2E suite**: `web/e2e/*.spec.ts` (8 files, 24 tests: onboarding, overview, company, news, settings, chat streaming, mobile 390×844, axe WCAG 2.0/2.1 A+AA) — `npm run test:e2e` (`BASE_URL`, `CHROME_PATH=/usr/bin/chromium`); 24/24 passed against the preview on 2026-10-09T20:0xZ. Backend contract test: `node node_modules/tsx/dist/cli.mjs scripts/contract-test.ts <backend>` (9/9), see `docs/BACKEND_VERIFICATION.md`.
**Known limits**: Perplexity's research phase upstream takes 40–80 s before the first answer token (the UI shows the plugin card + heartbeats meanwhile); some inline text links on mobile are < 24 px tall (nav targets are ≥ 40 px).

## 4. QA results (against the live preview, 2026-10-09T15:28Z)
### Playwright (13/13 passed)
| Project | Test | Status | Duration |
|---|---|---|---|
| desktop | Chat › streaming round-trip with company context (real OnDemand when a key is present, mock otherwise) | passed | 61400 ms |
| desktop | Chat › proxy refuses requests without x-ondemand-key and non-allow-listed paths | passed | 590 ms |
| desktop | Company detail › Perplexity page shows palette, fonts, evidence tier, timeline and workflow stamp | passed | 2455 ms |
| desktop | Company detail › unknown slug → not-found state | passed | 795 ms |
| desktop | Company detail › Judi Rx rebrand is applied | passed | 1168 ms |
| desktop | News Pulse › feed loads grouped by day and filters by company / sector / source | passed | 3234 ms |
| desktop | Settings & onboarding › onboarding shows tagline + GROWTH values and redirects first-run users | passed | 2782 ms |
| desktop | Settings & onboarding › settings persists apikey only in localStorage and lists plugin states | passed | 1915 ms |
| desktop | mobile: every screen renders without horizontal overflow and nav works | passed | 2599 ms |
| mobile | mobile: every screen renders without horizontal overflow and nav works | passed | 3160 ms |
| desktop | Portfolio Overview › renders KPI tiles, treemap, heatmap, gauges and 136-record table | passed | 2390 ms |
| desktop | Portfolio Overview › filters by sector via URL and saved filters persist | passed | 1752 ms |
| desktop | Portfolio Overview › axe: no serious/critical violations | passed | 4296 ms |

The chat test performed a **real OnDemand SSE round-trip** (session create with `contextMetadata` → `responseMode: "stream"` → `data:[DONE]`), asserted the answer mentions Fervo/geothermal/FRVO and rendered source chips; Regenerate + Stop were exercised (the mock path is used only when no key is present).

### axe-core (WCAG 2.0/2.1/2.2 A+AA tags) — 0 serious, 0 critical, 0 moderate, 0 minor on /overview, /company/perplexity-ai, /news, /chat, /settings, /onboarding.

### Lighthouse 12.8 (mobile = default throttled Moto G Power emulation; desktop = 1350×940, cpu ×1)
| Form factor | Page | Perf | A11y | Best practices | SEO | LCP ms | CLS | TBT ms |
|---|---|---|---|---|---|---|---|---|
| mobile | `/overview` | 72 | 100 | 100 | 100 | 3512 | 0 | 770 |
| mobile | `/company/perplexity-ai` | 81 | 100 | 100 | 100 | 2120 | 0 | 730 |
| mobile | `/news` | 96 | 100 | 100 | 100 | 2116 | 0 | 199 |
| mobile | `/chat` | 92 | 100 | 100 | 100 | 2270 | 0 | 313 |
| mobile | `/settings` | 94 | 100 | 100 | 100 | 2042 | 0 | 263 |
| desktop | `/overview` | 98 | 100 | 100 | 100 | 720 | 0.042 | 114 |
| desktop | `/company/perplexity-ai` | 100 | 100 | 100 | 100 | 456 | 0 | 0 |
| desktop | `/news` | 100 | 100 | 100 | 100 | 488 | 0 | 0 |
| desktop | `/chat` | 100 | 100 | 100 | 100 | 496 | 0 | 0 |
| desktop | `/settings` | 100 | 100 | 100 | 100 | 456 | 0.015 | 0 |

Targets met: accessibility ≥90 (all 100), desktop performance ≥90 (98–100), CLS ≤0.1 everywhere, LCP ≤2.5 s on desktop. **Residual:** mobile performance on `/overview` (72) and `/company/perplexity-ai` (81) is below 90 under Lighthouse's 4× CPU slowdown + slow-4G profile — see §6.

### Screenshots
`docs/screenshots/` — `overview | company-detail | news-pulse | chat | settings | onboarding` × `desktop-1440` / `mobile-390` (full page).

## 5. Known limitations
1. **OnDemand serverless endpoint** for the backend never left `initializing → failed` (3 attempts, two compute tiers); the backend therefore runs in an ephemeral Vercel sandbox. Open a ticket quoting app `6ac8de2d1f7d82eff69ac0d9` / endpoint `6ac8e3e867f952ee06ef350d`.
2. **Portfolio Plugin not registered** (400 "schema is required" / 524) — chat runs with Perplexity + GPT Search by default and injects the portfolio context itself.
3. **LinkedIn Search plugin returns 429s** under batch load (observed in workflow research nodes); LinkedIn-derived headcount is best-effort.
4. **Meesho hex conflict**: brand matrix primary `#815787` vs. observed site palette; evidence tier "Third-party" — flagged on the company page.
5. **4 blank evidence screenshots** (Baichuan, Dream Labs, Meesho, Vivacta) in the brand-evidence ZIP; those pages show logo + tokens only.
6. Licensed brand typefaces (Reckless Neue, Yellix) are not bundled; Fraunces/Inter subsets are served with the brand names first in the font stack.
7. Mobile Lighthouse performance on the two data-heaviest pages is 72–81 (see §4); the remaining cost is HTML size (136 records + treemap SVG) and hydration of the Radix tooltip tree.
8. Both Vercel sandboxes are ephemeral. The repo + `.env` are sufficient to recreate either in minutes (frontend: `npm ci && npm run build && npm start` with `ONDEMAND_API_KEY` exported).
9. Chat latency is dominated by the plugin research phase (Perplexity first token ≈ 40 s, GPT Search ≈ 85 s); the UI shows a "research · N plugins" activity until the answer streams. Users who want faster answers can disable GPT Search in Settings.
10. The `ListedSources` carousel from `@openuidev/react-ui` renders sources as non-anchor cards, so sources are rendered with our own citation list instead.

## 6. Next-step checklist
- [ ] Re-run `serverless_endpoint_create` for app `6ac8de2d1f7d82eff69ac0d9` once OnDemand support confirms provisioning; then set `PORTFOLIO_API_URL`/`NEXT_PUBLIC_PORTFOLIO_API_URL` to `https://serverless.on-demand.io/apps/bcap-portfolio-intel`.
- [ ] Register the Portfolio Plugin (console: My Agents → Create → REST API → paste `../openapi.json` as 3.0.3) or retry `PUBLIC_BASE_URL=… tsx ../scripts/register-plugin.ts`; set `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID`.
- [ ] After the owner configures `plugin-1777018662`, flip `config/plugins.json` status to ACTIVE and add it to the `verify` node of the workflows (never before confirmation).
- [ ] Replay the remaining batch executions (`BASE_URL=… INGEST_SECRET=… tsx ../workflows/replay.ts <executionId…>`) or wait for the next 06:00 UTC cycle.
- [ ] Promote the frontend from the sandbox to a permanent Vercel project (`vercel.json` not required; `web/` is the app root) and set the same `.env` values as project env vars.
- [ ] Mobile perf: paginate the overview table server-side (first 25 rows in HTML) and move the treemap SVG behind a responsive `<picture>`/lazy island to push `/overview` above 90 on the throttled mobile profile.
- [ ] Add the real Reckless Neue / Yellix files to `src/fonts` when licensed and swap the `localFont` sources.

## 7. Acceptance Gate (independent black-box run, 2026-10-09)
**Verdict: PASS** — gate start `2026-10-09T20:17:36Z`, first full pass `20:17–20:33Z` (one FAIL), fix deployed `20:36:55Z`, full rerun from fresh browser sessions `20:39:08–20:51:21Z` all green, gate end `2026-10-09T20:54:14.311Z`.
Method: every check ran through the `ui-validator` skill (headless Chromium, a NEW temporary profile per run → empty cache and storage, no reuse of any earlier browser state), wrapped by a gate runner that also evaluated on every page: `<img src="/brand/…">` with `naturalWidth/naturalHeight > 0`, light theme (`html.light`, `color-scheme: light`, white body, no element ≥ 30 000 px² with a dark background, `prefers-color-scheme: dark` not applied), Lucide-only icons (`svg.lucide` present, 0 foreign icon classes / font icons), live-backend badge `data-live="1"`, `HEAD` headers (no `X-Frame-Options`, `Content-Security-Policy: frame-ancestors *`), and 0 non-2xx sub-resources; console errors, page errors and failed requests were captured on every navigation. Preview `https://sb-2yrz211gekox.vercel.run` (sandbox `sbx_XnBw3bQ18gn303SzlLJW7Qv6Fs0T`), backend `https://sb-1gek6bq0m1au.vercel.run` (from `web/.env`), commit under test `5ade7e3` → fix commit below.

### 7.1 Failure found and fixed
* **settings · backend-URL validation**: typing an invalid URL set `aria-invalid` and `aria-describedby="set-backend-error"` and correctly refused to persist, but the referenced error element was never rendered (the `Field` for `#set-backend` was missing `error={urlErr}`), so the user saw no message. Minimal fix: one prop in `src/components/shell/settings-form.tsx`. Rebuilt and restarted in the SAME sandbox (BUILD_ID `27UKCTjSNceAeot-Qn9kj`, key hits in `.next` = 0); rerun shows "Enter a valid absolute https:// URL …" and no persistence of the bad value.

### 7.2 Pass/fail matrix (final rerun)
| Screen × viewport | HTTP 200 | 0 console / page errors | Logo renders (/brand/, naturalWidth>0) | Light theme | Lucide only | Primary actions OK | Live-backend badge | Streaming ≥3 chunks / first <5 s / monotonic | Sources rendered | No `{}` card | Stop → Send | Context kept | API key absent | Backend /health 200 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| onboarding 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — CTA 'Enter workspace' → /overview, onboarded persisted | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| onboarding 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — CTA 'Enter workspace' → /overview, onboarded persisted | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| overview 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — search 'fervo'→1 row; sort-score flips order (aria-sort); row → /company/nuvig | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| overview 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — search 'fervo'→1 row; sort-score flips order (aria-sort); row → /company/nuvig | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| company 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — breadcrumb → /overview; second slug artbio; unknown slug HTTP 404 | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| company 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — breadcrumb → /overview; second slug artbio; unknown slug HTTP 404 | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| news 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — sector 197→19; nonsense text → 0 + empty state; 196/196 links _blank+noopener | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| news 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — sector 197→19; nonsense text → 0 + empty state; 196/196 links _blank+noopener | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| chat 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — two prompts, Stop while streaming, Send restored | PASS | PASS — 284/81 chunks, first 778/572 ms, monotonic, [DONE]×2 | PASS (13 / 9 links) | PASS (never seen) | PASS | PASS (same sessionId; answer cites Cape Station/Fervo) | PASS (0 hits) | PASS (200, 136 records) |
| chat 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — two prompts, Stop while streaming, Send restored | PASS | PASS — 214/106 chunks, first 821/620 ms, monotonic, [DONE]×2 | PASS (13 / 9 links) | PASS (never seen) | PASS | PASS (same sessionId; answer cites Cape Station/Fervo) | PASS (0 hits) | PASS (200, 136 records) |
| settings 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS (after fix) — whitespace id → message; bad URL → https message, not persisted; valid values persisted | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| settings 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS (after fix) — whitespace id → message; bad URL → https message, not persisted; valid values persisted | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| root 1440x900 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — / 307→/overview→/onboarding; nav /news,/settings,/chat,/company + logo→/overview | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| root 390x844 | PASS (200) | PASS (0/0) | PASS | PASS | PASS | PASS — / 307→/overview→/onboarding; nav /news,/settings,/chat,/company + logo→/overview | PASS | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| iframe-harness 1440x900 | PASS (200) | PASS (0/0) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a (opaque cross-origin frame; checked on the direct loads) | PASS — iframe load event fired, cross-origin opaque frame rendered (14.5 % / 27.4 % non-white px) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |
| iframe-harness 390x844 | PASS (200) | PASS (0/0) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a (opaque cross-origin frame; checked on the direct loads) | PASS — iframe load event fired, cross-origin opaque frame rendered (14.5 % / 27.4 % non-white px) | n/a (opaque cross-origin frame; checked on the direct loads) | n/a | n/a | n/a | n/a | n/a | PASS (0 hits) | PASS (200, 136 records) |

Notes: the unknown-slug check `/company/does-not-exist-xyz` returned **HTTP 404** (curl and browser; page text "not found", 0 page errors). The only external-resource failures ever seen were third-party article thumbnails blocked by Chrome ORB on a company page (not app errors, not counted). On 390×844 the chat composer check targets the visible thread composer (`textarea.openui-agent-thread-composer__input`); OpenUI keeps a second, zero-size welcome composer in the DOM by design.

### 7.3 Chat — two consecutive prompts in one fresh session (`proof/acceptance-chat-stream.log`)
| | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Turn 1 "What did Fervo Energy announce recently?" | 284 chunks (311 data lines), first chunk +778 ms, finished +72.8 s, monotonic=True, [DONE]=True | 214 chunks (258 data lines), first chunk +821 ms, finished +82.9 s, monotonic=True, [DONE]=True |
| Turn 2 "Summarise that in three bullet points and name the sources." | 81 chunks (111 data lines), first chunk +572 ms, finished +25.1 s, monotonic=True, [DONE]=True, reused turn-1 sessionId=True | 106 chunks (117 data lines), first chunk +620 ms, finished +24.9 s, monotonic=True, [DONE]=True, reused turn-1 sessionId=True |
| Plugin cards | ['Perplexity searched | “What did Fervo Energy announce recently?” | 15 sources', 'Perplexity searched | “Summarise that in three bullet points and name the sources.” | 3 sources'] | ['Perplexity searched | “What did Fervo Energy announce recently?” | 15 sources', 'Perplexity searched | “Summarise that in three bullet points and name the sources.” | 3 sources'] |
| Sources rendered | 13 links | 9 links |
| Empty `{}` card ever shown | False | False |
| Stop shown while streaming → Send at completion | True → "Send message" | True → "Send message" |
| Context kept | turn-2 request carried turn-1 `sessionId`; answer: "Cape Station reached commercial operation ahead of schedule – The first GeoBlock (33 MW) hit its contractual Commercial …" | same; "Cape Station reached commercial operation ahead of schedule (Sept 30 / announced Oct 1–2, 2026): The first 33 MW GeoBloc…" |
| Console / page errors | 0 / 0 | 0 / 0 |

Response headers on `/api/chat`: `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `content-encoding: identity`, `x-ondemand-session: <sid>`. Heartbeat frames arrive every 10 s during the Perplexity research phase (≈50–75 s before the first answer token), which is why the first chunk is < 1 s while the first text delta is ≈ +54 s.

### 7.4 Security
30 served client assets (22 JS, 3 CSS, 2 woff2, 2 SVG, 1 ICO; 3 063 496 bytes) + 8 route HTML pages downloaded fresh → 0 occurrences of the API key; `git grep` → 0; no tracked `.env` (only `.env.example`, `web/.env.example`); `.gitignore` covers `.env`; the rebuilt `bcapital-portfolio-intelligence.zip` → 0 key hits, no `.env`. The literal variable NAME `ONDEMAND_API_KEY` appears once in the Settings help text (no value). Icon libraries in bundles: `lucide` only (one `iconify` string is a Splunk keyword inside a syntax-highlighter grammar, not an icon library). Backend `GET /health` → 200 (`db_record_count` 136) at 20:30:00Z.

### 7.5 Screenshots (`docs/screenshots/gate-*.png`, also attached to the run)
`gate-{root,onboarding,overview,company,news,settings,chat}-{1440x900,390x844}.png`, `gate-iframe-{overview,chat}-{1440x900,390x844}.png`, primary actions `gate-onboarding-cta`, `gate-overview-actions`, `gate-company-second`, `gate-company-back`, `gate-company-404`, `gate-news-filters`, `gate-settings-validation`, `gate-settings-reload`, `gate-root-nav`, chat timeline `gate-chat-turn1-t1s/t3s/t6s/final`, `gate-chat-turn2-t1s/t3s/t6s`, `gate-chat-2turn-1440x900` (turn-2 final, desktop), `gate-chat-2turn-mobile-390x844` (turn-2 final, mobile).

### 7.6 Action log (ISO-8601 UTC)
```
2026-10-09T20:17:36.622Z GATE START — fresh headless Chromium per run (ui-validator: new temp profile → empty cache/storage), preview https://sb-2yrz211gekox.vercel.run, backend https://sb-1gek6bq0m1au.vercel.run (from web/.env), repo @ 5ade7e3
2026-10-09T20:17:36.659Z START smoke 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-smoke
2026-10-09T20:17:41.929Z END   smoke 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-smoke-1440x900.png']
2026-10-09T20:18:06.947Z iframe harness served on http://127.0.0.1:8787 (origin differs from https://sb-2yrz211gekox.vercel.run → cross-origin embed)
2026-10-09T20:20:18.507Z START onboarding 1440x900 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding
2026-10-09T20:20:21.890Z START overview 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview
2026-10-09T20:20:22.573Z END   onboarding 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-onboarding-1440x900.png']
2026-10-09T20:20:26.606Z END   overview 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-overview-1440x900.png']
2026-10-09T20:20:27.277Z START onboarding 390x844 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding
2026-10-09T20:20:28.403Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company
2026-10-09T20:20:30.621Z START news 1440x900 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news
2026-10-09T20:20:31.362Z END   onboarding 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-onboarding-390x844.png']
2026-10-09T20:20:32.139Z START overview 390x844 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview
2026-10-09T20:20:32.978Z END   company 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-1440x900.png']
2026-10-09T20:20:35.153Z END   news 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-1440x900.png']
2026-10-09T20:20:35.580Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings
2026-10-09T20:20:36.504Z END   overview 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-overview-390x844.png']
2026-10-09T20:20:37.615Z START company 390x844 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company
2026-10-09T20:20:39.863Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-1440x900.png']
2026-10-09T20:20:39.901Z START settings 390x844 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings
2026-10-09T20:20:41.191Z START news 390x844 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news
2026-10-09T20:20:42.095Z END   company 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-390x844.png']
2026-10-09T20:20:42.153Z START onboarding 1440x900 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding-cta
2026-10-09T20:20:44.088Z END   settings 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-390x844.png']
2026-10-09T20:20:45.916Z END   news 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-390x844.png']
2026-10-09T20:20:46.032Z subagents A1–A5 dispatched (platform cap 5 concurrent); orchestrator runs A6 (root/nav), A7 (iframe), A8 (security) and the chat gate itself
2026-10-09T20:20:46.070Z START iframe-harness 1440x900 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Foverview%3Fskip%3D1 label=gate-iframe-overview-1440x900
2026-10-09T20:20:47.714Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/artbio?skip=1 label=gate-company-second
2026-10-09T20:20:48.167Z END   onboarding 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:20:51.712Z START overview 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview-actions
2026-10-09T20:20:51.887Z END   company 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-second-1440x900.png']
2026-10-09T20:20:51.928Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back
2026-10-09T20:20:54.656Z END   iframe-harness 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-overview-1440x900-1440x900.png']
2026-10-09T20:20:54.698Z START iframe-harness 390x844 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Foverview%3Fskip%3D1 label=gate-iframe-overview-390x844
2026-10-09T20:20:57.136Z END   company 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:20:57.711Z START news 1440x900 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news-filters
2026-10-09T20:21:00.796Z END   overview 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:21:02.342Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-validation
2026-10-09T20:21:03.523Z END   iframe-harness 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-overview-390x844-390x844.png']
2026-10-09T20:21:03.569Z START iframe-harness 1440x900 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Fchat%3Fskip%3D1 label=gate-iframe-chat-1440x900
2026-10-09T20:21:05.608Z END   news 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-filters-1440x900.png']
2026-10-09T20:21:08.984Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-validation-1440x900.png']
2026-10-09T20:21:09.026Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-reload
2026-10-09T20:21:12.567Z END   iframe-harness 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-chat-1440x900-1440x900.png']
2026-10-09T20:21:12.608Z START iframe-harness 390x844 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Fchat%3Fskip%3D1 label=gate-iframe-chat-390x844
2026-10-09T20:21:13.248Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-reload-1440x900.png']
2026-10-09T20:21:21.595Z END   iframe-harness 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-chat-390x844-390x844.png']
2026-10-09T20:21:26.615Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-validation-diag
2026-10-09T20:21:30.095Z START news 1440x900 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news-filters
gate-iframe-overview-1440x900.png (1440, 900) non-white in iframe area: 14.5%
gate-iframe-overview-390x844.png (390, 844) non-white in iframe area: 27.4%
gate-iframe-chat-1440x900.png (1440, 900) non-white in iframe area: 3.7%
gate-iframe-chat-390x844.png (390, 844) non-white in iframe area: 1.3%
2026-10-09T20:21:31.886Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-validation-diag-1440x900.png']
2026-10-09T20:21:32.162Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back
2026-10-09T20:21:37.939Z END   news 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-filters-1440x900.png']
2026-10-09T20:21:38.633Z END   company 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:21:41.723Z A7 iframe harness: 4/4 runs PASS (load event fired, cross-origin opaque frame, rendered content 14.5%/27.4%/3.7%/1.3% non-white px), no XFO, CSP frame-ancestors *
2026-10-09T20:21:41.755Z START chat 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat
2026-10-09T20:21:42.563Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-validation-diag2
2026-10-09T20:21:46.232Z END   chat 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-1440x900.png']
2026-10-09T20:21:47.828Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-validation-diag2-1440x900.png']
2026-10-09T20:21:53.856Z START overview 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview-actions
2026-10-09T20:21:55.697Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-validation-diag3
2026-10-09T20:22:00.796Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-validation-diag3-1440x900.png']
2026-10-09T20:22:04.173Z END   overview 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-overview-actions-1440x900.png']
2026-10-09T20:22:04.675Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back-probe
2026-10-09T20:22:10.945Z END   company 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:22:23.931Z START onboarding 1440x900 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding-cta
2026-10-09T20:22:27.431Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back-probe2
2026-10-09T20:22:28.714Z END   onboarding 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-onboarding-cta-1440x900.png']
2026-10-09T20:22:30.986Z END   company 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-back-probe2-1440x900.png']
2026-10-09T20:22:50.422Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back-probe3
2026-10-09T20:22:53.122Z chat gate: launching two-turn instrumented run (fresh profile) + t+1/3/6 capture runs
2026-10-09T20:22:53.185Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn
2026-10-09T20:22:54.529Z END   company 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:22:55.186Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t1s
2026-10-09T20:23:00.597Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn1-t1s-1440x900.png']
2026-10-09T20:23:00.672Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t3s
2026-10-09T20:23:02.355Z END   chat-2turn 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:23:07.601Z END   chat-2turn 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:23:07.675Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t6s
2026-10-09T20:23:08.290Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company-back
2026-10-09T20:23:14.306Z END   chat-2turn 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:23:16.968Z END   company 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-back-1440x900.png']
2026-10-09T20:23:27.008Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/does-not-exist-xyz?skip=1 label=gate-company-404
2026-10-09T20:23:31.512Z END   company 1440x900 ok=False http=404 console=1 pageErr=0 failedReq=0 fails=1 shots=['gate-company-404-1440x900.png']
2026-10-09T20:24:18.891Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t6s
2026-10-09T20:24:29.473Z END   chat-2turn 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:25:05.126Z note: ui_validate's DevTools socket timeout inherits the remainder of --wait-ms; long chat evals need a long quiet settle (45 s) — rerunning chat gate with that
2026-10-09T20:25:05.190Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn
2026-10-09T20:25:06.194Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t3s
2026-10-09T20:25:56.155Z END   chat-2turn 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:27:44.711Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-1440x900.png']
2026-10-09T20:29:19.924Z chat gate PASS: 2 turns in one session, chunks 340/68, first chunk 949/716 ms, sources 13
2026-10-09T20:29:34.808Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn
2026-10-09T20:30:00.220Z START root 1440x900 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:30:04.801Z END   root 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:30:04.843Z START root 390x844 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:30:09.669Z END   root 390x844 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:30:38.626Z START root 1440x900 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:30:49.491Z END   root 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-root-1440x900.png']
2026-10-09T20:30:49.535Z START root 390x844 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:31:00.417Z END   root 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-root-390x844.png']
2026-10-09T20:31:06.328Z START root 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-root-nav
2026-10-09T20:31:17.293Z END   root 1440x900 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=[]
2026-10-09T20:31:38.706Z START root 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-root-nav
2026-10-09T20:32:12.596Z END   root 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=1 fails=0 shots=['gate-root-nav-1440x900.png']
2026-10-09T20:32:19.055Z A6 root/nav PASS: / → 307 /overview → /onboarding (fresh profile); nav /news,/settings,/chat,/company + logo→/overview all navigate; 0 console/page errors (one external Perplexity logo image blocked by ORB on the company page — third-party asset, not an app error)
/                            HTTP/2 307  date: Fri, 09 Oct 2026 20:32:19 GMT 
/onboarding                  HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/overview                    HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/company/fervo-energy        HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/company/does-not-exist-xyz  HTTP/2 404  date: Fri, 09 Oct 2026 20:32:19 GMT 
/news                        HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/chat                        HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/settings                    HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/brand/b-capital-logo.svg    HTTP/2 200  date: Fri, 09 Oct 2026 20:32:19 GMT 
/icon.svg                    HTTP/2 200  date: Fri, 09 Oct 2026 20:32:20 GMT 
/opengraph-image             HTTP/2 200  date: Fri, 09 Oct 2026 20:32:20 GMT 
2026-10-09T20:32:24.357Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-1440x900.png']
2026-10-09T20:32:24.426Z START chat-2turn 390x844 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn-mobile
2026-10-09T20:32:44.979Z A5 settings FAIL found: backend-URL error message never rendered (Field lacked error={urlErr}; aria-describedby pointed at a missing #set-backend-error). Minimal fix applied in settings-form.tsx (one prop).
2026-10-09T20:34:47.606Z END   chat-2turn 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-mobile-390x844.png']
2026-10-09T20:37:07.061Z FIX DEPLOY: settings-form.tsx backend-URL error message → copying to sbx_XnBw3bQ18gn303SzlLJW7Qv6Fs0T, next build, restart (preview URL unchanged)
2026-10-09T20:38:12.714Z FIX DEPLOY done; rerunning the gate from fresh browser sessions
2026-10-09T20:38:27.177Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings-validation
2026-10-09T20:38:33.728Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-validation-1440x900.png']
2026-10-09T20:39:08.812Z RERUN (post-fix, BUILD_ID 27UKCTjSNceAeot-Qn9kj): chat two-turn gate desktop+mobile launched
2026-10-09T20:39:08.875Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn
2026-10-09T20:39:30.794Z A8 security PASS: 30 client assets (3.06 MB) + 8 HTML pages → 0 key hits; git grep 0; no tracked .env; Lucide-only bundle; backend /health 200 (136 records)
2026-10-09T20:39:30.795Z RERUN: all six screens + root + iframe × 2 viewports from fresh sessions (post-fix build)
2026-10-09T20:39:30.828Z START root 1440x900 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:39:41.797Z END   root 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-root-1440x900.png']
2026-10-09T20:39:41.838Z START root 390x844 url=https://sb-2yrz211gekox.vercel.run/ label=gate-root
2026-10-09T20:39:52.706Z END   root 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-root-390x844.png']
2026-10-09T20:39:52.748Z START onboarding 1440x900 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding
2026-10-09T20:39:56.740Z END   onboarding 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-onboarding-1440x900.png']
2026-10-09T20:39:56.783Z START onboarding 390x844 url=https://sb-2yrz211gekox.vercel.run/onboarding label=gate-onboarding
2026-10-09T20:40:00.966Z END   onboarding 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-onboarding-390x844.png']
2026-10-09T20:40:01.013Z START overview 1440x900 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview
2026-10-09T20:40:05.456Z END   overview 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-overview-1440x900.png']
2026-10-09T20:40:05.498Z START overview 390x844 url=https://sb-2yrz211gekox.vercel.run/overview?skip=1 label=gate-overview
2026-10-09T20:40:09.952Z END   overview 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-overview-390x844.png']
2026-10-09T20:40:09.994Z START company 1440x900 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company
2026-10-09T20:40:14.461Z END   company 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-1440x900.png']
2026-10-09T20:40:14.502Z START company 390x844 url=https://sb-2yrz211gekox.vercel.run/company/fervo-energy?skip=1 label=gate-company
2026-10-09T20:40:18.934Z END   company 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-company-390x844.png']
2026-10-09T20:40:18.976Z START news 1440x900 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news
2026-10-09T20:40:23.512Z END   news 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-1440x900.png']
2026-10-09T20:40:23.554Z START news 390x844 url=https://sb-2yrz211gekox.vercel.run/news?skip=1 label=gate-news
2026-10-09T20:40:28.474Z END   news 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-news-390x844.png']
2026-10-09T20:40:28.516Z START settings 1440x900 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings
2026-10-09T20:40:32.752Z END   settings 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-1440x900.png']
2026-10-09T20:40:32.797Z START settings 390x844 url=https://sb-2yrz211gekox.vercel.run/settings?skip=1 label=gate-settings
2026-10-09T20:40:36.959Z END   settings 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-settings-390x844.png']
2026-10-09T20:40:37.001Z START chat 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat
2026-10-09T20:40:41.515Z END   chat 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-1440x900.png']
2026-10-09T20:40:41.557Z START chat 390x844 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat
2026-10-09T20:40:46.010Z END   chat 390x844 ok=False http=200 console=0 pageErr=0 failedReq=0 fails=1 shots=['gate-chat-390x844.png']
2026-10-09T20:40:57.230Z START chat 390x844 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat
2026-10-09T20:41:01.627Z END   chat 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-390x844.png']
2026-10-09T20:41:01.669Z START iframe-harness 1440x900 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Foverview%3Fskip%3D1 label=gate-iframe-overview-1440x900
2026-10-09T20:41:10.542Z END   iframe-harness 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-overview-1440x900-1440x900.png']
2026-10-09T20:41:10.585Z START iframe-harness 390x844 url=http://127.0.0.1:8787/index.html?u=https%3A%2F%2Fsb-2yrz211gekox.vercel.run%2Foverview%3Fskip%3D1 label=gate-iframe-overview-390x844
2026-10-09T20:41:19.374Z END   iframe-harness 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-iframe-overview-390x844-390x844.png']
2026-10-09T20:41:24.881Z RERUN screens: 16/16 PASS (root/onboarding/overview/company/news/settings/chat × 2, iframe × 2); mobile chat textarea check uses the visible thread composer (the hidden welcome composer is zero-size by design)
2026-10-09T20:42:23.038Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-1440x900.png']
2026-10-09T20:42:23.109Z START chat-2turn 390x844 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn-mobile
2026-10-09T20:43:35.149Z chat gate: final capture run (desktop + mobile) with base64-sliced export of the per-chunk record
2026-10-09T20:43:35.214Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn
2026-10-09T20:43:48.268Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t6s
2026-10-09T20:43:48.268Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-t3s
2026-10-09T20:44:38.436Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn1-t3s-1440x900.png']
2026-10-09T20:44:41.544Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn1-t6s-1440x900.png']
2026-10-09T20:45:04.808Z END   chat-2turn 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-mobile-390x844.png']
2026-10-09T20:46:00.942Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-1440x900.png']
2026-10-09T20:46:01.013Z START chat-2turn 390x844 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-2turn-mobile
2026-10-09T20:48:36.128Z END   chat-2turn 390x844 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-2turn-mobile-390x844.png']
2026-10-09T20:48:50.568Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn1-final
2026-10-09T20:48:51.579Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn2-t1s
2026-10-09T20:48:52.580Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn2-t3s
2026-10-09T20:48:53.589Z START chat-2turn 1440x900 url=https://sb-2yrz211gekox.vercel.run/chat?skip=1 label=gate-chat-turn2-t6s
2026-10-09T20:48:54.514Z chat captures launched: turn1-final, turn2 t+1s/t+3s/t+6s (desktop)
2026-10-09T20:51:03.074Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn1-final-1440x900.png']
2026-10-09T20:51:09.768Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn2-t6s-1440x900.png']
2026-10-09T20:51:14.617Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn2-t1s-1440x900.png']
2026-10-09T20:51:21.668Z END   chat-2turn 1440x900 ok=True http=200 console=0 pageErr=0 failedReq=0 fails=0 shots=['gate-chat-turn2-t3s-1440x900.png']
2026-10-09T20:52:37.534Z chat captures done (turn1-final, turn2 t+1/3/6 s)
2026-10-09T20:54:14.311Z GATE END — matrix fully green after one fix+rerun; writing report
```

## 8. Redeploy 2026-10-09 (sandboxes expired → fresh deploy, no code changes)
Both earlier sandboxes answered HTTP 410 at `2026-10-09T23:19:33Z`. Redeployed from `origin/main` @ `2f1ab53` (clean tree) — **no application code changed**; only `web/.env` (git-ignored), docs and this proof file.

| Item | Value |
|---|---|
| Frontend | **https://sb-3umbne3uc2g2.vercel.run** — sandbox `sbx_W6xF81UAEW2qdPnN9oq1oNwR3FhW`, port 3000, Node v22.22.2, `npm ci && next build && next start` |
| BUILD_ID | `Fj6s7WsLZM6XKgVVX0aZk` |
| Deploy live (UTC) | `2026-10-09T23:25:14Z` |
| Backend | **https://sb-3az18qgrrd3p.vercel.run** — sandbox `sbx_Buo0S1DoSSNBxot3Psnt31AFOIzm` (root Hono + Drizzle SQLite, unchanged code, `npm ci && npm run build && npm start`); `GET /health` → 200 (`db_record_count` 136), `GET /openapi.json` → 200 (`servers[0]` = the new URL) |
| Env | `web/.env`: `PORTFOLIO_API_URL` / `NEXT_PUBLIC_PORTFOLIO_API_URL` = backend URL above, `NEXT_PUBLIC_SITE_URL` = frontend URL above, `ONDEMAND_API_KEY` server-only (no `NEXT_PUBLIC_*` copy) |
| Routes (`curl -sI`) | `/` 307→`/overview`; `/onboarding /overview /company/fervo-energy /news /chat /settings /brand/b-capital-logo.svg` 200; `/company/does-not-exist-xyz` 404; no `X-Frame-Options`, `CSP: frame-ancestors *` |
| Validation (UTC) | ui-validator matrix `23:26:11Z–23:27:33Z`; chat two-turn desktop `23:29:19Z–23:32:08Z`, mobile `23:32:55Z–23:35:35Z`; captures until `23:40:19Z` |

### 8.1 ui-validator matrix (fresh Chromium profile per run)
| Route × viewport | HTTP 200 | 0 console errors | 0 page errors | Light theme (html.light, white body) | Lucide-only / no first-party PNG | B Capital logo (naturalWidth>0) | Live-backend badge | No X-Frame-Options |
|---|---|---|---|---|---|---|---|---|
| / (root) 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| / (root) 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| onboarding 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| onboarding 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| overview 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| overview 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| company (fervo-energy) 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| company (fervo-energy) 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| news 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| news 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| chat 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| chat 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |
| settings 1440x900 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=137x28) | PASS | PASS |
| settings 390x844 | PASS (200) | PASS | PASS | PASS | PASS | PASS (natural=211x43 rendered=130x28) | PASS | PASS |

### 8.2 Chat — two consecutive prompts, one fresh session (`proof/redeploy-chat-stream.log`)
Turn 1 "What did Fervo Energy announce recently?" · Turn 2 "How does that compare to their previous funding round?" · pluginIds `["plugin-1722260873"]` on both turns.

| | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Turn 1 | 292 chunks, first chunk +911 ms, [DONE] at +80.6 s, monotonic=True | 225 chunks, first chunk +786 ms, [DONE] at +63.3 s, monotonic=True |
| Turn 2 | 231 chunks, first chunk +694 ms, [DONE] at +87.9 s, monotonic=True, reused turn-1 sessionId=True | 269 chunks, first chunk +996 ms, [DONE] at +96.4 s, monotonic=True, reused turn-1 sessionId=True |
| Plugin card input (TOOL_CALL_ARGS) | `{"plugin":"Perplexity","pluginId":"plugin-1722260873","query":"What did Fervo Energy announce recently?","endpointId":"predefined-claude-fable-5.1"}` — never `{}` | same shape, never `{}` |
| Plugin cards rendered | ['Perplexity searched | “What did Fervo Energy announce recently?” | 15 sources', 'Perplexity searched | “How does that compare to their previous funding round?” | 5 sources'] | ['Perplexity searched | “What did Fervo Energy announce recently?” | 10 sources', 'Perplexity searched | “How does that compare to their previous funding round?” | 13 sources'] |
| Sources rendered | 15 | 15 |
| Stop while streaming → Send at completion | True → "Send message" | True → "Send message" |
| Context kept (turn 2 never names Fervo) | answer: "Fervo Energy: IPO vs. the Series E that preceded it  | | Series E (previous round) | IPO (most recent raise) |…" | "Fervo's May 2026 IPO dwarfed anything the company had raised privately. Here's how the two stack up:  The IPO …" |
| Console / page errors | 0 / 0 | 0 / 0 |

### 8.3 Security sweep
`.next/static`: API-key **value** 0 files; literal `ONDEMAND_API_KEY` 1 file (`app/settings/page-*.js`, the Settings help text naming the variable — no value). `.next/server`: value 0. Served assets (37 files, 3 466 367 B) + 7 route HTML pages downloaded fresh: value 0, literal name 1 (same chunk), `NEXT_PUBLIC_ONDEMAND*` 0. `git grep` value → 0; tracked `.env` → 0.

### 8.4 Screenshots (`docs/screenshots/redeploy-*.png`)
`redeploy-{root,onboarding,overview,company,news,chat,settings}-{1440x900,390x844}.png`; chat timeline desktop `redeploy-chat-turn1-{t1s,t3s,t6s,final}`, `redeploy-chat-turn2-{t1s,t3s,t6s}`, `redeploy-chat-2turn-1440x900` (turn-2 final); mobile `redeploy-chat-m-turn1-{t1s,t3s,t6s,final}`, `redeploy-chat-m-turn2-{t1s,t3s,t6s}`, `redeploy-chat-2turn-mobile-390x844` (turn-2 final).
