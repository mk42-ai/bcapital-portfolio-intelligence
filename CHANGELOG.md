# Changelog

## 2026-10-11 — brand icon set wired (`9f786f6` → `31a9ada`…)

### Added
- **Ten flat-line brand icons** (`web/public/brand/icons/icon-{writer-compose,research-search,compare,stock-market,fervo-geothermal,
  portfolio-listing,agent,autonomous-mobility,news-sentiment,payments-fintech}.png`, 1024², 2px charcoal #1F2937 strokes, one #0AC985 accent;
  PNG magic + dimensions verified before wiring, sha256 in `web/public/icons/icon-manifest.json`). Registry `web/src/lib/brand-icons.ts`
  (`brandIconForPlugin / brandIconForOperation / brandIconForCompany / brandIconForStarter / EMPTY_STATE_BRAND_ICON`), component
  `web/src/components/ui/brand-icon.tsx` (`img[data-testid=brand-icon][data-icon][data-slot]`).
- Wired into: plugin/tool icon slots via `pluginIconFor()` (B Capital mark → shipped SVG → **brand icon** → favicon chain → monogram; the
  Portfolio Plugin keeps `/brand/b-capital-mark.png`), the run status row mini icon (running tool / operation / "Writing the answer"), Outputs
  step rows (`data-operation-id`, bridge now forwards `operationId`), the inspector context list and `/companies` cards (company glyphs),
  welcome starters, and the no-results / no-news / no-selection / no-plugins empty states.
- `web/e2e/brand-icons.spec.ts` (1440×900 + 390×844 against the live preview): every icon renders with `naturalWidth > 0`, artifact card
  arrives before DONE, the live 2,100 data point is present, no `rail-plan` elements, 0 console/page errors. Unit: `test:brand-icons` 62,
  `test:plugin-icons` 28.

## 2026-10-11 — turn 4: run-view payload filter, answer-view fixes, pdf.js artifacts, data reconciliation, Portfolio Plugin registered (`c63fddb` → )

### Added
- **Run view** (`t4/u1`): planner tool-definition JSON (`{"pluginId"…, "api_request_parameters"…, "… 2048 chars each"}`) no longer streams
  as Thinking — the bridge classifies every reasoning delta (`classifyThinkingDelta`) and routes payload spans to a new
  `ondemand.planner_payload` frame rendered as a collapsed **"Planner payload"** disclosure inside Outputs (`planner-payload`); the Thinking
  header tail shows the last *prose* line only. Friendly plugin labels (`pluginLabel`: "Web search (Perplexity)", "OnDemand Agent", "PitchBook",
  …) with the raw id in `title`/`data-plugin-id`. "Jump to latest" pill gets a scroll-area pad + backdrop so it never covers a Working row.
  Live before-state on main@04dd11d: 22 of 78 thinking deltas were JSON-looking (`web/proof/unit1/stream-before.summary.json`).
- **Answer view** (`t4/u2`): thread titles ellipsise with a full-title tooltip (`thread-title`); the chat context payload is built at SEND time
  from the live company-chip state (`web/src/lib/chat/context-payload.ts`, 24 unit assertions) with distinct `sentiment_score` /
  `sentiment_delta_vs_prior_run` / `run_status: "first run"` fields and a `Context: N companies — …` line under the composer
  (`context-line`); "Investor matches — 5 of 724 shown"; footer timings split into `tools Y s` vs `answer W s` (`data-tools-ms`,
  `data-answer-ms`). `prior_run_at` is mapped from the backend into the chat context.
- **Artifacts** (`t4/u3`): inline PDF rendering with **pdf.js 4.10.38** canvas pages (`pdf-pages`, worker at `/pdf.worker.min.mjs`) in both the
  chat side pane and the /artifacts preview, with a fallback (preview-unavailable / open-externally icons + Open / Tab / Download); compact
  card is a 2-row grid (no overlapping chips); one meta line `[vN] · size · age`; report filenames derived from the answer's H1
  (`reportFileName` → `portfolio-summary-2026-10-11.pdf`, old prompt slug kept as `alias` on the SSE frame; 14 unit assertions);
  `version-history.png` on the history toggle, `empty-artifacts.png` in the empty state; floating count badge merged into the Artifacts nav item
  (`nav-artifacts-count`); bundle manifest/README/ASSET_BUNDLE.md updated in place (21 → 25 entries).
- **Data** (`t4/u4`): `scripts/news-reconciliation.ts` + `GET /news/reconciliation` (raw / deduped(url) / deduped(title) / in-window 30d & 7d /
  no-url, per company) and `GET /sentiment/runs`; `/companies` now exposes `sentiment.scored_at`, `prior_run_at`, `prior_score`, `model`,
  `ingest_run_id`. Second sentiment pass (rule:news-mean-v1, stored corpus only — the step-2 web search returned ZERO sources, nothing
  fabricated) run locally (seed DB committed, `ing-2026-10-11T100803Z-42fde1`) and against the live backend: 0 companies with a null delta.
  **Portfolio Plugin registered**: `plugin-1791713636` / `agent-1791713636` "B Capital Portfolio Intelligence" via the AI tool generator
  (the documented `POST /plugin/v1` path still answers HTTP 500 with an empty body for the live-derived 3.0.3 schema — log:
  `proof/data-lane/plugin-registration-2026-10-11b.log.txt`); chat verification answered from live backend data; portfolio-internal questions
  now route to it first (`resolvePluginIds(…, query)`). `MEDIA_ALLOW_VIDEO` flag (default off) for mp4/webm uploads, documented in
  `web/.env.example` / `web/.env.test.example`.
- **Tests** (`t4/u5` + units): `upload-e2e` (PDF + PNG → Artifacts tagged input, icons, counters +2/+1/+1/+2, download), `routes-clean`
  (6 routes × 2 viewports, 0 console/page errors), `thinking-json-filter`, `thinking-pinned-working-row`, `title-ellipsis`, `context-sync`,
  `pdf-inline-render`, `chip-overlap`; `playwright.evidence.config.ts` runs them all with video + trace.

### Reconciliation (computed from the backend, as of 2026-10-11)
2,104 = raw rows before de-dup (now 2,100 after `dedupe-news.ts`); 182 does **not** reproduce from `latest_news` (Σ = 2,037, capped 25/company)
— it is the plugin-directory page count; 150 = 19 + 33 + 37 + 38 + 23 reproduces exactly under the `/news/summary` rule for the five focus
companies. Full table: `proof/data-lane/news-reconciliation-2026-10-11.md`.

## 2026-10-11 — turn 3 continuation: artifacts card v2, stream audit, thread re-open, asset bundle, evidence suite (`e51d6ec` →)

### Added
- **Artifacts card v2** (`turn3/artifacts`, f7fed3a): `[type icon] name · [kind] [vN] [status chip] [input|generated]`; status chip
  `artifact-status` = Verified (green, bytes in backend AND OnDemand media stored or generated output answering) · Processing (amber) ·
  Stored locally (grey) · Failed (red); lazy **preview snippet** (`artifact-snippet`: first 240 chars for text/markdown/csv/json, honest
  "PDF · N KB · page preview on open" / "Video · opens in the side pane" otherwise, ≤1 fetch per id, never >2 MB); **version history**
  (`artifact-versions-toggle` → `artifact-version-row` with per-version Download) backed by new `GET /artifacts/{id}/versions`
  (+ OpenAPI, + `scripts/test.ts` case, + web proxy `/api/artifacts/[id]/versions`); richer empty state with "Go to Chat".
- **Raw upstream SSE audit** (`turn3/stream`, 1b0a891): `web/scripts/record-upstream-sse.mjs` recorded a 3-step run straight from
  `api.on-demand.io` (699 data frames, 47.96 s to `[DONE]`): eventTypes planning_thinking/planning_output/step_thinking/step_output/
  plugin_sources/fulfillment_thinking/fulfillment/metricsLog + 15 heartbeats — **zero `message/statusLog` frames, so `summarize_history.initialized`
  / `.completed` were not observed**; the "Summarising step N" checkpoint is bridge-derived (step boundary = `plugin_sources(N)` → first frame of
  step N+1). Documented in `docs/ONDEMAND_SSE_FRAMES.md` + 12 new eventmap assertions (60/60).
- **Thread re-open after reload** fixed: OpenUI only called `loadThreads()` from its own sidebar (replaced by our shell) → `Persistence` now
  loads threads on mount; `/chat?thread=<id>` deep link; new `web/e2e/thread-reopen.spec.ts` (1/1 passed against the deployed build).
- **Run-view order** now exactly the contract: … answer → (8) collapsed sources strip → (9) Artifacts card → data gap → (10) footer;
  `browser-action-done` button on the awaiting_browser_action card; 390 px pass (header ≤2 lines, Working label ellipsis, favicon strip ≤5,
  stacked prompt buttons, `overflow-wrap:anywhere` on answer links/code).
- **Asset bundle** (`turn3/assets`, 08d4e05): `web/public/assets/bundle/` (icons/file-types ×13, icons/upload-states ×4, charts ×2,
  illustrations ×2, `manifest.json` with sha256 + measured palettes + roles, `README.md` icon spec) and `web/docs/ASSET_BUNDLE.md`;
  the deliverable `ondemand-artifact-asset-bundle.zip` (14.6 MB) is built from the same files. All 17 icons already in
  `web/public/icons/artifacts/` are byte-identical (sha256) to the bundle.

### Verified on the redeployed sandbox (frontend https://sb-485hwxjqqz7l.vercel.run · backend https://sb-22j0v0grzslt.vercel.run, e51d6ec)
- Gates: root `tsc` 0 · web `tsc` 0 · `next build` exit 0 · `scripts/test.ts` all passed · `test:eventmap` 60/60 · secret scan 0.
- Routes `/overview /company/1au /news /chat /artifacts /settings` 200, 0 console / 0 page errors; `/artifacts` renders `artifact-status`,
  `artifact-version`, `artifact-versions-toggle`, `artifact-download` at 1440×900 and 390×844 (ui-validator).
- Live docs re-fetched 2026-10-11T08:17Z: the five reference PDFs/HTML and the five OpenAPI fragments are sha256-identical to the committed copies.

## 2026-10-11 — seven-lane parallel build (run view · artifacts · media · uploads · data · QA), merged at `375484e`

Orchestrated as seven time-boxed lanes on separate branches (`lane/a`…`lane/g`), each pushed as soon as it was green, then merged into `main`
(plus the parallel session's `ecc4325`/`aea689a`/`33bbacc`/`df35047`/`ef17c05`). Gates on the merged tree: root `tsc --noEmit` 0 errors,
web `tsc --noEmit` 0 errors, `next build` exit 0, secret scan 0 hits, `scripts/test.ts` all passed, `test:eventmap` 49/49.

### Added
- **Lane A — `web/docs/stream-contract.md`**: every submit-query v1 SSE event (thinking ×5, statusLog ×15 incl. `summarize_history.*`,
  `plugin_sources`, `fulfillment`, `metricsLog`, `clarification_request`, every `ondemand_agent.*` subtype, heartbeat, `[DONE]`, `[ERROR]`) mapped to
  its bridge CUSTOM frame, UI block (positions 1–10) and data-testid; media create/fetch/delete schemas copied from the LIVE OpenAPI fragments
  (`docs/reference/doc-*.json`, fetched 2026-10-11T06:55Z); persistence rule = `mediaId` + UNSIGNED `sourceUrl`, re-sign on open via fetch media.
- **Lane B — run view** (`chat-shell.tsx`, `shell.css`, `run-rail.tsx`): run header (`run-header`: model · reasoning · plugin chips · live `run-timer`
  driven by `startedAt` + interval, so heartbeat-only stretches still tick; frozen at `finishedAt`), Thinking pinned at top with NO character cap
  (12 000 / 4 000 / 6 000-char slices removed; persisted copy capped at 200 000), phase chips Planning / Step n / Answer (`thinking-phases`,
  `data-phases`), fixed-height auto-scrolling body (240 px, 160 px ≤640 px), collapses to "Thought for N s" on the first answer token and never
  moves; ONE thinking block per turn (PendingRow hides once the live RunView mounts); Working rows keep ≥1 favicon, `OutputsCard` never shows an
  empty `{}`; live red `data-gap` sentence (#EF4444) as soon as a call fails; footer timings `run-footer` (first event · first token · total ·
  tokens) rendered live once the answer is done; duplicate plan removed from the "This run" rail.
- **Lane C — Artifacts**: backend columns `media_source_url` (query string stripped server-side — a signed SAS URL is never persisted),
  `media_url_expires_at`, `media_external_user_id`, `media_plugins` (idempotent boot `ALTER TABLE`), `GET /artifacts/{id}/signed-url`
  (OnDemand fetch-media lookup, 10-min cache, honest `source:"backend"` fallback — always 200 for a known artifact), web proxy
  `/api/artifacts/[id]/signed-url`, Open/Download re-sign first; full saved icon set via pure `iconFor()` (pdf · document · spreadsheet ·
  presentation · image · video · audio · chart · code · json · archive · link · generic, upload idle/progress/success/failed; webp `<picture>` with
  PNG fallback); `/artifacts` header mark + empty state (`artifacts-empty`), filters by type / thread / date, media badge green only when
  `mediaStatus=stored`. Chat + media relays now pass the unsigned sourceUrl/expiry/externalUserId/plugins through `saveArtifact`.
- **Lane D — `web/e2e/upload-journeys.spec.ts`**: PDF + DOCX + 3 image fixtures (geothermal-plant, bar-chart, blurred-memo — the memo MUST be
  declared unreadable; regex-asserted, no invented contents), failure state (`.exe`, empty file) + mocked-503 retry → recovery, /artifacts
  persistence after reload, latency log. Proof under `web/proof/upload-journeys/`.
- **Lane E — media** (`web/src/components/media/*`, `media.css`): fixed-aspect stream thumbnails (`image-thumb`) → lightbox (+ "Open in side
  pane", Download); videos render a poster + play button only (lazy canvas poster, no `<video controls>` and no autoplay in the stream) and play in
  the side pane; `SidePane` (`side-pane`) next to the chat (460–520 px ≥1024 px, full-screen sheet below) with PDF `<object>`, text/markdown/csv,
  sandboxed html, honest "Preview not available" for docx/xlsx/pptx; `openSidePane()` / `openArtifactInPane()` API.
- **Lane F — data**: ONE `newsTotal()` definition (rows of listed companies, orphans excluded, de-duplicated by `(company_slug, url)`) used by
  `/health`, `/companies`, `/news/count`, new `GET /news/summary`, `/refresh/status` and the frontend (News Pulse lede, Overview KPI tile, company
  page); measured live: raw Σ 2 104 → 4 duplicate (slug,url) pairs → **2 100** (seed DB de-duplicated and committed; the 1 849 figure was a
  transient fallback render and is no longer reachable). Sentiment pass 2 (`rule:news-mean-v1`, ingest `ing-2026-10-11T071024Z-cf03d9`) written
  back for the 131 companies that still had `delta = null` → **0 null deltas of 136**; focus deltas: Fervo −0.25, Flutterwave +0.04, Apptronik
  +0.24, WRITER +0.42, Perplexity +0.69. Data-source badge unified (`data-source-badge` live | partial (amber) | snapshot; global
  `backend-status` now `no-store`, 4 s timeout).
- **Lane G — QA harness** (`web/scripts/record-sse.mjs`, `brand-audit.mjs`, `qa-summary.mjs`, `web/e2e/qa-final.spec.ts`, projects `qa-final`
  1440×900 + `qa-final-mobile` 390×844): full SSE recording to `[DONE]`, artifact-chain check, state screenshots, console errors per route, brand
  audit, smoothness score. Baseline (6305876) + final (375484e) runs under `web/proof/qa-final/`.

### Changed
- Brand audit rule: a colour fails when hue ∈ [190, 260], saturation > 0.15 **and chroma > 0.15** — the brand charcoal `#1F2937` and tailwind
  grey inks are neutral (chroma 0.09), every real blue (`#1d4ed8`, `#3898EC`, `#000D5E`) still fails. A portfolio company's own accent dot on
  its page is excluded like its palette swatches (`data-hue-audit-ignore`).

### Measured on the final deployment (frontend https://sb-485hwxjqqz7l.vercel.run · backend https://sb-22j0v0grzslt.vercel.run, 375484e)
- Report SSE: first event 110 ms · first token 30,974 ms · total 39,035 ms · heartbeats 3 · `[DONE]` seen;
  artifact `creating@37869 ms → ready@39033 ms` (frame 520) **before** `RUN_FINISHED` (frame 522) and `[DONE]` (frame 523);
  `/api/artifacts` lists `write-a-short-portfolio-report-on-report.pdf` (16478 B, mediaStatus stored, mediaId 6acb3d18cf3ee6ce347391ea); `/content` 200 + `%PDF`;
  `/signed-url` 200 `source=backend` (the OnDemand media object points at the 2 h upload relay, so the durable copy is the backend blob).
- News SSE: first event 26 ms · first token 16,336 ms · total 20,551 ms.
- Routes `/overview /company/1au /news /chat /artifacts /settings`: HTTP 200, 0 console errors, 0 page errors at 1440×900.

### Still open (documented, not faked)
- **Portfolio Plugin registration** — `portfolio_plugin_id` stays `null`. 23 REST variants of `POST /plugin/v1` + 2 MCP `plugin_create` calls:
  string `schema` → `{"message":"schema is required","errorCode":"invalid_request"}`; object `schema` → `json: cannot unmarshal object into Go
  struct field PluginAction.action.schema of type string`; `identifier=rest` → `invalid agent identifier`; AI tool generator → `context deadline
  exceeded`. `GET /plugin/v1/list` total 0. Log: `proof/data-lane/plugin-registration-2026-10-11.log.txt`. Frontend already orders the plugin
  first once `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID` is set.
- Re-opening a thread after a full page reload on `/chat` is not reliable in the UI (thread list hydration) — the user bubble's attachment chips
  therefore cannot be asserted after reload; `/artifacts` persistence after reload passes.
- `video-side-pane` screenshot: no video artifact is produced by any current flow (honest n/a).
## 2026-10-11 — recovery run (lanes A–G): run view v2, artifacts re-sign + side pane, uploads E2E, data reconciliation, redeploy

### Added
- `docs/reference/event-ui-contract.md` (SSE event → UI block map, prompt addenda, Media API endpoints) and `docs/data-reconciliation-2026-10-11.md`.
- Run header with live timer (heartbeat-driven), Thinking phases Planning / Step n / Answer, action-style Working rows, footer timings (`chat-shell.tsx`, `eventMap.ts LABEL.action/done`).
- Planner / step / answer prompt addenda prepended by `/api/chat` (first-person "I'll…" objective ≤ 22 words, `[action label]` step queries, single "Data gap:" sentence).
- Artifacts: `media_url` / `media_source_url` columns, backend `GET /artifacts/{id}/open` and `/signed-url`, web `/api/artifacts/{id}/open` + `/signed-url`, `SidePane` (documents beside the chat, video playback, image view), thread/date filters and per-type icons on `/artifacts`, "Open" on every card.
- `web/e2e/upload-artifacts.spec.ts` (6 tests) + `upload-journeys.spec.ts`; recordings and screenshots under `web/proof/run-ux/2026-10-11-recovery/`.

### Changed
- Thinking is uncapped (the 4,000 / 6,000 / 12,000-char slices are gone); the plan checklist renders once (rail copy removed); in-stream video shows poster + play and never autoplays; `BackendStatus` probes `/health` per request (no 60 s ISR), so the rail badge and the page badge agree.
- Sentiment pass 2 written for all 137 companies (`ing-2026-10-11T0704*`), News Pulse "Δ vs previous run" now populated; news total served from `/news/summary` (2,100 de-duplicated).
- Redeployed: backend https://sb-185s3jbbgatn.vercel.run, frontend https://sb-4ngs1cqv9b55.vercel.run (see HANDOFF §2 / §16).

### Still blocked
- Portfolio Plugin registration: `POST /plugin/v1` answers 400 `schema is required` (string) / 400 `cannot unmarshal object` (object) / 500 (minimal spec); register via the console and set `NEXT_PUBLIC_PORTFOLIO_PLUGIN_ID`.
- OnDemand Media API returns 500 for files published from a non-public origin (local runs) — artifacts are stored in the backend with `media_status: failed`; on the deployed sandbox the same flow stores with a real media id.

## 2026-10-11 — asset restore (icons · upload states · fixtures · reference docs)

### Added
- `web/public/assets/artifacts/` — 13 file-type icons (doc, pdf, image, video, audio, spreadsheet, presentation, chart, code, json, archive, link, generic).
- `web/public/assets/upload/` — 4 upload-state icons (idle, in-progress, success, failed).
- `web/public/assets/artifacts-ui/` — 7 earlier Artifacts/upload UI icons (artifacts-header, artifact-document/-image/-video, upload-attach, upload-failed-retry, artifacts-empty).
- `web/public/assets/misc/` — bar-chart original/refined, geothermal variation a/b.
- `web/tests/fixtures/upload/` — upload E2E fixtures: geothermal-plant.png, bar-chart.png, blurred-memo.png, plus `OnDemand-Outputs-Panel-Spec.pdf` (copied from `docs/`) and `compendium.docx` (copied from `web/e2e/fixtures/ux/`; `docs/` holds no DOCX).
- `docs/reference/ondemand/` — SSE reference, Run UX Before/After (HTML + PDF), Outputs Panel Spec, Agent Videos supporting document, Platform Architecture.
- `web/public/assets/manifest.json` — array of `{name, path, role, source_blob_id, bytes, sha256, saved_at}` for every restored file.

### Restored
- The six `d624130` glyphs (`composer-ask`, `credentials-card`, `browser-action-card`, `pitchbook-synced`, `new-chat-empty`, `voice-orb-thinking`) at `web/public/assets/<name>.png` — the whole `web/public/assets/` tree had been dropped by merge `076c6b6`, so they were re-downloaded rather than found.

### Notes
- Nothing was regenerated: every file is the original blob, verified by magic bytes (PNG `89 50 4E 47`, `%PDF`, `<html`) and sha256 (table appended to `web/docs/HANDOFF.md`, section "Asset restore 2026-10-11").

## 2026-10-11 — Run UX step 1 · Artifacts · media/uploads · 2,104 news · sentiment pass 2

### Added
- **Run view (one reducer, fixed order, identical live and settled)** in `web/src/components/chat/open-intelligent-ui/chat-shell.tsx`, inside the kept OpenUI `AgentInterface` (`/api/chat` still adapts OnDemand SSE → AG-UI). The order within each turn is: **Thinking** pinned at the top (live ticker, auto-collapses to "Thought for N s" at the first answer token) → **Plan** checklist with its objective → **Working** rows, one per plugin action, drawn *before* the action, with favicon chips (never an empty `{}` box) and resolving to done (N sources · s) or a red failed state → between-step **summary** cards → **Outputs** card (`step_output`) → interactive **prompts** (awaiting_input / require_creds / awaiting_browser_action) → **answer** with publisher-first citation chips (+N overflow) → inline **image grid + lightbox**, **video player**, **artifact cards** → a numbered **Sources** list, collapsed, under the answer → one **Data gap** sentence when something fails.
- **First-event skeleton**: Thinking and Working placeholders render on send. Measured first skeleton is 201–284 ms, against the 34.9–82 s first-token wait seen upstream.
- **Artifacts**:
  - Backend `POST/GET /artifacts`, `GET /artifacts/{id}`, `GET /artifacts/{id}/content`, `DELETE /artifacts/{id}`. Bytes are stored in SQLite, capped at 25 MB, with versioning by name+thread. All of these are in `/openapi.json`.
  - Web proxies under `/api/artifacts/*`.
  - Side **Artifacts panel** plus an **`/artifacts`** route. Both show filters, thumbnails, the Step 3 type icons, preview (image/video/PDF/text), version, timestamp, download and delete.
  - The panel auto-populates from `ondemand_agent.file_written` / `artifact_ready`. Report asks also produce a PDF artifact (`bridge.report`), which is registered with the OnDemand Media API.
- **Uploads**: every composer upload is persisted as an Artifact. A new local DOCX/PDF text extractor (`web/src/lib/media/extract.ts`) is used only when OnDemand media create fails, and those chips are labelled `local`.
- **`news_count`** per company, plus **`news_total`** on `/companies` and `/health`, taken from `news_items`. The live sum is **2,104**.
- **`web/e2e/run-ux.spec.ts`**: upload and report journeys at 1440×900 and 390×844, recorded on video. Each action is logged with an ISO-8601 UTC timestamp, and each run gets a measured smoothness score out of 10. Outputs are in `web/proof/run-ux/` (`score-history.json`, `TEST-LOG.md`, `iter10-live/` videos + screenshots).
- **`docs/ONDEMAND_SSE_FRAMES.md`**: live docs fetched 2026-10-11T00:42:58Z. Covers the Media, Chat, Services and Flow Builder endpoints, and every SSE frame type.
- **`scripts/sentiment-pass2.ts`**: deterministic second scoring pass (`rule:news-mean-v1`).

### Fixed
- **182/197 news assumption**: News Pulse now sums `GET /companies/{slug}/news` for all 137 companies, giving 2,104 items. The chat context and inspector use `news_count`, not `latest_news.length`.
- **Sentiment deltas** are now non-null for Perplexity AI (+0.69), Apptronik (+0.24), Fervo Energy (−0.25), Flutterwave (+0.04) and WRITER (+0.42), from ingest run `ing-2026-10-11T004631Z-b4adfa`.
- **Chat CLS**: `.chat-main` lost its viewport height while a run streamed. The page grew from 900 to 2,192 px and the composer jumped twice (CLS 0.41). It is now pinned. Sources now mount after the answer finishes, the live Thinking body has a fixed height, there is a 1-line Thinking ticker at 390 px, and the stall band sits under the Working rows. Desktop report CLS went from 0.63 to 0.02.
- **`/artifacts` CLS 0.14**: the page now waits for the first backend refresh instead of painting a stale cached list.

### Still blocked (documented, not faked)
- **Portfolio Plugin** `portfolio_plugin_id = null`. `POST https://api.on-demand.io/plugin/v1` (via `scripts/register-plugin.ts`) returned 400 `{"message":"schema is required","errorCode":"invalid_request"}` at 2026-10-11T01:12:00Z with a JSON-stringified OpenAPI in `action.schema`. MCP `plugin_v1_plugin_create` returned an empty body at 01:12Z, and `suggest_plugins` shows no "Portfolio Plugin". Registering through the console is the remaining path.
- **OnDemand Media API from a non-public origin**: a local `next start` received HTTP 500 `errors.server_error`, because OnDemand cannot fetch a 127.0.0.1 blob URL. In the deployed sandbox, all 5 fixtures and both report PDFs were `stored` with real media ids (e.g. `6acaf1a1c536376e5904a2b9`).

## 2026-10-10 — images · PitchBook · companies scroll · upload · voice (30-agent continuation)

### Added
- **`GET /api/img`** same-origin image proxy (image/* only, 3 MB cap, 1 h LRU, SSRF guard, 204 on any failure) + resolution chain article → company logo → publisher favicon → monogram → `public/fallbacks/news-tile.webp`; reserved 96 px boxes, `loading=lazy decoding=async fetchPriority=low`.
- **Image audit** (`web/proof/images/`): 136/136 logos ok; 1,854 news rows → 658 broken before the proxy (577 null `image_url`, 61 HTML responses, 13 `http://`, 4 hotlink 403, 3 timeouts).
- **PitchBook**: `src/pitchbook.ts` (brief builder, markdown parser, provenance), table `pitchbook_records`, `GET /pitchbook`, `GET /pitchbook/:slug`, `POST /pitchbook/ingest` (records or slugs, async jobs, salvage of truncated LLM payloads), `POST /pitchbook/run` (Flow Builder execute relay); weekly workflow **`6aca3d3faeef8927baa25a05` "B Capital — PitchBook weekly enrichment"** (cron `0 0 6 * * 1`, Mon 06:00 UTC, active); 136/136 records in the DB. UI: PitchBook card on the company page and in the chat rail, fact chips with provenance + freshness, honest `NOT_AVAILABLE_FROM_PLUGIN` lines, "Ask in chat" / drag chips into the composer (adds `plugin-1777018662` for that turn).
- **`/companies`**: window-virtualized single-scroll list (@tanstack/react-virtual), sticky filter header, A–Z rail, scroll restoration, roving keyboard focus, iOS momentum; root cause in `web/proof/companies-scroll-root-cause.md`.
- **Upload**: `POST /api/media` (25 MB, allow-listed types, OnDemand Media API with the per-kind plugin id, local-grounding fallback when upstream answers 500/400 for plain text), `GET /api/media/blob/:token`, composer attachments (drag-drop, paste, picker, progress chips), `context.attachments` → extracted text prepended to the query + `ondemand.attachments` frame; verified live: "The Zephyr-7 pilot plant produced 41.7 MWh on 3 March 2026 [attachment: z7.md]".
- **Voice**: `POST /api/voice/tts`, `POST /api/voice/stt`, `GET /api/voice/clip/:token` (OnDemand `text_to_speech` / `speech_to_text`, verified live: TTS 200 → 3.19 s mp3, STT exact round-trip), mic capture with RMS VAD (push-to-talk / hands-free), sentence-chunked TTS queue with barge-in, brand-green orb dock in the composer, captions (`aria-live`), `Permissions-Policy: microphone=(self)`.
- **eventMap**: `CLIENT_EVENT.attachments` / `.voice`, `MEDIA_EVENT`, `UPSTREAM_UNKNOWN_POLICY`, `classifyClientFrame`, 49 unit assertions (`npm run test:eventmap`).
- `docs/ONDEMAND_CONTRACTS.md` — live-fetched OpenAPI contracts (Media, Services, Submit Query, Flow Builder) with fetched_at.

### Changed
- Brand sweep: `--primary` / `--ring` / badges / switches / selection / chart accent moved from blue (#1d4ed8) to the B Capital green family (#047857 ink, #0AC985 ring).
- Step-5 bridge deltas found only on the sandbox were synced into git (monotonic `seq` frame ids, session pre-warm, early plan, adaptive markdown cadence).
- Composer host observers no longer ping-pong (voice panel / attachments / context chips) — fixed a page freeze.
- PitchBook relative times render after mount (React #418).

## 2026-10-10 — owner QA pass (`qa: full-screen chat, rail cleanup, pitchbook first-paint, citations`, d25d486 → merge 076c6b6)
- /chat is one full-width thread canvas: OpenUI thread sidebar slot emptied, app-owned composer row (Attach · textarea · mic · send), slim top bar (title · New chat · Threads · Inspector).
- Primary nav rail: 224 px expanded / 56 px icon mode (collapsed by default on /chat); inspector drawer holds This run · PitchBook · Company context · Model & plugins; telemetry + raw SSE frame behind one `dev-disclosure` reveal.
- PitchBook: committed snapshot `web/src/data/pitchbook-snapshot.json` (136 companies) rendered server-side on the company page and in the drawer — no Run-now button, no execution ids, zero `/pitchbook|execute|workflow/` requests on load; "Ask in chat" appends to the composer draft.
- Brand: blue-hue purge (tokens, charts, OpenUI theme, shell CSS) — computed colours stay below 0.15 saturation in the 190–260° band; `e2e/brand-hue.spec.ts`.
- Citations: publisher-first chips with a "+N" overflow after three per claim.
- QA evidence: `web/proof/qa-owner/` (36/36 checks at 1440×900 and 390×844, `qa_results.json`), specs `e2e/qa-owner-{a,b,c}.spec.ts`.

## 2026-10-10T23:29Z — backend redeploy (no code changes)
- `B Capital Portfolio Intelligence API` redeployed from the committed tree (`npm ci` → `npm run build` → `node dist/server.js`, seed `data/portfolio.sqlite`) to https://sb-4wg000bgek46.vercel.run after the previous sandbox expired; `/health` 200 (`db_record_count` 136), `/openapi.json` 3.1.0, `scripts/contract-test.ts` 12/12.
- Frontend `.env` (git-ignored) repointed and rebuilt at https://sb-1mw4ywgyt3fa.vercel.run (the earlier frontend sandbox had also expired); `/overview`, `/company/1au`, `/news`, `/chat` verified 200 with the live-backend badge and zero console errors at 1440×900.
