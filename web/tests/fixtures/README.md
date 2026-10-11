# Upload e2e fixtures

Used by `web/e2e/upload-journeys.spec.ts` (Lane D) and `web/e2e/run-ux.spec.ts`.

| File | What it is | What the test expects |
| --- | --- | --- |
| `geothermal-plant.png` | Photo of a geothermal power plant | answer mentions geothermal / plant / steam / industrial (soft) |
| `bar-chart.png` | A bar chart with a title | answer mentions "bar"/"chart" (soft) |
| `blurred-memo.png` | A memo blurred beyond legibility | answer **must** say it cannot read it (unreadable / illegible / blurry …) and must **not** invent contents — hard assertion |
| `upload/compendium.docx` | 15 MB DOCX (under the 25 MB relay cap, slow) | chip reaches `ready`; answer cites the DOCX; artifact `source:"upload"` |
| `upload/OnDemand-Outputs-Panel-Spec.pdf` | Reference PDF | (run-ux) |
| `../../docs/reference/submit-query-v1-sse-reference.pdf` | 4.5 KB, 1 page; text contains "Submit Query v1" / "SSE event reference" | PDF journey (falls back to `web/public/fixtures/zephyr-7.pdf` if absent) |

Failure fixtures are generated in-memory by the spec (`tool.exe`, 0-byte `empty.pdf`).

Run: `cd web && BASE_URL=<frontend> npx playwright test e2e/upload-journeys.spec.ts --project=desktop --workers=1 --reporter=line`
Proof: `web/proof/upload-journeys/` (screenshots `<name>-<viewport>.png`, `latency.json` with send→first-token ms per turn, `journey-log.ndjson`).
