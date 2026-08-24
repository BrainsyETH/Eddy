# Gasconade River — services research

The Gasconade is the longest river lying wholly within Missouri, 25 access
points over 252 river miles, and its four directory rows had **no phone number
between them**. This pass makes all four callable and corrects what they say.

No rows were added. That is the finding.

## Every row described the wrong river

All four Gasconade rows carried a description naming the **Big Piney**:

> Froggy's River Resort — "River resort campground on the Big Piney River."
> Gasconade Hills Resort — "Full amenities for Big Piney River floaters."
> BSC Outdoors — "Full-service outfitter on the Big Piney River."
> Ruby's Landing — "Large campground on the Big Piney River."

Eddy's own access points said otherwise the whole time: `Gasconade Hills Resort`
is an access point at Gasconade mile 71.4, `Ruby's Landing` at mile 110.5, and
`Boiling Spring Campground (BSC Outdoors)` at mile 143.7, each within a few
hundred metres of the service row's stored coordinate.

The operators settle it. Gasconade Hills calls itself "a family-friendly resort
situated on the Gasconade River"; Froggy's is on the Gasconade at Richland;
Ruby's runs "5 mile floats down the beautiful Gasconade River"; BSC serves
**both** rivers, which is why its dual river link was already right. MCFA lists
all four under the Gasconade.

The cause is visible in the source document: `business_database_2026` has a
combined "Big Piney / Gasconade / Little Piney" corridor section, and the whole
section was written up as Big Piney.

## The corridor label leaked into the address fields too

All four rows carried **zip 65529** — Jerome — regardless of town. The real
towns are Richland (65556), Waynesville (65583) and Dixon (65459). Two rows
also had `city = Jerome` when the operator publishes Richland.

This is the same defect the `services-batch3.csv` diff exposed on the Caddo,
where one corridor label had been written into `city` for every row in the
section. It is worth stating as a pattern: **in that source document, town and
ZIP are corridor labels, not addresses.**

It is not confined to the Gasconade. Of the 24 rows still sourced to
`business_database_2026`:

- four Van Buren rows carry **65466**, which is the ZIP the Eminence rows carry;
- `rt66-canoe-rental` sits in Devils Elbow with Jerome's **65529**, while
  `devils-elbow-river-safari` — same town — correctly carries 65457;
- **18 of the 24 still have no phone number at all.**

## What each row now says

| Row | Phone | Corrected |
| --- | --- | --- |
| Gasconade Hills Resort | 573-765-3044 | city Jerome→Richland, zip, river, + float rentals and pool |
| Froggy's River Resort | 573-421-8714 | city Jerome→Richland, zip, river, + RV/showers/store/rentals; cabins 1→3 |
| Ruby's Landing | 573-855-9567 | zip, river, + rentals, shuttle, laundry, store, playground; RV 100→99, cabins 12→11 |
| BSC Outdoors | 573-759-7294 | zip, river (both), + tubes, jon boats, tent sites, store, Wi-Fi |

Ruby's site counts moved because the old ones were rounded: Visit Missouri and
the operator both give 99 RV sites and 11 cabins plus a tiny home, not 100 and 12.

## Held back

| Business | Why |
| --- | --- |
| **Lay Z Day Canoes and Camping** | Saint Robert, floats of 5, 7 and 11 miles. Every source is an aggregator, one of them lists it as **CLOSED** as of July 2026, and they disagree about whether it is a Gasconade or a Big Piney business. Adding a possibly-closed row is the class of error this branch exists to remove. |
| **Route 66 Canoe Rental** (Gasconade link) | Already in the directory against the Big Piney. Two float directories say it also serves the Little Piney and the Gasconade, but its own domain `rt66canoe.com` no longer resolves, so nothing operator-controlled supports adding a second river. Its stored row should be re-checked. |

## The commercial cluster is genuinely narrow

The Gasconade's outfitters sit between roughly river mile 65 and 145 — the
Richland, Dixon and Waynesville stretch. MCFA lists exactly three businesses for
the whole river, and floatmissouri.com states plainly that it has no recommended
outfitter for the Gasconade at all. The lower river below Vienna, some 100 miles
to the Missouri confluence, appears to have no commercial float service.

As with the St. Francis whitewater reach, a low count here is partly the river,
not only the research.
