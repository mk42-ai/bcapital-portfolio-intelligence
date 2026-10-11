# Evidence suite — proof/evidence (turn3/e2e)

Run against the LIVE deployment https://sb-485hwxjqqz7l.vercel.run (backend https://sb-22j0v0grzslt.vercel.run) with `playwright.evidence.config.ts` (video `on`, trace `on`, screenshot `on`, workers 1, retries 0). Spec: `web/e2e/evidence.spec.ts`. Run log with timestamps: `run-times.txt`; per-step ISO-UTC log: `evidence-log.ndjson`; latencies: `latency.json`; raw results: `results.json`.

Command: `cd web && BASE_URL=https://sb-485hwxjqqz7l.vercel.run API_URL=https://sb-22j0v0grzslt.vercel.run npx playwright test -c playwright.evidence.config.ts --workers=1`

Final run (RUN3): 2026-10-11 08:45:55Z → 08:48:09Z — **9 passed, 3 skipped (T5/T6/T7 are desktop-only by design), 0 failed**.

## Pass/fail per test per viewport

| Test | Project / viewport | Status | Duration | Video | Trace | Screenshots |
|---|---|---|---|---|---|---|
| T1 — document upload → chip ready → grounded answer cites the file → artifa | evidence-desktop (1440×900) | **PASSED** | 12.8 s | test-results/evidence-Evidence-suite-T1-ce857-t-listed-with-source-upload-evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T1-ce857-t-listed-with-source-upload-evidence-desktop/trace.zip (36316 KB) — NOT committed (>12 MB), kept locally | t1-0-chat.png, t1-1-chip-ready.png, t1-2-answer.png, test-finished-1.png |
| T2+T3 — image upload → thumb in chip → answer → message-images grid → lightbox | evidence-desktop (1440×900) | **PASSED** | 25.2 s | test-results/evidence-Evidence-suite-T2-04c7e--lightbox-side-pane-preview-evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T2-04c7e--lightbox-side-pane-preview-evidence-desktop/trace.zip (42028 KB) — NOT committed (>12 MB), kept locally | t2-1-chip-thumb.png, t2-2-answer.png, t3-1-lightbox.png, t3-2-side-pane.png, test-finished-1.png |
| T4 — reload persistence → /artifacts lists both files (hard) → thread re-op | evidence-desktop (1440×900) | **PASSED** | 10.1 s | test-results/evidence-Evidence-suite-T4-16cb3-hread-re-open-on-chat-soft--evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T4-16cb3-hread-re-open-on-chat-soft--evidence-desktop/trace.zip (27585 KB) — NOT committed (>12 MB), kept locally | t4-0-after-reload.png, t4-1-artifacts.png, t4-2-chat-reopened.png, test-finished-1.png |
| T5 — download → PDF bytes (download event | new tab | request.get fallback) | evidence-desktop (1440×900) | **PASSED** | 1.5 s | test-results/evidence-Evidence-suite-T5-ef8d7-ation-pdf-starting-with-PDF-evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T5-ef8d7-ation-pdf-starting-with-PDF-evidence-desktop/trace.zip (1832 KB) | t5-1-after-download.png, test-finished-1.png |
| T6 — video preview → relay allow-list, backend ingest auth, no inline autop | evidence-desktop (1440×900) | **PASSED** | 2.7 s | test-results/evidence-Evidence-suite-T6-e29aa-oster-play-or-icon-fallback-evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T6-e29aa-oster-play-or-icon-fallback-evidence-desktop/trace.zip (10298 KB) | t6-0-artifacts.png, test-finished-1.png |
| T7 — upload failure + retry → .exe error chip (red) → remove → 503 mock err | evidence-desktop (1440×900) | **PASSED** | 15.5 s | test-results/evidence-Evidence-suite-T7-3dfc9-y-→-unroute-→-retry-→-ready-evidence-desktop/video.webm | test-results/evidence-Evidence-suite-T7-3dfc9-y-→-unroute-→-retry-→-ready-evidence-desktop/trace.zip (28276 KB) — NOT committed (>12 MB), kept locally | t7-1-exe-error.png, t7-2-503-error-retry.png, t7-3-retry-ready.png, test-finished-1.png |
| T1 — document upload → chip ready → grounded answer cites the file → artifa | evidence-mobile (390×844) | **PASSED** | 12.1 s | test-results/evidence-Evidence-suite-T1-ce857-t-listed-with-source-upload-evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T1-ce857-t-listed-with-source-upload-evidence-mobile/trace.zip (41905 KB) — NOT committed (>12 MB), kept locally | t1-0-chat.png, t1-1-chip-ready.png, t1-2-answer.png, test-finished-1.png |
| T2+T3 — image upload → thumb in chip → answer → message-images grid → lightbox | evidence-mobile (390×844) | **PASSED** | 26.3 s | test-results/evidence-Evidence-suite-T2-04c7e--lightbox-side-pane-preview-evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T2-04c7e--lightbox-side-pane-preview-evidence-mobile/trace.zip (48385 KB) — NOT committed (>12 MB), kept locally | t2-1-chip-thumb.png, t2-2-answer.png, t3-1-lightbox.png, t3-2-side-pane.png, test-finished-1.png |
| T4 — reload persistence → /artifacts lists both files (hard) → thread re-op | evidence-mobile (390×844) | **PASSED** | 10.3 s | test-results/evidence-Evidence-suite-T4-16cb3-hread-re-open-on-chat-soft--evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T4-16cb3-hread-re-open-on-chat-soft--evidence-mobile/trace.zip (28742 KB) — NOT committed (>12 MB), kept locally | t4-0-after-reload.png, t4-1-artifacts.png, t4-2-chat-reopened.png, test-finished-1.png |
| T5 — download → PDF bytes (download event | new tab | request.get fallback) | evidence-mobile (390×844) | **SKIPPED** | 0.4 s | test-results/evidence-Evidence-suite-T5-ef8d7-ation-pdf-starting-with-PDF-evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T5-ef8d7-ation-pdf-starting-with-PDF-evidence-mobile/trace.zip (21 KB) | test-finished-1.png |
| T6 — video preview → relay allow-list, backend ingest auth, no inline autop | evidence-mobile (390×844) | **SKIPPED** | 0.3 s | test-results/evidence-Evidence-suite-T6-e29aa-oster-play-or-icon-fallback-evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T6-e29aa-oster-play-or-icon-fallback-evidence-mobile/trace.zip (22 KB) | test-finished-1.png |
| T7 — upload failure + retry → .exe error chip (red) → remove → 503 mock err | evidence-mobile (390×844) | **SKIPPED** | 0.3 s | test-results/evidence-Evidence-suite-T7-3dfc9-y-→-unroute-→-retry-→-ready-evidence-mobile/video.webm | test-results/evidence-Evidence-suite-T7-3dfc9-y-→-unroute-→-retry-→-ready-evidence-mobile/trace.zip (22 KB) | test-finished-1.png |

All screenshot paths are relative to `test-results/<dir>/` shown in the Video column. HTML report: `html-report/index.html` (open with `npx playwright show-report proof/evidence/html-report`). The report's `data/*.zip` trace copies >12 MB are not committed (size budget) — the small ones and all `data/*.webm` + `data/*.png` are.

## Measured first-token latency (send click → first answer-block text)

| Project | Test | first token | total turn | answer chars |
|---|---|---|---|---|
| evidence-desktop | T1 do | 4670 ms | 6595 ms | 120 |
| evidence-desktop | T2+T3 | 5197 ms | 7341 ms | 257 |
| evidence-mobile | T1 do | 4304 ms | 6420 ms | 120 |
| evidence-mobile | T2+T3 | 5344 ms | 7161 ms | 167 |

## Annotations / findings recorded by the tests

- **evidence-desktop / T5** `download-path`: page download event → 200 application/pdf 4591 B
- **evidence-desktop / T6** `app-finding`: video upload: video upload not allowed by relay (unsupported_type; allowed: pdf, docx, xlsx, csv, txt, md, png, jpg, jpeg, webp, mp3, wav, m4a)
- **evidence-desktop / T6** `app-finding`: backend ingest: POST https://sb-22j0v0grzslt.vercel.run/artifacts without X-Ingest-Secret → 401 (expected 401/403 — the suite does not hold the secret)
- **evidence-desktop / T6** `app-gap`: no video artifact reachable — the relay allow-list rejects mp4 and the backend ingest needs X-Ingest-Secret; fallback icon verified for kind video via iconFor (/icons/artifacts/video.png + /assets/artifacts/video-256.webp both 200). side-pane[data-kind=video] + <video controls> could NOT be exercised end-to-end.

## Honest gaps / findings

1. **Video preview could NOT be exercised end-to-end (T6).** The upload relay allow-list rejects `.mp4` (`POST /api/media` → 400 `unsupported_type`, allowed: pdf, docx, xlsx, csv, txt, md, png, jpg, jpeg, webp, mp3, wav, m4a) and the backend `POST /artifacts` requires `X-Ingest-Secret` (→ 401 without it; this suite does not hold the secret). No artifact of kind `video` exists on the live deployment, so `video-poster`/`video-play` → `side-pane[data-kind=video]` with `<video controls>` is only covered by the code path, not by this run. What WAS verified: no `video[autoplay]` and no inline `<video controls>` on `/artifacts` or `/chat`; the kind=video fallback icons `/icons/artifacts/video.png` and `/assets/artifacts/video-256.webp` both answer 200 (iconFor path). Fixture `web/tests/fixtures/sample-video.mp4` (29 KB, ffmpeg testsrc+sine, 2 s) is committed for when the relay accepts video.
2. **Thread re-open after reload (T4, soft):** on both viewports the thread WAS re-opened from the Threads menu (`welcomeButtons: 0, menuPresent: 1`) and the user message with its attachment chip came back — so the previously-known gap did not reproduce in RUN3. In RUN2 the same step failed only because of a TEST bug (`.first()` picked the hidden `threads-menu` item before the visible one); fixed in the spec. Had it failed, it is recorded as `app-gap` annotation only (the `/artifacts` listing is the hard assertion).
3. **Download path (T5):** the real Playwright `download` event fired (`/api/artifacts/<id>/content?download=1`, `source: backend`), bytes start with `%PDF`; the same URL re-fetched via `request.get` → 200 `application/pdf`, 4591 B. No new tab was opened (popup path not needed).
4. **Error chip colour (T7):** red state detected via the colour heuristic (r≥150, r>g+50, r>b+50) and class `oiu-att__chip--error`; the exact `rgb(239, 68, 68)` string did not match the computed colour (likely a tinted border/text variant), so the assertion accepts heuristic-red OR error class as specified.
5. **Mobile project runs T1–T4 only** (T5–T7 `test.skip` on mobile, by design of the task: "T8 mobile project runs T1–T4"). The mobile skipped rows still produce a trace/video stub.
6. **Size budget:** traces >12 MB (T1/T2/T4/T7 desktop, T1/T2/T4 mobile — 28–50 MB each, because trace `on` captures every network body incl. the 740 KB PNG and the SSE stream) are NOT committed; they remain in the local worktree `/tmp/wt/e2e/web/proof/evidence/test-results/`. All videos (12 × .webm, 6.4 MB total), all screenshots, the small traces (T5/T6 desktop + the three mobile skipped stubs), the HTML report index + its png/webm data, `results.json`, `latency.json`, `evidence-log.ndjson` and `run-times.txt` are committed.

## Run history (see run-times.txt)

- RUN1 08:29:44Z — crashed in 5 s: Playwright's bundled ffmpeg missing (`ms-playwright/ffmpeg-1013/ffmpeg-linux`); fixed by symlinking `/usr/bin/ffmpeg` (environment, not test).
- RUN1 (retry) 08:33:57Z — both T1 failed in 17 s: the live deployment served **HTTP 400 text/html** for its own `/_next/static` chunks (`layout-04f80e7b…js`, `208-…js`, two css) → "Refused to execute script … MIME type text/html"; by 08:38Z the HTML referenced new chunk hashes (`layout-3f690e7a…js` → 200). Transient deployment flake, not a test bug — recorded, run repeated.
- RUN2 08:40:27Z → 08:43:15Z — T1, T2+T3 green on both projects; T4 hard assertions green; test failed only on the soft thread-re-open step (test-side locator bug, fixed).
- RUN3 08:45:55Z → 08:48:09Z — final: 9 passed, 3 skipped (desktop-only tests on mobile), 0 failed.

## 2026-10-11 turn 4 — plan of record (unit 4b: upload-e2e + routes-clean; evidence config picks up all turn-4 specs)

`playwright.evidence.config.ts` `testMatch` now matches `(evidence|upload-e2e|routes-clean|thinking-json-filter|thinking-pinned-working-row|title-ellipsis|context-sync|pdf-inline-render|chip-overlap).spec.ts` so the orchestrator's final run picks up every turn-4 spec (the last six are written by other units). Both projects (evidence-desktop 1440×900, evidence-mobile 390×844), video/trace/screenshot always on, `--workers=1`.

### `e2e/upload-e2e.spec.ts` (two serial describes, `@1440x900` and `@390x844`, each test ≤ 240 s; log → `upload-e2e-log.ndjson`)
- U1: `/artifacts?skip=1` → read the `.art-chip-n` counters of `artifact-filter-all|document|image|upload` (missing chip ⇒ n/a) → `/chat?skip=1` → paperclip (`attachment-input`) `docs/reference/submit-query-v1-sse-reference.pdf` (4.5 KB) then `tests/fixtures/bar-chart.png` → both chips `data-status=ready` → poll `/api/artifacts?limit=200` (≤ 60 s) for both names with `source: "upload"` (uploads persist at upload time via `/api/media` → saveArtifact) → one short turn "List the two attached files by name in one sentence." (`answer-block` ≤ 120 s, soft) so the files are tied to a thread.
- U2: `/artifacts?skip=1` → both `artifact-item`s present, each `artifact-source` text `input`, PDF `artifact-card[data-icon=pdf]`, PNG `data-icon` `image|chart` (`iconFor` returns `chart` for image names matching /chart|graph|plot/ — bar-chart.png ⇒ `chart`) → counters ≥ baseline + {all 2, documents 1, images 1, uploads 2} (`>=` so concurrent artifacts from other suites cannot break it) → `artifact-download` on the PDF → download event (fallback: new tab / signed-url / `request.get`) → 200 `application/pdf`, bytes start with `%PDF`.

### `e2e/routes-clean.spec.ts` (both projects; result → `routes-clean.json` `[{route, viewport, status, consoleErrors, pageErrors, settled, ms}]`)
- `/overview /companies /news /chat /artifacts /settings` + `?skip=1` → `networkidle` (20 s cap, falls back to domcontentloaded) → main document HTTP 200 → 0 console errors, 0 `pageerror`s after the helpers.ts `captureErrors` allow-list (favicon / `net::ERR_ABORTED` / `ERR_BLOCKED_BY_ORB` / 404 resources) plus sourcemap / `_rsc=` aborted-fetch / ResizeObserver noise.

### Unit-4b run against https://sb-4o6djxojbfi1.vercel.run (main @ 04dd11d)
- RUN1 10:06:49Z → 10:08:45Z — **16 passed, 4 skipped (the other-viewport describe of upload-e2e in each project), 0 failed**; no second run needed.
- upload-e2e counters: desktop before `{all 0, document 0, image 0, upload 0}` → after `{2, 1, 1, 2}` (Δ +2/+1/+1/+2); mobile before `{2, 1, 1, 2}` → after `{4, 2, 2, 4}` (Δ +2/+1/+1/+2). Cards: PDF `source=input icon=pdf kind=document`, PNG `source=input icon=chart kind=image`. Chip ready: PDF ≈ 2.0–2.3 s, PNG (740 KB) 13.6–17.0 s; artifacts persisted at upload time (76–111 ms after chips ready); first answer token 4.2–4.7 s; download via page download event → 200 application/pdf 4591 B `%PDF-`.
- routes-clean: 12/12 rows `status=200 console=0 page=0`, all settled at networkidle (1.4–3.7 s).
- Environment note: Playwright's bundled ffmpeg (`ms-playwright/ffmpeg-1013/ffmpeg-linux`) was missing again → symlinked `/usr/bin/ffmpeg` under both `$XDG_CACHE_HOME/ms-playwright` and `~/.cache/ms-playwright` before RUN1.
- Committed artefacts: videos + screenshots + traces ≤ 10 MB for the upload-e2e/routes-clean test-results; the two U1 traces (40 MB / 46 MB) and the two /settings routes-clean traces (25 MB each) are NOT committed.
- Orchestrator: fill in the results of the final combined run below.
