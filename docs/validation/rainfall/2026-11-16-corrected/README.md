# Reading NOAA's gauge-corrected rainfall, 2026-11-16

Evidence for the `unitsEvidence` release gate in
`missouri-float-planner/src/lib/rainfall/public-policy.ts`. Public amounts are
built from NOAA's MRMS multi-sensor QPE, pass 2: the radar field after NOAA
corrects it with rain gauges. It is published as GRIB2 on NOAA's open archive
(`noaa-mrms-pds`), not on the hosted image service the collector reads for the
radar-only product, so Eddy reads the file itself
(`src/lib/rainfall/corrected-source.ts`). This folder shows that reading is
right. `src/lib/rainfall/corrected.test.ts` replays it.

## What is here

- `MRMS_MultiSensor_QPE_01H_Pass2_00.00_20261116-060000.grib2.gz`: NOAA's file
  for the hour ending 2026-11-16 06:00Z, as downloaded (489,535 bytes, SHA-256
  `fbdfbfba…f372e3`). A wet hour over Louisiana.
- `expected-on-tile.f32.gz`: the same file read by pygrib, an independent GRIB
  decoder, at the centre of every cell of the Louisiana tile in
  `../2026-11-16-units/capture.json` (118,195 little-endian float32 values,
  millimetres, row by row from the north-west corner).
- `expected-on-tile.py`: how that was produced
  (`python expected-on-tile.py FILE.grib2 ../2026-11-16-units/capture.json OUT`;
  needs `pygrib` and `numpy`).

## What it establishes

- **The reading is exact.** Eddy's reader and pygrib agree at all 118,195
  cells, 47,416 of them wet, so a shifted, flipped or mis-scaled grid could not
  pass. The same comparison was run once on the 24-hour and 72-hour files for
  2026-11-16 18:00Z with the same result; those files are 3 MB and 7 MB and are
  not saved here.
- **The unit is millimetres.** NOAA's MRMS GRIB2 table gives millimetres for
  these products (discipline 209, category 6, parameters 37, 41 and 43 for the
  1, 24 and 72-hour pass 2 totals), stored in tenths with a reference of −3.0,
  which NOAA uses for cells outside coverage. A cell below zero is stored as
  missing, never as zero rain.
- **Millimetres agrees with the ground.** `../2026-11-16-units/` holds the
  pass 2 24-hour values at 75 rain gauges for the same storm, read by pygrib:
  26.7 per gauge inch against 25.4 for exact agreement.

- **NOAA uses two depths.** In an hour when no cell needs more than 8 bits NOAA
  packs the field at 8 bits instead of 16. The first eight-day backfill refused
  5 such hours of 193 rather than misread them; the reader now takes both. Two
  of them (hours ending 2026-11-10 02:00Z and 03:00Z, SHA-256 `b9cd9603…ed30e4`
  and `79fcb2fc…01c504`) were compared with pygrib on the same tile once: no
  cell differed. They are not saved here; the test builds both depths.

A file for another product or another hour is refused, as is any other depth
or anything that is not one whole message in this layout.

## What it does not establish

How close the product is to the rain that fell in the Ozarks. That is in
`../2026-11-16-jacks-fork/`.
