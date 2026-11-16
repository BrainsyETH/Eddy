# Source inspection, 2026-11-11

Captured at 15:16 UTC (9:16 AM Central) using
`scripts/rainfall/inspect-sources.ts`. The inventory came from the read-only
query in [rainfall-sources.md](../../../rainfall-sources.md).

This is source evidence, **not approval to publish rainfall**. No database
rows, basin approvals, charts or Read inputs were changed.

- 54 curated stations in the export; 50 USGS IDs inspected; four without IDs
  counted separately. This is the investigation inventory, not the eventual
  rainfall eligibility list: it includes dam-controlled gauges.
- 157 upstream requests. All 50 returned source captures; 48 passed geometry
  screening. The operator run correctly exited 1 for the two rejected shapes.
- 44 had no area/point screening flags. Every basin remains `unreviewed`.
- Typechecking and the full registered suite passed (5,153 tests on this
  preflight branch); the source-contract tests are in the explicit test list.

| Site | Evidence | Disposition |
| --- | --- | --- |
| Big Piney near Houston, 06928900 | Basin 158.8 vs USGS 251 sq mi; stored pin 959 m from the current USGS point. NLDI and USGS points agree. | Hold basin; a stored-pin correction alone cannot fix the area mismatch. |
| Niangua at Windyville, 06923250 | Basin 336.7 vs USGS 377 sq mi (10.7% smaller); source points agree. | Hold basin for boundary review. |
| Elk at Noel, 07188925 | Basin 800.94 vs current USGS 801 sq mi; Eddy's stored comparator is absent. | Comparator now found; boundary review and any database correction remain separate. |
| Current at Doniphan, 07068000 | NLDI and current USGS points differ by 123.5 m; area agrees. | Check the pour point; distance is a screening flag, not proof the whole basin is wrong. |
| North Fork near Tecumseh, 07057500 | Full NLDI MultiPolygon fails Turf geometry screening; three kink intersections reported. | Quarantine for topology review; no automatic repair. |
| Black at Poplar Bluff, 07063000 | Full NLDI MultiPolygon fails Turf geometry screening; four kink intersections reported. | Quarantine; this downstream dam-controlled gauge is also excluded from v1 eligibility. |

The 1/6/24/72-hour Alley Spring **raw diagnostic** means were all 0. The
24-hour display renderer returned 1 over the same geometry and locked raster.
This demonstrates why rendered categories cannot be used as rainfall totals;
it does not establish native units, complete coverage or a public dry state.
Wet-case raw-product cross-checks, independent comparisons, coverage/weighting,
forecast sampling and reviewed geometry remain open gates.

## Files

- `inventory.json`: the curated source inventory, without credentials.
- `report.json`: complete machine-readable screening results and gate status.
- `source-responses.json.gz`: a JSON object keyed by capture filename, with all
  157 provider responses, URLs, POST parameters, fetch times and original
  response-body SHA-256 values. The body is stored as parsed JSON; the hash
  identifies the original response bytes (including its original whitespace).

Inspect with `gzip -dc source-responses.json.gz`. Run the inspector into a new
directory to compare later captures; do not overwrite this evidence. These
latest-only raster captures cannot establish historical storm behavior.
