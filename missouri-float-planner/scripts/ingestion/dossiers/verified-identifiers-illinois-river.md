# Illinois River (OK) identifiers — checked 2026-11-02

The Illinois River is a research draft with no production river row; production
has no Oklahoma rivers at all. This file verifies identifiers and provider
metadata independently of the research pass. It is **not** a threshold sign-off,
a corridor approval or permission to activate. Readiness reviews in
`illinois-river.json` remain pending.

## Gauges

All four were checked against the USGS monitoring-location and series catalogue
APIs on 2026-11-02, and all are in production `gauge_stations` as active,
reference-tier (`curated=false`), unlinked stations with fresh `gauge_latest`
readings (04:30–05:15 UTC). The research recorded the same coordinates and
drainage areas.

| Site | USGS name | County | Drainage | Datum (NAVD88) | Continuous series (instantaneous) | NWS LID |
|---|---|---|---|---|---|---|
| **07195500** | Illinois River near Watts, OK | Adair | 630 mi² | 894.01 ft | 00060 since 1990-10-01 (daily since 1955); 00065 since 2007-10-01 | WTTO2 |
| **07196090** | Illinois River at Chewey, OK | Adair | 825 mi² | 800.91 ft | 00060 and 00065 since 2010-06-07 (daily discharge since 2000) | CWYO2 |
| **07196320** | Illinois River near Moodys, OK | Cherokee | 895 mi² | 744.66 ft | 00065 only, since 2018-05-22 | none (NWPS has no forecast point) |
| **07196500** | Illinois River near Tahlequah, OK | Cherokee | 950 mi² | 665.08 ft | 00060 since 1990-10-01 (daily since 1935); 00065 since 2007-10-01 | TALO2 |

Every series above was current to 2026-11-01/02 at retrieval.

NWPS (`api.water.noaa.gov/nwps/v1/gauges/<LID>`), stage only (flow -9999):

| LID | usgsId | Action | Minor | Moderate | Major |
|---|---|---|---|---|---|
| WTTO2 | 07195500 | 13 ft | 13 ft | 17 ft | 23 ft |
| CWYO2 | 07196090 | 9 ft | 12 ft | 15 ft | 20 ft |
| TALO2 | 07196500 | 9 ft | 11 ft | 14 ft | 18 ft |

These are flood metadata and the official override, not recreational anchors.

**Unit note for sign-off.** The dossier gives every gauge `measurementUnit: "ft"`
because GRDA's rules are written in feet. Watts, Chewey and Tahlequah also
publish discharge, which is not affected by the stage drift the research
describes. For an unrated, readings-only release either unit is supportable;
the choice is the owner's.

## NHD identity

NHD MapServer layer 6, queried 2026-11-02. All carry GNIS_ID **01094043**,
GNIS_Name "Illinois River", FCode 55800.

| Permanent_Identifier | ReachCode | Length | Lies at |
|---|---|---|---|
| **64287778** | 11110103000196 | 0.951 km | Chewey gauge (dossier's representative id) |
| 64286510 | 11110103000222 | 2.397 km | Watts gauge |
| 64290058 | 11110103000181 | 0.830 km | Moodys gauge |
| 64293504 | 11110103001505 | 0.351 km | Tahlequah gauge |

USGS names the tributary **Baron Fork** (gauge 07197000 "Baron Fork at Eldon,
OK", HUC12 111101030709). Use that spelling for any NHD lookup; "Barren Fork"
matches nothing.

## Geometry (TNM HU8 11110103, `scripts/lib/nhd.ts` dissolve)

GNIS "Illinois River", 529 flowlines: **148.7 mi** from the Arkansas headwaters
(-94.31233, 35.86871) to the Arkansas River (-95.09758, 35.48902). This runs
through Tenkiller Ferry Lake and the regulated tailwater below the dam.

Positions on that line (miles from headwaters):

| Feature | Eddy mile | Off line | GRDA mile | Eddy − GRDA |
|---|---|---|---|---|
| WOKA (AGFC facility 25308) | 49.84 | 38 m | 2.6 | 47.24 |
| Watts gauge 07195500 | 50.42 | 36 m | (Watts PAA 3.1) | — |
| Chewey gauge 07196090 | 70.97 | 25 m | — | — |
| Round Hollow (OSM lead) | 75.55 | 91 m | 27.7 | 47.85 |
| Peavine Hollow (OSM lead) | 79.68 | 61 m | 32.4 | 47.28 |
| Moodys gauge 07196320 | 83.37 | 35 m | — | — |
| No Head Hollow (OSM lead) | 88.94 | 155 m | 41.5 | 47.44 |
| Echota (OSM lead) | 100.21 | 98 m | 53.2 | 47.01 |
| Tahlequah gauge 07196500 | 101.96 | 158 m | — | — |
| **Baron Fork mouth (NHD)** | **108.70** | 0 m | 62.5 | 46.20 |
| **Tenkiller Ferry Lake polygon begins** | **108.75** | — | — | — |
| Horseshoe Bend (OSM lead) | 111.82 | 64 m | 65.6 | 46.22 |
| Lake polygon ends (dam) | 137.91 | — | — | — |

Findings:

1. **GRDA river miles ≈ Eddy miles − 47.2** throughout the corridor (46.2–47.9;
   the spread is consistent with line simplification). The six OSM leads sit
   where GRDA's published mileage puts them. This corroborates them as
   *placement leads*; it does not make them launch coordinates.
2. **Baron Fork enters at the head of Tenkiller Ferry Lake** in NHD. The
   dossier's downstream exclusion (below Baron Fork) coincides with the end of
   free-flowing river. Horseshoe Bend is inside the lake polygon.
3. **The whole-stem importer would store ~40 miles of lake and tailwater.**
   `build-tailwater-geometry.ts` can slice a stem but is tailwater-only (it
   forces `riverType: 'dam_tailwater'`). Ending the Illinois at the lake head
   (Eddy mile ~108.7) needs an owner decision and a small `endAt` option on
   `import-nhd-rivers-from-tnm.ts`. Trimming the downstream end does not move
   any river mile, because miles are measured from the headwaters.
4. The Arkansas reach above WOKA (Eddy miles 0–~49.8) stays in the geometry
   under the headwaters-origin convention. No AR endpoints are proposed.

## Access identifiers

No access point has an authoritative coordinate; all remain null and held as
the dossier records. GRDA, USACE and ODWC coordinates are still needed. The
production reference catalog has no `illinois-river` slug (queried
2026-11-02).
