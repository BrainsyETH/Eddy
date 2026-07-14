# Verified identifiers — Mulberry River (mulberry)

ingest-dossier.ts: every `gauges[].siteId` in mulberry.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07252000 — Mulberry River near Mulberry, AR  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 35.57694444, -94.0152778 · drainage 373 sq mi.

## Calibration key + sign-off notes

Optimal band transferred from Turner Bend staff gauge to the USGS datum (MED, 3 cross-checks); dangerous 8.0 ft from American Whitewater ("experts only >8 ft") corroborated by NWS AHPS flood ladder. LOW-confidence "high" (6 ft) dropped.

## 2026-07-14 — DANGER ANCHOR REVISED 8.0 → 4.5 ft (owner sign-off)

Owner adopted the published Mulberry recreation key ("Readings between 2' and 4' are
ideal, while 4.5' and beyond are considered dangerous ... a heavy rain can quickly
transform the Mulberry into a rampaging torrent"). On gauge 07252000 (ft):
- Set **level_high = 4.0** (top of the ideal band) and **level_dangerous = 4.5**
  (was 8.0).
- The American Whitewater "experts only >8 ft" number is RETAINED HERE as the
  documented whitewater-expert ceiling — deliberately NOT the badge anchor. This app
  serves general/family floaters, for whom 4.5 ft is the correct "don't float"
  threshold. validate_river_data(): 0 errors, 0 warnings.
