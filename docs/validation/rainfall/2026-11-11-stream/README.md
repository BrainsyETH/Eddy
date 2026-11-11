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

`black-river-context.json` is a read-only snapshot of Eddy's existing Black River
geometry and approved access coordinates. The browser fixture filters labels
inside the real USGS basin and clips the river to it. Rain amounts in browser
screenshots remain synthetic and are separate from this source evidence.

References:
- [ArcGIS direct image streaming](https://developers.arcgis.com/rest/services-reference/enterprise/export-image/)
- [GDAL sparse TIFF and nodata semantics](https://gdal.org/en/stable/drivers/raster/gtiff.html)
