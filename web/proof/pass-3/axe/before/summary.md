# axe a11y sweep — before

Generated 2026-10-11T12:08:03.211Z · target https://sb-1gizcktepfgc.vercel.run · tags `wcag2a, wcag2aa, wcag21aa, wcag22aa, best-practice`
15 audits · **2 failing** (serious/critical) · totals: critical 2 · serious 0 · moderate 0 · minor 2

## Route × viewport

| route | viewport | critical | serious | moderate | minor | total | status | rule ids |
|---|---|---|---|---|---|---|---|---|
| /artifacts | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /artifacts | 390x844 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /chat (after turn) | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /chat?skip=1 | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /chat?skip=1 | 390x844 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /companies | 1440x900 | 1 | 0 | 0 | 0 | 1 | ❌ FAIL | aria-required-children |
| /companies | 390x844 | 1 | 0 | 0 | 0 | 1 | ❌ FAIL | aria-required-children |
| /company/fervo-energy | 1440x900 | 0 | 0 | 0 | 1 | 1 | ⚠️ report | aria-allowed-role |
| /company/fervo-energy | 390x844 | 0 | 0 | 0 | 1 | 1 | ⚠️ report | aria-allowed-role |
| /news | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /news | 390x844 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /overview | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /overview | 390x844 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /settings | 1440x900 | 0 | 0 | 0 | 0 | 0 | ✅ | — |
| /settings | 390x844 | 0 | 0 | 0 | 0 | 0 | ✅ | — |

## Top rule ids (by impact, then node count)

| rule | impact | audits | nodes | help |
|---|---|---|---|---|
| `aria-required-children` | critical | 2 | 2 | [Certain ARIA roles must contain particular children](https://dequeuniversity.com/rules/axe/4.13/aria-required-children?application=playwright) |
| `aria-allowed-role` | minor | 2 | 38 | [ARIA role should be appropriate for the element](https://dequeuniversity.com/rules/axe/4.13/aria-allowed-role?application=playwright) |

## Top offenders (rule → first target selector → where)

- **`aria-required-children`** (critical)
  - `.\[-webkit-overflow-scrolling\:touch\]` — /companies@1440x900, /companies@390x844
- **`aria-allowed-role`** (minor)
  - `dl` — /company/fervo-energy@1440x900, /company/fervo-energy@390x844
