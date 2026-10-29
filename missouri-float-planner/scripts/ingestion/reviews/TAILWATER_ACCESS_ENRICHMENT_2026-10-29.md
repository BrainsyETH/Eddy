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
| Fee | 38 "no fee" by column default | 2 fee, 4 verified free, 32 unknown (NULL) |
| Parking info | 0 | 27 |
| Road access | 0 | 19 |
| Road surface | 0 | 5 |
| Amenities | 0 | 35 |
| Local tips (incl. posted hours) | 0 | 23 |

Fees: Dam-Quarry Boat Ramp (Corps day-use fee) and Dam-Quarry Campground
($24–$80 a night) charge. Cotter Access, Armstrong Hole and Roundhouse Shoals
(Cotter ordinance: city parks free unless reserved) and Calico Rock (city
parks "free and open to the public") are free. No official source states that
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

## Open questions from the research

- **Gaston's Access:** only AGFC's GIS lists the ramp as AGFC-owned; AGFC's
  tailwater map and its 2018 list of public accesses omit it. It is a published
  float endpoint. Confirm it is public before relying on it.
- **Empire Park:** MDC calls it "Empire Electric Park" and an MDC map shows an
  Empire District Electric recreation area nearby, so stored "City" ownership
  may be wrong.
- **Branson City Ramp:** the city does not say whether non-guests of the RV
  park may launch there.
- **Calico Rock:** AGFC lists the ramp as AGFC-owned while the city lists a
  boat ramp among its parks; ownership unresolved.
- The Corps' Little Rock District site and several AGFC pages returned 403 to
  the research, so the Dam-Quarry fee amount was not found.
