# Niangua corridor — services research

The Niangua carries 34 access points, more than any river but the Current and
the Meramec, and had **zero** directory rows. Seven of those access points are
named after businesses Eddy did not otherwise know existed.

Eight rows are proposed in `services-niangua.csv`. Four are held back.

## Sources

Every row is confirmed by the operator's own site or by the managing agency.
Aggregators were used only to find candidates, never as the source of a fact.

| Business | Source | Notes |
| --- | --- | --- |
| Riverfront Campground & Canoe Rental | operator | phone, email, address, offerings all on the site |
| Hidden Valley Outfitters | operator | "over 100 full-hookup sites" is the only site count published in the corridor |
| Niangua River Oasis | operator | four routes, 4–14 miles; shuttles private boats |
| Sand Spring Resort | operator | lodging, RV hookups, Gravel Bar & Grill |
| Maggard Canoe & Corkery Campground | operator | states what it does *not* have — no dump station, sewer or cabins |
| Mountain Creek Family Resort | operator | 11.5-mile float from Bennett Spring back to the campground |
| Smokey Bottom Resort | Lebanon chamber | see the rename below |
| Bennett Spring State Park Campground | MO State Parks | five campgrounds; #1 reserves year-round, the rest Feb/Apr–Oct |

Shuttle is claimed only where the operator says so. Several of these certainly
run shuttles — it is the core of a float business — but four sites do not say
it, and this pass does not assume it.

## Ho-Humm is now Smokey Bottom Resort

The Lebanon chamber's listing for "Ho-Humm Canoe Rental & Campground" serves
Smokey Bottom Resort, at the same address and the same phone number
(30651 Marigold Drive; 417-588-1908). OpenStreetMap independently returns
"Smokey Bottom Resort" for that address. The old name is recorded in
`alt_names` so a search for it still resolves, and so the importer's
name-collision check can see the two are one business.

Eddy's own access point at river mile 38.2 is still called "Ho Humm private".
It is unapproved, and its coordinates are about 35 miles off — see below.

`smokeybottomresort.com` is left out of the row: it redirects in a loop, and a
link that cannot open is worse than no link. The phone number is good.

## Coordinates

Every coordinate is confirmed twice. OpenStreetMap resolved seven of the eight
by business name *and* street address, and where Eddy already holds an approved
access point named for the same business, the two agree:

| Business | OSM | Eddy access point | Apart |
| --- | --- | --- | --- |
| Maggard Canoe | 37.805724, -92.871108 | 37.806152, -92.871293 | 0.03 mi |
| Mountain Creek | 37.800653, -92.837347 | 37.800174, -92.840100 | 0.15 mi |
| Riverfront | 37.734963, -92.872521 | 37.731649, -92.873022 | 0.23 mi |
| Hidden Valley | 37.739368, -92.859160 | 37.745660, -92.858583 | 0.44 mi |

Niangua River Oasis is the exception: OSM has no record of it, so its
coordinate is Eddy's approved access point of the same name.

**A separate defect found on the way.** Four *unapproved* Niangua access points
carry coordinates roughly 35 miles southeast of the corridor — "Bennett Spring
Branch on right" (37.3709, -92.4107), "Fort Niangua private", "Ho Humm private"
and "Mountain Creek on right". Every approved point on the river sits near
37.7–37.9, -92.84–92.88. Nothing public renders them, but they should not be
approved as they stand.

## Held back — needs a human

| Business | Why |
| --- | --- |
| Big Bear River Resort | Identity and location are solid — OSM returns it at 372 County Road 64-152 and Eddy's approved access point agrees to within 0.15 mi. But `bigbearriverresort.com` renders empty on every path tried, so the offerings have no source that is not an aggregator. Typing it `campground` without a sourced camping offering would create exactly the defect this branch just cleared. |
| Fort Niangua River Resort | Under new ownership (Coastal Country Resorts LLC) after a rebuild that ran to May 2025, and Yelp now lists "Coastal Country" at the same address. Which name it trades under today is unresolved. |
| Majestic Views Floats | `majesticviewsfloats.com` returned 503 on every attempt. |
| Larry's Cedar Resort, Menagerie Campground, Fort Bennett Trading Post | Named in one aggregator round-up and nowhere else that could be reached. Not yet confirmed to be trading. |

## Also noticed

`steele-river-kayaks` is recorded as `permanently_closed` in Windyville — a
Niangua town — but is linked to the **Meramec**. MCFA lists it under the
Niangua. The row is closed so nothing renders, which is why it has gone
unnoticed; the link is still wrong.
