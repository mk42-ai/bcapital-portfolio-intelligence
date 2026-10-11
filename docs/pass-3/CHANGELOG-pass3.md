# Changelog draft — pass 3 (turn 5)

> DRAFT for the merge agent. Fold into `CHANGELOG.md` under
> `## 2026-10-11 — turn 5 / pass 3: run-panel rebuild, overview, companies, shared QA (\`7c43344\` → <merge sha>)`.
> `<status>` per bullet is one of `merged` / `partial (<what is missing>)` / `dropped (<why>)` — take it from
> `docs/pass-3/subagent-ledger.json` once filled. Keep bullets whose status is `dropped` under **Still open** instead.
> Branch base: main @ `7c43344`. Hard constraints for every bullet: light-only, brand green `#0AC985` (ink `#047857`) the only accent,
> no hue 190–260°, charcoal `#1F2937`, Lucide icons only, Plan/Run tab kept, dev details behind the single `dev-disclosure` reveal, WCAG 2.2 AA.

## Added

### Run panel (a1–a16)
- **a1** (`t5/a1`) — RunStatusHeader anchored at the top of the run panel; interleaved Working band removed; Outputs folded into the header — `<status>`
- **a2** (`t5/a2`) — Thinking collapsed by default, auto-expands when the Portfolio Plugin starts, manual toggle wins — `<status>`
- **a3** (`t5/a3`) — Working header single-source invariant (bridge stall frames stay in filler) + spec — `<status>`
- **a4** (`t5/a4`) — Uniform 56px step rows (status ring · plugin chip · label · timing) with zero-CLS reserve — `<status>`
- **a5** (`t5/a5`) — PluginIcon map — B Capital mark for the Portfolio Plugin, local Perplexity/OnDemand SVGs, monogram fallback — `<status>`
- **a6** (`t5/a6`) — Checklist-only Plan card; planner JSON lives only behind the developer reveal — `<status>`
- **a7** (`t5/a7`) — SSE frame guard (dedupe / gap / stale), robust SSE line splitting, planner frame channels + unit tests — `<status>`
- **a8** (`t5/a8`) — Compact tools-vs-answer timing bar; verbose timings behind the dev reveal — `<status>`
- **a9** (`t5/a9`) — Scaffolding filter covers planner format-reasoning lines; one Chevron component across heads — `<status>`
- **a10** (`t5/a10`) — A11y: reduced-motion, green focus rings on run-panel toggles, AA contrast on mint surfaces — `<status>`
- **a11** (`t5/a11`) — 390×844 run-panel layout — 64px rows, no horizontal overflow, wrapped header/footer + mobile spec — `<status>`
- **a12** (`t5/a12`) — Evidence suite (Playwright evidence config + T1…Tn screenshots of the run panel on desktop) — `<status>`
- **a13** (`t5/a13`) — Recorded bridge+upstream SSE fixture of a 2-plugin run and a replay harness — `<status>`
- **a14** (`t5/a14`) — Visual run-panel state snapshots + layout metrics at 1440×900 / 390×844 (before/after sets) — `<status>`
- **a15** (`t5/a15`) — Stream continuity check script + two-turn session spec (hang detection, heartbeat gaps, session reuse) — `<status>`
- **a16** (`t5/a16`) — Lighthouse route runner + performance budget (LCP ≤2.5s, TBT ≤200ms, CLS ≤0.1) — `<status>`

### Overview (a17–a26)
- **a17** (`t5/a17`) — Hero verdict strip with reduced-motion-safe count-up — `<status>`
- **a18** (`t5/a18`) — Sector colour tokens (emerald + AA tints, hue-audited, no blue) + sectorColor() helper + tests — `<status>`
- **a19** (`t5/a19`) — Top movers since last run with delta arrows and sector pills — `<status>`
- **a20** (`t5/a20`) — News Pulse mini-feed with publisher favicon chips — `<status>`
- **a21** (`t5/a21`) — Bento grid + spacing/motion tokens + hover elevation — `<status>`
- **a22** (`t5/a22`) — Cmd/Ctrl+K company switcher (logo chips, sector colour, keyboard nav) — `<status>`
- **a23** (`t5/a23`) — Dependency-free SVG Sparkline + unit tests; inline in the sentiment panel — `<status>`
- **a24** (`t5/a24`) — Empty-state icons (no-results / no-news / no-selection / offline) wired into empty + loading states — `<status>`
- **a25** (`t5/a25`) — Overview acceptance + axe spec (verdict row, movers, mini-feed, a11y, no overflow) — `<status>`
- **a26** (`t5/a26`) — Overview vitals runner (CPU 4×) + CLS-free SVG sizing / Suspense boundaries — `<status>`

### Companies (a27–a38)
- **a27** (`t5/a27`) — CompanyCard — logo chip, sector tag, sentiment pill with delta, last deal, news bar — `<status>`
- **a28** (`t5/a28`) — Local company logos (fetch script + log) and local-logos map — `<status>`
- **a29** (`t5/a29`) — Grid/list toggle, coloured sector filter chips, sort by delta / news / last deal — `<status>`
- **a30** (`t5/a30`) — Company detail header with sector tint band, KPI row, tinted deal timeline — `<status>`
- **a31** (`t5/a31`) — Sector-coloured chat context chips with clear remove affordance, counter in title, less copy — `<status>`
- **a32** (`t5/a32`) — /compare side-by-side strip for 2–5 selected companies — `<status>`
- **a33** (`t5/a33`) — Keyboard a11y: roving tabindex + typeahead on companies, arrow nav on the rail, brand-green focus rings everywhere — `<status>`
- **a34** (`t5/a34`) — CLS-free skeleton loading states for company detail and news — `<status>`
- **a35** (`t5/a35`) — Companies acceptance spec (cards, toolbar, filters, a11y) with proof screenshots — `<status>`
- **a36** (`t5/a36`) — CompanyLogo component (local logo → favicon → monogram fallback) wired into the companies page — `<status>`
- **a37** (`t5/a37`) — Filter / sort / view / search state in the URL (shareable, back/forward safe) + tests — `<status>`
- **a38** (`t5/a38`) — 390×844 companies + company detail layout fixes + mobile spec — `<status>`

### Shared / QA (a39–a49)
- **a39** (`t5/a39`) — Icon QA — glyph PNG/SVG audit (sizes, transparency, no-blue) with machine-readable report — `<status>`
- **a40** (`t5/a40`) — Design-token audit (hue 190–260° blue ban, contrast, unused tokens) with report — `<status>`
- **a41** (`t5/a41`) — One-shot gate script (tsc web+root, unit tests, lint, testid inventory) for the merge agent — `<status>`
- **a42** (`t5/a42`) — <task per SUBAGENT PLAN — not visible from the t5/a42 worktree at scaffold time; merge agent to fill> — `<status>`
- **a43** (`t5/a43`) — Secret scan (keys / .env / tokens) over the tree and git history with report — `<status>`
- **a44** (`t5/a44`) — <task per SUBAGENT PLAN — not visible from the t5/a44 worktree at scaffold time; merge agent to fill> — `<status>`
- **a45** (`t5/a45`) — <task per SUBAGENT PLAN — not visible from the t5/a45 worktree at scaffold time; merge agent to fill> — `<status>`
- **a46** (`t5/a46`) — <task per SUBAGENT PLAN — not visible from the t5/a46 worktree at scaffold time; merge agent to fill> — `<status>`
- **a47** (`t5/a47`) — Release scaffold: snapshot-zip script, pass-3 changelog draft, subagent ledger — `<status>`
- **a48** (`t5/a48`) — <task per SUBAGENT PLAN — not visible from the t5/a48 worktree at scaffold time; merge agent to fill> — `<status>`
- **a49** (`t5/a49`) — <task per SUBAGENT PLAN — not visible from the t5/a49 worktree at scaffold time; merge agent to fill> — `<status>`

## Changed
- Run panel information architecture: one status header, uniform step rows, Thinking collapsed, raw frames / planner JSON / verbose timings
  only behind `data-testid="dev-disclosure"` (a1, a2, a4, a6, a8, a9) — `<status>`
- Overview page recomposed as a bento grid (hero verdict → movers → news pulse) on the new spacing/motion/sector tokens (a17–a21) — `<status>`
- Companies list → card grid with toolbar, URL-backed state and local logos; company detail gets a sector-tinted header (a27–a30, a36, a37) — `<status>`
- Chat context chips and inspector drawer restyled with sector colours and less copy (a31) — `<status>`
- Shared tokens: `tokens.css` gains sector + spacing + motion tokens; `globals.css` gains reduced-motion and brand-green focus rings (a10, a18, a21, a33) — `<status>`
- Release tooling: `scripts/snapshot-zip.py` produces the git-tracked snapshot zip (`bcapital-portfolio-intelligence-<shortsha>.zip`,
  excludes node_modules / .next / dist / non-example `.env*` / >25 MB, lists exclusions in `SNAPSHOT-EXCLUDED.txt`, `testzip()` verified) (a47) — `<status>`

## Fixed
- Owner-evidence bugs (`docs/owner-evidence/pass-3/*.png`): Working band interleaving / duplicated headers (a1, a3) — `<status>`
- Planner tool-definition JSON and format-reasoning lines leaking into Thinking / Plan (a6, a9) — `<status>`
- Duplicate / out-of-order / stale SSE frames and split SSE lines in the bridge (a7) — `<status>`
- Layout shift on step rows, overview SVGs and loading states (a4, a26, a34) — `<status>`
- Mobile 390×844 overflow in the run panel and companies pages (a11, a38) — `<status>`
- AA contrast on mint surfaces (green text → ink) and missing focus rings (a10, a33) — `<status>`
- Blue-hued colours removed from tokens / sector palette (a18, a40) — `<status>`

## Evidence
- Playwright specs added this pass: run-panel-working-header, thinking-json-filter, run-panel-a11y, run-panel-mobile, run-panel-visual,
  session-continuity, overview-acceptance, keyboard-nav, cls-skeletons, companies-acceptance, companies-mobile — final run on <merge sha>:
  `<passed> passed / <skipped> skipped / <failed> failed` (`web/proof/pass-3/…`) — `<status>`
- Unit tests: eventmap / frame-guard (a7), sector-color (a18), sparkline (a23), url-state (a37) — `<n>` assertions — `<status>`
- SSE fixture + replay harness: `web/tests/fixtures/sse/portfolio-movers.bridge.ndjson`, `web/scripts/replay-sse-fixture.mjs` (a13) — `<status>`
- Visual before/after sets 1440×900 / 390×844: `web/proof/pass-3/visual/` (a14), `web/proof/pass-3/overview/` (a25), `web/proof/pass-3/mobile/` (a11) — `<status>`
- Perf: `web/proof/pass-3/perf/overview-*.json` (a26), Lighthouse budget run `web/proof/pass-3/…` (a16) — LCP `<s>` / TBT `<ms>` / CLS `<n>` — `<status>`
- Audits: icon QA `web/public/icons/glyph-qa.json` (a39), token/hue audit (a40), secret scan (a43), gate script output (a41) — `<status>`
- Snapshot zip of the merged tree: `bcapital-portfolio-intelligence-<merge sha>.zip` — `<bytes>` bytes / `<files>` files / `<excluded>` excluded — `<status>`
- Live deployment used as test target during the pass: frontend `https://sb-1gizcktepfgc.vercel.run`, backend `https://sb-3lo1xqgc9bdb.vercel.run` (main @ 7c43344).

## Still open
- `<move every bullet with status dropped / partial here, with the real error text or missing piece>`
- Subagent tasks whose plan text was not recoverable from the worktree at scaffold time: a42, a44, a45, a46, a48, a49 — fill from the SUBAGENT PLAN.
- `next build` + production deploy of the merged tree (merge agent) — `<status>`
- Sentiment copy: owner screenshot deltas (Perplexity +0.69, WRITER +0.42, Apptronik +0.24, Flutterwave +0.04, Fervo −0.25) vs current backend
  scores (aimotive 0.56, apptronik 0.54, fervo 0.35, flutterwave 0.44, writer 0.52, perplexity 0.34) — confirm which the UI labels as *delta* — `<status>`
