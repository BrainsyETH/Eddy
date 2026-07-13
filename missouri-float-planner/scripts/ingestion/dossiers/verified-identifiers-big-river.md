# Verified identifiers — Big River (big-river)

ingest-dossier.ts: every `gauges[].siteId` in big-river.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07018500 — Big River at Byrnesville, MO  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 38.3917222, -90.6378056 · drainage 917 sq mi.

### 07018100 — Big River near Richwoods, MO  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 38.1596111, -90.7060556 · drainage 735 sq mi.
- note: Nearest gauge just downstream of Washington State Park and the popular upper float accesses (Blackwell RM 12, Washington SP RM 20, Mammoth RM 23.3, Merrill Horne RM 28.7); it is the gauge moherp pairs with those reaches (documented moherp trip 'Merrill Horne to Browns Ford' cited 572 cfs / 3.79 ft here). Also carried on moherp: https://rivers.moherp.org/gauge/?gauge=07018100

### 07017200 — Big River at Irondale, MO  (secondary)
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 37.83, -90.6908889 · drainage 175 sq mi.
- note: Uppermost gauge (St. Francois Mts., near Irondale/Leadwood). Small drainage with very low summer flow (USGS July p50 = 19 cfs, p90 = 83 cfs) — the headwater reach is usually TOO LOW to float outside spring/high water, confirming guide advice that the upper 'lead belt' section is not recommended. Included for completeness of the upper river; not a practical float-calibration gauge in summer. NOTE lat: DMS 37°49'48" = 37.8300 (use 37.83, not 38.0).

## Calibration key + sign-off notes

USGS day-of-year percentiles cross-checked with moherp live rating + OzarkAnglers seasonal normals (optimal band). high/dangerous OMITTED per owner — percentile inference only. Ships optimal-only. Popular Washington State Park reach is better represented by secondary gauge 07018100 (Richwoods).
