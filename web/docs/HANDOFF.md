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
| Frontend live preview | https://sb-2yrz211gekox.vercel.run (Vercel **sandbox** `sbx_XnBw3bQ18gn303SzlLJW7Qv6Fs0T`, port 3000; `next start` with `ONDEMAND_API_KEY` in its env; redeploy = `sandbox create` + `npm ci && npm run build && npm start`) |
| Backend base URL (live) | https://sb-1gek6bq0m1au.vercel.run — Hono + Drizzle SQLite API in Vercel sandbox `sbx_s2v1UAKFK3gFbzPBGdyxZoZfIuAC` (`/health` 200) |
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
