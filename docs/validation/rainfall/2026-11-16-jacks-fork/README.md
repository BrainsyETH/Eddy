# Jacks Fork basin rain in two real storms, 2026-11-16

Evidence for the `coverageEvidence` release gate in
`missouri-float-planner/src/lib/rainfall/public-policy.ts`, for the three Jacks
Fork stations: near Mountain View (07065200), at Alley Spring (07065495) and at
Eminence (07066000). It had not rained on the Jacks Fork since collection began,
so these are two past 24-hour storms taken from NOAA's archive, one in autumn
and one in summer. Captured read-only with
`missouri-float-planner/scripts/rainfall/capture-storm-evidence.ts`;
`src/lib/rainfall/storm-evidence.test.ts` replays the saved files.

## Basin rain, inches

| 24 hours ending | Station | Gauge-corrected | Radar-only | 24 hourly files added | Dense sample |
| --- | --- | --- | --- | --- | --- |
| 2026-11-04 12:00Z | Mountain View | 1.00 | 0.74 | 1.00 | 1.01 |
| | Alley Spring | 0.97 | 0.71 | 0.97 | 0.97 |
| | Eminence | 0.86 | 0.63 | 0.86 | 0.86 |
| 2026-08-08 12:00Z | Mountain View | 1.74 | 1.58 | 1.74 | 1.75 |
| | Alley Spring | 2.00 | 1.85 | 2.00 | 2.01 |
| | Eminence | 2.00 | 2.02 | 2.00 | 2.01 |

- **Gauge-corrected** is what the public view shows: NOAA's pass 2 24-hour
  total on the collector's tile, averaged with each basin's prepared weights.
- **24 hourly files added** is the hourly bars for the same window. They add up
  to NOAA's own 24-hour total to four decimal places.
- **Dense sample** does not use the tile or the weights: NOAA's cells are
  sampled every fifth of a tile cell and averaged inside the outline. It is
  within 0.6% of the weighted amount in every row.
- The weights account for 100.0000% of each basin's area (604, 982 and 1,288
  cells), and every hour of both storms had full coverage.

## Against rain gauges

USGS rain gauges under the whole tile (not only the Jacks Fork), counted when
the record spans the window and caught at least 0.2 in. The number is the
product's cell divided by the gauge; 1.00 is exact agreement.

| 24 hours ending | Gauges | Gauge-corrected, middle (middle half) | Radar-only, middle (middle half) |
| --- | --- | --- | --- |
| 2026-11-04 12:00Z | 64 | 1.02 (0.92 to 1.17) | 1.00 (0.82 to 1.31) |
| 2026-08-08 12:00Z | 32 | 1.18 (1.00 to 2.01) | 1.40 (1.02 to 2.01) |

With the Louisiana check in `../2026-11-16-units/` (1.05 against 1.9), the
gauge-corrected product's middle value has stayed between 1.02 and 1.18 times
the gauges in three storms, and radar-only between 1.00 and 1.9. In the autumn
storm the two middles were the same and the corrected spread was tighter; over
the Jacks Fork itself radar-only was about a quarter lower.

## Limits

- NOAA corrects pass 2 with gauges, many of them these same USGS gauges, so the
  agreement is partly by construction. It is still the product whose inches
  match what a gauge on the ground collects.
- A single gauge and a cell a kilometre wide differ storm to storm, more in
  summer thunderstorms: a quarter of the August gauges read under half the cell.
- Two storms. Snow, ice and long light rain are not covered.
- This says nothing about how the river responds to the rain.

## Files, per storm folder

- `capture.json`: the window, tile, NOAA file addresses and SHA-256, each
  basin's result and the gauge comparison.
- `corrected-24h.tiff.gz`, `radar-only-24h.tiff.gz`: each product on the tile,
  in the format the collector archives.
- `usgs-precipitation.json.gz`: the USGS readings, reduced to the fields the
  comparison reads (station, sensor record, time, value, location).
- `weights.json.gz`: the three basins' weights on this tile.

The basin outlines are the reviewed versions named in `capture.json` and in the
release list; the test fails if the release list names a different version.
