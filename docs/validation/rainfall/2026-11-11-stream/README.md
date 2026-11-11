# Direct NOAA TIFF replay — 2026-11-11

Read-only source probes, with no production writes or release approval.
`direct-export.json` records request parameters, raster identities, fetch time,
TIFF hashes and decoded statistics. `1h/6h/24h/72h.tiff.gz` preserve the returned
bytes. The corresponding `*-statistics.json` files preserve NOAA's own
`computeStatisticsHistograms` results for the same locked raster and region.

| Window | Pixels | Zero pixels | Missing | Sum of raw cells |
| --- | ---: | ---: | ---: | ---: |
| 1 hour | 202,935 | 202,935 | 0 | 0 |
| 6 hours | 202,935 | 199,570 | 0 | 1,304.100192 |
| 24 hours | 202,935 | 194,380 | 0 | 6,683.200543 |
| 72 hours | 202,935 | 189,755 | 0 | 9,793.700837 |

All counts and sums match NOAA's statistics (sums within 1e-6). The completely
dry one-hour TIFF consists of implicit sparse blocks without a nodata tag.
The previous decoder incorrectly marked all 202,935 pixels missing.

Replay from `missouri-float-planner`:

```sh
node --import tsx --test src/lib/rainfall/public.test.ts
```

The tests also cover explicit nodata (negative, positive, zero and NaN), exact
boundary area weights, partial current bins, missed publication, revisions,
pagination and idempotent replay. These source-service comparisons establish
transport and decoding. They do not independently prove the image-service wet
units against the underlying MRMS archive or constitute storm backfill.
Those release gates remain open; public rainfall remains disabled.

`weights-performance.json` records the offline preparation benchmark for the
same 50 captured basin versions and the validated regional grid. On this Node
20 runtime all 50 completed within 15 seconds each (slowest 5.538 seconds;
38.815 seconds total). Selected results:

| Basin | Preparation |
| --- | ---: |
| Current at Montauk | 0.063 s |
| Jacks Fork at Alley Spring | 0.217 s |
| Buffalo near St. Joe | 0.524 s |
| Current at Van Buren | 0.950 s |
| Gasconade at Jerome | 1.592 s |

Reproduce from `missouri-float-planner`:

```sh
node --import tsx scripts/rainfall/benchmark-weights.ts --evidence ../docs/validation/rainfall/2026-11-11-review --tile ../docs/validation/rainfall/2026-11-11-stream/direct-export.json
```

These timings are machine-dependent preparation measurements. Hourly publication
loads prepared private objects and never runs this calculation. Storage readback,
production replay runtime and scheduled publication still need deployment evidence.
The numerical tests compare the optimized path against full clipping for holes,
concave boundaries, disconnected polygons and regions extending outside the grid.

`black-river-context.json` is a read-only snapshot of Eddy's existing Black River
geometry and approved access coordinates. The browser fixture filters labels
inside the real USGS basin and clips the river to it. Rain amounts in browser
screenshots remain synthetic and are separate from this source evidence.

References:
- [ArcGIS direct image streaming](https://developers.arcgis.com/rest/services-reference/enterprise/export-image/)
- [GDAL sparse TIFF and nodata semantics](https://gdal.org/en/stable/drivers/raster/gtiff.html)
