# Tailwater access enrichment — October 29, 2026

Visitor facts for the 38 approved access points on Norfork, the White and
Lake Taneycomo, which went live the same day with descriptions on only 8 and
no parking, road, amenity or verified fee data (issue #1541). Desk research
from official sources: AGFC's public-use facility GIS and tailwater maps, MDC
area pages, Recreation.gov and Corps notices, Arkansas State Parks, and the
cities of Branson, Cotter, Calico Rock, Rockaway Beach and Forsyth. Every
value and its sources are in
[`tailwater-access-enrichment-evidence-2026-10-29.json`](tailwater-access-enrichment-evidence-2026-10-29.json).
This is not a field survey and does not confirm current operating conditions.

**Applied to production 2026-10-29** with
[`tailwater-access-enrichment-2026-10-29.sql`](tailwater-access-enrichment-2026-10-29.sql)
(final statement `COMMIT` at apply; the file keeps `ROLLBACK`). One atomic
transaction, guarded on each row's id, name, river and approval, and on the
exact prior facilities text where it was replaced.

## Result

| Field | Before | After |
| --- | --- | --- |
| Description | 8 | 38 (the 8 reviewed on 2026-10-17 kept as they were) |
| Fee | 38 "no fee" by column default | 2 fee, 3 verified free, 33 unknown (NULL) |
| Parking info | 0 | 27 |
| Road access | 0 | 19 |
| Road surface | 0 | 5 |
| Amenities | 0 | 35 |
| Local tips (incl. posted hours) | 0 | 23 |

Fees: Dam-Quarry Boat Ramp (Corps day-use fee) and Dam-Quarry Campground
($24–$80 a night) charge. Cotter Access, Armstrong Hole and Roundhouse Shoals
(Cotter ordinance: city parks free unless reserved) are free; Calico Rock was
set free from a city statement and returned to unknown after review (below). No official source states that
AGFC or MDC accesses are free, so those stay unknown. The access page now
shows "No fee" only for an explicit `false` (see this PR's FacilitiesSection
change).

## Facilities text corrected

The research contradicted 13 stored facilities summaries, which the access page
shows as "Amenities". Corrected: Dry Run Creek (importer note removed),
Cooper Creek (one ADA dock, not two), both Norfork Access records (one ramp per
bank, not "two ramps"), Rivercliff (Bull Shoals town side, not below the
powerhouse), Ranchette (no "Jenkins Creek loop"), Cartney (walk-in is
downstream), Rim Shoals (restrooms are at the walk-in lot), Jim Griffin
(Powerhouse Road; restroom seasonal), Dam-Quarry Campground (no sourced dump
station), and the unsourced "~20/~40 rigs" counts on four Taneycomo ramps.

## Not filled, and why

- **Parking capacity:** no official source states a count; the column only
  accepts buckets.
- **Driving directions:** directions still go to each ramp pin. Official street
  addresses were found for some sites (evidence file) but are not used, since
  a geocoded address can land away from the ramp.
- **Managing agency:** the column has no Arkansas Game and Fish value, so AGFC
  ramps stay blank there; ownership already says AGFC.

## Decisions after review (2026-10-29, Evan)

- **Gaston's Access** is a private access: `is_public = false`, ownership
  `private`, managing agency `Private`. It stays an access point and a float
  endpoint, so White's `tailwaterPilot.floatEndpoints` is unchanged.
- **Empire Park** is public; who owns it does not matter for Eddy. Already
  `is_public = true`; no change.
- **Branson City Ramp** is public and anyone can launch, not only RV park
  guests. Description and tip now say so (the RV office hours tip is removed).
- **Calico Rock** is an AGFC access (ownership already `AGFC`). Its description
  now says so, and its fee returns to unknown, because the only "free" source
  was the city's statement about city parks.

## Open questions from the research

- The Corps' Little Rock District site and several AGFC pages returned 403 to
  the research, so the Dam-Quarry fee amount was not found.
