# Source inspection after review, 2026-11-11

Captured at 16:50 UTC (10:50 AM Central). This new run preserves the
[original full-resolution evidence](../2026-11-11/README.md). It approves no
basin and publishes no rainfall values.

- 54 inventory rows; all 50 USGS gauges processed; four without IDs counted.
- 163 requests and saved responses; zero request/geometry failures; exit 0.
- All 50 simplified basins pass topology screening; 46 have no area/point flags.
  Every basin remains `unreviewed`; dam eligibility remains separate.
- Big Piney still differs from USGS drainage area and has a displaced stored
  pin. Windyville retains its area mismatch; Doniphan its point mismatch;
  Elk's missing stored area is still recorded. No database records changed.
- North Fork: full 562.0189, simplified 561.9791 sq mi (0.0071% smaller).
  Black/Poplar Bluff: full 1252.6132, simplified 1252.4190 (0.0155% smaller).
  Both simplified shapes pass; their invalid full-resolution shapes retain
  diagnostic areas and station checks in `fullResolutionComparisons`.
- Each selected 1/6/24/72h CONUS raster reports its own 1,189.18 m projected
  cell size and origin. The 573 m service-level minimum is not used.
- Masked Alley Spring diagnostics contain 886 valid pixels and zero means
  for each window; display categories remain separate. This count is not
  proof of complete basin coverage, and this is not a public dry-state claim.

## Independent sampling probes

`sampling-probes.json` contains seven complete request/response records from
one locked 24h raster, with its catalog and grid. These are source-contract
probes, not the reviewer's ten rain-gauge comparisons:

- Wet-area raw and masked means both 15.1921; display category mean 6.
- Pacific missing-coverage probe: 99 raw pixels at -3; after masking, the
  service returns an empty statistics array. The parser keeps its mean null,
  never zero. A valid zero-pixel value remains zero in the regression test.

NOAA documents the underlying QPE products in millimetres. The reviewer's
independent gauge comparison supports that scale, but its gauge IDs, exact
windows and captures were not available in the review or PR discussion.
That comparison is not claimed as reproduced. The hosted numeric path still
needs archived independent wet-case unit evidence before public conversion.

`computeStatisticsHistograms` does not accept a grid registration point;
its native-resolution, nearest-neighbor, masked output remains diagnostic.
Native-grid alignment, boundary/area weighting, expected coverage, basin
review, forecast sampling and storm replay remain collection/publication gates.

## Files and reproduction

- `inventory.json`: exactly the input inventory; SQL now includes its `id`.
- `report.json`: complete result and open gates for this new run.
- `source-responses.json.gz`: all 163 provider captures, keyed by filename.
- `sampling-probes.json`: the seven additional source-contract probes.

Capture records include URLs, parameters, timestamps and SHA-256 hashes of
original response bytes; the body is parsed JSON, so whitespace is not retained.
For a fresh run, follow [rainfall-sources.md](../../../rainfall-sources.md) and
use a new output directory. Raster IDs expire; obtain and pin the live catalog
again rather than substituting another raster into a historical comparison.

Run `npm run lint:rainfall`, `npm run typecheck`, and the registered tests from
`missouri-float-planner/`. The inspector is now included in routine lint.
