# Raw unit and product accuracy, 2026-11-16

Read-only evidence for the raw-unit release gate, captured with
`missouri-float-planner/scripts/rainfall/capture-units-evidence.ts` over
Louisiana (`--bbox -93.9,29.7,-89.8,32.5`), where it rained in the window. No
production writes. `src/lib/rainfall/units-evidence.test.ts` replays everything
here from the saved bytes.

Window: 2026-11-15 18:00Z to 2026-11-16 18:00Z, the locked `conus_QPE_24H`
raster, requested exactly as the collector requests it (native grid, raw F32,
no renderer). 111 USGS rain gauges reported in the window; 75 had a
whole-window record and at least 0.2 in.

| Comparison at the 75 gauges | Middle value | Middle half |
| --- | --- | --- |
| Hosted raw value / RadarOnly source file | 1.00 | 0.99 to 1.00 |
| RadarOnly / gauge inches (25.4 = unbiased millimetres) | 48.0 | 36.1 to 60.5 |
| MultiSensor Pass 1 / gauge inches | 47.8 | 33.9 to 57.3 |
| MultiSensor Pass 2 / gauge inches | 26.7 | 25.1 to 29.2 |

What this establishes:

- **Unit.** The hosted raster's raw values are NOAA's `RadarOnly_QPE_24H`
  values, and NOAA documents that product in millimetres. This does not depend
  on how accurate radar is.
- **Not inches.** Gauge ratios near 1 would mean inches. They are near 48.
- **Radar-only read high.** About 1.9 times the gauges in this storm. The
  gauge-corrected Pass 2 product sat within about 5% of them. Pass 2 uses
  gauges, so that agreement is partly by construction.

What it does not establish: how radar-only behaves in other storms, seasons or
in the Ozarks. It is one window in one region.

## Files

- `capture.json`: raster identity, native tile, request parameters, hashes, and
  each gauge's total, raw cell value and ratio.
- `raster.tiff.gz`: the raster bytes as returned.
- `usgs-precipitation.json.gz`: every precipitation reading (parameter 00045)
  the USGS `continuous` API returned for the box and window, pages joined in
  the order returned.
- `source-comparison.json`: NOAA's three source products read at the same
  gauges, with each file's URL and SHA-256 (of the uncompressed GRIB2).
- `extract-source-values.py`: how `source-comparison.json` was produced. It
  needs `pygrib`; the GRIB2 files are about 3 MB each and are not committed.
