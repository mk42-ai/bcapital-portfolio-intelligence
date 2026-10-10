# SA7 — Functional verification matrix (live preview)

Target: https://sb-3umbne3uc2g2.vercel.run (backend https://sb-3az18qgrrd3p.vercel.run, `/health` → 200 at run time)
Method: `ui-validator` (`ui_validate.py`, headless Chromium, fresh profile per run) at **1440x900** and **390x844**; every check is a `--eval` assertion plus the built-in HTTP-status / blank-page / console-error / page-error checks. Raw reports: `web/proof/sa7-logs/<screen>-<viewport>.json`; screenshots: `.ui-proof/SA7-*.png`. Run window: 2026-10-10 00:16–00:21 UTC.

| # | Screen / check | Assertion | 1440x900 | 390x844 | Evidence |
|---|---|---|---|---|---|
| 1 | /overview — search | `[data-testid=table-search]` = "fervo" narrows 25 → 1 row, first row "Fervo Energy", status "Showing 1 of 1 rows matching “fervo”" | PASS | PASS | overview-*.json `search` |
| 2 | /overview — sort | `[data-testid=sort-score]` click 1 → first row "Perplexity AI", `aria-sort=ascending`; click 2 → "Fervo Energy", `aria-sort=descending` (initial: "1AU Opportunistic", no aria-sort) | PASS | PASS | overview-*.json `sort`, sort-detail |
| 3 | /overview — row link | first tbody row anchor href `/company/fervo-energy` (matches `^/company/[a-z0-9-]+$`) | PASS | PASS | overview-*.json `rowlink` |
| 4 | /overview — live badge | `[data-testid=backend-status][data-live="1"]` visible, text "live backend", title = backend URL. Code: `backend-status.tsx` server component fetches `${backendBaseUrl}/health` (4 s abort, ISR `revalidate: 60`) and sets `data-live` from `r.ok` → reflects a real `/health` call (curl `/health` → 200 during the run) | PASS | PASS | overview-*.json `badge` |
| 5 | /overview — fetched stamp | page-header "fetched <ISO>" within 2 min of `Date.now()`: 2026-10-10T00:16:44Z vs now 00:16:47.130Z → age 3.1 s (desktop); 00:16:50Z, age 3.5 s (mobile) | PASS | PASS | overview-*.json `stamp` |
| 6 | /news — sector filter | "N of M items": 27 of 27 → `#nf-sector`="Energy & Resilience" → 7 of 27 (M unchanged) | PASS | PASS | news-*.json `news` |
| 7 | /news — nonsense search | `#nf-q`="zzqxv-nonsense-9981" → 0 of 27 + empty state "No news matches these filters" | PASS | PASS | news-*.json `news` |
| 8 | /news — external links | 27 external `a[href^=http]`, all `target=_blank` + `rel` contains `noopener` (0 bad) | PASS | PASS | news-*.json `ext` |
| 9 | /company/fervo-energy — external links | 8 external links, 0 missing `_blank`/`noopener` | PASS | PASS | company-*.json `ext` |
| 10 | /company/does-not-exist-xyz — 404 | `curl -sI` → `HTTP/2 404`; browser document status 404; body contains "Page not found" / "company not found" + "Back to overview" | PASS | PASS | notfound-*.json, curl |
| 11 | /settings — externalUserId validation | `#set-user`="   " → `#set-user-error` visible ("externalUserId is required — …"), `aria-invalid=true`, `aria-describedby=set-user-error`; `bcap.settings.v1` NOT written | PASS | PASS | settings-*.json, settings-detail |
| 12 | /settings — backend URL validation | `#set-backend`="not a url" → `#set-backend-error` visible, `aria-invalid=true`; `backendUrl` not persisted | PASS | PASS | settings-*.json, settings-detail |
| 13 | /settings — valid values persist | "sa7-user" + "https://sb-3az18qgrrd3p.vercel.run/" → localStorage `bcap.settings.v1` = `{externalUserId:"sa7-user", backendUrl:"https://sb-3az18qgrrd3p.vercel.run"}` (trailing slash stripped), 0 error nodes left | PASS | PASS | settings-detail |
| 14 | /onboarding — CTA | `form button[type=submit]` ("Enter workspace") click → `location.pathname=/overview`, `bcap.settings.v1.onboarded=true`, 5 default focus companies | PASS | PASS | onboarding-*.json `onb` |
| 15 | Onboarding gate | fresh profile `/overview` (no `?skip=1`) → client redirect to `/onboarding` | PASS | PASS | gate-*.json |
| 16 | Light theme (all 6 screens) | `html.light`, `body` bg `rgb(255, 255, 255)`, 0 elements ≥30 000 px² with dark (avg channel <80) background | PASS | PASS | `theme` in every report |
| 17 | Lucide-only (all 6 screens) | `svg.lucide` present (6–32 per page), 0 foreign icon classes (fa-/material-icons/heroicon/i.icon), 0 first-party `<img>` outside `/brand/`; the only non-brand `<img>` are remote article images (news) and the real Fervo company logo (company) — both allowed | PASS | PASS | `lucide` in every report |
| 18 | Console / page errors | 0 `pageErrors` on all screens; 0 `consoleErrors` on all screens except the 404 route, where the only entry is the browser's own "Failed to load resource: 404" for the document itself (expected — it *is* the 404) | PASS | PASS | every report |

Notes
- `failedRequests` lists `net::ERR_ABORTED …/overview?_rsc=` on some runs: Next.js `<Link>` prefetch cancelled by navigation/teardown; not an app error and not surfaced in console.
- The `ui_validate.py` exit code was 1 on news/company/notfound runs only because my first-pass Lucide eval was stricter than the rule (it flagged allowed remote article/company images lacking the local `data-testid` — the live build predates the uncommitted `news-cards.tsx` change) and because the 404 route returns the intended non-2xx status. The per-check evidence above is from the recorded eval payloads.
- No defects found → no files edited. Nothing was changed under `web/src`.
