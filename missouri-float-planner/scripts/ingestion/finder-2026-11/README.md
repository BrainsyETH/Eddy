# Missing river-access finder, v3 (2026-11-01)

Output of `scripts/ingestion/propose-public-land-access.ts` (read-only; it
writes nothing to the database). It replaces the v1 list in
[`../agency-gis/2026-11-oneoff/README.md`](../agency-gis/2026-11-oneoff/README.md#missing-public-land-access-finder).

| File | What it is |
| --- | --- |
| `candidates.csv` / `candidates.geojson` | Places to check, sorted by tier then score, one per 300 m of river. `road_kind` says what the road is (below) |
| `reviewed.csv` | Input: spots the owner checked by hand, with a verdict. The finder leaves them out of `candidates.csv` |
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

## Owner review of the v3 list (2026-11-01)

The owner checked 16 spots on imagery. Every verdict, with its coordinates,
is in `reviewed.csv`, which the finder reads: a rerun leaves reviewed spots
(and the 300 m around them) out, so the list holds only unchecked places.

| Kind of spot | Checked | Real access |
| --- | ---: | --- |
| MVUM road reaching the river on forest land | 3 | **3**: High Log Eddy (FS 255), Henry River (FS 1538), FS 1794 |
| County road reaching the water on land not shown public | 7 | 1 with parking (Co Rd 5328); 1 bridge with no parking (Co Rd 405) |
| Bridge on a state, US or county road | 5 | 2 that look usable but private or without parking (Hwy 32, Co Rd 5117) |
| Local road on land PAD-US shows public | 1 | 0 (Tulsa Rd: the land isn't public) |

Lessons for the next calibration:
- An MVUM road open to passenger or high-clearance vehicles that reaches
  forest riverbank is the strongest signal. All three were real. The MVUM line
  can stop short of the road's real end (High Log Eddy, about 480 m), so
  check the end on imagery.
- A county road reaching the water without public land is mostly not an
  access (1 of 7). Tier B is right for it.
- Bridges rarely have a usable public launch.

Added to Eddy from this review, through the dossier importer and its
validation, then guarded SQL. The SQL and its rollback are in
`../access-points/reviews/finder-review-2026-11-01.sql`:

| Access | River | Mile | Notes |
| --- | --- | ---: | --- |
| County Road 5328 Access | Big Piney | 10.88 | county road; parking |
| Henry River Access | Big Piney | 45.82 | FS 1538, gravel, passenger cars |
| High Log Eddy | Big Piney | 57.11 | FS 255, gravel; pinned at the road's real end |
| Forest Road 1794 Access | Big Piney | 67.18 | FS 1794, high clearance; limited parking |

Approved: three existing records whose spots the finder hit and the owner
confirmed. Each was a bare "Boat ramp" row and is now a float endpoint with
the agency's facts:
- **Simmons Ford Access** (Big Piney, MDC): mile 17.17.
- **Dalton Boat Ramp** (Eleven Point, AGFC): mile **58.7, was 65.7**.
- **Eleven Point Boat Ramp** (Eleven Point, AGFC, locally the Dunn Road
  access): mile **78.0, was 86.16**.

The two Arkansas miles were overstated. Myrtle to Dalton was 17.7 mi, but it
measures 11.2 on the USGS channel and 10.7 on Eddy's line. Dalton to the
Eleven Point ramp was 20.5, against 19.9 on the channel. Both are now set by
line distance below Myrtle (48.0), the same way the line matches the curated
Riverton to Myrtle miles (12.6 vs 12.4).

Also added, at the owner's call: **County Road 405 Bridge** (Eleven Point,
mile 8.2, about a mile above Cane Bluff) and **County Road 5117 Bridge** (Big
Piney, mile 22.42). Both have river access but no parking and private land
around them, which their text says. Their SQL and rollback are in
`../access-points/reviews/bridges-and-sandy-shoals-2026-11-01.sql`.

**Sandy Shoals Ford** (Big Piney) was the third rounded placeholder pin
(37.378, -91.974), with no road crossing within 4 km. Census still draws Sand
Shoals Rd through the old low-water ford (37.411016, -91.949972), and the
owner's parcel map shows private land on both banks there. The road now
crosses on a bridge about 200 m north, so the pin is at that bridge
(37.412816, -91.950842, snap 8 m). The mile moves from 34.6 to 37.9, which
makes Sandy Shoals to Boiling Spring 6.7 mi; published reports say 6 to 8, and
it was 10.0. The text no longer describes a ford or an unverified 8 to 10 car
pull-off.

## 2026-11-01 run (v3, after the review)

95 candidates. Reviewed spots are left out: 5 on the Eleven Point and 10 on
the Big Piney. Neither river has a tier-A spot left. Recall is 14 of 14 on the
Eleven Point and 19 of 23 on the Big Piney. The misses are:
- Mineral Springs, Sandy Shoals Ford and Warren Bridge, as before;
- High Log Eddy, whose MVUM line stops short of the river.

### The pre-review run

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

## Placeholder-pin scan, all rivers (2026-11-01)

After three rounded placeholder pins turned up (Boiling Spring, Hwy 160 Bridge,
Sandy Shoals Ford), every pin was checked in two ways:
- each of the 40 pins with 4 or fewer decimals was measured against the
  USGS NHD channel;
- every pin was compared with the agency's own feature of the same name.

Moved to MDC's boat ramp with authorization. The SQL and rollback are in
`../access-points/reviews/mdc-ramp-pins-2026-11-01.sql`.

| Access | River | Was off by | Mile |
| --- | --- | ---: | --- |
| Mineral Springs Access (placeholder 37.344, -91.988) | Big Piney | 2.7 km | 30.4 → 33.4 |
| Blair Bridge Access | North Fork | 482 m | unchanged |
| Ross Access | Big Piney | 465 m | unchanged |
| Blue Springs Creek Conservation Area | Meramec | 404 m | unchanged |
| Syenite Access | St. Francis | 355 m | unchanged |
| Mount Shira Access | Elk | 288 m | unchanged |

Millstream Gardens Conservation Area was flagged but is correct: it is the
Tiemann Shut-Ins put-in, and the MDC ramp belongs to Millstream Gardens
Fisherman's Access.

Still open, not changed:
- Lucky Clover Resort (approved) is 297 m from the channel, probably pinned at
  the office.
- Five unapproved records have doubtful pins: Beal Landing on left (Current,
  1 km), Turner Mill North (Eleven Point), Berryman Campground and Hazel Creek
  Recreation Area (Courtois), and Van Buren City Access (Current).
