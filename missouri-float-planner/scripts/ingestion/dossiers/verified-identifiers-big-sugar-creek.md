# Big Sugar Creek identifiers — checked 2026-11-02

Big Sugar Creek is a research draft with no production river row. This file
verifies identifiers and provider metadata independently of the research pass.
It is **not** a threshold sign-off, a corridor approval or permission to
activate. Readiness reviews in `big-sugar-creek.json` remain pending.

## Primary: USGS 07188653, Big Sugar Creek near Powell, MO

- Provider name: **Big Sugar Creek near Powell, MO**.
- Coordinate: **36.6158611, -94.1822222**. HUC12 **110702080107** (HUC8 11070208, Elk).
- Drainage area: **141 square miles**.
- Continuous series (USGS time-series catalogue, retrieved 2026-11-02):
  - **00060 discharge, ft³/s**: instantaneous `8e7a19c0f1a0428b88dd7ecb4468a198`,
    2000-05-26 → 2026-11-01 06:15 UTC; daily from 2000-05-25.
  - **00065 gage height, ft**: instantaneous `e2f71643997e48f39c452c47f66ebfcd`,
    2007-10-01 → 2026-11-01 06:15 UTC; daily from 2002-10-01.
- Production: `gauge_stations` row exists, active, reference tier
  (`curated=false`), not linked to any river. `gauge_latest` reading
  2026-11-02 05:15 UTC, 4.26 ft / 10.7 cfs.
- Measurement unit for an unrated release: **cfs** (discharge is published).
- Position: 2 m from the NHD mainstem at Eddy-geometry mile **25.26** of 44.06
  (headwaters = 0), about 15 river miles above Deep Ford.

Sources: [station metadata](https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items/USGS-07188653?f=json),
[series catalogue](https://api.waterdata.usgs.gov/ogcapi/v0/collections/time-series-metadata/items?f=json&monitoring_location_id=USGS-07188653&limit=100),
[monitoring page](https://waterdata.usgs.gov/monitoring-location/USGS-07188653/).

## NWS: BSGM7

NWPS `BSGM7` "Big Sugar Creek near Powell" resolves to usgsId **07188653**
(36.61583, -94.18222). Flood categories: action **8 ft / 2,190 cfs**, minor
**10 ft / 3,500 cfs**, moderate **15 ft / 9,400 cfs**, major **20 ft / 19,850 cfs**.
These are flood metadata and the official override, **not** recreational
anchors. Source: `https://api.water.noaa.gov/nwps/v1/gauges/BSGM7`.

## Calibration evidence checked at source

[moherp Powell page](https://rivers.moherp.org/gauge/?gauge=07188653&hours=168),
retrieved 2026-11-02. **Observed** tier: Flood (none), High (none), Good **80 cfs**,
Low **50 cfs**. Estimated tier (rejected as thresholds per README rule 2):
930 / 410 / 171 / 70. The observed tier has no top of the ladder, so a rated
release would read "Good" from 80 cfs up to the 10-ft flood override. This
supports the dossier's unrated recommendation; it does not sign it off.

## Excluded: USGS 07188838, Little Sugar Creek near Pineville, MO

Exists in production (reference tier, NWS LSGM7, fresh). It is on the other
headwater fork and enters only at the confluence. Correctly left out of
`gauges[]`.

## NHD identity

NHD MapServer layer 6, queried 2026-11-02:

| Permanent_Identifier | GNIS_ID | GNIS_Name | ReachCode | FCode | Note |
|---|---|---|---|---|---|
| **86152947** | 00748853 | Big Sugar Creek | 11070208000057 | 55800 (artificial path) | 0.719 km at Deep Ford; dossier's representative id |
| 86154253 | 00748853 | Big Sugar Creek | 11070208000056 | 55800 | 8 m connector ending at -94.38268, 36.58829 (the confluence) |

Big Sugar's lower channel is mapped as artificial paths through an NHD
StreamRiver area, so a representative id is a reach id, not a whole-river id
(the same convention as Elk's 86154255).

TNM HU8 11070208 dissolve (`scripts/lib/nhd.ts`, GNIS "Big Sugar Creek", 159
flowlines): **44.1 mi**, start -93.95910, 36.51993, end **-94.38267, 36.58828**.
That end is **0 m** from production `rivers.geom` start for `elk`, so the two
geometries join at the confluence.

## Access identifiers

- **Deep Ford Access**: MDC Area_ID **8512**. Oct 29 MDC snapshot point
  **36.616707, -94.352531**. The
  [MDC page](https://mdc.mo.gov/discover-nature/places/deep-ford-access) states
  "a parking lot and a gravel launch ramp suitable for canoes or kayaks to Big
  Sugar Creek", 42.1 acres, open 4 AM–10 PM daily. Snaps **58 m** to the
  mainstem at Eddy-geometry mile **40.45** (3.6 NHD miles above the mouth;
  floatmissouri guide 20.4 → 24.3 = 3.9 mi). The snapshot feature carries no
  stream name, which is why the Oct 3 review missed it.
- **City of Pineville Elk River Access**: an existing approved Elk access point.
  It snaps 376 m from the Big Sugar mouth because it is on the Elk, below the
  confluence.

## Routing finding

`get_float_segment` (migration `00142`) resolves both endpoints on a single
river. Deep Ford → Pineville spans two rivers and cannot be planned today. A
Big Sugar corridor needs either a take-out on Big Sugar itself, a cross-river
routing change, or a listing-only release (as with Cowskin on the Elk).
