# Companies list scroll bug — root cause (1440×900 and 390×844)

Branch `wt/scroll`. Reported: on the company list the wheel/touch scroll "sticks" and the end of the list (rows 26–136) cannot be reached.

## Where the list lived

There was no `/companies` route. The **Companies** nav item (`web/src/components/shell/nav.tsx`) deep-linked to `/company/perplexity-ai`;
the full 136-record list only existed on `/overview` as `PagedTable` → `DataTable`
(`web/src/components/overview/paged-table.tsx`, `web/src/components/overview/data-table.tsx`).

## Nested scroll containers on `/overview` (exact selectors)

| # | Element | Classes / style | Axis | Effect |
|---|---|---|---|---|
| 1 | `html` / `body` (document) | `Shell`: `div.flex.min-h-dvh.flex-col.lg:flex-row` → `main#main.flex-1` | **Y** | The page itself scrolls (overview is ~5 cards tall before the table). This is scroller **A**. |
| 2 | `DataTable` wrapper `div[tabindex=0][aria-label=caption]` | `max-h-[520px] overflow-auto rounded-xl border` | **Y + X** | A second, bounded vertical scroller (**B**) nested inside A. When the pointer/finger is over the table the wheel/touch delta is consumed by B until B hits its own end; with 25 rows × ~41 px (≈1 025 px) inside 520 px that is ~500 px of "dead" scroll, and because the browser's scroll-chaining starts the *outer* scroll only after B is exhausted *and* the gesture is re-initiated, users perceive the page as stuck. On iOS the momentum of a flick is spent entirely inside B. |
| 3 | `thead.sticky.top-0.bg-surface-2` inside B | sticky inside the inner scroller | – | Sticky *relative to B*, so when B is scrolled to its end the header overlaps the bottom rows and visually hides "where the list ends"; it also means scroll-into-view of a focused row (keyboard) lands under the header. |
| 4 | `table[data-testid=company-table].w-full.min-w-[840px]` | 840 px min width inside a 390 px viewport | **X** | On 390×844 the same wrapper B scrolls on **both axes**. A vertical swipe that is a few degrees off starts a horizontal pan (touch-action resolution picks one axis per gesture), so finger-drags alternate between X-pan and Y-scroll of B, and the page (A) never receives the gesture — "cannot reach the end". |
| 5 | `PagedTable` paging | `rows.slice(0, n)` with `pageSize=25`, buttons `data-testid=table-show-all` / `table-next` | – | Rows 26–136 are not in the DOM at all until "Show all 136" is pressed; the status line is *below* the scroller, so a user who scrolled B to its end sees the last of 25 rows and no further content — read as a broken scroll even when the inner scroller works. |
| 6 | `aside.sticky.top-0.z-40 … lg:h-dvh` (shell) | `lg:h-dvh` sidebar | – | Not a scroller, but on <1024 px it is a 56 px sticky top bar; any sticky in-page header must be offset by it (`top-14`) or it is covered. |

Why wheel/touch events are "trapped": an element with `overflow:auto` and `scrollHeight > clientHeight` is a scroll container; the browser delivers the wheel/touch delta to the *innermost* scrollable ancestor under the pointer and only chains to the next ancestor when that container cannot scroll further in that direction (and, for touch, only on a new gesture). With B nested inside A, every interaction that starts over the table scrolls B, not the page. Adding a second axis (min-w 840 px on mobile) makes the inner container claim the gesture even more often.

## What is fixed

1. **New `/companies` route** (`web/src/app/companies/page.tsx`, server component, `revalidate = 120`, firm record filtered out) rendering
   `web/src/components/companies/companies-list.tsx`:
   * **one scroll container = the document.** Rows are window-virtualized with `@tanstack/react-virtual`'s `useWindowVirtualizer`
     (`estimateSize` 64 px desktop / 84 px mobile, `overscan: 8`, `scrollMargin` = list offset) — no inner `max-height`/`overflow` box, no horizontal overflow (stacked layout on mobile, columns on `lg`).
   * Sticky filter bar (`sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur`) sticks to the *window*, under the mobile top bar.
   * No paging: all 136 rows are reachable by scrolling the page; `Showing N of 136`, wrapper `data-testid=companies-list data-total data-visible data-last-visible`, rows `data-testid=company-row data-index aria-rowindex`.
   * A–Z rail (`hidden lg:flex`) → `virtualizer.scrollToIndex(firstIndexWithLetter, {align:'start'})` then compensates for the sticky header height.
   * Scroll restoration per filter key in `sessionStorage['bcap.companies.scroll']`.
   * Touch/iOS: wrapper has `[-webkit-overflow-scrolling:touch] [overscroll-behavior-y:auto]`; nothing sets `overflow:hidden` on `html`/`body` (grep: no body scroll locks in `web/src`; the only `overflow-hidden` is a decorative card on `/docs/interactive-ui`).
   * Keyboard: roving focus on the row links (`data-index`): ArrowUp/Down, Home/End (scrollToIndex → focus), PageUp/PageDown (viewport-height), `aria-rowcount`, `aria-rowindex`, `aria-live` "Row N of 136".
2. **Nav** → Companies points at `/companies` (`match: "/compan"` keeps `/company/*` highlighted).
3. **Overview**: `DataTable` container keeps `max-h-[520px] overflow-y-auto` only below 1024 px (where the card would otherwise be 5 600 px tall) and becomes `lg:max-h-none lg:overflow-y-visible` on desktop so the page is the only vertical scroller; `overflow-x-auto` is kept for the 840 px-wide table on mobile; iOS touch + `overscroll-behavior-y:auto` classes added; `data-testid=company-table-scroller`. A **"Open the full list →"** link (`data-testid=open-full-list`) is added in the table card description. `PagedTable` itself (search/sort/paging testids) is unchanged.
4. **Tests**: `web/e2e/companies.spec.ts` (see test names in the report) verify, at both 1440×900 and 390×844, `data-total=136`, that scrolling the window to the document bottom attaches row `data-index=135` inside the viewport, that its name equals the alphabetical max of the `companies-data` JSON, and that **no ancestor of the list other than `document.scrollingElement` is a vertical scroller**; plus End-key roving focus and the A–Z rail.
