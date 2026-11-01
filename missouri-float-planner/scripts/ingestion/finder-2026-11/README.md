# Missing river-access finder, v3 (2026-11-01)

Output of `scripts/ingestion/propose-public-land-access.ts` (read-only; it
writes nothing to the database). It replaces the v1 list in
[`../agency-gis/2026-11-oneoff/README.md`](../agency-gis/2026-11-oneoff/README.md#missing-public-land-access-finder).

| File | What it is |
| --- | --- |
| `candidates.csv` / `candidates.geojson` | Places to check, sorted by tier then score, one per 300 m of river. `road_kind` says what the road is (below) |
| `suspect-records.csv` | Access points pinned more than 300 m from the real channel, not trusted as "known". Empty after the pin fixes below |

These are places for a person to look at, not access points. A road reaching
public ground says nothing about a launch being legal, safe or usable.

## Why v2

v1 read only Forest Service (MVUM) roads. Its top Eleven Point pick, Boom Hole,
was wrong: a 1.5-mile high-clearance track to a river feature. The spot
floaters actually use, **Long Hollow**, sits about 0.8 km away. It is reached
on Oregon County Road 416, which ends 48 m from the channel. v1 missed it for
three reasons:

1. **No county roads.** v2 adds Census TIGER local and secondary roads.
   MTFCC S1500 marks a 4WD trail.
2. **Eddy's river line is coarse**, with about one vertex per 400 m. v2
   measures distance to water against the USGS NHD high-resolution channel
   and uses Eddy's line only for position along the river.
3. **Road geometry.** County Road 416 loops down to the river and back, so its
   nearest point is mid-road, not an end. v2 adds "road loops to river"
   approach points. Its dead-end test also ignores a road's own vertices:
   TIGER has seven vertices in Long Hollow's last 49 m.

## Why v3: five false positives

The owner reviewed v2's five Eleven Point tier-A spots, and none is an access.
Each sits on National Forest land with no MVUM route within 300 m:

| Spot | Census road | Why it isn't a way in |
| --- | --- | --- |
| Hurricane Creek mouth, 36.776422, -91.275183 | Forest Rd 4031 (S1400) | Forest Service road missing from the MVUM |
| 36.651746, -91.186327 | unnamed (S1740) | S1740 is a private service road (logging, ranch) |
| 36.750056, -91.249741 | Forest Rd 3230A (S1400) | The MVUM lists 3230A as high-clearance only, and not down to this point |
| 36.785240, -91.311326 | unnamed (S1400) | unnamed woods road, not on the MVUM |
| Rush Creek mouth, 36.565231, -91.176195 | unnamed (S1740) | private service road |

Long Hollow, the true find, is the only one on a road Census codes as a
**county** route (RTTYP `C`).

On National Forest land, motor vehicles may use only MVUM routes (36 CFR
212.51). The MVUM, though, lists only Forest Service roads, so a road missing
from it is not necessarily closed:
- **Cane Bluff** is reached on County Road 405, which Census names
  "Forest Rd 3189" and the MVUM omits.
- **East Gate**'s entry road is an unnamed recreation-site road.

Dropping every off-MVUM road on the forest cost those real accesses, and recall
fell to 11/12 and 12/18. So v3 does three things instead:
- it stops reading S1740 as drivable;
- it gives **tier A only** to county, state or US routes (TIGER RTTYP C/S/U/I)
  and to MVUM roads open to passenger vehicles (maintenance level 3 or above);
- it flags a road end on National Forest land that is off the MVUM. A local or
  unnamed road end is noted as "unknown status: may be private".

The land test uses the land where the road **ends**. A private resort road
beside forest bank is not a forest road.

The five spots are fixtures in `public-land-access-2026-11.test.ts`: none can
reach tier A again.

## Tiers

- **A**: a county or state road, or a passenger-grade MVUM road, reaches public
  riverbank.
- **B**: a road reaches the water, but one of these applies:
  - the land is not shown public (often a county right-of-way, so check
    legality);
  - it is a high-clearance Forest Service track;
  - it is a local or unnamed road of unknown status.
- **C**: a road crosses the river (a bridge or ford).

## Validation

- **Holdout:** `--river=eleven-point --holdout=long-hollow` treats Long Hollow
  as unknown. v3 still finds it as **tier A**: Co Rd 416, 47 m to water, 15 m
  from the access pin.
- **Recall:** trusted launches with a road candidate within 0.5 km:
  - Eleven Point: 12 of 12;
  - Big Piney: 15 of 18, which now includes Boiling Spring. The misses are
    Mineral Springs, Sandy Shoals Ford and Warren Bridge, the same three
    the v2 rules miss on today's data.
- **Precision:** none of the five reviewed false positives is tier A. Only one
  tier-A spot remains on either river.

## 2026-11-01 run (v3)

123 candidates:

| River | Tier A | Tier B | Tier C |
| --- | ---: | ---: | ---: |
| Eleven Point | 0 | 44 | 0 |
| Big Piney | 1 | 72 | 6 |

Tier A is **High Log Eddy** on the Big Piney: FS 255, an MVUM road at
maintenance level 3, 65 m to water on Mark Twain National Forest land,
37.544632, -92.021159, between Warren Bridge and Slabtown.

The best tier B leads are county roads that reach the water on land not shown
as public. These are likely right-of-way spots, so check legality:

| River | Road | To water | Between | Pin |
| --- | --- | ---: | --- | --- |
| Big Piney | Co Rd 5966 (loop) | 20 m | river start → Baptist Camp | 37.129836, -92.153144 |
| Big Piney | Co Rd 4320 (loop) | 40 m | river start → Baptist Camp | 37.209419, -92.015870 |
| Big Piney | Co Rd 2630 (loop) | 43 m | Bookers Bend → Gasconade confluence | 37.833450, -92.085606 |
| Big Piney | Co Rd 5328 (loop) | 42 m | river start → Baptist Camp | 37.194717, -92.039614 |
| Big Piney | Co Rd 5930B (loop) | 61 m | river start → Baptist Camp | 37.125446, -92.125057 |
| Eleven Point | Co Rd 405 (loop) | 103 m | Denny Hollow → Cane Bluff | 36.791437, -91.413010 |

## Pin fixes (applied 2026-11-01)

Both suspect records from the v2 run were fixed in production with
authorization. The SQL is guarded: compare-and-set, and each update must
match exactly one row. It is in
`../access-points/reviews/pin-fixes-2026-11-01.sql`, with its rollback.

| Record | Was | Now | Evidence |
| --- | --- | --- | --- |
| Boiling Spring Access (Big Piney, approved) | 37.435, -91.97, a rounded placeholder 458 m off Eddy's line; mile 42.4 | 37.461580, -91.987636, snap 42 m; mile 44.6 (upstream 63.3) | MDC Boat Ramps layer, OBJECTID 39, 14 m from the channel |
| Hwy 160 Bridge (Eleven Point, unapproved) | 36.7985, -91.3834, 17 km upriver | 36.648742, -91.200844, snap 0 m | where US Hwy 160 crosses the NHD channel |

Boiling Spring's pin is 2.1 line-miles downstream of the old one, so the mile
was re-interpolated on the curated scale between:
- Sandy Shoals Ford: mile 34.6, line 33.5;
- Mason Bridge: mile 50.4, line 48.9.

Boiling Spring to Mason Bridge is now 5.8 mi, and published float reports put
it at about 6. Sandy Shoals to Boiling Spring is now 10.0 mi, while reports
range from 6 to 8. Sandy Shoals' own pin (212 m from the line) is worth a look.

Hwy 160 Bridge duplicates Riverton, 34 m away, and stays unapproved.

## Promoted from this finder

**Long Hollow** (Eleven Point) went in from
`../access-points/eleven-point.json` via `import-dossier-access-points.ts`.
`../access-points/reviews/long-hollow-2026-11-01.csv` was then applied with the
guarded repair script:
- road surface set to dirt + 4WD required (the dossier RPC has no
  road-surface key);
- river mile set to 13.1. The geometry mile was 17.22, which put it below
  Greer Crossing; 13.1 is interpolated on the curated scale between Cane Bluff
  (9.3) and Greer (16.6).

Approved, USFS-managed, float endpoint.

To promote another confirmed spot, add it to a dossier and import it. It lands
`approved = false`.
