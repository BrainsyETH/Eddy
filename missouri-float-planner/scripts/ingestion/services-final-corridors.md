# James, Bourbeuse, Kings River, Spring River (MO) — the last four corridors

Two additions, one correction, and two rivers deliberately left as they are.

| River | Was | Now | Why |
| --- | --- | --- | --- |
| `james` | 2 | **3** | Hootentown Canoe Rental added |
| `bourbeuse` | 0 | **1** | Devil's Back Floats added — the only float service on the river |
| `kings-river` | 4 | 4 | the four operators that exist are all already recorded |
| `spring-river-mo` | 0 | 0 | no commercial float service could be found |

## Hootentown Canoe Rental — a business Eddy was already pointing at

Eddy has held **Hooten Town Access** as an approved James River access point at
mile 66.7 the whole time, and the business that gave the crossing its name was
not in the directory. Hootentown has been running canoes, rafts, tubes and
kayaks with shuttle there since 1993, on routes of roughly 4 to 13 miles.

`hootentown.com` no longer resolves, so the claim rests on **Visit Missouri**,
the state tourism division, which lists the rentals and the shuttle. The Census
geocoder resolves 1254 Hooten Town Rd exactly, and lands 0.15 mi from Eddy's own
access point — two independent sources agreeing on the location.

The spelling is unsettled across sources: Visit Missouri writes "Hootontown",
MDC names the access "Hooten Town", Eddy's access point says "Hootentown", and
the road sign says "Hooten Town Rd". All three variants are in `alt_names`.

## Devil's Back Floats — the Bourbeuse's only outfitter

The Bourbeuse had 19 access points and no services at all. It has one now, and
one appears to be the complete answer: MCFA's own Bourbeuse page names no
businesses whatsoever, and no directory turned up a second float service on the
river.

Devil's Back has been family-run since 1980 at Noser Mill — canoe, kayak and jon
boat rentals, primitive riverside camping and a concrete ramp, an hour from St
Louis. As with Hootentown, Eddy already held **Devils Back Floats (Noser Mill)**
as a private access point at mile 58.7; the Census geocode of 5103 Noser Mill
Road lands 0.46 mi from it.

Its own site returned 503 on every attempt, so the row rests on Visit Missouri
and MCFA's business listing.

## Kings River — already complete

Four outfitters, all four already in Eddy with phone numbers, and three of them
sourced to `owner_provided+outfitter_site` rather than an import. Searching for a
2026 list of Kings River operators returns exactly the set Eddy holds: Riverside
Resort, Kings River Outfitters, Trigger Gap Outfitters and Float Eureka. Nothing
to add.

One thing to check some day: Kings River Outfitters' address is published two
ways — 190 County Rd 539, Eureka Springs on one listing, 8190 Arkansas 221,
Berryville on another. The row is not wrong, but the two are not the same place.

## Spring River (Missouri) — no commercial service found

Not to be confused with the Arkansas Spring River at Hardy, which Eddy holds
separately as `spring-river` with 13 services.

The Missouri Spring River rises near Verona on the Barry–Lawrence county line
and runs west-northwest through Jasper County into Kansas. Eddy has 15 access
points on it, nearly all public road crossings and MDC accesses rather than
outfitter landings.

No commercial outfitter, rental or shuttle could be found on it. MCFA's
directory, floatmissouri, Visit Missouri and MDC's own canoe-outfitter directory
all return operators on other rivers when searched for this one. The float
literature treats it as a Class I–II run accessed from public bridges, mostly by
people bringing their own boats.

**Zero is the answer here, not a gap.** That is the third such finding in this
branch, after the St. Francis whitewater reach and the lower Gasconade — and it
is worth recording, because a coverage table that shows `0` invites somebody to
spend a day proving it again.
