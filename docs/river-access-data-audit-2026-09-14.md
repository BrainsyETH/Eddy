# River access data audit — access points, boat ramps, campgrounds

Scope: all 24 `rivers.active = true` rivers, audited 2026-09-14 against
production (`ilefwfpvphadsbptiaur`). Read-only; no data was changed.

Covers `access_points`, `nearby_services` (campground / cabin_lodge /
outfitter), `nps_campgrounds`, `campsite_facilities`, and the mile/geometry
plumbing those three depend on. Every number below came from a query against
production and the query is quoted so it can be re-run.

## Baseline

| | |
| --- | --- |
| Active rivers | 24 (17 MO, 7 AR) |
| Access points on active rivers | 401 |
| — approved (public) | 309 |
| — pending (invisible to users) | 92 |
| Services linked to an active river | 188 (88 outfitter, 51 cabin_lodge, 49 campground) |
| NPS campgrounds snapped to an active river | 34 |
| Live-availability facilities | 40 (30 + 6 enabled), synced same-day, 0 stale |

Two access-point flags decide what a user can actually do. `approved = false`
is hidden by RLS (`Approved access points are viewable by everyone`), and
`is_float_endpoint = false` cannot be a put-in or take-out
(`src/lib/access-points/endpoint-resolver.ts`). "Usable" below means both true.

---

## P0 — The app shows wrong distances on 11 of 24 rivers

**This is the most serious finding, and it is silent.**

`get_float_segment()` returns two things that come from two different sources:

```sql
ST_LineSubstring(v_river_geom, v_start_fraction, v_end_fraction)  -- the map line: GEOMETRY
ABS(v_end_mile - v_start_mile)                                    -- the quoted miles: STORED COLUMN
```

The drawn segment is derived from the snapped coordinates. The mileage the user
reads — and the float time computed from it in `/api/plan` — is
`river_mile_downstream` arithmetic. When those two disagree, the map and the
number disagree, and nothing notices.

They disagree on 11 rivers. Comparing each approved point's stored mile against
the database's own formula (`ST_LineLocatePoint(geom, pt) * length_miles`, which
is exactly what `snap_to_river()` computes):

| River | pts | mean offset | spread (max−min) |
| --- | --- | --- | --- |
| niangua | 19 | −25.84 | **9.78** |
| gasconade | 19 | −3.94 | **8.58** |
| bourbeuse | 18 | −29.85 | **8.27** |
| black | 8 | +8.04 | 4.80 |
| meramec | 29 | −23.18 | 4.73 |
| eleven-point | 17 | −4.72 | 3.36 |
| buffalo | 22 | −15.95 | 2.29 |
| huzzah | 8 | −3.28 | 2.16 |
| st-francis | 9 | −23.23 | 1.36 |
| north-fork-white | 8 | +1.02 | 1.10 |
| courtois | 6 | −6.94 | 0.83 |

The other 13 rivers (current, jacks-fork, james, kings-river, crooked-creek,
mulberry, caddo-river, bryant-creek, spring-river, spring-river-mo, big-river,
war-eagle-creek, big-piney) match to ≤0.05 mi. Those are the rivers where
`set_access_point_miles_from_geometry()` has been run against the current
geometry; the 11 above have not been re-run since their geometry last changed.

**The mean offset is mostly harmless — the spread is not.** A constant offset is
just a different mile datum (Buffalo's ≈−16 looks like official NPS miles, and
its spread of 2.29 is consistent with that). Distances are differences, so only
the *variation* in the offset corrupts them. Worst real put-in/take-out pairs:

| River | Put-in → take-out | App quotes | Map draws | Error |
| --- | --- | --- | --- | --- |
| **niangua** | **Williams Ford → Moon Valley** | **10.10 mi** | **1.55 mi** | **+551%** |
| black | Highway K → River Road Park | 13.20 mi | 18.00 mi | −27% |
| black | River Road Park → Mill Spring | 12.40 mi | 9.22 mi | +34% |
| meramec | Sappington Bridge → Meramec State Park | 4.80 mi | 6.91 mi | −31% |
| jacks-fork | Bay Creek → Alley Spring | 5.80 mi | 4.02 mi | +44% |
| huzzah | Dillard Mill → Highway 49 Bridge | 0.10 mi | 1.44 mi | −93% |
| meramec | Meramec State Park → Spanish Claim | 4.00 mi | 2.67 mi | +50% |
| niangua | Cat Hollow → Riverfront Campground | 3.50 mi | 2.28 mi | +53% |

25 consecutive-pair segments are off by ≥1.0 mi.

Williams Ford Access is a single bad value rather than a datum question. Every
other Niangua point sits ≈25.5 mi below its geometry mile; Williams Ford sits
33.4 below. Against its downstream neighbour Moon Valley it should read ≈20.8,
not 12.2. A user planning Williams Ford → Moon Valley is told to budget a
10-mile day for a 1.5-mile paddle.

Ordering is *not* affected — only two adjacent near-ties swap rank across all 24
rivers — so access lists and upstream/downstream logic are fine. This is purely
a magnitude defect.

### Why the existing gate misses it

`validate_river_data()` has two mileage checks and neither can catch this:

- `mileage_order_mismatch` compares *order* along the geometry, never magnitude.
- `mileage_equals_length` catches only the clamped-placeholder case.

A full `npm run db:validate` today returns exactly **one** finding across all 24
rivers (`jacks-fork threshold_order`), which reads as a clean bill of health.

### A second, separate bug in the same function

`access_point_offline` is dead code:

```sql
AND ST_Distance(ap.location_snap::geography, r.geom::geography) > 500
```

`location_snap` is produced by `ST_LineInterpolatePoint(geom, fraction)` — it is
*on* the line by construction, so this distance is always ~0 and the check can
never fire. Measured distances confirm it: `location_snap → geom` is 0.000 m for
every approved point, while the real `location_orig → geom` distance reaches
1000 m (Buffalo City) and 993 m (Echo Bluff State Park). It should measure
`location_orig`. The stored `snap_distance_m` column already holds the right
number and could be used directly.

**Recommended:** add a magnitude check to `validate_river_data()`
(stored vs `ST_LineLocatePoint * length_miles`, warn above ~1 mi), fix
`access_point_offline` to measure `location_orig`, fix Williams Ford by hand,
then decide per river whether to re-run
`set_access_point_miles_from_geometry(river_id, true)` or to keep a deliberate
curated datum (Buffalo's NPS miles are the case for keeping one — and if kept,
`get_float_segment` should derive distance from geometry, not from the datum).

---

## P1 — Coverage gaps

### Rivers with no camping data at all

Three active rivers have zero campgrounds from every source (services directory,
NPS, and access points typed `campground`):

- **james** — 5 access points, 93 mi, 1 cabin_lodge, no campground
- **kings-river** — 10 access points, 108 mi, nothing
- **spring-river-mo** — 14 access points, 98 mi, **no services of any kind**

Three more have exactly one: bourbeuse, bryant-creek, courtois, crooked-creek.

### Usable endpoints per river

Thinnest coverage by miles-per-usable-endpoint:

| River | geom mi | usable endpoints | mi/endpoint | covered span |
| --- | --- | --- | --- | --- |
| black | 187 | 8 | 23.4 | mile 12 → 87 |
| caddo-river | 73 | 4 | 18.2 | mile 12 → 36 |
| james | 90 | 5 | 18.1 | mile 55 → 88 |
| big-river | 138 | 9 | 15.4 | mile 13 → 131 |
| gasconade | 255 | 19 | 13.4 | mile 3 → 252 |
| st-francis | 119 | 9 | 13.2 | mile 7 → 77 |
| kings-river | 108 | 10 | 10.8 | mile 11 → 94 |

Unserved end-of-river stretches (no usable endpoint at all):

- **meramec** — miles 136→224. The entire lower river through the St. Louis
  metro, the most populated reach in the dataset.
- **black** — miles 87→187.
- **caddo-river** — only 24 of 73 miles covered, at either end.
- **crooked-creek** — upper 40 miles.
- **james** — upper 55 miles.
- **eleven-point** — lower 43 miles.
- **niangua** / **spring-river-mo** — lower ~42 miles each.

Some of these are legitimate (the Niangua's bottom end is Lake of the Ozarks;
lower Meramec is flatwater). They should be recorded as deliberate rather than
left looking like missing data.

36 interior gaps of ≥12 mi between consecutive endpoints. Largest:
big-river Leadwood → Washington State Park (43.9 mi), gasconade Wilbur Allen →
Anna M. Adams (30.1), gasconade Pointers Creek → Helds Island (24.6), buffalo
Rush → Buffalo City (24.2), gasconade Schlicht Springs → Riddle Bridge (23.8),
st-francis Jewett → Sam A. Baker (23.1).

### Buffalo live campsite availability is half-wired

All 17 Current and all 6 Jacks Fork NPS campgrounds have an enabled
`campsite_facilities` row. Buffalo has 4 of 11. Missing: **Kyles Landing (33
sites)**, **Ozark (32)**, **Rush (12)**, **Carver (8)**, plus Spring Creek,
South Maumee and Woolum. All seven have `reservation_url` set on the NPS row, so
a user sees a booking link with no availability behind it. The sync itself is
healthy — last run today, zero stale facilities — so this is a coverage gap, not
a broken job. Four facility rows (1 recreation_gov, 3 mo_state_parks) are
orphans linking to no campground, access point, or service.

---

## P2 — Data hygiene

### The pending queue is 74% legacy junk

92 pending points. They split cleanly into two populations:

- **68 created 2026-01-22/23** by the legacy `import-floatmissouri.ts` path that
  `docs/data-pipeline.md` already warns "duplicates and mislocates". **58 sit
  more than 1500 m from their river** — up to 162 km (niangua "Smith Ford").
  Names are truncated mid-string (`Hwy`, `St`, `Private`, `Brazil low-water
  bridge on road between Hwy`) and carry unescaped HTML entities
  (`Bird&#8217;s Nest`, `River &#8216;Round`). 15 Meramec rows share the
  identical mile 108.5 and cluster within 40 m of each other ~82 km off-river —
  a geocoder fallback, not places.
- **21 created 2026-03 through 2026-07**, well-snapped, sourced, and ready.

Those 21 are worth approving on their own merits and several close gaps named
above — Meramec State Park (Lower Ramp) (2 m), Gruner Ford (2 m), Bass River
Low-Water Bridge (2 m), Mill Creek (4 m), Barlow Ford (8 m), Laubinger Ford
(8 m), Indian Ford (12 m), County Road 654 Bridge (17 m), Ruby's Landing (31 m),
Highway 8 Bridge Lower (40 m), Twin Rivers Landing (40 m), Mt. Sterling Bridge
(41 m), Big John Access (57 m), Shine Eye (65 m), Whitehouse Ford (145 m),
Charity Access (227 m), Turner Mill North (316 m), Tecumseh Access (922 m),
Huzzah CA / Highway E (996 m), Parks Bluff Campground (1089 m), Robert E. Talbot
Access (1139 m).

Two of those (Meramec State Park Lower Ramp, Huzzah CA / Highway E) and one
Gasconade row (Odin Access) have `river_mile_downstream = NULL` and need a mile
before they are useful.

Purging the 68 legacy rows would cut the admin queue from 92 to 24 and make the
`unapprovedAccessPoints` badge mean something again.

### 39 mapped services have no coordinates

Of the services whose *primary* river is active, 39 have `latitude IS NULL` —
they cannot be placed on a map or distance-sorted. Whole rosters are affected:
all 8 of Black's Lesterville cluster, all 6 of Spring River (AR)'s, all 4 of
Buffalo's outfitters, all 3 of Crooked Creek's. Three more are geocoded far from
their river: OA Rental Properties (17.8 mi), Float Eureka (13.4 mi), Wild Bill's
Outfitter (10.6 mi). Separately, **no service anywhere carries a
`google_place_id`** (0 of 188), so `propose-service-places.ts` has never landed.

### 92 approved access points carry no roles

Per ADR 0008 the `types` array is the roles axis and drives which map layers a
place appears on. It is empty on 92 approved points, concentrated in 11 rivers
where it is empty on *every* point: spring-river-mo (14), spring-river (10),
kings-river (10), crooked-creek (9), big-river (9), bryant-creek (8),
war-eagle-creek (7), mulberry (7), north-fork-white (7), james (5),
caddo-river (4).

`launchRolesOf()` falls back to the singular `type`, so these still resolve as
launches — but a fallback to one value cannot express two roles, so on those 11
rivers no place can be both a boat ramp and a campground. Related: 6 approved
points list `boat_ramp` in `amenities` without the `boat_ramp` role, and 5 list
`camping` without the `campground` role. Those drop off the respective layers.

### Facility metadata is absent on a whole cohort

Eleven rivers have **no** amenities, parking, or road-access data on any approved
access point: big-river, bryant-creek, caddo-river, crooked-creek, james,
kings-river, mulberry, north-fork-white, spring-river, spring-river-mo,
war-eagle-creek. Seven of those also have no description. spring-river-mo is
empty on every field checked including `official_site_url` and `managing_agency`.

The two NPS rivers are thin in a different way: jacks-fork has no
`official_site_url` or `managing_agency` on any of its 11 points, current on 32
and 30 of 34 — exactly the fields worth having where an official page exists.

### Shuttle routing has no anchor anywhere

`driving_lat` / `driving_lng` are **NULL on all 443 access points**, so
`/api/shuttle` and `/api/plan` route from the snapped mid-river point. This is
known — `src/app/api/plan/route.ts` removed drive time and mileage from
`PlanResult` because of it — but the comment there says "372 of 406 access
points", which is now stale; it is 443 of 443. Only 30 approved points have a
`directions_override` to fall back on. The feature stays switched off until this
column is populated.

### Two service-linking mechanisms, both nearly empty

`access_point_services` holds 23 links across 21 access points, and
`access_points.nearby_services` (jsonb) is an empty array on 282 of 309 approved
points — populated only on meramec (21), huzzah (3), big-piney (2) and
courtois (1). So ~93% of access points route no outfitter or campground content,
which is what `src/lib/access-points/linked-services.ts` exists to do.

### Near-duplicate approved points

Only one looks like a genuine duplicate: big-piney **"Devil's Elbow (Highway V
Bridge)"** and **"Old Route 66 Bridge"** — 21 m apart, identical river mile
104.20, both typed `bridge`. Worth merging. The other close pairs are distinct
places correctly recorded separately (a resort beside an MDC access, etc.);
current's "Van Buren Riverfront Park" / "Van Buren City Access" at 140 m should
be confirmed, especially as a *third* unapproved "Van Buren City Access" exists
113 m away.

### Hazards (adjacent, and thinner than it looks)

Only 22 hazard records exist across all active rivers, and **12 of 24 rivers
have none at all** — including current, jacks-fork, buffalo and eleven-point,
the four flagship rivers. Six of the 22 have `location IS NULL`. `/api/plan`
selects hazards by river-mile range, so on the 11 rivers in the P0 section the
hazard datum and the access-point datum are not guaranteed to agree.

---

## Suggested order of work

1. Fix Williams Ford's mile (one row, worst single user-facing error).
2. Add the mile-magnitude check to `validate_river_data()` and fix
   `access_point_offline` — without these, item 3 regresses silently.
3. Re-run `set_access_point_miles_from_geometry` per river, or record the datum
   as deliberate and change `get_float_segment` to measure geometry.
4. Approve the 21 good pending points; delete the 68 legacy rows.
5. Geocode the 39 coordinate-less services.
6. Wire the 7 missing Buffalo NPS campgrounds to `campsite_facilities`.
7. Backfill `types` roles on the 11 empty-roles rivers.
8. Fill the camping void on james, kings-river, spring-river-mo.
9. Backfill facility metadata on the 11-river cohort.
10. Decide and record which unserved reaches are deliberate.
