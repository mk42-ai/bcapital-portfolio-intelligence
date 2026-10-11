# Lighthouse — before (https://sb-1gizcktepfgc.vercel.run)

Lighthouse 12.8.2, 2026-10-11T12:02:13.676Z, presets: desktop, mobile. Budget: perf ≥90, a11y ≥90, LCP ≤2500 ms, TBT ≤200 ms, CLS ≤0.1.

| Preset | Route | Perf | A11y | Best-pr. | LCP ms | TBT ms | CLS | FCP ms | SI ms | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | /overview | 75 | 100 | 100 | 972 | 350 | 0.129 | 474 | 2081 | FAIL | perf 75<90; TBT 350>200; CLS 0.129>0.1 |
| desktop | /companies | 95 | 100 | 100 | 749 | 73 | 0.129 | 287 | 852 | FAIL | CLS 0.129>0.1 |
| desktop | /news | 79 | 100 | 100 | 1595 | 266 | 0.129 | 587 | 1188 | FAIL | perf 79<90; TBT 266>200; CLS 0.129>0.1 |
| desktop | /chat?skip=1 | 88 | 100 | 100 | 826 | 201 | 0.117 | 375 | 1301 | FAIL | perf 88<90; TBT 201>200; CLS 0.117>0.1 |
| desktop | /artifacts | 100 | 100 | 100 | 572 | 21 | 0.006 | 270 | 732 | PASS |  |
| desktop | /settings | 99 | 100 | 100 | 886 | 2 | 0 | 298 | 508 | PASS |  |
| mobile | /overview | 76 | 100 | 100 | 3134 | 141 | 0.255 | 2126 | 3023 | FAIL | perf 76<90; LCP 3134>2500; CLS 0.255>0.1 |
| mobile | /companies | 77 | 100 | 100 | 2574 | 330 | 0.255 | 978 | 1651 | FAIL | perf 77<90; LCP 2574>2500; TBT 330>200; CLS 0.255>0.1 |
| mobile | /news | 38 | 100 | 100 | 5895 | 1132 | 0.255 | 2595 | 2874 | FAIL | perf 38<90; LCP 5895>2500; TBT 1132>200; CLS 0.255>0.1 |
| mobile | /chat?skip=1 | 48 | 100 | 96 | 10889 | 1429 | 0.028 | 1558 | 3703 | FAIL | perf 48<90; LCP 10889>2500; TBT 1429>200 |
| mobile | /artifacts | 95 | 100 | 100 | 2444 | 153 | 0 | 1400 | 2688 | PASS |  |
| mobile | /settings | 81 | 100 | 100 | 4585 | 126 | 0 | 1526 | 3012 | FAIL | perf 81<90; LCP 4585>2500 |

Overall: **FAIL**

## Root-cause hints (from the per-route LHR json in this folder)
- CLS 0.129 (desktop) / 0.255 (mobile) on /overview, /companies, /news comes from two shifts of `body > div.flex > div.flex > footer.border-t` (the shell footer moves when page content hydrates) — reserve the footer/main height or make the footer non-shifting.
- Mobile /chat LCP element is `.oiu-welcome__starter-prompt` (starter buttons render late, after 2.7 s of script evaluation); mobile /news TBT 1132 ms = script evaluation on hydration.
- a11y is 100 everywhere; best-practices 96 on mobile /chat.

Re-run: `cd web && LABEL=after node scripts/lighthouse-routes.mjs` (≈4 min on one CPU; `PRESETS=desktop` ≈2 min; `MERGE=1 PRESETS=mobile` to add mobile rows later).
