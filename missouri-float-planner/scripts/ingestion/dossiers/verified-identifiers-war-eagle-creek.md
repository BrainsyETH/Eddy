# Verified identifiers — War Eagle Creek (war-eagle-creek)

ingest-dossier.ts: every `gauges[].siteId` in war-eagle-creek.json must appear below.

All gauge IDs below were verified against the live USGS site service on 2026-07-13
(station name, available parameters, coordinates, drainage area).

## USGS gauges (verified)

### 07049000 — War Eagle Creek near Hindsville, AR  ✅ PRIMARY
- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.
- coords: 36.2, -93.855 · drainage 263 sq mi.

## Calibration key + sign-off notes

Gage-height float key (Withrow Springs SP / AR Own Backyard / Arkansas Canoe Club) — HIGH-confidence optimal band (2.0–3.5 ft). Danger anchor OMITTED (the only source, "just over 4 ft = flood," is single-source) — ships optimal-only, documented no_dangerous.

## 2026-07-14 — DANGER ANCHOR ADDED (owner sign-off)

Owner adopted the community float key for the Hindsville / Hwy 45 gauge (07049000):
ideal 2.0–3.5 ft, ">4 ft = flood." Set **level_dangerous = 4.0 ft** (was null).
- Sources: recreational float guide ("levels above 4 feet are considered flood stage")
  + Arkansas Canoe Club forum thread (2.0 ft floatable floor; "huge drainage basin,"
  flashy). This corroborates the earlier single-source note.
- NOT an NWS forecast point — USACE HDGA4 carries live data only (1.56 ft / 183 cfs
  at check time), no published flood stage — so this is a community/recreational
  anchor, adopted per owner rather than a hydrologic AHPS stage.
- `level_high` left null (no distinct published high band; sources jump ideal-3.5 →
  flood-4.0). validate_river_data(): 0 errors, 0 warnings.
