# Verified identifiers — Crooked Creek (crooked-creek)

ingest-dossier.ts: every `gauges[].siteId` in crooked-creek.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07055607 — Crooked Creek at Kelly Crossing at Yellville, AR  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 36.23027778, -92.7094444 · drainage 398 sq mi.

## Gauge-ID correction caught during verification

`07056000` (my initial ID) is actually **Buffalo River near St. Joe, AR**. Correct Crooked Creek gauge = **07055607** (Kelly Crossing at Yellville).

## Calibration key + sign-off notes

AGFC Crooked Creek Water Trail + OzarkAnglers paddler-forum gage-height key (MED). No NWS flood stage published; high/dangerous are paddler-derived (2-sourced). "low" left null (sources give a sharp draggy→ideal pivot at ~10.5 ft).
