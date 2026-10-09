# B Capital Portfolio Intelligence — Frontend (`web/`)

Next.js 15 (App Router, React 19, TypeScript) + Tailwind CSS v4 (CSS-variable theming via `@theme inline`) + Radix primitives
(shadcn-style components in `src/components/ui`). It sits on top of the backend in the repo root (Hono + Drizzle/SQLite) and talks
to the OnDemand Chat & Agent Tools API **only through same-origin server routes** (`/api/chat` bridge + `/api/ondemand/*` proxy) that
authenticate with the server-side `ONDEMAND_API_KEY` (`apikey` header). **Light theme only**, **Lucide icons only** (no raster/AI imagery),
chat UI = **Open Intelligent UI** shell on the OpenUI `AgentInterface`.

Live preview (ephemeral Vercel sandbox, see HANDOFF for TTL): **https://sb-2yrz211gekox.vercel.run** — acceptance gate PASS 2026-10-09 (HANDOFF §7)

## Screens
| Route | What it shows |
|---|---|
| `/onboarding` | First-run: tagline, GROWTH values, optional per-user apikey override (browser-only), company picker (1–5); plain white, Lucide `Hexagon` mark |
| `/overview` | Fund-level KPI tiles · server-rendered sector/region **treemap** (tile = est. ticket, opacity = sentiment, every tile a link) · **KPI heatmap** (sentiment / news volume / funding recency, 0–100) · sentiment **gauges** per sector · **status chips** (IPO / rebrand / acquired / unicorn / funding) · estimated ownership & ticket with the **estimate badge** (tooltip = `estimate_confidence` + `estimate_rationale`) · saved filters (sector / region / stage / status / role) · accessible 136-row table |
| `/company/[slug]` | Themed with the company's own `brand_tokens` (AA-checked at runtime, B Capital fallback): logo, palette swatches with WCAG ratios, fonts, evidence-tier badge, B Capital position, sentiment timeline + evidence, PitchBook-style funding timeline with "B Capital participated" markers, news cards with image + source chips, "Last updated by daily workflow … (workflow id, 06:00 UTC)" stamp |
| `/news` | News Pulse grouped by day; filters by company / sector / source plugin / sentiment / text; Δ vs previous run rail; empty-state asset |
| `/chat` | **Open Intelligent UI** chat (OpenUI `AgentInterface` from `@openuidev/react-ui`) → `POST /api/chat` (AG-UI SSE) → OnDemand `POST /chat/v1/sessions` + `POST /chat/v1/sessions/{id}/query` (`responseMode: "stream"`, Perplexity `plugin-1722260873` first). Streamed markdown answer, research/tool activity, a **citation list** (one anchor per source URL, favicon + host + path) under every assistant message, conversation starters, thread list + messages + OnDemand `sessionId` persisted in localStorage (`bcap.chat.threads.v2`, `bcap.chat.thread.v2.<id>`, `bcap.chat.session.v2.<id>`; v1 threads imported once). Deep link `/chat?q=…` sends a question on load. |
| `/settings` | optional per-user apikey override (localStorage only, "Test connection"), externalUserId, model endpointId (default `predefined-claude-fable-5.1`), verified-plugin toggles (Perplexity on by default — exactly one plugin per request; GPT Search / US Stock Fundamentals / Reddit / X opt-in; LinkedIn dropped; Portfolio Plugin = registration pending; PitchBook `plugin-1777018662` = deferred with countdown), backend base URL, reset |

## Architecture
```
browser ──(AG-UI SSE)──► Next.js /api/chat (OpenUI bridge) ──(apikey = ONDEMAND_API_KEY)──► https://api.on-demand.io/chat/v1/sessions + /sessions/{id}/query (stream)
browser ──(optional x-ondemand-key)──► Next.js /api/ondemand/[...path] ──(apikey)──► https://api.on-demand.io  (sessions · query SSE · messages · plugin list)
browser ────────────────────► Next.js server components ───────────────► portfolio backend (PORTFOLIO_API_URL) → SQLite  (ISR 120 s, snapshot fallback)
browser ────────────────────► Next.js /api/portfolio/[...path] (read-only pass-through, /ingest blocked)
OnDemand Flow Builder (7 cron workflows, 06:00 UTC, Fable 5.1) ──► POST {backend}/ingest  (X-Ingest-Secret)
```
* Server Components by default; `"use client"` only for filters, news feed, chat, settings, pickers, tooltips.
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
`ONDEMAND_API_KEY` must be set (server env) for the chat to work; `proof/chat-e2e.log` holds a real streamed round-trip captured against the deployed preview.

## Environment variables (`.env`, gitignored — copy `.env.example`)
| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PORTFOLIO_API_URL` | `https://sb-4wdkkmzv7w2z.vercel.run` | Backend shown/overridable in Settings |
| `NEXT_PUBLIC_DEFAULT_MODEL` | `predefined-claude-fable-5.1` | Chat endpointId (Fable 5.1) |
| `NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID` | `INV-001` | OnDemand externalUserId |
| `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` | *(empty → "registration pending")* | Portfolio Plugin id once registered |
| `NEXT_PUBLIC_PITCHBOOK_PLUGIN_ID` | `plugin-1777018662` | Labelled "PitchBook"; deferred |
| `NEXT_PUBLIC_EARLIEST_TEST_UTC` | `2026-10-09T12:37:25Z` | Countdown for the deferred plugin |
| `NEXT_PUBLIC_SITE_URL` | preview URL | `metadataBase` for OG images |
| `ONDEMAND_BASE_URL` | `https://api.on-demand.io` | Upstream for `/api/chat` and `/api/ondemand/*` (server) |
| `ONDEMAND_API_KEY` | *(secret, server only)* | Sent as the `apikey` header by the server routes. **Never** `NEXT_PUBLIC_`, never logged, never in the client bundle (`grep -r "$ONDEMAND_API_KEY" .next/static` → 0 hits). |
| `PORTFOLIO_API_URL` | same as public | Server-side backend URL |

A user may still paste their own key in Settings; it is kept in `localStorage` (`bcap.settings.v1`) and forwarded as `x-ondemand-key`, overriding the server key for that browser only.

## OnDemand endpoints used (from the live public docs, 2026-10-09)
| Step | Method + path | Headers | Body |
|---|---|---|---|
| Create session | `POST https://api.on-demand.io/chat/v1/sessions` | `apikey: <ONDEMAND_API_KEY>`, `content-type: application/json` | `{ externalUserId, pluginIds[], contextMetadata?[] }` → `data.id` |
| Submit query (stream) | `POST https://api.on-demand.io/chat/v1/sessions/{sessionId}/query` | same + `accept: text/event-stream` | `{ query, endpointId, responseMode: "stream", pluginIds[] }` → `event:heartbeat|thinking|message` frames, `data:{"eventType":"fulfillment","answer":"…"}`, terminal `data:[DONE]` |
| List sessions | `GET https://api.on-demand.io/chat/v1/sessions?externalUserId&limit` | `apikey` | — |
| List messages | `GET https://api.on-demand.io/chat/v1/sessions/{sessionId}/messages` | `apikey` | — |

### Verified plugin list (hard-coded in `src/lib/ondemand/config.ts`, Perplexity first)
| Plugin ID | Name | Session | Query | First token | Total | Timestamp (UTC) | Decision |
|---|---|---|---|---|---|---|---|
| `plugin-1722260873` | Perplexity | 201 | 200 | 37.5 s | 54.2 s | 2026-10-09T17:27:16Z | **kept, default on** |
| `plugin-1741871229` | GPT Search | 201 | 200 | 85.0 s | 109.1 s | 2026-10-09T17:28:10Z | kept, **opt-in** (sending two plugins per request stalled the run) |
| `plugin-1716429542` | US Stock Fundamental Analysis | 201 | 200 | 35.4 s | 40.8 s | 2026-10-09T17:35:21Z | kept, opt-in |
| `plugin-1748003575` | Reddit Posts | 201 | 200 | 38.4 s | 45.2 s | 2026-10-09T17:32:30Z | kept, opt-in |
| `plugin-1751872652` | X Search Agent | 201 | 200 | 105.3 s | 125.5 s | 2026-10-09T17:33:16Z | kept, opt-in (slow) |
| `plugin-1718116202` | LinkedIn Search | 201 | 200 | 139.5 s | 151.1 s | 2026-10-09T17:29:59Z | **dropped** — tool returned 404 inside the answer |
| `plugin-1777018662` | PitchBook Investor Finder | — | — | — | — | — | deferred (never sent) |

## Chat UI provenance
* **Open Intelligent UI** — https://github.com/thesysdev/open-intelligent-ui @ `3b39c06b954e87c394ef95fee41a7e0084f94a27` (package `openui-self-hosted` 0.1.1, `private: true`, **not on npm**, README: "Requires Node 24"). Only its generic shell CSS and the neutral `createTheme` palette were vendored into `src/components/chat/open-intelligent-ui/` (see `ATTRIBUTION.md`); the travel demo components, MapLibre and the OpenUI Gateway route were not copied.
* Runtime components come from the MIT-licensed OpenUI packages: `@openuidev/react-ui` **0.17.0**, `@openuidev/react-headless` **0.17.0**, `@openuidev/react-lang` **0.3.2**.
* Node: the app builds and runs on **Node 22** (sandbox `v22.22.2`, local `v22.23.3`) — the Node 24 requirement applies to open-intelligent-ui's own Gateway server, which is not used here.

See `docs/HANDOFF.md` for IDs, QA results, limitations and next steps.
