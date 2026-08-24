# Big Piney River — services research

Five rows, three of them uncallable and two carrying a corridor label instead of
an address. All three are fixed. **No businesses were added, because there are
none left to add.**

## The corridor is fully enumerated

Pulaski County's tourism office publishes an outfitters page listing seven
businesses on the Big Piney and Gasconade:

| Business | Phone | Already in Eddy |
| --- | --- | --- |
| BSC Outdoors | 573-759-7294 | yes |
| Devils Elbow River Safari | 573-855-4733 | yes |
| Froggy's River Resort | 573-421-8714 | yes (Gasconade) |
| Gasconade Hills Resort | 573-765-3044 | yes (Gasconade) |
| Peck's Last Resort | 573-435-6669 | yes |
| Ruby's Landing River Resort | 573-855-9567 | yes |
| Wilderness Ridge Resort | 573-435-6767 | yes |

Every one was already in the directory. MCFA lists only BSC for this river;
floatmissouri.com lists three. There is no upper-river cluster around Licking or
Houston that anyone publishes.

That page is also a **second independent confirmation of the Gasconade work
landed immediately before it** — every phone number and street address matches
what the operators' own sites gave, including the Richland addresses that
replaced the wrong Jerome ones.

## What was fixed

**Peck's Last Resort** carried `city = Jerome, zip = 65529` and no phone. It is
at 33401 Windsor Lane, **Duke, MO 65461** — next door to Wilderness Ridge at
33850 on the same lane, which had the right town all along. Same corridor-label
defect the Gasconade rows had. It now has its phone, website, address, and the
offerings its own site lists, plus a note that the mini cabin is out of service
after flood damage in November.

**Devil's Elbow River Safari** had no phone and no website. It now has
573-855-4733 and the boat rental and shuttle offerings the county lists it
under; it had been recorded as camping-only.

**Wilderness Ridge Resort** had **no coordinates at all**, despite Eddy holding
an approved access point named after it. Its street address geocodes exactly
through the Census geocoder, and that is what is now stored — 37.664284,
-92.050389.

A note on that coordinate: Eddy's access points place Wilderness Ridge (mile
75.2) and Peck's (mile 75.1) about 80 m apart, while the Census geocodes their
two street addresses about 900 m apart. Both businesses are on Windsor Lane and
both are real; the access points are river-mile snaps, which land on the water
rather than on the business. The street-address match is the better locator for
a directory pin, so Wilderness Ridge uses Census while Peck's keeps its existing
coordinate, which already agreed with its access point.

## Held back

**Route 66 Canoe Rental** should be re-checked before it is trusted:

- its domain `rt66canoe.com` no longer resolves;
- neither `20105 Trophy Ln` (stored, and Yelp) nor `21050 Trophy Lane`
  (Naturally Meramec) geocodes, and the two sources disagree about the number;
- it carries `zip = 65529` — Jerome's — while sitting in Devils Elbow, which is
  65457, as the neighbouring `devils-elbow-river-safari` row correctly records;
- and it is **absent from the Pulaski County outfitters page**, though it is a
  Pulaski County business, while all six of its neighbours are listed.

Any one of those is unremarkable. Together they suggest the business may have
stopped trading, and the honest move is to leave the row alone and say so rather
than freshen it with a phone number from a directory that may be as stale as the
website. Its stored email, `rt66canoe@socket.net`, does match what Naturally
Meramec lists, so the row is not fabricated — just unverified.

## Still open on this river

`rt66-canoe-rental` remains the only Big Piney row with no phone and a
`business_database_2026` source.
