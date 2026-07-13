# Verified identifiers — Bryant Creek (bryant-creek)

ingest-dossier.ts: every `gauges[].siteId` in bryant-creek.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07058000 — Bryant Creek near Tecumseh, MO  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 36.6272222, -92.3060556 · drainage 570 sq mi.

### 07057500 — 07057500  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- note: The North Fork of the White River, which Bryant Creek joins ~0.5 mi above Norfork Lake near Tecumseh. Larger and more strongly spring-fed than Bryant; useful for planning combined/extended floats onto the North Fork and for reading regional conditions. Not a substitute for the Bryant gauge - Bryant runs lower and flashier.

## Gauge-ID correction caught during verification

`07056700` (my initial ID) is actually **Buffalo River near Harriet, AR**. Correct Bryant Creek gauge = **07058000** (near Tecumseh).

## Calibration key + sign-off notes

moherp community trip-report calibration (optimal band well-grounded). high/dangerous OMITTED per owner (2026-07-13) — no published recreational cutoff exists (percentile inference only). Ships optimal-only, documented no_dangerous.
