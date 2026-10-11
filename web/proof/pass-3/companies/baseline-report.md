# a35 — /companies acceptance spec, baseline run (main @ 7c43344, https://sb-1gizcktepfgc.vercel.run)

Spec: `web/e2e/companies-acceptance.spec.ts` · project `desktop`, `--workers=1`, two describes (1440×900, 390×844). Raw JSON: `baseline-results.json`.

## Hard assertions
| check | 1440×900 | 390×844 |
|---|---|---|
| 0 console/page errors | pass | pass |
| `companies-list` data-total ≥ 100 (=136) | pass | pass |
| ≥20 distinct `company-row` rendered across scroll (virtualised; 19 / 14 in DOM at top) | pass (39) | pass (29) |
| A–Z rail: click M → first visible row "MediTrust" | pass | n/a (rail is `lg:flex`, hidden <1024) |
| no horizontal overflow (scrollWidth == clientWidth) | pass (1440) | pass (390) |
| axe wcag2a/wcag2aa/wcag22aa → 0 serious/critical | **FAIL** | **FAIL** |

axe finding (critical, `aria-required-children`): `<div role="grid" data-testid="companies-list">` contains `<p class="sr-only" aria-live="polite" data-testid="companies-live">` — a `p` is not an allowed child of `grid`. Fix hint: move `companies-live` outside the `role="grid"` element (or give it `role="presentation"`/wrap rows in `role="rowgroup"`), keep the testid.

## Soft assertions (before-state)
| check | result | annotation |
|---|---|---|
| logo chip per visible row | pass (11/11, 6/6) | img naturalWidth>0 or fallback |
| a27 `company-card-sentiment` per visible row | FAIL | not in baseline |
| a29 `chip-sector` chips (aria-pressed, count shrinks, select in sync) | FAIL | not in baseline |
| a37 `?sector=` URL state (chip + select path) | FAIL | not in baseline |
| sort offers delta / news / last deal | FAIL ×3 | baseline options: name, signal, sector |
| view toggle `companies-view-grid` → `data-view` | FAIL | not in baseline |
| a33 Tab → first `company-row-link`, ArrowDown → row 1 | pass | already works in baseline |
