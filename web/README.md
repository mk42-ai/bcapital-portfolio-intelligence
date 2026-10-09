# B Capital Portfolio Intelligence — Frontend (`web/`)

Next.js 15 (App Router, React 19, TypeScript) + Tailwind CSS v4 (CSS-variable theming via `@theme inline`) + Radix primitives
(shadcn-style components in `src/components/ui`). It sits on top of the backend in the repo root (Hono + Drizzle/SQLite) and talks
to the OnDemand Chat & Agent Tools API **only through a same-origin proxy** that forwards the user's key from the `x-ondemand-key` header.

Live preview (ephemeral Vercel sandbox, see HANDOFF for TTL): **https://sb-3h35jqofd2sz.vercel.run**

## Screens
| Route | What it shows |
|---|---|
| `/onboarding` | First-run: brand background, tagline, GROWTH values, apikey paste (browser-only), company picker (1–5) |
| `/overview` | Fund-level KPI tiles · server-rendered sector/region **treemap** (tile = est. ticket, opacity = sentiment, every tile a link) · **KPI heatmap** (sentiment / news volume / funding recency, 0–100) · sentiment **gauges** per sector · **status chips** (IPO / rebrand / acquired / unicorn / funding) · estimated ownership & ticket with the **estimate badge** (tooltip = `estimate_confidence` + `estimate_rationale`) · saved filters (sector / region / stage / status / role) · accessible 136-row table |
| `/company/[slug]` | Themed with the company's own `brand_tokens` (AA-checked at runtime, B Capital fallback): logo, palette swatches with WCAG ratios, fonts, evidence-tier badge, B Capital position, sentiment timeline + evidence, PitchBook-style funding timeline with "B Capital participated" markers, news cards with image + source chips, "Last updated by daily workflow … (workflow id, 06:00 UTC)" stamp |
| `/news` | News Pulse grouped by day; filters by company / sector / source plugin / sentiment / text; Δ vs previous run rail; empty-state asset |
| `/chat` | SSE streaming from OnDemand (`responseMode: "stream"`) through `/api/ondemand/*`; `message.parts` rendering (text, reasoning, tool-invocation chips, source-url chips); status submitted/streaming/ready/error; Stop (AbortController → proxy → upstream), Regenerate, optimistic input; thread list in localStorage + OnDemand session/message history; plugin toggles; 1–5 company context injected as `contextMetadata` + a context preamble; mock stream when no key is set |
| `/settings` | apikey (localStorage only, "Test connection"), externalUserId, model endpointId (default `predefined-claude-fable-5.1`), plugin toggles (Portfolio Plugin = registration pending, PitchBook `plugin-1777018662` = configuring/deferred with countdown to `earliest_test_utc`), backend base URL, theme, reset |

## Architecture
```
browser ──(x-ondemand-key)──► Next.js /api/ondemand/[...path] ──(apikey)──► https://api.on-demand.io  (chat sessions · query SSE · messages · plugin list)
browser ────────────────────► Next.js server components ───────────────► portfolio backend (PORTFOLIO_API_URL) → SQLite  (ISR 120 s, snapshot fallback)
browser ────────────────────► Next.js /api/portfolio/[...path] (read-only pass-through, /ingest blocked)
OnDemand Flow Builder (7 cron workflows, 06:00 UTC, Fable 5.1) ──► POST {backend}/ingest  (X-Ingest-Secret)
```
* Server Components by default; `"use client"` only for filters, news feed, chat, settings, pickers, tooltips.
* `src/lib/api.ts`: live backend first, `src/data/snapshot.json` (fetched 2026-10-09T13:14Z) as offline fallback; the source is shown in each page header.
* `src/styles/tokens.css`: B Capital tokens (`#0AC985 / #FAAB3D / #12ABCF / #0A211A / #FFFFFF`) + derived surfaces, every pairing annotated with its WCAG ratio; light theme variant.
* Fonts: Reckless Neue / Yellix are licensed and not bundled → self-hosted **Fraunces** (display) and **Inter** (body) subsets (`src/fonts`, latin, wght 400–700, `font-display: swap`, preloaded) via `next/font/local`, with the brand names first in the fallback stack so they are used when installed.
* Brand assets: `scripts/fetch-brand-assets.mjs` downloads the manifest (SAS URLs expire 2026-10-16) into `public/brand/` — the optimised WebP/PNG derivatives are committed.
* Accessibility: skip link, visible focus rings, ≥24 px targets, `prefers-reduced-motion`, aria-live status for streaming, keyboard-navigable treemap (SVG links) / heatmap (table) / data table, consistent help placement (Settings link in the footer of every page).

## Scripts
```bash
npm ci
npm run dev            # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run assets         # re-download brand manifest (needs valid SAS URLs)
BASE_URL=https://… CHROME_PATH=/usr/bin/chromium npm run test:e2e     # Playwright + axe (desktop 1440 + mobile 390)
BASE_URL=https://… CHROME_PATH=/usr/bin/chromium npm run qa:lighthouse  # Lighthouse mobile + desktop → .lighthouse/summary.json
BASE_URL=https://… node scripts/screenshots.mjs                        # full-page screenshots → docs/screenshots
```
Set `ONDEMAND_API_KEY` in the environment to make the chat e2e do a **real** OnDemand round-trip (otherwise it exercises the mock stream).

## Environment variables (`.env`, all public except the last two)
| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PORTFOLIO_API_URL` | `https://sb-4wdkkmzv7w2z.vercel.run` | Backend shown/overridable in Settings |
| `NEXT_PUBLIC_DEFAULT_MODEL` | `predefined-claude-fable-5.1` | Chat endpointId (Fable 5.1) |
| `NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID` | `INV-001` | OnDemand externalUserId |
| `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` | *(empty → "registration pending")* | Portfolio Plugin id once registered |
| `NEXT_PUBLIC_PITCHBOOK_PLUGIN_ID` | `plugin-1777018662` | Labelled "PitchBook"; deferred |
| `NEXT_PUBLIC_EARLIEST_TEST_UTC` | `2026-10-09T12:37:25Z` | Countdown for the deferred plugin |
| `NEXT_PUBLIC_SITE_URL` | preview URL | `metadataBase` for OG images |
| `ONDEMAND_BASE_URL` | `https://api.on-demand.io` | Proxy upstream (server) |
| `PORTFOLIO_API_URL` | same as public | Server-side backend URL |

The OnDemand **apikey is never an env var here** — it is pasted by the user and kept in `localStorage` (`bcap.settings.v1`).

See `docs/HANDOFF.md` for IDs, QA results, limitations and next steps.
