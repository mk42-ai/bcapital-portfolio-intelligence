# B Capital Portfolio Intelligence — Frontend (`web/`)

Next.js 15 (App Router, React 19, TypeScript) + Tailwind CSS v4 (CSS-variable theming via `@theme inline`) + Radix primitives
(shadcn-style components in `src/components/ui`). It sits on top of the backend in the repo root (Hono + Drizzle/SQLite) and talks
to the OnDemand Chat & Agent Tools API **only through same-origin server routes** (`/api/chat` bridge + `/api/ondemand/*` proxy) that
authenticate with the server-side `ONDEMAND_API_KEY` (`apikey` header). **Light theme only**, **Lucide icons only** (no raster/AI imagery),
chat UI = **Open Intelligent UI** shell on the OpenUI `AgentInterface`.

Live preview (ephemeral Vercel sandbox, see HANDOFF for TTL): https://sb-1z9qy0mx48sk.vercel.run (DeepSeek Flash v4.1 · Perplexity-only release, HANDOFF §10; backend https://sb-7d0g7nrod31w.vercel.run)

**Fixed OnDemand configuration (2026-10-10, no fallback chain anywhere):** model `predefined-deepseek-flash` (**DeepSeek Flash v4.1**, endpoint_name `deepseek-v4.1-flash`) · `reasoningMode: "medium"` · `responseMode: "stream"` · `pluginIds: ["plugin-1722260873"]` (**Perplexity — the only plugin**, on the session and on every query). When Perplexity fails upstream the chat shows a red error card and the refresh pipeline records the error verbatim — no other plugin or model is ever substituted.

## Screens
| Route | What it shows |
|---|---|
| `/onboarding` | First-run: tagline, GROWTH values, optional per-user apikey override (browser-only), company picker (1–5); plain white, Lucide `Hexagon` mark |
| `/overview` | Fund-level KPI tiles · server-rendered sector/region **treemap** (tile = est. ticket, opacity = sentiment, every tile a link) · **KPI heatmap** (sentiment / news volume / funding recency, 0–100) · sentiment **gauges** per sector · **status chips** (IPO / rebrand / acquired / unicorn / funding) · estimated ownership & ticket with the **estimate badge** (tooltip = `estimate_confidence` + `estimate_rationale`) · saved filters (sector / region / stage / status / role) · accessible 136-row table |
| `/company/[slug]` | Themed with the company's own `brand_tokens` (AA-checked at runtime, B Capital fallback): logo, palette swatches with WCAG ratios, fonts, evidence-tier badge, B Capital position, sentiment timeline + evidence, PitchBook-style funding timeline with "B Capital participated" markers, news cards with image + source chips, "Last updated by daily workflow … (workflow id, 06:00 UTC)" stamp |
| `/news` | News Pulse grouped by day; filters by company / sector / source plugin / sentiment / text; Δ vs previous run rail; empty-state asset |
| `/chat` | **Open Intelligent UI** chat (OpenUI `AgentInterface` from `@openuidev/react-ui`) → `POST /api/chat` (AG-UI SSE) → OnDemand `POST /chat/v1/sessions` + `POST /chat/v1/sessions/{id}/query` (`responseMode: "stream"`, Perplexity `plugin-1722260873` first). Streamed markdown answer, research/tool activity, a **citation list** (one anchor per source URL, favicon + host + path) under every assistant message, conversation starters, thread list + messages + OnDemand `sessionId` persisted in localStorage (`bcap.chat.threads.v2`, `bcap.chat.thread.v2.<id>`, `bcap.chat.session.v2.<id>`; v1 threads imported once). Deep link `/chat?q=…` sends a question on load. |
| `/settings` | optional per-user apikey override (localStorage only, "Test connection"), externalUserId, backend URL, default context companies; model (DeepSeek Flash v4.1 · medium) and plugin (Perplexity `plugin-1722260873`) are shown read-only — fixed product-wide |

## Architecture
```
browser ──(AG-UI SSE)──► Next.js /api/chat (OpenUI bridge) ──(apikey = ONDEMAND_API_KEY)──► https://api.on-demand.io/chat/v1/sessions + /sessions/{id}/query (stream)
browser ──(optional x-ondemand-key)──► Next.js /api/ondemand/[...path] ──(apikey)──► https://api.on-demand.io  (sessions · query SSE · messages · plugin list)
browser ────────────────────► Next.js server components ───────────────► portfolio backend (PORTFOLIO_API_URL) → SQLite  (ISR 120 s, snapshot fallback)
browser ────────────────────► Next.js /api/portfolio/[...path] (read-only pass-through, /ingest and /refresh blocked)
OnDemand Flow Builder (7 cron workflows, 06:00 UTC, DeepSeek Flash v4.1 + Perplexity only) ──► POST {backend}/ingest  (X-Ingest-Secret)
backend scheduler (REFRESH_CRON_MINUTES, default 60) / POST {backend}/refresh (X-Ingest-Secret) ──(apikey)──► OnDemand Chat API + Perplexity plugin-1722260873 ──► news_items (image_url, published_at)
```
* Server Components by default; `"use client"` only for filters, news feed, chat, settings, pickers, tooltips.
* **Chat stream (live-data release).** `/api/chat` writes `RUN_STARTED` + `CUSTOM ondemand.status {phase:"connecting"}` before any upstream call (first byte 26–37 ms when no session has to be created, 621 ms when the ≤1.5 s header fast-path awaits the create — `web/proof/ttft-probe.log`), creates the OnDemand session **inside** the stream and announces it as `CUSTOM ondemand.session`, then relays `ondemand.status` phases (`creating-session → querying → streaming`), an `ondemand.heartbeat` every 10 s of silence, `TEXT_MESSAGE_CONTENT` deltas from upstream `fulfillment` frames and `ondemand.sources` (with `imageUrl` thumbnails) from `plugin_sources`. The client shows the phase and an elapsed-seconds counter because Perplexity's research phase puts the first answer token 30–70 s after the query (33.1 s / 14.7 s / 64.0 s in the three probe turns) — upstream latency, not a bridge defect. Unknown or deferred plugin ids are dropped server-side and reported as `droppedPluginIds`.
* **Portfolio context.** No portfolio plugin could be registered (no public endpoint; `web/proof/plugin-registration.log`), so `src/app/chat/page.tsx` fetches live backend data server-side and `chat-shell.tsx` injects it as system context into every query. `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` stays empty. none (built-in context)
* **Company logos.** `<CompanyLogo/>` (overview table, company picker, chat sidebar, news cards) renders the HTTP-verified `logo_url` resolved by the backend's `scripts/resolve-logos.ts` (clearbit → og:image → Google favicon) with a Lucide fallback; `proof/image-coverage.json` = 136 / 136 companies (110 existing, 20 og:image, 6 favicon). News cards show the article `image_url` persisted by the refresh pipeline.
* `src/lib/api.ts`: live backend first, `src/data/snapshot.json` (fetched 2026-10-09T13:14Z) as offline fallback; the source is shown in each page header.
* **Theme — light only.** `src/styles/tokens.css` ships ONE neutral light theme: `#FFFFFF` background, `#111827` text, `#E5E7EB` borders, `#6B7280` muted text, 8 px spacing scale, 1 px borders instead of shadows, no glows/gradients/blur. `<html class="light" style="color-scheme: light">` is forced; there is no `.dark`, no `dark:` variants, no `prefers-color-scheme: dark` rule, no theme toggle. Charts (treemap, KPI heatmap, gauges, Recharts) use a gray scale + one restrained accent. Per-company `brand_tokens` are used ONLY for the logo/accent chip after an AA contrast check, never as a page background.
* **Icons — Lucide only** (`lucide-react` 0.546.0; no `@radix-ui/react-icons` was needed). Chat avatar `Bot`, empty states `Inbox` / `FolderOpen` / `Newspaper`, error/offline `AlertCircle` / `WifiOff`, sectors `Cpu` / `HeartPulse` / `Landmark` / `Zap` / `Leaf` / `ShoppingBag` / `Factory` …, nav `LayoutDashboard` / `Building2` / `Newspaper` / `MessageSquare` / `Settings`. App icon / favicon / OG image = the monochrome Lucide `hexagon` glyph (`src/app/icon.svg`, `src/app/favicon.ico`, `src/app/opengraph-image.tsx` via `next/og`). All AI-generated PNG/WebP assets were removed from `public/brand/` and from the UI.
* Fonts: Reckless Neue / Yellix are licensed and not bundled → self-hosted **Fraunces** (display) and **Inter** (body) subsets (`src/fonts`, latin, wght 400–700, `font-display: swap`, preloaded) via `next/font/local`, with the brand names first in the fallback stack so they are used when installed.
* Accessibility: skip link, visible focus rings, ≥24 px targets, `prefers-reduced-motion`, aria-live status for streaming, keyboard-navigable treemap (SVG links) / heatmap (table) / data table, consistent help placement (Settings link in the footer of every page).

## Scripts
```bash
npm ci
npm run dev            # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run assets         # re-download brand manifest (needs valid SAS URLs)
BASE_URL=https://… CHROME_PATH=/usr/bin/chromium npm run test:e2e     # Playwright suite in web/e2e (8 specs: screens, chat streaming, mobile 390, axe)
BASE_URL=https://… CHROME_PATH=/usr/bin/chromium npm run qa:lighthouse  # Lighthouse mobile + desktop → .lighthouse/summary.json
BASE_URL=https://… node scripts/screenshots.mjs                        # full-page screenshots → docs/screenshots
```
`ONDEMAND_API_KEY` must be set (server env) for the chat to work; `proof/chat-e2e.log` holds a real streamed round-trip captured against the deployed preview, `proof/ttft-probe.log` the three-turn TTFT probe of the live-data release, `proof/payloads/` redacted upstream request/frame dumps (`ONDEMAND_PAYLOAD_DUMP=1`), `proof/functional-matrix.md` and `proof/security-sweep.md` the release checks.

### Refresh pipeline (backend, consumed by this UI)
News cards, the News Pulse and the chat context read `news_items` rows that the backend's **refresh pipeline** keeps fresh: `POST {backend}/refresh` (`X-Ingest-Secret`; body `{slugs?, limit?, concurrency?}`) streams one Perplexity query per company through the OnDemand Chat API, takes `plugin_sources.items[]` as the news items (title, url, domain, `imageUrl`), recovers `published_at` from the answer text / URL / page meta, backfills `og:image` when the plugin gave no image, and upserts with a deterministic id (`n-<sha1(slug|url)>`), recording one `ingest_runs` row (`source:"refresh"`). An in-process scheduler repeats this for the 40 stalest companies every `REFRESH_CRON_MINUTES` (default 60; `0` disables). `GET {backend}/refresh/status` (public) exposes the last run, counters and `next_scheduled_at`. The frontend proxy (`/api/portfolio/*`) blocks `/refresh` like `/ingest`; the UI only ever reads. Recorded run (`proof/refresh-run.json`, 5 focus companies): 54 items, 54 with images (100 %), 43 dated (80 %), 0 errors, 56–115 s per company. Full description: [`docs/REFRESH_PIPELINE.md`](docs/REFRESH_PIPELINE.md). Deployed-backend status after the first tick: DB on the deployed backend: 202 news items / 184 with image_url; last runs rf-2026-10-10T002013Z-0682e7 (23 companies, 91 items), rf-2026-10-10T004411Z-8edb67 (40 companies), rf-2026-10-10T011148Z-a5a309 (2 companies, 11 items, 8 with images, 9 dated); scheduler enabled every 60 min, batch 40, next 2026-10-10T02:24:27Z

## Environment variables (`.env`, gitignored — copy `.env.example`)
| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PORTFOLIO_API_URL` | https://sb-7d0g7nrod31w.vercel.run | Backend shown/overridable in Settings (previous: `https://sb-3az18qgrrd3p.vercel.run`) |
| `NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID` | `INV-001` | OnDemand externalUserId |
| `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` | *(empty)* | Portfolio Plugin id — **no public registration endpoint exists** (HANDOFF §9.6); leave empty, context is injected server-side |
| `NEXT_PUBLIC_EARLIEST_TEST_UTC` | `2026-10-09T12:37:25Z` | Countdown for the deferred plugin |
| `NEXT_PUBLIC_SITE_URL` | preview URL | `metadataBase` for OG images |
| `ONDEMAND_BASE_URL` | `https://api.on-demand.io` | Upstream for `/api/chat` and `/api/ondemand/*` (server) |
| `ONDEMAND_API_KEY` | *(secret, server only)* | Sent as the `apikey` header by the server routes. **Never** `NEXT_PUBLIC_`, never logged, never in the client bundle (`grep -r "$ONDEMAND_API_KEY" .next/static` → 0 hits). |
| `PORTFOLIO_API_URL` | same as public | Server-side backend URL |
| `ONDEMAND_SESSION_HEADER_WAIT_MS` | `1500` | How long `/api/chat` waits for the session create before streaming without the `x-ondemand-session` header (the id is always also sent as `CUSTOM ondemand.session`) |
| `ONDEMAND_PAYLOAD_DUMP` | *(unset)* | `1` → write redacted upstream request/frame dumps to `proof/payloads/` (debug only; never in production) |

Backend-side variables for the refresh pipeline (`ONDEMAND_API_KEY`, `ONDEMAND_BASE_URL`, `REFRESH_CRON_MINUTES`, `INGEST_SECRET`) live in the root `.env.example`, not here.

A user may still paste their own key in Settings; it is kept in `localStorage` (`bcap.settings.v1`) and forwarded as `x-ondemand-key`, overriding the server key for that browser only.

## OnDemand endpoints used (from the live public docs, OpenAPI 3.0.3, fetched 2026-10-09)
Security scheme: `apikey` (`in: header`, `name: apikey`). Errors: `4XX`/`5XX` → `{ errorCode, message }`. Full field tables in HANDOFF §9.4.
| Step | Method + path | Headers | Body (required in **bold**) → response |
|---|---|---|---|
| Create session | `POST https://api.on-demand.io/chat/v1/sessions` | `apikey`, `content-type: application/json` | `{ **externalUserId**, pluginIds[] (≤20), contextMetadata?[{key,value}] (undocumented, accepted) }` → `{ message, data: { id, companyId, externalUserId, pluginIds, title, createdBy, createdAt, updatedAt } }` |
| Submit query | `POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query` | same + `accept: text/event-stream` | `{ **query**, **endpointId**, **responseMode**: "sync"\|"stream"\|"webhook", pluginIds[] (≤20), fulfillmentOnly?, modelConfigs?{fulfillmentPrompt, stopSequences, temperature, topP, presencePenalty, frequencyPenalty} }` → sync: `{ message, data: { sessionId, messageId, answer, status } }`; stream: SSE (below) |
| List messages | `GET https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages?externalUserId&sort=asc\|desc&cursor&limit(1–50)` | `apikey` | → `{ message, data: ChatMessage[], pagination: { next } }` |
| List sessions | `GET https://api.on-demand.io/chat/v1/sessions?externalUserId&limit` | `apikey` | (used read-only by `/api/ondemand/*`; not among the three docs fetched) |

**Observed stream shape** (not in the docs; one recorded Perplexity run, 65 s): `event:heartbeat|thinking|message` + `data:{sessionId, messageId, eventIndex, eventType, status}`; `eventType` in order of appearance `planning_thinking` → `planning_output` → `step_output` / `step_thinking` → `plugin_sources` (`sources.items[{title,url,domain,imageUrl}]`, `pluginId`, `pluginName`, +24.5 s) → `fulfillment_thinking` → `fulfillment` (`answer` deltas, first at +50.8 s) → `metricsLog` (`publicMetrics.{inputTokens,outputTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}`) → terminal `data:[DONE]`. Heartbeats roughly every 3 s while idle.

### Verified plugin list (hard-coded in `src/lib/ondemand/config.ts`, Perplexity first)
| Plugin ID | Name | Session | Query | First token | Total | Timestamp (UTC) | Decision |
|---|---|---|---|---|---|---|---|
| `plugin-1722260873` | Perplexity | 201 | 200 | 37.5 s | 54.2 s | 2026-10-09T17:27:16Z | **kept, default on** |
| _(other plugins)_ | GPT Search, US Stock Fundamentals, Reddit, X Search, LinkedIn, PitchBook | — | — | — | — | 2026-10-09 | **removed on 2026-10-10** — the product sends exactly one plugin (Perplexity); their ids no longer appear in code or config |

## Chat UI provenance
* **Open Intelligent UI** — https://github.com/thesysdev/open-intelligent-ui @ `3b39c06b954e87c394ef95fee41a7e0084f94a27` (package `openui-self-hosted` 0.1.1, `private: true`, **not on npm**, README: "Requires Node 24"). Only its generic shell CSS and the neutral `createTheme` palette were vendored into `src/components/chat/open-intelligent-ui/` (see `ATTRIBUTION.md`); the travel demo components, MapLibre and the OpenUI Gateway route were not copied.
* Runtime components come from the MIT-licensed OpenUI packages: `@openuidev/react-ui` **0.17.0**, `@openuidev/react-headless` **0.17.0**, `@openuidev/react-lang` **0.3.2**.
* Node: the app builds and runs on **Node 22** (sandbox `v22.22.2`, local `v22.23.3`) — the Node 24 requirement applies to open-intelligent-ui's own Gateway server, which is not used here.

See `docs/HANDOFF.md` for IDs, QA results, limitations and next steps.

## `/api/chat` SSE event schema (AG-UI frames, one `data: {json}\n\n` per upstream event, terminal `data: [DONE]`)
| Frame | When | Payload |
|---|---|---|
| `RUN_STARTED` | synchronously on request receipt (first visible event < 400 ms) | `{threadId, runId}` |
| `CUSTOM ondemand.status` | every phase change | `{phase: connecting · creating-session · querying · streaming · planning · researching · answering · done, elapsedMs, …}` |
| `CUSTOM ondemand.session` | session known | `{sessionId, created, viaHeader, endpointId, reasoningMode, pluginIds}` — the client persists it per thread and sends it back as `context.sessionId` (turn 2 reuses the session) |
| `TOOL_CALL_START / ARGS / END` | first upstream planning/step frame | `toolCallName "Perplexity"`, args `{plugin, pluginId, query, endpointId, reasoningMode}` → card **"Searching with Perplexity"** (Loader2) |
| `CUSTOM ondemand.thinking` | every `planning_thinking` / `planning_output` / `step_thinking` / `step_output` / `fulfillment_thinking` delta | `{kind, delta}` → collapsible **Thinking trace** |
| `CUSTOM ondemand.sources` | every `plugin_sources` frame (partial) and once at the end | `{sources[{url,title,sourceName,imageUrl?}], pluginId, partial}` → card **"Perplexity searched · N sources"** (Check) + clickable list with Google favicons |
| `TOOL_CALL_RESULT` | plugin done or failed | `{status: ok · error, plugin, sources, message?}`; on failure also `isError: true, error` → card **"Perplexity failed"** (AlertTriangle, red) |
| `TEXT_MESSAGE_START / CONTENT / END` | answer deltas (`fulfillment.answer`) flushed per upstream event | progressive markdown |
| `CUSTOM ondemand.metrics` | `metricsLog` | `{publicMetrics{inputTokens,outputTokens,totalTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}, firstTokenMs}` → tokens on the answer badge |
| `CUSTOM ondemand.error` | HTTP error, `[ERROR]:` frame, `eventType:"error"`, or the plugin-failure pattern (`Not enough credits` / `"error":"Internal server error"` / `tool returned an error`) in any delta | `{code, message, raw}` → red error banner with "show raw frame" |
| `RUN_FINISHED` / `RUN_ERROR` | end | — |

Per-answer badge: `DeepSeek Flash v4.1 · medium · plugin-1722260873 · first token N ms` (N measured client-side from send to the first `TEXT_MESSAGE_CONTENT`). Audit: every turn appends `{request (apikey redacted), first 10 raw upstream events, timings}` to `web/proof/chat-payload-audit.json` (`ONDEMAND_PAYLOAD_AUDIT=0` disables).

## Logos & images
Every logo/thumbnail `<img>` goes through `LogoImg` / `CompanyLogo` / `NewsThumb` with an `onError` + `naturalWidth === 0` fallback to a serif-initial monogram tile (never an AI-generated asset). `perplexity-ai` uses the locally hosted official mark `public/brand/logos/perplexity.svg` (downloaded unaltered from `https://www.perplexity.ai/favicon.svg`). `npm run logo:audit` → `proof/logo-audit.json` (2026-10-10: 137 backend logo URLs → 136 ok · 1 fixed (local asset) · 0 fallback); the browser-side `naturalWidth>0` check runs in `e2e/qa-routes.spec.ts`.

## GROWTH values (onboarding)
`src/components/shell/growth-values.tsx`: six `<button aria-expanded aria-controls>` tiles (Generosity · Resilience · Open-mindedness · Will · Teamwork · Humility); hover/focus lift (−2 px + shadow) with a serif-initial tile accent; click / Enter / Space expands an inline description (`grid-template-rows 0fr→1fr` + opacity); Arrow/Home/End move focus; `prefers-reduced-motion` disables transforms and transitions. Lucide `ChevronDown` indicator.
