# Buffalo National River — services research

The Buffalo held three outfitters, all of them lower-river businesses in
Yellville, against 23 NPS access points spanning 131 river miles. The upper and
middle river — Ponca, Jasper, Gilbert, Silver Hill, the whole Boxley-to-Maumee
half of the park — had nothing.

Nine rows land: seven new, two corrections. Four are held back.

## The source that makes this corridor cheap

NPS publishes its authorized concessioners at
`nps.gov/buff/rentals-and-other-services.htm`, grouped by district, with a phone
number and a website for each. Twelve businesses are listed:

| District | Concessioners |
| --- | --- |
| Upper (Boxley–Carver) | Buffalo Outdoor Center, Buffalo Camping & Canoeing, Buffalo River Canoes, Lost Valley Canoe & Lodging, Riverview Motel |
| Middle (Carver–S. Maumee) | Buffalo River Outfitters, Dirst Canoe Rental, Crockett's Canoe Rental, Rio Buffalo Outfitter |
| Lower (N. Maumee–Buffalo City) | Buffalo River Float Service, Wild Bill's Outfitter, Silver Hill Float Service |

Every one was then checked against its own site. That second pass is what found
everything below — the NPS list is accurate about *who is authorized*, not about
what each business is doing this season.

`nps_authorized` is set true on all nine.

## What the operator sites changed

**Riverview Motel is not lodging any more.** NPS lists it under lodging; the
operator's own site says the motel is closed and only canoe and kayak
reservations are being taken. It is recorded as an outfitter, with the closure
in `seasonal_notes`. Had this pass trusted the agency list alone, Eddy would be
sending people to a shut motel.

**A wrong phone number was already in production.** `buffalo-river-float-service`
carried **870-449-6042**. Both NPS and the operator's own site say
**870-449-2042**. One transposed digit, and the only thing an outfitter row
really has to get right.

**Silver Hill Float Service publishes a different number than NPS does.** NPS
lists 870-439-2372; the operator's site lists 870-504-2038 and an
`info@silverhillcanoe.com` address on a different domain from the one NPS
links. The operator's own number is the one recorded, since a business is the
better authority on how to reach it, but the disagreement is worth knowing.

**Two toll-free numbers were masquerading as main numbers.** NPS lists
1-800-221-5514 for Buffalo Outdoor Center and 1-800-582-2244 for Buffalo River
Outfitters; both operators publish local numbers as well. Local goes in `phone`,
toll-free in `phone_toll_free`.

**`floatthebuffalo.com` now 301s to `buffalorivercanoes.com`** — noted for the
held row below.

## Coordinates

Every coordinate is confirmed twice, and the method validated itself on the way:
the US Census geocoder returned **exactly** the coordinate already stored for
Wild Bill's, which the database records as `operator_site+census`.

| Business | Sources | Apart |
| --- | --- | --- |
| Buffalo River Float Service | stored, OSM, Census | < 90 m across all three |
| Buffalo Camping & Canoeing | Census, OSM (Gilbert General Store) | 40 m |
| Buffalo Point Concession | Census, OSM (Concession Cabin Office) | 120 m |
| Buffalo Outdoor Center | OSM name+street, Eddy's Ponca access point | 0.47 mi |
| Buffalo River Outfitters, Silver Hill Float | OSM name+street, adjacent on US 65 | consistent |
| Dirst Canoe Rental | Census exact | street numbers on Hwy 268 E order correctly against Wild Bill's (23) and Buffalo Point (2261) |
| Riverview Motel & Canoe | Census exact | — |

## Held back — needs a human

| Business | Why |
| --- | --- |
| **Crockett's Canoe Rental** | Two geocoders disagree by **1.4 miles**. Census normalises the published "119 W Hwy 14" to "119 E HWY 14" and returns 36.0168, -92.5373; OSM returns 36.0326, -92.5504 for "119, State Highway 14". Everything else about this business is well sourced — Arkansas Tourism gives 870-448-3892 against NPS's 800-355-6111, and the offerings are clear. It is the pin that is unresolved. |
| **Lost Valley Canoe & Lodging** | The published address is "Hwy 43, Ste 10, Ponca" — a PO box suite, not a street number, so nothing geocodes. Ponca's town centroid is 0.13 mi from Buffalo Outdoor Center, so a centroid would place two different businesses on top of each other. Otherwise well documented: 8 lodging units named on the operator site, plus a historic general store. |
| **Buffalo River Canoes** | Address is an intersection — "the corner of Kyles Landing Rd. and Highway 74 West" — with no number. Offerings and phone are confirmed on the operator site. |
| **Rio Buffalo Outfitter** | The operator's site says it is **closed due to low water and reopens 1 March 2027**. Its coordinate also resolves only to a road centreline on AR-74, not a building. |

Three of these four are held **only** for want of a coordinate. They are
NPS-authorized businesses with confirmed phones, websites and offerings, and the
quality ratchet's `no_coordinates` rule is what keeps them out — a rule worth
revisiting, since a row you can call is useful even before it can be drawn.

## Also noticed

`crooked-creek-adventures` is linked to the Buffalo but does not appear on the
NPS authorized concessioner list. Crooked Creek is a Buffalo tributary, so a
business may legitimately serve both; the row is not wrong, but it is not
NPS-authorized for the Buffalo and should not be presented as though it were.

The 11 NPS campgrounds on the Buffalo — Steel Creek, Kyles Landing, Erbie,
Ozark, Carver, Woolum, Tyler Bend, South Maumee, Spring Creek, Buffalo Point,
Rush — already live in `nps_campgrounds`, synced by `park_code`, and are not
duplicated into `nearby_services`. The corridor's campground count reading zero
is correct as the directory models it.
