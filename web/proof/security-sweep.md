# Security sweep — live-data release (preview https://sb-1z9qy0mx48sk.vercel.run, backend https://sb-7d0g7nrod31w.vercel.run)
Run at 2026-10-10T00:46:35Z by the orchestrator (the SA9 subagent returned no output; sweep repeated here).

| Check | Result |
|---|---|
| Served client assets downloaded (7 route HTML pages + /_next/static JS/CSS/fonts + /brand + /icon.svg, one level of chunk refs) | 42 files, 3 467 824 bytes |
| API-key VALUE in served assets | **0** files |
| API-key VALUE in route HTML | **0** |
| Literal `ONDEMAND_API_KEY` in served assets | 1 file (`app/settings/page-*.js`) — the Settings help text naming the variable ("server env only"); no value |
| `NEXT_PUBLIC_ONDEMAND*` in served assets | 0 |
| Sandbox build output (.next/static / .next/server) key VALUE | 0 / 0 (checked on the sandbox right after `next build`) |
| `git grep` key value | 0 |
| Tracked `.env` files | 0 (`.gitignore` covers `.env`; only `.env.example` files tracked) |
| Working tree key hits outside .env files | 0 |
| Response headers (all routes) | no `X-Frame-Options`; `Content-Security-Policy: frame-ancestors *`; 200 (404 for unknown slug, 307 for /) |
| Backend `POST /ingest` without secret | 401 |
| Backend `POST /refresh` without secret | 401 |
| Backend `/health` exposes INGEST_SECRET | no (0 occurrences) |
