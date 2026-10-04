# Elk release review — 2026-10-04 UTC

**Decision: keep Elk inactive.** The listing and geography cleanup is prepared;
Noel calibration and verified launch-to-landing routes remain release blockers.
This review covers Elk only. It does not launch Big Sugar, Little Sugar or Indian
Creek. No production changes were made during this review.

## Researched release options — follow-up, 2026-10-04

The initial review treated three unresolved items as a single reason to hold the
whole river. They are separate decisions. We can limit the first planner release
to the established corridor above the dam, and can consider an explicitly
unrated release while recreational calibration is completed. These are proposed
product choices, not approval to bypass the existing activation gate.

### Gauge choices

| Option | What users receive | Work / limitation |
| --- | --- | --- |
| **Noel in feet, calibrated with local evidence** | Measured mainstem stage plus Eddy condition ratings | Obtain Noel-specific trip observations and operator limits, including craft and reach; match dated observations to USGS history. No discharge conversion is required. Best route to a fully rated launch |
| **Measured stage, unrated initially** | Live Noel hydrograph, readings/trend, access, camping, POIs and verified trips; no Too Low/Good/Optimal badge until calibrated | Build an explicit unrated mode across DB condition RPCs, web/iOS, planner estimates, recommendations and agent responses; make readiness permit that declared mode. Fastest independent release path, but not a fully rated launch |
| **Upstream discharge model** | An explicitly modeled flow estimate after validation | Big Sugar, Little Sugar and Indian Creek have continuous discharge histories overlapping both the historical Tiff period and Noel's period. Backtest a tributary model on withheld historical Tiff data, account for timing and ungauged inflow, then assess Noel's stage relationship. This is a research option, not a verified transfer or launch requirement |

Additional USGS checks went beyond the continuous-series catalogue:

- [Noel discharge field measurements](https://api.waterdata.usgs.gov/ogcapi/v0/collections/field-measurements/items?monitoring_location_id=USGS-07188925&parameter_code=00060&limit=100&f=json)
  returned **zero** features.
- [Noel field-measurement metadata](https://api.waterdata.usgs.gov/ogcapi/v0/collections/field-measurements-metadata/items?monitoring_location_id=USGS-07188925&limit=100&f=json)
  returned only reference gage height, dated June 2–August 24, 2026.
- [Noel expanded rating](https://waterdata.usgs.gov/nwisweb/get_ratings?site_no=07188925&file_type=exsa)
  returned **zero files**. This establishes no publicly retrievable rating in
  that endpoint, not that USGS could not have unpublished work.
- The legacy measurement URL redirects to the modern monitoring page; that
  redirect was not treated as proof of absent measurements.
- USGS metadata for **07188653 Big Sugar/Powell**, **07188838 Little Sugar/Pineville**
  and **07188885 Indian/Lanagan** all contains continuous `00060` series through
  October 3. Their drainage areas are 141, 195 and 239 square miles: **575 sq mi**
  combined versus Noel's **801**. A raw sum omits about **28%** of the Noel basin
  and is not measured Noel discharge. Do not publish the sum as a gauge reading.

Reproduce the tributary checks using the same USGS `monitoring-locations` and
`time-series-metadata` endpoints in the identifiers file, substituting the three
site IDs. This model route is possible to investigate despite the lack of direct
Noel–Tiff overlap; the earlier statement ruled out the direct overlap method,
not every possible hydrologic model.

Code review found a concrete unrated-mode requirement:
`shared/condition-ladder.ts::classifyReading` falls through to `too_low` when all
anchors are null. `src/lib/conditions.ts::computeConditionFromDbRow`, used by the
planner fallback, does not check `hasLadder`. Simply clearing thresholds would
therefore be incorrect. Fix the behavior and explicit readiness contract before
offering the unrated option; do not fill dummy thresholds to satisfy the gate.

For a fully rated release, the shortest external evidence request is to Elk
River Floats, **417-475-3230**: which gauge now governs operations, low/normal/
high/closed levels on **07188925**, and dated examples for the upper versus Noel
trips and different craft. For the provider question, the station's legacy page
routes to Oklahoma support; the [USGS Oklahoma–Texas center](https://www.usgs.gov/centers/oklahoma-texas-water-science-center/connect)
lists **otpublicinfo@usgs.gov**. Ask whether discharge is planned, whether a
rating/measurements are available, and whether Shadow Lake backwater affects
interpretation at this location. No messages have been sent.

### Access and route choices

| Initial planner scope | What is established | Remaining specific work |
| --- | --- | --- |
| **Public-access minimum: Pineville → Mount Shira** | Two agency-listed endpoints; approximately 7.5 Eddy miles, above the Noel dam | Final route/directions review; does not need private launch permission. Narrower than the desired full Noel launch |
| **Recommended core: Pineville through Noel, ending at Wayside** | Operator publishes Kozy → Trestle (seasonal 6 mi), Trestle → Wayside (6 mi), Kozy → Wayside (12 mi, canoe/kayak only); paid personal-boat access is published | Place/review Kozy, Trestle and Wayside bank pins and separate road entrances. Keep Cowskin and below-dam endpoints out of planner eligibility for this first scope |
| **Add lower Elk as a separate corridor** | The Spot advertises a paid boat launch and personal-boat shuttle; Cowskin is public | Confirm The Spot → Cowskin service and exact below-dam bank. Enforce corridor separation server-side before approving both upper and lower endpoints |

This removes a portage investigation from the core launch: **do not offer a
cross-dam trip**. Hiding Cowskin from one picker is insufficient; leave it
ineligible in the shared endpoint resolver's data until the separate corridor
rule exists. It can remain an access listing. Full lower-Elk coverage is a later
increment, not a prerequisite to the popular above-dam routes.

The private locations have better primary-source evidence than the first review
communicated:

- **Trestle:** the operator's [campground page](https://trestlepark.com/elk-river-campground)
  and [property map](https://img1.wsimg.com/isteam/ip/4c611e4a-7b28-4d91-afd7-9f1102df1c5e/A03155FD-7BDD-4057-AC0A-4D251F844CB9.jpeg)
  show the beach beside the Elk Springs Road low-water crossing, office and
  campground road. Use that beach/access area for bank-pin review, not the
  website's generic cabin/property coordinate.
- **Wayside:** the [campground page](https://waysidecamp.com/camping) and
  [property map](https://img1.wsimg.com/isteam/ip/d1802747-9892-43c9-a0c8-d379822f4274/WS%20Map.jpeg)
  identify the permitted swim/watercraft beach, office near the highway junction,
  and downstream no-watercraft boundary before the dam. The site map requires
  designated beach access; it does not permit launching from every campsite.
  Verify the landing at that beach, not the downstream tip of the peninsula.
- **Kozy:** [operator trip descriptions](https://trestlepark.com/float-trips)
  establish it as the upper put-in. Its exact launch bank is the least resolved
  of these three; the business address alone does not locate that bank.
- **Personal boats:** [Trestle's rates page](https://trestlepark.com/rates)
  publishes a **$20/person single-location drop pass** and **$30/person two-park
  put-in/take-out pass**, subject to its stated access hours/weekend limits.
  Permission is therefore not wholly unknown; confirm the selected locations
  and parking/shuttle arrangements. Prices are page-listed, checked on this
  review date, not guaranteed future charges.
- **Below the dam:** [The Spot](https://lowerelkriveradventures.com/) lists a
  **$10 launch** and **$35 personal-boat shuttle**, but does not name Cowskin as
  the other endpoint. That pair is a concrete candidate, not an established
  bookable route yet.

The operator maps were visually inspected. They resolve the intended bank areas
and trip relationships, but are schematic rather than georeferenced. No
survey-grade latitude/longitude was inferred from them or marked approved.

**Recommendation:** finish the three core private pins and release only the
above-dam corridor first. Pursue Noel-in-feet calibration for the complete rating
experience; offer an explicit unrated initial release if operator evidence is
not available promptly. Do not make a flow model or a dam portage prerequisites.

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
