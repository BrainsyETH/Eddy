# St. Francis River — services research

The St. Francis held one row — the Silver Mines campground corrected earlier in
this branch — against ten access points spanning 77 river miles, four different
land managers (MDC, USFS, Missouri State Parks, the Corps of Engineers), and
Missouri's only genuine whitewater.

Three rows land. The interesting result is what does **not** exist.

## There is no commercial whitewater outfitter, and that is the answer

The gap list flagged this river as the sharpest case: "zero outfitters on
Missouri's only whitewater river, which is also the one river where a floater
most needs an operator's read on conditions."

The premise turns out to be wrong in an instructive way. The whitewater reach —
Millstream Gardens (MDC, mile 20.2) to Silver Mines (USFS, mile 23.2), through
the Tiemann Shut-Ins — has **no commercial outfitter, rental or shuttle**.
Nothing was found on the MCFA directory, in Arkansas- or Missouri-tourism
listings, or in any search scoped to Fredericktown and the Shut-Ins. The reach
is Class II–III+, is neither spring- nor dam-fed, and only runs after heavy
rain. It is a private-boater run: the Missouri Whitewater Association treats it
as its home river and runs the Missouri Whitewater Championship there, but it is
a club, not a business, and does not belong in a directory of services.

So `st-francis` showing zero outfitters on its whitewater section is **accurate,
not a research gap**. What was missing is the float-trip half of the river,
downstream of Sam A. Baker, and that is what these three rows cover.

This is worth knowing before anyone treats the count as a to-do.

## The three rows

| Row | Type | Source |
| --- | --- | --- |
| Sam A. Baker State Park | campground | MO State Parks camping, lodging and floating pages |
| Otahki Lake KOA | outfitter | operator site + MCFA |
| Greenville Recreation Area | campground | recreation.gov |

**Sam A. Baker** is the substantial one: three camping areas including an
equestrian camp, 19 native stone and wood cabins, the Mudlick Mountain Grill and
Store, and a concessionaire that rents canoes, sit-on-top kayaks and six-person
rafts for floats of 4 to 18 miles, April through November. It is recorded as a
campground to match how the directory already models Bennett Spring, Washington
and St. Francois state parks, with the rentals in `services_offered`.

**Otahki Outfitters and Otahki Lake KOA are one property under two brands.**
Both publish 1224 Wayne 318, Patterson. The KOA side runs the campground, the
cabins and the St. Francis floats on 855-568-2454; the Outfitters side sells
guided deer, turkey and hog hunts on 314-306-3175 and mentions no river service
at all. MCFA lists the hunting name against the KOA website, which is how the
two get conflated. One row, under the name that actually runs the floats, with
the other in `alt_names`.

## Two geocoding traps, both caught

Neither of these coordinates comes from a geocoder, and both would have been
wrong if it had.

**Greenville Recreation Area.** Its recreation.gov address — 10992 Highway T,
Wappapello — geocodes cleanly, to a point **17 miles away**. That address is the
Corps' Wappapello Lake project office at the south end of the lake; the
campground is at the north end, a mile south of Greenville. The coordinate used
is Eddy's own approved access point of the same name, at river mile 76.8.

**Sam A. Baker State Park.** OpenStreetMap returns the park polygon's centroid,
which sits 1.6 miles north on Mudlick Mountain — correct for the park, useless
for the visitor. The coordinate used is Eddy's approved access point at the
Campground 1 boat launch, which is where the concession, cabins, store and grill
actually are.

**Otahki Lake KOA has no coordinate.** Neither Census nor OSM resolves
1224 Wayne 318. Under the severity split landed earlier today this is a warning
naming the slug rather than a blocked row, which is the intended behaviour: the
phone number works today, and the pin can follow.

## Not added

Millstream Gardens Conservation Area is day-use — the whitewater put-in, with no
camping. It is an access point, not a service, and adding it would repeat the
Dillard Mill mistake this branch has already cleaned up once.
