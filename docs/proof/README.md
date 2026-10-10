# Playwright record → analyse → fix proof (Agent 17)

`web/scripts/ux-loop.sh <label> <base_url>` records a full chat turn on desktop (1440×900) and mobile (390×844) with the run-ux recorder
(`web/tests/e2e/run-ux.spec.ts`, trace: on, video: on), scores the smoothness (`tests/e2e/score.mjs`) and copies the proof set here:

```
docs/proof/<label>/
  timeline.json      per-turn events (t_ms): first SSE frame, first answer token, first citation, answer done, CLS samples, long frames
  score.json         smoothness score (formula inside) + metrics, per viewport × turn
  screenshot.png     final desktop state    screenshot-mobile.png   final mobile state
  screenshots/       milestone shots (loaded, plan stepper, favicon strip, citation chip, final badge …)
  video.webm         desktop recording (trimmed to ≤60 s)   video-mobile.webm
  trace.zip          Playwright trace (open with `npx playwright show-trace`)   trace-mobile.zip
```

* `before/` was recorded against the previous build (https://sb-6aate8kggetp.vercel.run, Perplexity without credits on this account —
  the turn ends in the honest status line, which is still a valid timeline).
* AFTER pass (run post-deploy by the orchestrator): `bash web/scripts/ux-loop.sh after <NEW_URL>` — when both `before/` and `after/`
  exist the script writes `docs/proof/compare.md` (metric | before | after | delta + top findings) via `tests/e2e/compare.mjs`.
* Artifacts are capped: videos trimmed with ffmpeg when available; traces kept whole (≈7 MB each).
