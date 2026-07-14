# Verified identifiers — Kings River (kings-river)

ingest-dossier.ts: every `gauges[].siteId` in kings-river.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07050500 — Kings River near Berryville, AR  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 36.4272222, -93.6208333 · drainage 527 sq mi.

## Gauge-ID correction caught during verification

`07050152` (my initial ID) is actually **Roaring River at Roaring River State Park, MO** — a different river. Correct Kings gauge = **07050500**.

## Calibration key + sign-off notes

HELD INACTIVE. Only the outfitter minimum-floatable levels (too_low 3.2 / low 3.5 ft) are published; no optimal band exists and the only danger reference is the NWS flood stage (30 ft, far above floater-danger). Ingested too_low/low only; activate when an outfitter optimal/danger key exists.

## 2026-07-14 — ACTIVATED (owner sign-off)
Gauge **07050500 (Kings River near Berryville, AR)** linked (ft). Operator key from
**Kings Crossing RV Park & Campground** (Berryville float operator): "Minimum 3.0 / Optimal
3.5–5.0 / Dangerous: Above 6.0." Ladder: too_low 3.0 / low 3.2 / optimal_min 3.5 /
optimal_max 5.0 / **high 5.1 (set by owner)** / **dangerous 6.0**. Danger 6.0 is single-operator
but directionally corroborated (American Whitewater "surfing 5 and up"; ozarkpages play-wave
>6 ft); NOT the ~30 ft NWS valley-flood stage. Access points (14) + services (3) + geometry +
prose were already staged. `stale_gauge` warning clears on the first gauge poll.
