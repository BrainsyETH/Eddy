# Elk release review — 2026-10-04 UTC

**Decision: keep Elk inactive.** The listing and geography cleanup is prepared;
Noel calibration and verified launch-to-landing routes remain release blockers.
This review covers Elk only. It does not launch Big Sugar, Little Sugar or Indian
Creek. No production changes were made during this review.

## Coverage and prepared changes

| Area | Production inspected | Prepared in this batch | Still needed |
| --- | --- | --- | --- |
| Gauge | Inactive Tiff City primary; Noel exists but is not linked | Correct dossier to the live Noel candidate; archive historical Tiff values without transferring them | Noel-specific recreational thresholds, owner signoff, primary link and curated polling |
| Access | Six records; five approved endpoints, including two unsupported bridge pins | Keep Pineville, Mount Shira and Cowskin; withdraw I-49 and MO-59 bridge endpoints; correct Lanagan to Indian Creek | Operator landing/launch pins, permissions, road entrances and parking |
| Camping / services | Seven linked businesses, no structured route facts | Update seven; add Trestle Park, Sycamore Landing and The Spot; source field changes and booking links | Check exact campsite/launch relationships and photographs; no campsite availability feed is connected |
| Trips | One section describes a continuous Pineville–Cowskin route | Correct section narrative; record 12 advertised route entries across five operators, including repeated branded trips | Validate actual endpoint pairs and prevent unverified dam-crossing itineraries |
| POIs | None | Two USGS-mapped confluences: Elk formation and Indian Creek | No additional mainstem attraction verified for insertion |
| Springs | None | Research recorded below; no invented spring stops | Add only when an identifiable mainstem location and any landing permission are established |
| Eddy / photos | No Elk knowledge section; some access images belong to other locations | Add Elk knowledge; remove borrowed bridge photos and Pineville's restricted-use MDC image | Review remaining/new imagery and river-page presentation before activation |

Prepared files: `services-elk-release-2026-10-04.csv`, its `.diff.txt` preview,
`service-river-facts-elk-2026-10-04.csv`, `access-points/elk.json`,
`dossiers/elk.json`, `dossiers/verified-identifiers-elk.md`, `EDDY_KNOWLEDGE.md`,
and migration `20261004013052_elk_release_data_cleanup.sql`.

## Gauge: the earlier cfs proposal is not supported

USGS Noel **07188925** publishes stage (`00065`) beginning **2026-06-02
19:15 UTC**, plus battery voltage. No discharge (`00060`) series was returned.
Eddy's latest-reference table held a fresh **2026-10-04 00:15 UTC** reading at
inspection, although its curated history was empty. Historical Tiff City
**07189000** continuous stage and discharge both end **2026-04-27 16:30 UTC**.
The records do not overlap, so an overlap-based discharge transfer cannot be
performed. The operator's level page still embeds Tiff City.

Next calibration work: ask a local operator for **Noel-specific** observed
levels, dates, craft and reach for low/normal/high/no-float conditions, then
compare those dates with USGS history. Elk River Floats lists **417-475-3230**.
No contact was made in this review. Do not substitute a fixed stage offset,
percentiles, or the instrument's suppression limits for recreational anchors.

The new dossier deliberately has no thresholds and is not signed off. Linking
and curating Noel should be a separate reviewed change once the gauge/reach
choice is settled; simply accumulating Eddy readings does not calibrate it.

Provider URLs, series IDs and dates are in
[verified-identifiers-elk.md](dossiers/verified-identifiers-elk.md).
Operator source: <https://www.elkriverfloats.com/river-levels/>.

## Access and routing

| Access | Eddy mile | Review |
| --- | ---: | --- |
| City of Pineville | 0.26 | Agency-listed city launch; MDC map shows boat ramp, parking and privy off Rhine Road |
| I-49 / US-71 crossing | 0.96 | Bridge coordinate; no verified public launch or parking. Withdraw approval |
| Lanagan | — | Agency identifies Indian Creek. Already unapproved; clear misleading Elk miles |
| Mount Shira | 7.78 | MDC gravel launch and parking; camping prohibited. Remove unsupported restroom/trail claims |
| Noel / MO-59 crossing | 11.31 | Bridge coordinate does not establish a public landing. Verify operator banks separately |
| Cowskin | 21.17 | MDC ramp and parking; camping prohibited. Lower-Elk endpoint, not evidence of a continuous upper-river trip |

Sources: MDC [Pineville](https://mdc.mo.gov/discover-nature/places/city-pineville-elk-river-access),
[Mount Shira](https://mdc.mo.gov/discover-nature/places/mount-shira-access),
[Cowskin](https://mdc.mo.gov/discover-nature/places/cowskin-access),
[Lanagan](https://mdc.mo.gov/discover-nature/places/lanagan-access).
The Pineville, Mount Shira and Cowskin area maps were also inspected.
MDC's [watershed report](https://mdc.mo.gov/media/107435) places historical Noel
City Park on Butler Creek; it does not verify the current MO-59 bridge pin.

Read-only `get_float_segment` checks returned valid lines for all ten pairs of
the five currently approved points. Pineville–Mount Shira measures **7.52 stored
miles / 7.30 geodesic miles**. Pineville–Cowskin measures **20.91 / 20.55** but
crosses Shadow Lake Dam. Geometry working does not validate landing rights or
that through-route. Stored river length is 34.8 miles; the actual line measures
33.92. The line is correctly oriented from Pineville to Grand Lake.

Keep Eddy miles, historical combined-creek guide miles and outfitter product
distances separate. The old dossier mixed these origins. New POI miles use the
same current line-fraction × stored-length calculation as the access records.

Verify private endpoints in this order:

1. **Kozy → Trestle → Wayside:** operator publishes seasonal six-mile upper,
   six-mile Noel and twelve-mile combined products. Obtain each actual bank pin,
   road entrance, parking and rental/personal-boat terms. Trestle publishes paid
   [access passes](https://trestlepark.com/rates).
2. **Pineville → Shady Beach / River Ranch / Sycamore:** confirm which landings
   each booked product uses. River Ranch's current five-mile copy differs from
   its older four-mile map. Do not calculate routing from that marketing length.
3. **Lower Elk / The Spot → Cowskin:** verify a below-dam put-in and operator
   agreement. Confirm the Trestle low-water crossing and the Noel dam boundary
   during route review. The existing Shadow Lake Dam row marks a required
   portage, but there is no verified land-access/portage route or enforced
   separation in the current planner. Resolve that before activation.

Business coordinates in the service CSV are **not approved float endpoints**.
Do not approve all access rows or ingest the held bridge placeholders. The
access importer does not revoke approval on existing rows; the migration does.

## Campgrounds and outfitters

| Listing | Change / verified offering | Operator source |
| --- | --- | --- |
| Elk River Floats / Wayside | Preserve existing slug; clarify campground identity, tent/RV camping, offsite cabins and booking | [Wayside](https://waysidecamp.com/) |
| Kozy Kamp | Refresh tent/RV/hut description and upper/combined trip facts | [Kozy Kamp](https://kozykamp.com/) |
| Eagles Nest | Add RV offering and current provenance | [Eagles Nest](https://eaglesnestcampcanoe.com/) |
| River Ranch | Refresh booking, tent/RV/cabin/glamping and five/eight-mile product facts | [River Ranch](https://riverranchresort.com/) |
| Shady Beach | Add RV and shuttle offerings; record summer float-booking requirement for camping | [Shady Beach](https://www.shadybeach.com/) |
| Big Elk | Refresh March–October camping; distinguish Elk and Big Sugar bookings | [Big Elk](https://bigelkfloatsandcamping.com/) |
| Two Sons | Add personal-boat shuttle; record May–September season and four/eight-mile products | [Two Sons](https://twosonsfloats.com/floating/) |
| Trestle Park | New tent/RV/cabin campground listing and private access-pass source | [Trestle Park](https://trestlepark.com/) |
| Sycamore Landing | New separate River Ranch campground, tent/RV area and showers | [Sycamore](https://riverranchresort.com/lodging/camping/sycamore-landing/) |
| The Spot | New lower-river tent/RV/cabin listing, rentals, personal-boat shuttles and paid launch | [The Spot](https://lowerelkriveradventures.com/) |

New operator pins are approximate business/campground coordinates. Trestle's
visible street address differs from its embedded schema address; retain the
visible contact address and review the entrance separately. Sycamore's pin is
from [Campendium](https://maps.campendium.com/us/noel-mo/camping-rv/river-ranch-resort-sycamore-landing-noel-mo--0),
corroborated against the operator's [campground map](https://riverranchresort.com/plan-your-trip/maps/sycamore-landing-map/).
Its street address is intentionally blank rather than using the main resort's
address. Wayside and The Spot coordinates come from their operators' website
location data. No campsite counts, availability, or access-point/service links
are fabricated. All ten records link to Elk; this is a researched release
inventory, not a claim to list every lodging business in the region.

## POIs, springs and nearby attractions

The migration adds the Elk's formation and Indian Creek confluence from shared
vertices of USGS NHD flowlines, both within one metre of the existing geometry.
The identifiers file provides coordinates and reproducible source queries.
They are on-water landmarks and grant no land access.

The [Missouri DNR basin report](https://dnr.mo.gov/sites/dnr/files/vfc/2020/06/main/2004-03-26-elk-river-3246-total-maximum-daily-load.pdf)
lists springs including Camp Beaver on Indian Creek, Whittaker on Big Sugar and
Deer Lick on Mill Creek. None was established as a publicly visitable **Elk
mainstem** float stop. An unnamed NHD spring in the search envelope is also not
enough evidence to create a named visitor destination. No springs are inserted;
this does not assert that the basin has none.

[Bluff Dwellers Cave](https://bluffdwellerscave.com/contact-us), 163 Cave Road,
Noel, is a drive-to attraction roughly 3 km from the mainstem. It is included in
Eddy's knowledge, not placed on the river. The current river POI endpoint filters
off-water attractions from the displayed set. Elk River Breaks Woodland is in
Big Sugar Creek State Park, not an Elk mainstem stop.

## Validation and deployment

The preview uses the existing importer's actual parsing, merge, collision,
quality and field-provenance functions against the read-only production service
inventory: **10 rows, 7 updates, 3 inserts, 95 field-source records, no new
quality findings**. Route parsing accepts five relationship rows and twelve
published route entries. Existing service slugs and river links are preserved.
The Elk knowledge section is recognized by the production parser. The held
dossier and unknown launch coordinates remain blocked.

Web validation passed on Node 20: both TypeScript configurations, ESLint (zero
errors; 14 existing warnings), design-token lint, recommendation tests and all
3,021 tests in the full suite. The dossier CLI dry run stopped with the expected
unsigned-dossier and uncalibrated-primary findings before opening a write path.

The migration has not been applied; runtime database validation remains part of
the approved deployment. No service-role credentials are present locally, so
the connected CLI write path was not exercised. Production preconditions and
POI coordinate calculations were checked with read-only SQL.

After approval, apply the migration to the expected project and record its
actual version in `supabase/production-migrations.txt`. Run the normal guarded
service imports in this order from `missouri-float-planner`:

```bash
export EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-elk-release-2026-10-04.csv --record-sources
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-elk-release-2026-10-04.csv --record-sources --import
npx tsx scripts/import-service-river-facts.ts scripts/ingestion/service-river-facts-elk-2026-10-04.csv
npx tsx scripts/import-service-river-facts.ts scripts/ingestion/service-river-facts-elk-2026-10-04.csv --import
```

Re-run service checks and Elk readiness after applying. Leave `rivers.active`
false. Once calibration and route work are complete, sign off the dossier,
preview the existing activation RPC, and check web/iOS access selection, float
distance/time, shuttle directions, camping cards, POI positions and Eddy's
answers against the approved routes before the final activation decision.
