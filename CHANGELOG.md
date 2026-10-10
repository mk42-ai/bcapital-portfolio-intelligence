# Changelog

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
