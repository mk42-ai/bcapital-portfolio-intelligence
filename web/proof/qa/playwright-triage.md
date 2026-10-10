# Playwright triage — 2026-10-10 (BASE_URL=https://sb-1xe432s1qrj3.vercel.run)

61 tests / 2 workers / 6.2 min: **45 passed, 16 failed** (list: playwright-list.txt, json: playwright-results.json).

## REGRESSIONS (something that should work is broken) — 10 failures, 2 root causes
1. **React hydration error #418 on /chat and /settings** (desktop + mobile) — 8 failures:
   qa-routes /settings (desktop, mobile), qa-routes /chat (desktop, mobile), settings.spec "editing the user id persists", mobile.spec settings, mobile.spec chat, qa-chat-timing @mobile.
   Assertion: `expect(real, "0 console/page errors").toEqual([])` → received `pageerror: Minified React error #418 ... args[]=text` (server/client text mismatch — likely a localStorage/Date-derived string rendered during SSR on the chat/settings pages). Layout/overflow/nav assertions all passed before this.
2. **Empty assistant answer when Perplexity is blocked** — chat.spec "answer streams incrementally" (`expect(finalText.length).toBeGreaterThan(40)` → 0) and qa-chat-timing @desktop (`turn1 answer text length > 0` → 0). The UI shows the honest red card "Perplexity failed — Not enough credits ... No other plugin was substituted" but no prose; root cause is the external Perplexity credit exhaustion (BLOCKED BY EXTERNAL DEPENDENCY) — the tests pass when the plugin answers (J5 via curl got a cited answer because GPT Search was also attached). Classify as EXTERNAL / behaviour-under-outage, not a code regression, unless the product requires a fallback answer.
3. **qa-routes /news @ mobile 390x844 — 120 s test timeout** (desktop /news passed in 2.0 min). /news HTML is 5.4 MB with 1,845 cards; borderline perf regression on page weight.

## STALE EXPECTATIONS (test encodes removed copy / old layout) — 6 failures
| Spec | Exact assertion | Why stale |
|---|---|---|
| overview.spec.ts:33 "sort by score toggles row order" | `expect(page.locator('[data-testid="sort-score"]')).toBeVisible()` → element not found | `sort-score` testid no longer exists in src (table uses `aria-sort` on `<th>` in data-table.tsx) |
| settings.spec.ts:17 "model and plugin are fixed (DeepSeek Flash v4.1 · Perplexity only)" | `expect(getByTestId('plugin-list')).not.toContainText(/GPT Search\|LinkedIn\|Reddit\|PitchBook\|X Search/)` | Settings now shows the live plugin directory ("Showing 40 of 186"), multi-plugin selection per turn is intentional |
| growth.spec.ts:165 hover/expanded/focus | `expect(t).toMatch(/^matrix\(-1,0,0,-1,0,0\)$/)` → got `matrix(-0.814,0.58,...)` | chevron is now animated (rotation read mid-transition); assertion assumes instant 180° |
| growth.spec.ts:231 light-up timer chain | `expect(grid).toHaveAttribute("data-revealed","false")` → `"true"` | grid now reveals immediately on /onboarding?skip=1 (above the fold at 1440x900), no pre-scroll hidden state |
| growth.spec.ts:289 prefers-reduced-motion | `expect(dur.split(",").every(d => d.trim()==="0s")).toBe(true)` on tile/chevron | CSS reduced-motion block sets `transition: none` on `.growth-item` only; tile/chevron keep a transition-duration — either a stale assertion or a minor a11y gap (judgement call for integrator) |
| (qa-chat-timing session-reuse assertion) | `expect(sessionReused ...)` never reached | not stale — blocked by regression #2 above; session reuse verified by curl (J9b) |

Note: no spec in this run failed on the removed copy 'server-side proxy', "Why it's interactive" or a model row containing 'stream' — those assertions were either not present or already updated.
