# Verified identifiers — Big Piney River (big-piney)

ingest-dossier.ts: every `gauges[].siteId` in big-piney.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 06930000 — Big Piney River near Big Piney, MO  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 37.66563889, -92.0499167 · drainage 560 sq mi.

### 06928900 — BIG PINEY RIVER NEAR HOUSTON, MO  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 37.3264368, -92.0071006 · drainage 251 sq mi.
- note: Upper-river gauge (~Houston, Texas Co, 37.3231/-91.9971). Nearest gauge for upper sections (Baptist Camp–Mineral Springs–Boiling Spring). Already secondary in DB.

## Gauge-ID correction caught during verification

`07066000` (my initial ID) is actually **Jacks Fork at Eminence, MO**. Correct Big Piney gauge = **06930000** (near Big Piney / at Ross), already in the DB.

## Calibration key + sign-off notes

ADOPTED moherp key per owner (2026-07-13), replacing the older conservative DB values (which had dangerous 814 cfs vs moherp Good). New ladder: too_low 164 / optimal 519–1013 / high 1014 / dangerous 2049 cfs. Secondary upper-river gauge 06928900.
