# River readiness review — 2026-10-03

Scope: read-only production inspection plus repository and primary-source review.
Demand ranking, stars, page-view counters and analytics work are removed from this
workstream. Nothing in this review approves a new river or a threshold transfer.

## Results and delivery

- Production has **24 active rivers and four inactive**: Elk, White, Norfork
  Tailwater and Taneycomo. Twelve active rivers have no active `river_hazards` rows.
- **18 river/gauge links** with recreational thresholds lack a source category or
  source URL. This is a provenance backlog, not proof that all 18 ladders are wrong.
  Kings/Berryville and Big River/Richwoods are the missing-source primary gauges.
- Two matching full ladders in the initial live-only audit needed investigation:
  **Mulberry / Current above Powder Mill** and **Big Piney near Houston / Niangua
  at Tunnel Dam** (the latter includes an alternate-unit ladder). Shared gauges,
  different units and entirely empty ladders do not count as duplicates.
- Structured hazards feed the route planner, MCP hazard/plan tools and Eddy chat
  hazard/plan tools. General `river_characteristics`, access notes and knowledge
  prose do not automatically create route-specific hazard records.
- Those five reads previously discarded database errors. Agent tools now return
  an unavailable error. The planner keeps the plan usable with an internal
  `hazardsUnavailable` flag and excludes partial results from its saved-plan cache.
  Web and iOS show a short lookup-failed line in the hazards section only when
  unavailable, outside `warnings`; successful empty results add no note. iOS
  retains previously saved hazards and their recorded date during failed refreshes.
- Buffalo is included in the homepage guide band. A missing guide links to the
  river report instead of the generic blog index.
- Every existing JSON dossier has an explicit retrospective readiness checklist.
  New Big Sugar and Norfork worksheets remain unsigned. Historical sign-off is not
  silently promoted to a completed review.

Snapshots: `river-readiness-audit-2026-10-03.json` holds the inspected catalog,
main ladders, characteristics, mapped hazards and selected access rows;
`river-readiness-findings-2026-10-03.json` holds the executable audit output,
including alternate ladders. The revised comparison side includes inactive rivers.
Matching optimal bands with differing anchors are reported separately from matching
full ladders. Counts are time-stamped observations, not constants.

## Safety work first

The twelve empty inventories are: **Buffalo, Caddo, Courtois, Crooked Creek,
Current, Eleven Point, Huzzah, Jacks Fork, James, Spring River AR, Spring River MO,
and War Eagle Creek**. Review all twelve, starting with the busy Current / Eleven
Point / Jacks Fork / Huzzah corridors and known permanent-hazard prose on James
and Spring River AR. Spring AR prose names Saddler Falls and High Falls; James
prose identifies low-water dams. Those are research leads, not approved pins.

For each corridor, compare structured rows, characteristics, access notes and
`EDDY_KNOWLEDGE.md`. Record the primary source, review date, exact reach and known
fixed hazards. Confirm coordinates and route mile before adding a pin. If no fixed
hazard is found, record that review explicitly. Do not create a dummy hazard to
satisfy a row count. Temporary strainers and changing conditions cannot be treated
as a complete inventory.

Existing rows need review too. Big River's Morse Mill description includes advice
about sliding a canoe at the dam; Clearwater's description implies a portage
without establishing a legal, usable route. Treat these as urgent editorial and
route reviews. A hazard marker or `portage_required` flag does not by itself prove
that a through-trip is viable.

### Kings and threshold provenance

The July 13 Kings JSON was stale. `dossiers/verified-identifiers-kings-river.md`
records July 14 activation and owner sign-off, attributing minimum/optimal/danger
anchors to Kings Crossing RV Park & Campground. Production matches that recorded
ladder: **3.0 / 3.2 / 3.5 / 5.0 / 5.1 / 6.0 ft at 07050500**. The 5.1 high anchor
was owner-set. This is evidence of a recorded calibration decision, not proof of
copying from Elk. It also is not a substitute for recovering the operator's exact
source and gauge reference. The database source/URL remains missing, and this
review did not independently recover that operator key. The JSON now warns
against re-ingesting its obsolete anchors; no live thresholds were changed.

Recover the Kings evidence and Big River/Richwoods provenance before making
numeric changes. Audit secondary and alternate-unit ladders as well as primaries.
James/Boaz's incomplete **cfs** ladder is a separate issue from Kings' **feet** key.

`threshold_source` has also been populated by flood-stage sync scripts. An
`nws_ahps` category cannot establish recreational floatability. Preserve the
separation between flood/action stages, cited recreational anchors and editorial
choices. The new audit flags that ambiguity; it does not approve a ladder merely
because a URL is present.

## Coverage: repair offered trips before counting more river miles

These differences use stored endpoint miles and are **diagnostic**, not newly
validated trip distances. Legal access, geometry, dam crossings and current
restrictions still control whether a pair can be offered.

| River | What is already represented | Concrete next work |
| --- | --- | --- |
| James | Five approved endpoints; Delaware Town → Shelvin Rock is 5.70 mi, Shelvin Rock → Hootentown 6.02 mi, H.L. Kerr → Ralph Cox 4.85 mi. Hootentown → H.L. Kerr is 16.62 mi. | Validate and present existing short trips; investigate the long middle gap. Reconcile Hootentown's note calling Galena a roughly 9-mile trip with stored Hootentown → Ralph Cox miles of 21.47. Do not copy that note into a trip card. |
| Caddo | Four approved endpoints: Norman 11.68, Swinging Bridge 17.77, Glenwood 27.68, Hwy 182 Amity 35.81. Adjacent differences are 6.09, 9.91 and 8.13 mi. All four inspected official-site URL and description fields are empty. | Restore primary access provenance and useful launch descriptions, then validate those three pairs. The raw 4-access/75-mile ratio does not establish that these float corridors lack a day trip. |
| Black | Ten approved endpoints, plus unapproved Parks Bluff. Upper Lesterville/Highway K and lower River Road/Markham Springs/Hammer corridors are separated by Clearwater Lake and Dam. | Review Lesterville carry access, Mill Creek's access evidence, Parks Bluff permission and photos. Validate upper/lower trips separately; never fill the lake/dam gap with an ordinary continuous float. Markham Springs → Hammer is a stored 2.70-mile candidate. |
| Big River | Nine approved endpoints. Leadwood → Washington State Park is a 43.90-mile stored gap; Bootleg → Leadwood 19.91; Brown's Ford → Morse Mill 18.89. | Research intermediate legal endpoints in those specific gaps. Check dam approach and portage issues before suggesting lower-river pairs. Existing short pairs near Washington/Mammoth/Merrill Horse deserve route verification first. |

Use the official agency/operator links already in the snapshot as leads. Placement
and approval remain the documented manual access-point step; no new coordinates,
access permissions, or route distances are asserted by this review.

## Elk through Noel; Big Sugar separately

The July 27 cutoff was intentional. Commit
`7ecc90cb37ab54b8b86dcf6f714ac6a5b10168c1` introduced the national reference tier:
`gauge_latest` carries current reference readings; curated or starred gauges
receive `gauge_readings` history. Powell, Little Sugar and Indian Creek remained
fresh in `gauge_latest` on October 3. Noel also had a fresh stage reading despite
zero historical rows. This does **not** support a stars-removal incident or a dead
upstream station. Do not manufacture a favorite or promote an unreviewed gauge to
curated merely to collect research history.

Primary sources inspected October 3:

- [Noel 07188925](https://waterdata.usgs.gov/monitoring-location/USGS-07188925/):
  continuous record begins **June 2, 2026**; published datum is 796.22 ft NAVD88.
- [Tiff City 07189000](https://waterdata.usgs.gov/monitoring-location/USGS-07189000/):
  continuous record ends **April 27, 2026**; datum is 750.89 ft NAVD88.

The inspected records do not overlap. Noel currently has stage but no discharge
in Eddy's reference reading. Consequently the proposed overlap-based cfs transfer
cannot be carried out from this evidence. Verify USGS time-series/parameter
metadata and any rating information before assuming a discharge history exists.
A USGS hydrograph describes water, not the limits of a particular float corridor.
The next calibration needs **Noel-specific, reach-specific observed/operator
anchors**, or a separately justified hydrologic method reviewed on its merits.
Do not transfer Tiff City stage thresholds, subtract datums, or invent a cfs key.

The stored Noel/Shadow Lake access also admits unresolved ramp geocoding, and the
US-71/I-49 access lacks an official source URL. Five approved endpoints and photos
do not close the legal-access/routing checklist. Review those and the Shadow Lake
dam before publication.

`dossiers/big-sugar-creek.json` starts an independent worksheet around candidate
07188653 near Powell. It needs its own corridor, legal access pair, representative
gauge and calibration. A combined Big Sugar/Elk itinerary additionally needs
connected routing across the confluence; activating either river does not prove it.

## One tailwater pilot: Norfork

`docs/TAILWATER_PLAN.md` already exists and parts of the release presentation have
shipped. The remaining decision is acceptance of a specific supported corridor,
not waiting for a missing document. Norfork is the first pilot because its stored
reach is compact (4.87 mi), not because a small river makes release hazards small.

Start with Dam-Quarry Boat Ramp → Norfork Access, reviewing Bill Ackerman River
Ridge as an intermediate endpoint. There are five approved access rows but **only
three boat endpoints**; Dry Run Creek and Dam-Quarry Campground are not launches.
All five lack photos. White has 24 approved access rows and Taneycomo seven; all
36 tailwater access rows lack photos. All three also lack structured hazard rows
and `river_characteristics` in the inspected catalog.

Pilot acceptance must establish:

1. Exact launch/landing and confluence geometry, legal access and current posted
   restrictions; photos that help a visitor identify each pilot endpoint.
2. Reviewed hazard and river-characteristics content, including rapid release
   changes, cold water and dam approach limits, with sources and dates.
3. **Observed** release/stage, provider timestamps and staleness distinct from
   **scheduled** generation. A schedule is not an observation or a safe window.
4. Web, iOS and MCP presentation with absent/stale measurements, a schedule
   disagreement and an unexpected release. Existing regulated-water float-time
   withholding must remain intact. No inferred wading or safe departure window.
5. A specific pilot activation review. The generic activation RPC deliberately
   refuses `dam_tailwater`; replace that hold only after the separate acceptance
   work, without fabricating ordinary recreational gauge thresholds.

The existing [USACE Norfork recreation page](https://www.swl.usace.army.mil/Missions/Recreation/Lakes/Norfork-Lake/Recreation-Activities/)
and agency links in the access snapshot are research leads. This review does not
claim a current regulations check or completed on-device pilot acceptance.

Then review White, followed by Taneycomo. Little Red stays on this track. Little
Missouri needs a reach-specific dossier distinguishing upper whitewater from the
Narrows tailwater; proximity to Caddo is not a shared hydrology model.

## Remaining expansion sequence

After safety and coverage work: Elk, independent Big Sugar decision, the Norfork
pilot, then Illinois River at Tahlequah. Barren Fork is separate and requires its
own Oklahoma access/rules review. Arkansas candidates remain Eleven Point's
Arkansas reach, Strawberry, upper Ouachita and Illinois Bayou, with Little Missouri
and Little Red handled by their reach types. Preserve the existing Eleven Point
ID/slug if extending it, but first define state, geometry, access and gauge reach
boundaries. Do not create a duplicate river just to represent a state line.

Missouri candidates remain Beaver Creek, Finley, Osage Fork, Little Piney, Indian
Creek and Shoal Creek. Texas, Upper Midwest and Tennessee remain later expansion;
evaluate hydrology per corridor instead of assuming every river in a state needs
release modeling. Every candidate uses the same evidence gate.

## Rollout and validation

The migration is additive and **applied** as `20261004002112` in
`production-migrations.txt`. Follow-up `20261004002532` adds the PostGIS
`extensions` schema to the activation function's fixed search path so the existing
validator resolves its geography types and spatial functions. Both were applied
with user approval on October 3, 2026 (October 4 UTC). Installation changed no river
visibility or numerical thresholds. They add a service-role-only
readiness audit and transactional activation RPC. Database errors, failed checks and
previews cannot leave a newly activated row behind. Existing live rows are not
retroactively deactivated. Direct administrator SQL can still bypass this operator
workflow; this is not a trigger that restricts every possible database writer.

PGlite tests exercise preview rollback, inactive-candidate validation, batch
rollback, thrown validator errors, missing evidence, unknown slugs, missing
measurement units, provenance, source-specific reading stores, duplicate ladders,
and anonymous-role denial. Freshness uses a fixed two-hour limit for all providers,
checking both latest and historical reading stores; it does not model provider-specific
reporting intervals. The full test run passed 3,024 tests under Node 20, including
iOS hazard retention, first-save, recovery and route-isolation regression tests.
`make check-web` passed TypeScript and ESLint but hit this environment's Unix-socket
restriction in the `tsx` CLI; the token lint, pretest and full tests passed using
Node's `--import tsx` entry point. `make check-mobile` passed typechecking and lint;
`make bundle-mobile` passed the production iOS
export and EAS archive allowlist check.

Production verification: the installed audit returns the existing data backlog;
an Elk activation preview returns findings and leaves Elk inactive. Hashes of
all river and river-gauge rows match before installation and after the preview.
Anonymous/authenticated execution is denied and service-role execution is allowed.
Database types were regenerated from production, including schema additions that
predated this PR. The search-path regression is covered by the PGlite test.

`make check-db` cannot start the `tsx` IPC socket in this environment, and the
readiness CLI has no local service-role credentials. The installed audit was run
through the authenticated Supabase connector; the repository's ledger and access
slug comparison helpers passed against a production snapshot. The only unmatched
migration was the then-pending `20260914205500` (applied 2026-10-10 as `20261010231359`), unrelated to this PR.
All 19 dossier readiness reviews remain outstanding; this installation activates
no rivers and clears none of that evidence backlog.
