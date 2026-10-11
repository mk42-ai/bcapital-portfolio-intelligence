# Recovery run 2026-10-11 — Lane E/G evidence

Local stack: backend `tsx src/server.ts` :8787 (committed `data/portfolio.sqlite`), frontend `next build` + `next start` :3100 (BUILD_ID `vxscwQXS4uJL25wtrwTAw`).

## SSE recordings (full streams to `[DONE]`, via `POST /api/chat`, Perplexity plugin only)
| file | query | first event | first token | `[DONE]` | frames | notes |
|---|---|---|---|---|---|---|
| `sse-fervo-news.log` | What is the latest news about Fervo Energy? Cite sources. | 07:26:00.458 | 07:26:26.727 | 07:26:32 | 874 lines | objective "I'll find the latest news about Fervo Energy and cite the sources." · Perplexity 8 sources · 14.2 s |
| `sse-movers.log` | Which of my context companies moved most since the last sentiment run, and why? | 07:26:00.453 | 07:26:27.876 | 07:26:32 | 1,012 lines | objective "I'll compare my saved context companies against fresh sentiment signals…" · 9 sources · 20.3 s |
| `sse-pdf-report.log` | Generate a short PDF report on the portfolio's sentiment this week. | 07:26:00.463 | 07:26:33.823 | 07:26:38 | 1,552 lines | step labels "Locating uploaded portfolio document" → "Gathering weekly sentiment signals" → "Generating portfolio sentiment report"; `ondemand.artifact` creating → ready (`art_f956cc6db15e`, 8,922 B) **before** `[DONE]`; OnDemand Media API answered HTTP 500 from this non-public origin → `mediaStatus: failed`, backend copy served |

Each line is `HH:MM:SS.mmm<TAB>data: {frame}`.

## Headless-browser checks (ui-validator, 1440×900 + 390×844, screenshots in `screenshots/`)
| label | page | asserted |
|---|---|---|
| `chat-run-live` | /chat?q=… (live) | thinking-block above the first working-row, no `rail-plan`, no horizontal overflow |
| `chat-run-settled` | /chat?q=movers (settled) | DOM order run-header → thinking-block (collapsed) → working-list (done) → answer-block → sources-list → answer-badge; ≤1 plan-stepper; no rail-plan |
| `chat-report-artifact` | /chat?q=PDF report | inline-artifacts card rendered above the Sources strip |
| `artifacts-empty` | /artifacts (empty) | artifacts-empty image decoded, thread + date filters present |
| `artifacts-page-report` | /artifacts | report PDF card listed (document) |
| `artifacts-side-pane` | /artifacts → Open | side-pane with PDF iframe (`side-pane-pdf`) at both viewports |
| `company-1au-pitchbook` | /company/1au | PitchBook panel present |
| `news-pulse` | /news | "2,100 news items across 137 companies", "Δ vs previous run" populated, no "No deltas yet" |
| `overview` | /overview | "live backend" badge, no "cached snapshot" |
All passed; 0 page errors; scrollWidth ≤ viewport at 390 px on every page.

## Playwright `web/e2e/upload-artifacts.spec.ts` (desktop project, serial): 6/6 passed — `playwright-upload-artifacts.json`
Upload-only turn: both chips reached `ready` (grounded `local` — Media API 500 from 127.0.0.1), agent cited the file names; blurred memo → "No transcription can be produced: the attached image carries no machine-readable text…" (never invented text); failure path red chip + retry → recovers; empty state renders; 390×844 no overflow.

## Gates
tsc (web) 0 · tsc (backend) 0 · `next build` exit 0 · backend `npm test` pass · eventmap 49/49 · secret scan: 0 hits of the OnDemand apikey / INGEST_SECRET / token patterns in `.next` and tracked files · broken images: 0 on the pages above.
