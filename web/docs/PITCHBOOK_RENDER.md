# PitchBook render path (zero network on first paint)

Data origin: OnDemand Flow Builder workflow `6aca3d3faeef8927baa25a05` (weekly, Mon 06:00 UTC) → backend table `pitchbook_records` (136/136) →
`GET {backend}/pitchbook/{slug}`. The web app never runs the workflow from the UI (no "Run now"); a manual refresh lives in Settings behind a reveal.

| Surface | Component | Data path | Client fetch on first paint |
|---|---|---|---|
| `/company/<slug>` | `PitchbookPanel` (server component) → `PitchbookView res=…` | `getPitchbook(slug)` on the server (ISR 120 s, falls back to `src/data/pitchbook-snapshot.json`) | **none** — the record is in the HTML (`data-testid="pb-view" data-source="server"`) |
| `/chat` inspector drawer | `InspectorDrawer` → `PitchbookRail initial=…` | `getPitchbookMany(DEFAULT_FOCUS)` in `app/chat/page.tsx` (5 default context companies) | **none** for default companies; a non-default context company fetches `/api/pitchbook/<slug>` after mount (`data-source="client"`, cached per session) |

## Test — `web/e2e/pitchbook-nofetch.spec.ts`
* Collects every request from navigation start until the network is idle (`e2e/fixtures/network-log.ts`).
* `/company/1au`: server HTML contains `pb-view | pb-empty | pb-field-empty`, no `Run now`, no execution id; the request log has **zero** URLs matching `/api/pitchbook/` or `/pitchbook/`.
* `/chat`: no PitchBook request before the drawer opens; after `inspector-toggle` the drawer shows initial content for `perplexity-ai` with zero PitchBook requests.
* Runs at the desktop project viewport and at 390×844. On an old build (no `inspector-toggle`) the drawer scenario soft-skips with an annotation.
