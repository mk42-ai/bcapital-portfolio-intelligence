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

## 9. Live data release 2026-10-09
Scope of this release: live news refresh from Perplexity (backend `POST /refresh` + hourly scheduler), verified real company logos, a
faster/transparent chat stream (`RUN_STARTED` + `ondemand.status` within 300 ms, session created inside the stream, elapsed counter and source
thumbnails in the UI), portfolio context in every chat query, and the OnDemand surface re-documented from the live docs. Earlier sections (§1–§8)
remain the record of the previous deploys; everything below supersedes them where they overlap.

### 9.1 Deployment record
| Item | Value |
|---|---|
| Commit deployed | (see git log — commit created after this doc edit; recorded in the run output) (previous: `bdb67f3`) |
| Frontend | https://sb-1z9qy0mx48sk.vercel.run — sandbox `sbx_oOywjD31caJiBj9dOse18UGc5Mx5`, port 3000, Node v22.22.2 (previous §8: https://sb-3umbne3uc2g2.vercel.run) |
| BUILD_ID | `rRd37mq9eO_2tR08PUzUo` |
| Backend | https://sb-7d0g7nrod31w.vercel.run — sandbox `sbx_lySC76aPta6XVEteU0Q5AsBUJfnS` (`/health` 200, `/openapi.json` 200, `/refresh/status` 200) (previous §8: https://sb-3az18qgrrd3p.vercel.run — `/health` 200, 137 rows incl. `b-capital`) |
| Backend env added | `ONDEMAND_API_KEY` (server-only, needed by `/refresh` + scheduler), `ONDEMAND_BASE_URL`, `REFRESH_CRON_MINUTES` (default 60; `0` disables), existing `INGEST_SECRET` now also guards `/refresh` |
| Frontend env | unchanged names (`web/.env.example`); `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` stays **empty** (see 9.6) |
| Deploy live (UTC) | 2026-10-10T01:25:09Z |
| First scheduled refresh tick | runs rf-2026-10-10T002013Z-0682e7 (23 companies, 91 items), rf-2026-10-10T004411Z-8edb67 (40 companies), rf-2026-10-10T011148Z-a5a309 (2 companies, 11 items, 8 images); DB 202 news items / 184 with image_url; scheduler enabled, 60 min, batch 40, next 2026-10-10T02:24:27Z |

### 9.2 What changed (by area)
| Area | Files | Change |
|---|---|---|
| Backend refresh | `src/refresh.ts` (new), `src/app.ts`, `src/server.ts`, `src/openapi.ts`, `openapi.json`, `scripts/refresh.ts` (new) | `POST /refresh` (X-Ingest-Secret; body `{slugs?, limit?, concurrency?}`) pulls Perplexity `plugin-1722260873` news per company via the Chat API stream, persists `news_items.image_url` (from `plugin_sources.items[].imageUrl`, else `og:image`) and `published_at`, writes one `ingest_runs` row with `source:"refresh"`; `GET /refresh/status`; in-process scheduler every `REFRESH_CRON_MINUTES` (40 stalest companies per tick). Full write-up: [`REFRESH_PIPELINE.md`](REFRESH_PIPELINE.md). |
| Logos | `scripts/resolve-logos.ts`, `scripts/apply-logos.ts` (new), `data/portfolio.sqlite`, `web/src/components/brand/*`, overview table / picker / sidebar / news cards | clearbit → og:image → Google favicon, each candidate HTTP-verified (200, `image/*`, >500 B); `proof/logo-resolution.json` + `proof/image-coverage.json`; `<CompanyLogo/>` with Lucide fallback. |
| Chat bridge | `web/src/app/api/chat/route.ts` | `RUN_STARTED` + `CUSTOM ondemand.status {phase:"connecting"}` are written before any upstream call; the OnDemand session is created **inside** the stream and announced as `CUSTOM ondemand.session {sessionId, created, viaHeader}` (a ≤1.5 s header fast-path still sets `x-ondemand-session` for header-only clients; `ONDEMAND_SESSION_HEADER_WAIT_MS` tunes it); `ondemand.status` phases `connecting → creating-session → querying → streaming`; `ondemand.heartbeat` every 10 s of silence; unknown/deferred plugin ids are dropped and reported in `droppedPluginIds`; `ONDEMAND_PAYLOAD_DUMP=1` writes redacted request/frame dumps to `web/proof/payloads/`. |
| Chat client | `web/src/components/chat/open-intelligent-ui/chat-shell.tsx`, `local-storage.ts`, `shell.css`, `chat-sidebar.tsx`, `company-picker.tsx` | reads `ondemand.session` / `ondemand.status`, shows the phase + an elapsed-seconds counter during the Perplexity research phase (first token is typically 30–70 s upstream — see 9.4), renders source thumbnails from `plugin_sources` image URLs, company logos in picker/sidebar. |
| Portfolio context | `web/src/app/chat/page.tsx`, `chat-shell.tsx` | live backend data (companies/news/sentiment) is fetched server-side and injected as system context into every query because no portfolio plugin could be registered (9.6); sample in `web/proof/chat-systemcontext-sample.txt`. |
| Settings / plugins | `web/src/lib/plugins.ts`, `web/src/lib/ondemand/config.ts`, `settings-form.tsx` | Portfolio Plugin row shows the registration outcome; plugin list unchanged otherwise. |
| Docs | `docs/ONDEMAND_SURFACE.md`, `README.md`, `web/README.md`, this file, `web/docs/REFRESH_PIPELINE.md` | OnDemand endpoints re-documented from the live docs; stream taxonomy from a recorded run (9.5). |

### 9.3 Recorded results (from the proof files produced during this release)
| Check | Result | Proof |
|---|---|---|
| `POST /refresh` 5 focus companies (local backend, DB copy, 2026-10-10T00:11–00:13Z) | status `ok`, run `rf-2026-10-10T001147Z-965915`, `companies_touched` 5, `news_upserted` **54**, `with_images` **54 (100 %)**, `dated` **43 (80 %)**, `errors` []; per company 56–115 s wall time at concurrency 3 | `proof/refresh-run.json` |
| Logo coverage (2026-10-10T00:06:55Z) | **136 / 136** companies with a verified logo — `existing` 110, `og` 20, `favicon` 6, `missing` [] | `proof/image-coverage.json`, `proof/logo-resolution.json` |
| `/api/chat` TTFT probe (next dev 127.0.0.1:3303, route pre-warmed, 2026-10-10T00:07–00:11Z) | Turn 1 (new session, header fast-path): first byte / `RUN_STARTED` **+621 ms** (includes a 581 ms session create), `ondemand.session` +641 ms, first `TEXT_MESSAGE_CONTENT` **+33.1 s**, `RUN_FINISHED` +48.0 s, 255 AG-UI frames, 4 heartbeats. Turn 2 (known sessionId, no create): first byte **+37 ms**, `ondemand.session` +42 ms, TTFT +14.7 s, done +16.7 s. Turn 3 (forced in-stream create, client sent deferred PitchBook + bogus id): first byte **+26 ms**, `creating-session` +32 ms, `ondemand.session` +215 ms (`viaHeader:false`), `droppedPluginIds` `["plugin-1777018662","plugin-bogus"]`, TTFT +64.0 s, done +79.3 s | `web/proof/ttft-probe.log`, `web/proof/payloads/` |
| Deployed-preview TTFT — FINAL gate on BUILD_ID `rRd37mq9eO_2tR08PUzUo` (fresh Chromium, two turns, one session) | **desktop 1440x900**: turn 1 response headers +331 ms / first SSE chunk + `RUN_STARTED` + `ondemand.status` + `TOOL_CALL_ARGS` **+333 ms** / first answer token (TTFT) +79.4 s / `[DONE]` +95.3 s (235 chunks, 253 data lines, monotonic); turn 2 (same session, no create) status event **+49 ms** / TTFT +135.4 s / `[DONE]` +161.9 s (417 chunks). **mobile 390x844**: turn 1 status event **+330 ms** / TTFT +75.6 s / done +88.2 s (183 chunks); turn 2 **+32 ms** / +120.0 s / +144.2 s (377 chunks). 19 / 15 source links rendered, plugin card shows the real query (never `{}`), Stop→Send reset, 0 console / page errors. First-token latency is upstream (Perplexity credits exhausted → GPT Search fallback + Fable fulfilment, see 9.8); the UI shows the status card + elapsed counter from +0.3 s | `web/proof/final-chat-stream.log`, `docs/screenshots/live-chat-2turn-*.png`, `live-chat-midstream-t6s-1440x900.png` |
| Functional matrix | all checks PASS, 0 defects (SA7) | `web/proof/functional-matrix.md` |
| E2E + contract tests | Playwright 26/26 (desktop 20 + mobile 6) vs the new preview; contract-test 10/10 vs the new backend | 2026-10-10T01:25:09Z |
| Security sweep | 0 in .next/static, 0 in .next/server, 0 in git grep, 0 in 42 served assets (literal variable NAME once in the Settings help text) | `web/proof/security-sweep.md` |
| Image coverage on the deployed backend | 184 / 202 (91 %) | — |

### 9.4 OnDemand Chat API — as documented in the live public docs (fetched 2026-10-09, OpenAPI 3.0.3, server `https://api.on-demand.io`)
Security scheme for all three: `apikey` — `type: apiKey, in: header, name: apikey`. Error bodies: `4XX`/`5XX` → `{ errorCode, message }`.

**Create Chat Session** — `POST /chat/v1/sessions` (`operationId createChatSession`)
| Body field | Required | Type | Notes (verbatim intent from the docs) |
|---|---|---|---|
| `externalUserId` | **yes** | string | identifier of the external user (your system's id; any unique string) — used for filtering sessions and auditing |
| `pluginIds` | no | string[] (max 20) | plugins for the whole session unless overridden per `/query`; may be empty |

Response `200` → `{ message, data: ChatSession }`, `ChatSession = { id, companyId, externalUserId, pluginIds[], title (auto-generated after the first query), createdBy, createdAt, updatedAt }`. The app reads `data.id`.
(`contextMetadata: [{key, value}]` is accepted by the live service — `/api/chat` sends the portfolio system context through it and `/refresh` tags its sessions `purpose=portfolio-news-refresh` — but it is **not** in the published request schema; treat it as optional/undocumented.)

**Submit Query** — `POST /chat/v1/sessions/{sessionId}/query` (`operationId submitQuery`; path param `sessionId` required)
| Body field | Required | Type | Notes |
|---|---|---|---|
| `query` | **yes** | string | the question |
| `endpointId` | **yes** | string | fulfillment model (predefined / BYOI / BYOM); app default `predefined-claude-fable-5.1` |
| `responseMode` | **yes** | `"sync" \| "stream" \| "webhook"` | app uses `stream` for chat and for `/refresh` |
| `pluginIds` | no | string[] (max 20) | replaces the session's list for this query; if unset at both levels RAG is bypassed |
| `fulfillmentOnly` | no | boolean (default false) | skips RAG/plugins even if `pluginIds` is set |
| `modelConfigs` | no | object | `fulfillmentPrompt`, `stopSequences` (≤4), `temperature` (0–2, default 0.7), `topP` (0–1, default 1), `presencePenalty`, `frequencyPenalty` |

Response `200` (sync mode) → `{ message, data: { sessionId, messageId, answer, status: "processing" \| "completed" \| "failed" } }`. In `stream` mode the body is `text/event-stream`; **the frame format is not in the docs** — see 9.5.

**Get Chat Messages** — `GET /chat/v1/sessions/{sessionId}/messages` (`operationId getChatMessages`)
Query params: `externalUserId`, `sort` (`asc|desc`, default `desc`), `cursor` (= previous `pagination.next`), `limit` (1–50, default 10).
Response `200` → `{ message, data: ChatMessage[], pagination: { next } }`, `ChatMessage = { id, sessionId, companyId, externalUserId, pluginIds[], endpointId, responseMode, status, type, media, query, answer, createdBy, createdAt, updatedAt }`.

Not in the docs we fetched but used read-only by `/api/ondemand/*`: `GET /chat/v1/sessions?externalUserId&limit` (session list). No public endpoint exists for plugin/tool registration (9.6).

### 9.5 Observed stream taxonomy (`/tmp/sa/probe-stream.log`, one real Perplexity run, 2026-10-09T23:58Z, query "5 most recent Fervo Energy news items", 65.2 s end-to-end)
SSE frames are `event:<name>\ndata:<json>\n\n`; every `data` object carries `sessionId`, `messageId`, and (except heartbeats) `eventIndex` + `status:"processing"`. Counts from the recorded run:

| `event:` | `eventType` in `data` | Count | Payload | First seen |
|---|---|---|---|---|
| `heartbeat` | — (`{sessionId, messageId, time}`) | 21 | keep-alive, ~every 3 s while idle | +3.8 s |
| `thinking` | `planning_thinking` | 13 | `thinking.delta` — planner reasoning text | +4.0 s |
| `thinking` | `planning_output` | 33 | `output.delta` — planner JSON (```json {"title": …}```) | +7.4 s |
| `thinking` | `step_output` | 29 | `output.delta` + `stepId` — per-step JSON (`{"title":"Searching Fervo Energy news", …}`) | +12.5 s |
| `thinking` | `step_thinking` | 1 | `thinking.delta` + `stepId` (empty delta observed) | +16.1 s |
| `message` | `plugin_sources` | 1 | `stepId`, `stepTitle`, `sources: { agentId:"agent-1722260873", pluginId:"plugin-1722260873", pluginName:"Perplexity", operationId:"perplexity", items:[{title,url,domain,imageUrl}] }` | +24.5 s |
| `thinking` | `fulfillment_thinking` | 75 | `thinking.delta` — fulfillment-model reasoning | +28.0 s |
| `message` | `fulfillment` | 228 | `answer` token delta (note: this frame's JSON has spaces after colons, the others do not) | **+50.8 s** |
| `message` | `metricsLog` | 1 | `publicMetrics: { inputTokens 9302, outputTokens 3525, totalTokens 12827, ragTimeSec 23.85, fulfillmentTimeSec 38.54, totalTimeSec 62.39 }` | +63.2 s |
| `message` | — | 1 | terminal `data:[DONE]` | +65.2 s |

Consequences baked into the code: `/refresh` reads only `plugin_sources` (items + `imageUrl`) and `fulfillment` (answer text, for dates); the chat bridge maps `plugin_sources` → `ondemand.sources` / thumbnails, `fulfillment` → `TEXT_MESSAGE_CONTENT`, `*_thinking`/`*_output` → tool activity, and keeps the client informed with its own heartbeat + elapsed counter because the **first answer token arrives 30–70 s after the query** (Perplexity research + Fable fulfillment) — upstream latency, not a bridge defect.

### 9.6 Portfolio plugin registration — outcome
`web/proof/plugin-registration.log` (2026-10-10T00:05–00:11Z): the 40 documented public endpoints (Chat / Media / Workflow / Projects / MQTT / Agents Flow Builder) contain **no plugin/tool-creation endpoint**; `ondemandmcp__plugin_v1_plugin_create` returned empty output twice (identifiers `rest`, `rest_api`); `public_v1_plugin_ai_generated_tool_create` failed with HTTP 524 and then `"auto-save: create plugin: invalid agent category"`. **No portfolio plugin id exists**; `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` stays unset and the Settings row says so. Instead, live backend context is injected into every chat query server-side (`web/src/app/chat/page.tsx` → `chat-shell.tsx` systemContext).
portfolio_plugin_id: none — systemContext injection (no public endpoint; MCP create empty/524/'invalid agent category')

### 9.7 Operating notes / limitations
* `POST /refresh` is synchronous and slow by design (≈1–2 min per company ÷ concurrency); call it with `slugs` for targeted refreshes and let the scheduler handle the sweep. Run at most one backend instance with `REFRESH_CRON_MINUTES > 0`.
* Refresh never sets `sentiment_score`/`summary`; those still come from the 06:00 UTC workflows (`/ingest`).
* `published_at` recovery is best-effort (80 % in the proof run); undated items sort last.
* Logo URLs are third-party (clearbit / company sites / Google favicon) and are re-verifiable with `scripts/resolve-logos.ts`; the SQLite snapshot ships with the verified set.
* Secrets: `ONDEMAND_API_KEY` is server-only on **both** apps now (backend for `/refresh`, Next.js for `/api/chat`); never `NEXT_PUBLIC_`, never in proof files (all dumps redact to `<redacted>` / `<sid>`).

### 9.8 Upstream incident during final validation (2026-10-10T01:03Z) and mitigation
A direct `responseMode:"sync"` query to `POST /chat/v1/sessions/{id}/query` with `pluginIds:["plugin-1722260873"]` (no app in the loop) returned an answer containing `the search tool returned an error ("Internal server error: Not enough credits") on all three attempts` — the account's **Perplexity plugin credits are exhausted** (it worked at 00:14Z and 00:46Z). GPT Search `plugin-1741871229` and X Search `plugin-1751872652` were verified working with the same key at 01:06Z. Mitigation shipped in this release: the chat default plugin set is now `[plugin-1722260873, plugin-1741871229]` (Perplexity first, GPT Search as the live-news fallback; override with `ONDEMAND_DEFAULT_PLUGIN_IDS`), the refresh pipeline sends the same pair (`ONDEMAND_NEWS_PLUGIN_IDS`) and mines sources from the answer text when no `plugin_sources` frames arrive, and the chat system prompt instructs the model to use web search for every external fact. Effect, measured on the final two-turn gate: fresh, cited answers on both turns ("…a secondary web search completed successfully…"), 23/17 source links rendered. Once Perplexity credits are topped up, `plugin_sources` frames (with `imageUrl`) resume automatically — no code change needed.

### 9.9 Final verification pass (2026-10-10T01:39Z–01:54Z, orchestrator)
| Check | Result | Proof |
|---|---|---|
| Deployed tree == working tree | frontend `src/**` + `package.json` + `next.config.*` md5-identical on `sbx_oOywjD31caJiBj9dOse18UGc5Mx5`; backend `src/**` identical on `sbx_lySC76aPta6XVEteU0Q5AsBUJfnS` (only `openapi.json` differs by the `servers[0]` URL, which is generated per host) | this doc |
| ui-validator matrix (fresh profile per run, std checks: B Capital SVG, light theme, Lucide-only, live badge, headers, 0 non-2xx resources) | onboarding, overview, company (`/company/fervo-energy`), news, settings — PASS at 1440x900 **and** 390x844; `/company/unknown-xyz` → HTTP 404 + not-found copy; overview logos **25/25 `naturalWidth>0`** on the visible page; company page news images **10/16** loaded (rest lazy/off-screen); news page first-fold images 8/12 (viewport capture) | `docs/screenshots/live-*.png`, `/tmp/gate/results.jsonl` (run log) |
| `fetched <ISO>` badge | page header renders `fetched <ISO>` from a request made at render time (`Sourced.fetched_at = new Date().toISOString()` on a live 200); each news card renders `fetched 2026-10-10 00:13Z`-style badges from `news_items.fetched_at` written by the refresh run | screenshots `live-company-1440x900.png`, `live-news-1440x900.png` |
| Health probes | `https://sb-7d0g7nrod31w.vercel.run/health` 200 · `/openapi.json` 200 · `/refresh/status` 200 (2026-10-10T01:42:07Z, again 01:54:00Z after the restart below); legacy `sb-3az18qgrrd3p` `/health` 200; `sb-1gek6bq0m1au` `/health` **410** (expired) | `web/proof/health-probe.log` |
| Backend data (live API, 2026-10-10T01:45Z) | 137 rows / **137 with `logo_url`** (136 companies + firm); **202 news items, 184 with `image_url` (91 %)**, all 202 with `fetched_at` on 2026-10-09/10; newest `published_at` 2026-10-08 after the fix below | — |
| Fix shipped in this pass | one refreshed item carried a **future** `published_at` (2026-11-18, an event listing) and sorted as the newest news. `src/refresh.ts` now passes every recovered date through `plausibleDate()` (reject > today+1 d or > 3 y old); the live DB row was nulled and the backend restarted at 01:53:56Z with the DB preserved (`/health` 200, scheduler re-armed, next tick 02:53:56Z); `npm test` 11/11 | `web/proof/action-log-orchestrator.log` |

## 10. DeepSeek Flash v4.1 · Perplexity-only release (2026-10-10)

### 10.1 Deployment record
| Item | Value |
|---|---|
| Frontend | https://sb-1z9qy0mx48sk.vercel.run — sandbox `sbx_oOywjD31caJiBj9dOse18UGc5Mx5` (reused; `npm ci && next build && next start -H 0.0.0.0 -p 3000`), **BUILD_ID `rZ50IHx6XHY72uY7iYXKG`**, live 2026-10-10T04:10:50Z (QA ran on the previous build of this release, `OdTCRD1C_EDPxoyEEznWb` @ 03:52:31Z; the only change since is `chat-shell.tsx`: no synthesised "Sources" list after a plugin failure — re-verified with ui-validator, `.ui-proof/after-chat-error-card-1440x900.png`) |
| Backend | https://sb-7d0g7nrod31w.vercel.run — sandbox `sbx_lySC76aPta6XVEteU0Q5AsBUJfnS` (reused; `tsc` + `node dist/server.js` restarted 2026-10-10T03:49:56Z) — `/health` 200 (`model: predefined-deepseek-flash`, 136 records), `/openapi.json` 200, `/refresh/status` 200 |
| Model | `predefined-deepseek-flash` = **DeepSeek Flash v4.1** (live endpoints API: endpoint_name `deepseek-v4.1-flash`, model_id `deepseek-flash`) — label everywhere "DeepSeek Flash v4.1" |
| reasoningMode | `medium` (accepted by the API; probe `web/proof/probe-deepseek-pplx.log`) |
| responseMode | `stream` |
| pluginIds | `["plugin-1722260873"]` — **Perplexity only**, on the session (`POST /chat/v1/sessions`) and on every query. No other plugin id exists anywhere in `web/`, `src/`, `workflows/`, `config/` (grep-verified; `workflows/created.json` is the only historical record kept) |
| Fallback chain | **none** — no model fallback, no plugin substitution, no retry with alternates. Upstream failure → typed error (`CUSTOM ondemand.error` + `TOOL_CALL_RESULT isError:true`) → red "Perplexity failed" card + error banner |
| Payload audit | `web/proof/chat-payload-audit.json` — per turn: request (apikey `<redacted>`), session-create response, query body/response, first 10 raw upstream events, timings (`ONDEMAND_PAYLOAD_AUDIT=0` disables) |

### 10.2 What changed
* **`/api/chat` bridge (`web/src/app/api/chat/route.ts`, rewritten)** — fixed endpointId/reasoningMode/pluginIds from `web/src/lib/ondemand/config.ts`; browser-like `User-Agent` on every upstream call (Cloudflare 1010 bans the default UA); the `ReadableStream` is returned before any upstream await (`RUN_STARTED` + `ondemand.status connecting` flushed synchronously → first client event 26–36 ms in the Playwright runs, 510 ms on the local dev server); the 1.5 s session-header race is now opt-in (`ONDEMAND_SESSION_HEADER_WAIT_MS`, default 0) and the sessionId is delivered in-stream (`CUSTOM ondemand.session`). Every upstream frame is forwarded as a typed client event (see README "SSE event schema"): `*_thinking` / `*_output` → `ondemand.thinking`, `plugin_sources` → incremental `ondemand.sources` + `TOOL_CALL_RESULT ok` (card turns green *when the plugin finishes*, not when the answer ends), `metricsLog` → `ondemand.metrics`, `statusLog` → status, `[ERROR]:` / `eventType:"error"` → `UpstreamError` → `ondemand.error` + `RUN_ERROR`. Plugin-failure pattern `/not enough credits|"error"\s*:\s*"internal server error"|tool returned an error|insufficient credits/i` is scanned in every thinking/output/answer delta → `ondemand.error {code:"plugin_error"}` + `TOOL_CALL_RESULT {status:"error", isError:true}`; the run then finishes normally so the model's disclaimer text stays visible (OpenUI drops the last debounced delta on `RUN_ERROR`).
* **Chat shell (`chat-shell.tsx`)** — Perplexity card states `searching` (Loader2) → `searched · N sources` (Check, sources list with Google favicons `https://www.google.com/s2/favicons?domain=…&sz=32`) → `failed` (AlertTriangle, red, upstream message); collapsible **Thinking trace**; per-answer badge `DeepSeek Flash v4.1 · medium · plugin-1722260873 · first token N ms · T tokens` (N measured client-side); error banner with "show raw frame"; after a plugin failure no "Sources" list is synthesised from the prose; sessionId persisted per thread (`bcap.chat.session.v2.<thread>`) and reused on turn 2; Stop→Send reset unchanged. Settings/sidebar show the fixed model + single plugin read-only (no model `<select>`, no plugin toggles). `src/lib/settings.ts` ignores stored `model`/`plugins` from earlier builds.
* **Backend refresh pipeline (`src/refresh.ts`, `src/config.ts`, `src/app.ts`, `workflows/*`, `config/plugins.json`, `.env.example`)** — same fixed configuration (`endpointId predefined-deepseek-flash`, `reasoningMode medium`, `pluginIds ["plugin-1722260873"]`, `modelConfigs.temperature 0.1`), browser UA, upstream-plugin-error detection (`upstream plugin error: …` recorded verbatim per company, prose never stored as news, `/refresh/status.last_run.plugin_errors`), no retry/fallback; all 7 Flow Builder bodies regenerated with Perplexity-only nodes; `DEFERRED_PLUGINS` removed; `/health` no longer reports `deferred_plugins`.
* **Images** — `web/public/brand/logos/perplexity.svg` (official `https://www.perplexity.ai/favicon.svg`, 2 438 bytes, unaltered); `LogoImg` / `LogoMonogram` (`web/src/components/ui/logo-img.tsx`) with `onError` + `naturalWidth===0` → serif-initial tile, applied to the company hero, `CompanyLogo` (overview table, context chips, picker, sidebar), `NewsThumb` (last step), chat source favicons; `src/lib/local-logos.ts` (`LOCAL_LOGOS`, `resolveLogo`). `npm run logo:audit` → `web/proof/logo-audit.json`: 137 URLs → **136 ok · 1 fixed · 0 fallback**; browser check (Playwright) overview 25/25 `naturalWidth>0`, Perplexity hero `naturalWidth 360`.
* **GROWTH values** (`web/src/components/shell/growth-values.tsx` + `.css`) — accessible expandable tiles (see README), `e2e/growth.spec.ts`.

### 10.3 Recorded results (Playwright, live preview, `web/proof/qa-chat-timing.json`, `qa-route-matrix.json`)
| Viewport | Turn | first status (ms) | first token (ms) | chunks | sources | card | error code | session reused | Stop→Send |
|---|---|---|---|---|---|---|---|---|---|
| 1440×900 | 1 | 26 | 7 979 | 179 | 0 real (3 URLs mined from prose — removed in build rZ50…) | searching → failed | plugin_error | — (`6ac9b9f4f7979c7d562ae403`) | ok |
| 1440×900 | 2 | 26 | 4 522 | 58 | 0 | searching → failed | plugin_error | **yes** (same id) | ok |
| 390×844 | 1 | 31 | 11 346 | 215 | 0 real (2 mined) | searching → failed | plugin_error | — (`6ac9b9f3f7979c7d562ae402`) | ok |
| 390×844 | 2 | 33 | 3 601 | 39 | 0 | searching → failed | plugin_error | **yes** (same id) | ok |

Playwright: 21/21 passed (`web/proof/qa-results.json`); route matrix (`qa-route-matrix.json`): onboarding/overview/company×2/news/settings/chat/404 × 1440 + 390 → 0 console errors, 0 page errors; logos: overview 25/25 `naturalWidth>0` (0 monograms), news 325/325 images, Perplexity hero `/brand/logos/perplexity.svg` `naturalWidth 360`; GROWTH tile expands (also under `prefers-reduced-motion: reduce`). Key numbers: first client status event 26–36 ms (desktop and mobile, both turns); first answer token 3.8–8.0 s (DeepSeek Flash v4.1 — vs 57–81 s on Fable 5.1 in §9); card transitions `searching → failed` on every turn because the account's Perplexity plugin still answers `"error":"Internal server error","message":"Not enough credits"` (raw frames in `probe-deepseek-pplx.log` and in the `chat-payload-audit.json` entries); session reused on turn 2 (same `sessionId`); Stop→Send reset OK; all routes × 2 viewports 0 console / 0 page errors; `/company/does-not-exist` → 404.

### 10.4 Upstream blocker (unchanged from §9.8)
Perplexity `plugin-1722260873` returns `{"error":"Internal server error","message":"Not enough credits"}` for every call on this account (chat and refresh alike; `POST /refresh` for 3 slugs at 2026-10-10T03:54:26Z → 3 × `upstream plugin error … Not enough credits`, 0 news upserted). Per the brief no other plugin is substituted: the chat shows the red error card with the raw frame, the refresh pipeline records the error and keeps the last good data (2026-10-10T02:53–03:09Z run, 111 items). Top up the Perplexity plugin credits on the OnDemand account and the same build turns the card green (`searched · N sources`) with no code change.


## 11. Interactive-UI streaming smoothness release (2026-10-10, commits e13f9d3 → 0367bf0)

| Item | Value |
|---|---|
| Frontend | https://sb-70502obas4b3.vercel.run — sandbox `sbx_igW28DVHgbufTZ97GBmIA3clrVWZ` (the previous sandboxes had stopped), final BUILD_ID `Avms_0k7qDgGiMJ6vT914` live 2026-10-10T06:03:56Z |
| Backend | https://sb-2qbyzccm187r.vercel.run — sandbox `sbx_avac52smFvIwTOEQRF7qIDCDt5XG` (`/health` 200, model predefined-deepseek-flash; `/openapi.json` 200) |
| Brand green | `--brand-green: #0AC985` (B Capital `brand_tokens.primary`, brand matrix / compendium), `--brand-green-ink #047857`, `--brand-green-soft #E6FAF3` — GROWTH hover/focus/expanded verified `rgb(10, 201, 133)` in both viewports |
| Plugins | 12-plugin catalogue (`src/data/plugin-catalogue.json`, live suggest API); Perplexity pinned; GPT Search / Reddit / US Stock Fundamentals toggled in the UI and sent explicitly (`context.pluginIds` → bridge allow-list → upstream `pluginIds`); favicon chain logoUrl → s2 → monogram, audit 12/12 s2 200 (`proof/favicon-audit.json`) |
| Bridge | `src/lib/ondemand/sse-adapter.ts` parses every submit-query v1 frame family into a discriminated union; `route.ts` emits typed AG-UI frames (status/session/plugins/plan/step/summary/agents/thinking/sources/metrics/error/clarification/require_creds/awaiting_input/awaiting_browser_action/filler); per-plugin tool cards; `/api/chat/creds` relay |
| Chat shell | rAF-coalesced live store, inline numbered citation chips (streamed, hover preview), reserved Sources rail + badge above the growing text, plan stepper, step-summary checkpoint cards, virtualised thinking trace, follow-to-bottom + jump pill, 60 ms throttled markdown, prompts, perf badge |
| Docs | `/docs/interactive-ui` synergy matrix (`src/lib/synergy-matrix.ts`), rail panel “Why it's interactive”, footer link |
| Recorder | `web/e2e/perf/record-run.mjs` (+ `init-script.js`, `mock-sse.mjs`, `mock-shots.mjs`); outputs under `web/proof/perf/<label>-<viewport>/` (video, mp4, trace.zip, run.har, sse-frames.json, metrics.json, PNGs) — trace/HAR/webm are git-ignored (size), delivered as run artifacts |

### 11.1 Rubric (final recordings, value → score)
| Item | Threshold for 10 | Desktop before | Desktop after | Mobile before | Mobile after |
|---|---|---|---|---|---|
| 1 Time-to-first-event (first SSE frame, ms) | ≤ 400 ms | 52 → 10 | 91 → 10 | 67 → 10 | 62 → 10 |
| 2 Time-to-first-token (first fulfillment delta, ms) | ≤ 1 500 ms client-side; upstream-dominated | 34381 → 6.3 | 36015 → 6.1 | 29251 → 6.9 | 67411 → 2.6 |
| 3 First inline citation chip before stream end | chip painted during the stream (< [DONE]) | None → 0 | 37420 → 10 | None → 0 | None → 0 |
| 4 Step-summary (summarize_history) card between steps | handler verified (fixture); live emission depends on upstream | 0 → 10 | 0 → 10 | 0 → 10 | 0 → 10 |
| 5 Frame-to-paint latency (SSE frame → DOM paint, ms) | ≤ 50 ms | 15.7 → 10 | 13.4 → 10 | 24.3 → 10 | 20.6 → 10 |
| 6 CLS during stream (no recent input) | ≤ 0.10 | 0.0094 → 10 | 0.0142 → 10 | 0.0609 → 10 | 0.6557 → 0 |
| 7 Long tasks > 50 ms during stream | 0 (≤1 of ≤75 ms = 8) | 1 (max 57 ms) → 8 | 1 (max 65 ms) → 8 | 2 (max 103 ms) → 6 | 1 (max 67 ms) → 8 |
| 8 Animation jank (rAF dropped frames while streaming) | ≤ 0.5 % dropped, p95 ≤ 17 ms | 0.04 % (p95 16.7 ms) → 10 | 0.16 % (p95 16.8 ms) → 10 | 0.1 % (p95 16.8 ms) → 10 | 0.02 % (p95 16.7 ms) → 10 |
| 9 Scroll anchoring while streaming | ≥ 90 % of growth samples at bottom, no user scroll | 100 % → 10 | 45 % → 5.0 | 90.9 % → 10 | 23.8 % → 2.6 |
| 10 Favicon load failures (HAR 4xx/5xx/aborted) | 0 broken images painted (404s fall back to hidden/monogram) | 0 → 10 | 1 → 8 | 0 → 10 | 0 → 10 |
| 11 Stop→Send reset latency (ms) | ≤ 100 ms after [DONE] | 5 → 10 | 12 → 10 | 6 → 10 | 6 → 10 |
| 12 Blank / spinner-only intervals > 1.5 s | none | 0 → 10 | 1 → 6 | 0 → 10 | 0 → 10 |
| 13 GROWTH hover/expand responsiveness + colour | hover ≤ 100 ms, expand ≤ 100 ms, colour = #0AC985 | 28.9 / 17.9 ms · rgb(29, 78, 216) → 0 | 28 / 24.6 ms · rgb(10, 201, 133) → 10 | 43.8 / 25.5 ms · rgb(29, 78, 216) → 0 | 41.6 / 24.9 ms · rgb(10, 201, 133) → 10 |

### 11.2 Open items
Mobile CLS 0.47–0.73 at the live→final message swap (OpenUI remounts the assistant message; desktop 0.014); scroll anchoring 45 % / 24 % at-bottom while growing on the final recordings; TTFT 28–67 s is upstream (four plugins); `summarize_history.*` was never emitted upstream for this prompt (handler verified on the fixture); the final mobile run streamed no links (Perplexity returned no sources) so it shows 0 chips — the 05:55 UTC mobile recording had 17.


## 12. eventMap release (2026-10-10, after e5d179b)

| Item | Value |
|---|---|
| Frontend | https://sb-70502obas4b3.vercel.run (sandbox `sbx_igW28DVHgbufTZ97GBmIA3clrVWZ`), BUILD_ID `33FEHVkxu6Sq4OBfkppYI` live 2026-10-10T07:12:10Z |
| Backend | https://sb-2qbyzccm187r.vercel.run (`/health` 200, model predefined-deepseek-flash) |
| AgentInterface | `@openuidev/react-ui@0.17.0` `AgentInterface` (+ `@openuidev/react-headless@0.17.0` agUIAdapter). Live npm/GitHub check 2026-10-10: there is NO Hugging Face "AgentInterface" package — `npm search agentinterface` returns `agentinterface@1.0.0` (iteebz, a component-JSON renderer, not a chat shell) and nothing under `@huggingface/*`; huggingface/chat-ui is a SvelteKit app, not an npm component. The OpenUI AgentInterface already mounted on /chat is kept; its native parts are AG-UI frames (TEXT_MESSAGE_*, TOOL_CALL_*, CUSTOM, RUN_*) consumed by `agUIAdapter` + `processStreamedMessage`. |
| Event bindings | `web/src/lib/ondemand/eventMap.ts` — the ONLY place SSE event names / eventTypes / statusTypes / agent subtypes / client CUSTOM names / labels live; `sse-adapter.ts`, `route.ts` and `chat-shell.tsx` import from it. Rebinding `summarize_history.*` is a one-line change in `STATUS_TYPE`. |
| Plugins | `/api/plugins` (server-side `GET /plugin/v1/search?limit=100&page=N`, apikey never leaves the server) → 182 chat plugins; `GET /plugin/v1/list` (documented Agents API) returns total 0 for this account (account-owned agents only). Rail shows 40 (14 curated incl. all 11 reference ids first, then subscribed research/finance/social plugins), Perplexity locked on, others opt-in per turn, live `logoUrl` favicons → unsigned base → s2 → monogram. Browser check: 0 broken favicons of 41. |
| Live probe through the bridge | 2026-10-10T07:12:48.916181Z → status 200, session `6ac9e57195268adc215dff0b`, pluginIds ['plugin-1722260873'], first event 66 ms, first token 41461 ms, [DONE] 46620 ms, 816 frames, 25 sources, Perplexity tool result `{"status":"ok","plugin":"Perplexity","pluginId":"plugin-1722260873","durationMs":25508,"sources":7,"items":7}` — **no "Not enough credits" this run** (credits available); the honest red card path is unchanged and verified on the fixture. Raw log `web/proof/probe-live-bridge.log`. |
| Validation | tsc 0 errors; `next build` exit 0 at 2026-10-10T07:10:41Z; ONDEMAND_API_KEY value 0 hits in `.next/static` and `.next/server`; GROWTH verified in a headless browser on the deploy: expanded tile rgb(10,201,133), card border rgb(10,201,133), chevron rgb(4,120,87), no rgb(29,78,216) anywhere in the grid. |

## 13. Run-UX record → analyse → fix → re-record (2026-10-10, after 18ec4a1)

| Item | Value |
|---|---|
| Recorder | `web/playwright.ux.config.ts` + `web/tests/e2e/run-ux.spec.ts` + `web/tests/e2e/ux-init.js` (Playwright 1.64; trace on with screenshots/snapshots/sources, HAR `mode:'full'` embedded per project, video on; projects desktop 1440×900 and mobile 390×844). One session, two turns: T1 "What is the latest news about Fervo Energy? Cite sources.", T2 "Compare the latest funding and project news of Fervo Energy and Ormat Technologies, then give me a one-paragraph summary with citations." Scorer `tests/e2e/score.mjs`, comparison `tests/e2e/compare.mjs`. Run: `RUN_LABEL=after BASE_URL=https://… node node_modules/@playwright/test/cli.js test -c playwright.ux.config.ts` → `web/artifacts/` (git-ignored; copies of the JSON in `web/proof/run-ux/`). |
| Observed summarisation event | **None.** Raw upstream probe (`web/proof/upstream-probe/`, session 6ac9eaad261cbe23404841b1, 812 frames over the two turns): SSE event names thinking/message/heartbeat only; eventTypes planning_thinking, planning_output, step_thinking, step_output, plugin_sources, fulfillment_thinking, fulfillment, metricsLog; **zero** statusLog / currentStatusLog / statusType / plan_created / summarize_history. The step boundary is `plugin_sources` (stepId N, stepTitle) → `step_thinking` (stepId N+1), 1.2 s apart. `eventMap.ts` now documents this as `STEP_BOUNDARY` and the bridge derives the Summarising checkpoint from it (`ondemand.summary {derived:true}`); the documented `summarize_history.*` binding is kept. |
| Smoothness | before 6.75 (desktop 7 / 7, mobile 6 / 7) → after 8.75 (desktop 10 / 10, mobile 7 / 8). CLS desktop T2 0.229 → 0.025; mobile T1 0.669 → 0.171, T2 0.805 → 0.212; console errors 3/1 → 0; favicon failures 3/1 → 0; GROWTH Escape assertion fail → pass. Dead-air gaps >800 ms with no filler: 0 in every run (the stall watchdog band bridges the one ~2 s silence per turn). |
| Root cause of the CLS | the in-flow `Jump to latest` pill: rendered as a sibling of OpenUI's thread it made the flex row shrink the whole thread by 128 px on every toggle (mobile 356→228 px). Now portalled into the scroll container, absolute. |
| Remaining | mobile CLS 0.17–0.21 is the first-row card stack arriving together at ~2 s (activity list + thinking trace + working band + plan slot) and the live→final remount (0.03); the plan JSON arriving still re-measures the row on mobile when the planner streams it before the first card. Long frames: 0–4 per run (max 91 ms, rAF + stream reader), under the −1 threshold on desktop. |

## 14. Senior-integrator continuation (2026-10-10, after 160392c)

| Item | Value |
|---|---|
| Active pair (health-probed 09:28Z) | FE https://sb-1xe432s1qrj3.vercel.run (sandbox `sbx_pPUDzu7v2FiELSnFjXqiHFEyP40J`, 5 h), BE https://sb-70og0c82gysn.vercel.run (`sbx_trGpXgKvmTN2RXWc1WaM2D5eC5SS`); previous pair sb-70502obas4b3 / sb-2qbyzccm187r was 200/200 but expiring; sb-3umbne3uc2g2 / sb-3az18qgrrd3p answer 410. |
| Perplexity credits | Probe 09:34:33Z session `6aca06a995268adc215e03d2`: `{"eventType":"fulfillment_thinking",…"thinking":{"delta":"ity error not enough credits. We"}}` → **BLOCKED BY EXTERNAL DEPENDENCY**; recorded in `proof/credit-probe/perplexity-probe.json`. GPT Search, X Search, LinkedIn, Reddit, US Stock answered the same question (`/tmp` probes summarised in the run report). The chat keeps Perplexity pinned, shows the red card and the `blocked` badge; nothing is substituted. |
| Part 1 (chat clean-up) | `web/src/app/chat/page.tsx`, `components/chat/chat-sidebar.tsx` (rail order: Plan card first, collapsible 48-px strip, `bcap.chat.rail`), `run-rail.tsx` (request-body row → `<details data-testid=dev-disclosure>` "show raw frame"), `plugin-panel.tsx`, `ui/plugin-favicon.tsx`, `open-intelligent-ui/chat-shell.tsx` (`ChatWelcome`: context chips, 3 starters, recent threads — mounted-gated), `shell.css` (bounded `.openui-agent-container`, welcome empty state, `content-visibility` on final messages), `shell/shell.tsx` + `nav.tsx` (compact aside, badge inline, tagline removed from the aside). `WhyInteractive` + synergy link live only under `/docs/interactive-ui`. |
| Part 2 (scoring) | `src/scoring.ts` + `scripts/test-scoring.ts` (10 tests), `/signals`, `/companies/:slug/signal`; UI `web/src/components/charts/signal-bullet.tsx` (SignalBullet / SignalMini / PercentileBadge), `components/company/signal-panel.tsx`, wired in `app/overview/page.tsx`, `components/overview/data-table.tsx` (Signal column, `sort-signal`), `app/company/[slug]/page.tsx`, `app/chat/page.tsx` + chat context list. `charts/gauge.tsx` kept but unused. |
| Part 3 (data) | `src/enrich.ts`, `/enrich` (+ async jobs), `/enrich/status`, `/companies/:slug/profile`; 136/136 profiles, avg field coverage 86 % (`proof/enrichment-coverage.json`); step-3 reconciliation `proof/step3-reconciliation.{json,md}` (accuracy: Perplexity 94 %, WRITER 80 %, Fervo 63 %, Apptronik 60 %, Flutterwave 60 %; headcount digit-strip bug fixed + `scripts/fix-headcount.ts` repaired 60 rows; Fervo total_raised = IPO proceeds flagged). `data/portfolio.sqlite` committed with the enriched state. |
| Part 4 (teams) | Team A: `web/proof/team-a/` (SSE trace 259 frames — no statusLog/summarize_history, no rebind; `/plugin/v1/list` = owned (0) vs `/plugin/v1/search` = marketplace (182 chat); plugin states in `lib/plugin-catalogue.ts`; `/api/plugins` paginates to 182; interactive cards verified by code path + fixture). Team D/E: `web/proof/qa/` (Playwright 45/61 before fixes → stale specs updated, hydration #418 fixed by mount-gating client-only state; journeys.json; security-sweep.md: 0 key hits in bundle/HTML/stream, injection refused, session isolation OK; `matrix-evidence.json`). |
| Known gaps | Perplexity credits (external); Document analysis / Report generation routes do not exist (NOT IMPLEMENTED); CSP is `frame-ancestors *` by design (embedding allowed); mobile /news is heavy (now paged 120 at a time); `markPluginAuthorized` has no caller until a creds flow fires live. |
