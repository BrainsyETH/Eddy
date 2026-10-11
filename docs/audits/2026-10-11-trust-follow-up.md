# Trust follow-up — 2026-10-11

Research covers the four unresolved data findings after PR #1479's first
review. Production: `ilefwfpvphadsbptiaur`. Sources checked on October 11;
publication dates vary. This is not confirmation of current water conditions.

## Applied and verified

Migration `20261011214010_verified_niangua_access_pin_and_mile.sql` corrects:

| Record | Before | After | Evidence |
| --- | --- | --- | --- |
| Bennett Spring Access | Pin -92.861007041, 37.733483969, above Hwy 64 | MDC concrete ramp -92.8603577757395, 37.74476977715927 | MDC boat-ramp GIS object 129, corroborated by area map |
| Lead Mine Access | Mile 53.9 | Mile 53.7 | MDC guide distinguishes Leadmine access 53.7 from Jakes Creek 53.9; existing pin is within 14 m of MDC ramp object 132 |

MDC's [Bennett map](https://mdc.mo.gov/sites/default/files/2024-05/6320map.pdf)
distinguishes a concrete ramp from two upstream canoe launches. The chosen
point represents the concrete ramp already described by Eddy. It moves the
pin 1,254 m, snaps within 58.75 m of the stored river line, and retains mile
30.2. The two alternative canoe launches are not new endpoints in this change.

[MDC GIS layer 17](https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17)
can reproduce these coordinates with `Area_ID IN (6320,8024)`, all fields, and
`outSR=4326`. Lead Mine object 132 is at -92.8976009620498, 37.86354397317311;
Herrick object 133 is at -92.91304891230736, 37.86138840866035. Those close
matches establish that Lead Mine and Herrick were not swapped. The
[current area map](https://mdc.mo.gov/sites/default/files/2024-09/8024map_0.pdf)
and [MDC guide pp. 40–41, hosted by moherp](https://rivers.moherp.org/maps/28.pdf)
corroborate the accesses. Existing Lead Mine/Herrick coordinates are preserved.

Rollback preview and committed readback both returned the intended two row
changes and three audit entries. Niangua's implausible-segment count fell from
three to one, without an off-channel or mileage-order finding. The aggregate
trust finding remains open and its detail was refreshed from the real SQL
validator. No completed check run was fabricated.

## What remains and what would settle it

| Finding | Confirmed | Missing evidence / next decision |
| --- | --- | --- |
| Niangua: Riverfront–Bennett | Riverfront publishes a boat ramp and launch area. Corrected Bennett pin makes the current stored 0.20-mile trip compare with 1.41 miles of river line. | Confirm Riverfront's operational launch coordinates and mile in the MDC editorial index. The property has a mile of frontage; a property address cannot settle the landing mile. |
| Meramec: Campbell–Riverview | Current pins span 0.53 line-miles but stored miles quote 0.20. Riverview's own site confirms floats end at its resort. MDC's guide lists Campbell at 73.7, whereas Eddy has 73.6. | Confirm Riverview's actual take-out and its mile from Campbell. Do not assign 74.2/74.3 from geometry alone or use the ranch's road address as a launch coordinate. Reconcile Campbell's 0.1-mile discrepancy as part of that source-based pair correction. |
| Mammoth Spring / Dam #1 | Official park brochure maps a pedal-boat dock on Spring Lake, above the dam. AGFC describes trout water below the dam. | Park staff must confirm whether the specific downstream pin supports public canoe/kayak launch or take-out, road/parking access, and any carry or access restrictions. General paddling listings and fishing access are insufficient. |
| Jacks Fork / Mountain View 07065200 | `level_low=100` and `level_optimal_min=100` eliminate Eddy's Good band. moherp's observed Good anchor is 100 cfs; 238 is explicitly estimated. | Decide whether to use a partial ladder with Good from 100 and no separate Flowing band, or obtain an observed/owner-backed Flowing floor greater than 100. No replacement threshold was applied. |

Private-launch sources:

- [Riverfront operator map](https://riverfrontcampcanoe.com/wp-content/uploads/2023/04/2023-Riverfront-Map.pdf): shows launch area and boat ramp, but no river-mile datum or coordinates.
- [Hidden Valley maps](https://www.hvoutfitters.com/overnight-rv-park): RV park ramp is upstream of Danceyard Creek; the campground has another ramp downstream of it. Its [float page](https://www.hvoutfitters.com/float-trips) confirms an 8.5-mile lower trip starting at the property. These establish launch facilities but do not supply a new precise river mile. Bennett–Hidden Valley no longer triggers after the verified Bennett correction; that alone does not certify all HVO coordinates.
- [Riverview operator](https://www.riverviewranch.org/canoes.php): describes five- and ten-mile trips ending at the ranch. [Directions](https://www.riverviewranch.org/drive-map.php) locate the property along Highway N near Campbell Bridge, not the landing. [MDC Meramec guide](https://rivers.moherp.org/maps/26.pdf) supplies Campbell's 73.7 anchor.

Mammoth Spring sources:

- [Official park page](https://www.arkansas.com/state-parks/explore/parks/mammoth-spring-state-park) and [official brochure map](https://www.arkansas.com/sites/default/files/2025-12/MammothSpring_2014_web.pdf).
- [State parks paddling list](https://www.arkansas.com/state-parks/explore/parks/kayaking-canoeing) includes Mammoth, but does not locate a downstream river launch.
- [AGFC Spring River](https://www.agfc.com/fishing/where-to-fish/trout-waters/spring-river/) describes the managed fishery beginning below Dam #1. Fishing-water designation does not establish vehicle-supported float access.
- Park office: **870-625-7364**. No contact was made. The existing endpoint and warning remain unchanged pending confirmation; lack of a ramp symbol is not proof that carrying a canoe is prohibited.

## Jacks Fork: a decision without an invented number

[moherp's gauge page](https://rivers.moherp.org/gauge/?gauge=07065200&hours=0)
separates observed Low 30 / Good 100 from estimated Good 238, High 490, and
Flood 1200. Individual trip reports vary by reach and date; they do not supply
a separate observed threshold matching Eddy's additional Flowing category.
Do not use seasonal percentiles to fill it: this upper reach is intermittent.

The shared classifier and SQL classifiers permit a partial ladder: clearing
`level_optimal_min` while retaining `level_low=100` and the existing upper
boundary would make 100–490 read Good instead of Flowing. The corresponding
alternate-unit Flowing floor would also need review. This is a proposed
classification change, not a researched new hydrologic threshold. It is not
applied here. It also does not validate the inherited estimator-based 490/1200
anchors, which should have their own observed/owner provenance reviewed.

[NPS water levels](https://www.nps.gov/ozar/planyourvisit/levels.htm) publishes a
4-foot closure level for Hwy 17/Buck Hollow in its downloadable table. That
provides separate closure guidance, not a CFS Good/Flowing split. A closure
stage must not be substituted into a CFS column; the corresponding hazard
handling should be checked against the current gauge/rating curve before any
additional threshold change.

## Verification and release state

The migration's guards pin the original names, roles, approval, endpoint
status, coordinates, and miles. Production readback confirms Bennett 30.2 and
Lead Mine 53.7. The remaining validator results are Jacks Fork threshold order,
Meramec mileage, and the single Niangua segment. Mammoth is a separate endpoint
eligibility check.

There are still nine open trust records: four unresolved data findings plus
five addressed by the code in PR #1479, which has not been deployed. Resolving
two pairs within Niangua does not close its one aggregated finding. After
deployment and a successful complete check run, the expected baseline is four
open findings, not zero.

Migration ledger/drift tests: 14 passed. All 137 post-baseline migration
versions match production and the local ledger. `make check-db` was attempted
but its tsx CLI cannot create an IPC socket in this environment; the same
repository comparison functions were run via Node 20 `node --import tsx`
against versions retrieved through the Supabase connector. `git diff --check`
passed. No runtime application code changed in this follow-up.
