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
    PXY["/api/ondemand/[...path]<br/>x-ondemand-key → apikey"]
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
  UI -- x-ondemand-key --> PXY --> CHAT
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
| Frontend live preview | https://sb-3h35jqofd2sz.vercel.run (Vercel **sandbox** `sbx_ieWUBqqWlKIGaBuaStxrLdtBYONd`, port 3000, TTL 5 h from 2026-10-09T13:40:27Z; redeploy = `sandbox create` + `npm ci && npm run build && npm start`) |
| Backend base URL (live fallback) | https://sb-4wdkkmzv7w2z.vercel.run — ephemeral Vercel sandbox from the backend run |
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
| `NEXT_PUBLIC_DEFAULT_MODEL` | web `.env` | `predefined-claude-fable-5.1` |
| `NEXT_PUBLIC_DEFAULT_EXTERNAL_USER_ID` | web `.env` | `INV-001` |
| `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` | web `.env` | empty until registered |
| `NEXT_PUBLIC_PITCHBOOK_PLUGIN_ID` | web `.env` | `plugin-1777018662` |
| `NEXT_PUBLIC_EARLIEST_TEST_UTC` | web `.env` | `2026-10-09T12:37:25Z` |
| `NEXT_PUBLIC_SITE_URL` | web `.env` | preview origin (OG images) |
| `INGEST_SECRET` | backend env only | 64-hex shared secret for `POST /ingest`; also in the workflow webhook (Basic auth + `?secret=`) |
| OnDemand `apikey` | **browser localStorage only** | forwarded per request as `x-ondemand-key`; never stored server-side |

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
8. Both Vercel sandboxes are ephemeral (backend TTL expired/expires; frontend 5 h). The repo + `.env` are sufficient to recreate either in minutes.

## 6. Next-step checklist
- [ ] Re-run `serverless_endpoint_create` for app `6ac8de2d1f7d82eff69ac0d9` once OnDemand support confirms provisioning; then set `PORTFOLIO_API_URL`/`NEXT_PUBLIC_PORTFOLIO_API_URL` to `https://serverless.on-demand.io/apps/bcap-portfolio-intel`.
- [ ] Register the Portfolio Plugin (console: My Agents → Create → REST API → paste `../openapi.json` as 3.0.3) or retry `PUBLIC_BASE_URL=… tsx ../scripts/register-plugin.ts`; set `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID`.
- [ ] After the owner configures `plugin-1777018662`, flip `config/plugins.json` status to ACTIVE and add it to the `verify` node of the workflows (never before confirmation).
- [ ] Replay the remaining batch executions (`BASE_URL=… INGEST_SECRET=… tsx ../workflows/replay.ts <executionId…>`) or wait for the next 06:00 UTC cycle.
- [ ] Promote the frontend from the sandbox to a permanent Vercel project (`vercel.json` not required; `web/` is the app root) and set the same `.env` values as project env vars.
- [ ] Mobile perf: paginate the overview table server-side (first 25 rows in HTML) and move the treemap SVG behind a responsive `<picture>`/lazy island to push `/overview` above 90 on the throttled mobile profile.
- [ ] Add the real Reckless Neue / Yellix files to `src/fonts` when licensed and swap the `localFont` sources.
