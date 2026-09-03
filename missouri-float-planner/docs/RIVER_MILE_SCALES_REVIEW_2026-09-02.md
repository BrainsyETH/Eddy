# River mile scales review — 2026-09-02

**Status: measurements + a consumer census, no decision.** The offsets below
were read against production (`ilefwfpvphadsbptiaur`) on 2026-09-02, read-only;
the consumer census is from the code at `826fa471`. Companions:
`RECENT_BRANCHES_FIX_PLAN_2026-09-01.md` §6.1–6.2 (where the finding surfaced),
`supabase/migrations/20260902132921_the_current_measures_itself_from_montauk.sql`
(the one river already moved), `RIVERS_AND_DAMS_REVIEW_2026-08-24.md` §3 P4.

**Verdict in one line:** nine rivers store access-point miles on a published
guide's ruler while the geometry measures from the NHD headwaters; everything
that *subtracts* two stored miles is fine, four code paths that *mix* a
geometry mile with a stored one are wrong by the river's offset today, and one
of them is the dam-reach selector on the Black.

---

## 1. What was measured

For approved access points within 500 m of their river's line,
`length_miles × ST_LineLocatePoint` minus the stored `river_mile_downstream`:

| River | Points | Median offset | Range |
|---|---|---|---|
| Bourbeuse | 18 | +29.5 mi | +26.0 to +34.2 |
| Niangua | 18 | +25.2 mi | +23.6 to +33.4 |
| St. Francis | 9 | +23.5 mi | +22.4 to +23.8 |
| Meramec | 29 | +22.8 mi | +21.8 to +26.6 |
| Buffalo | 21 | +15.7 mi | +15.0 to +17.3 |
| Black | 8 | −7.8 mi | −10.6 to −5.8 |
| Courtois | 6 | +7.0 mi | +6.4 to +7.2 |
| Eleven Point | 17 | +4.7 mi | +3.0 to +6.4 |
| Gasconade | 19 | +3.9 mi | −0.3 to +8.2 |
| Current | 33 | +0.6 mi before 2026-09-02; recomputed from geometry by `20260902132921` | |

A uniform per-river offset is two rulers, not a defect per point: the stored
miles are a guide's (mile 0 at a conventional put-in or county line — the
Buffalo's are the NPS float matrix by design,
`scripts/data/finalize-buffalo-access-points.ts:14-19`), and the geometry's
ruler starts wherever the NHD line starts. Differences between two points on
one river agree to within about a mile, so any consumer that subtracts two
stored miles is unaffected. Any consumer that derives a mile from geometry —
`snap_to_river` is `fraction × length_miles` with mile 0 at the line's start,
`supabase/migrations/00010_update_mile_calculations.sql:31-43` — and compares
it with a stored mile is off by the offset.

The repository already knew this in one place. `00204_river_section_reaches.sql:28-35`
says the Black's access frame, geometry frame and gauge frame are three
different rulers ("Poplar Bluff is recorded at mile 55 but sits ~86 miles down
the access frame") and warns that mixing them "is how a put-in below a dam ends
up reading a gauge above it". `shared/reach-types.ts:52-55` repeats it. What
was not known is that the same split exists on eight other rivers.

Which rivers are on the geometry ruler, and how they got there: the Current
(`20260902132921:75-85`), War Eagle Creek (`20260825224732:75-83`), Big Piney
(`00160_big_piney_access_point_rebuild.sql:921-930`, which calls the others
"chart-datum rivers"), and every river imported through the dossier pipeline,
because `scripts/ingestion/import-dossier-access-points.ts:131-138` fills miles
with `set_access_point_miles_from_geometry`
(`00165_access_point_miles_from_geometry.sql:21-49`). The snap trigger
deliberately never touches a mile (`00121_resnap_access_points.sql:28-31`,
`00016_verify_mile_trigger.sql:30-32`), so a guide ruler, once typed, stays.

---

## 2. Consumers, one line each

Classes: **subtracts** two stored miles (safe); **mixes** a geometry-derived
mile with a stored one (wrong by the offset); **cross-table** compares stored
miles from two tables that were typed separately (safe only if both editors
used the same ruler — unverified per river); **displays** a stored mile as an
absolute number (the ruler shows, unlabelled); **orders** by stored mile (safe
under a uniform offset).

### Geometry-derived producers

| Where | What it does | Class |
|---|---|---|
| `supabase/migrations/00010_update_mile_calculations.sql:9-49` | `snap_to_river`: mile = `ST_LineLocatePoint × length_miles`, mile 0 = line start | source of every geometry mile |
| `00040_assign_rivers_to_pois.sql:5-32` | `compute_poi_river_mile`, same expression; writes `points_of_interest.river_mile` via `src/lib/nps/sync.ts:394-404` and `src/app/api/admin/pois/[id]/compute-mile/route.ts:33-52` | POI miles are geometry-ruler on every river |
| `00165_access_point_miles_from_geometry.sql:29-44` | fills NULL access-point miles from `snap_to_river`; called by `import-dossier-access-points.ts:133-136` | new rivers land on the geometry ruler |
| `00142_get_float_segment_snap_fractions.sql:70-98` | `get_float_segment`: polyline sliced by `ST_LineLocatePoint` (72, 80); distance is `ABS(end − start)` of stored miles (92, 97) | polyline geometry-only, distance **subtracts** — safe, by design (header 1-16) |
| `packages/eddy-geo/index.ts:79-117` | `milePosts`: labels posts `fraction × lengthMiles` along the line; header 60-66 claims "a post labelled 12 lands where a put-in at riverMile 12.0 sits" | true only on geometry-ruler rivers; **mixes** on the nine |
| `eddy-ios/app/(tabs)/index.tsx:1054-1059`, `eddy-ios/src/map/RiverMap.tsx:1491-1502`, `2558-2588` | draws those posts on the iOS map, next to pins subtitled with the stored mile (`RiverMap.tsx:538`, `1076`) | **mixes**, on screen |
| `src/lib/geo-mile-posts.test.ts:5-7` | tests the arithmetic; encodes the same assumption, never a stored mile | no coverage of the offset |
| `20260826162627_an_unrated_gauge_reads_unknown_not_too_low.sql:209-231` | `get_river_condition_segment`: when only `p_put_in_point` is given, `snap_to_river`'s mile (216) is compared to `river_sections.river_mile_start/end` (227-228), which are in the access frame (`00204:67-70`) | **mixes** — the Black's dam case |
| same function, `240-249` | `p_put_in_mile` vs `river_gauges.river_mile` (`<=`) | **cross-table** |
| `src/lib/reports/gauge-derivation.ts:193-211`, `329` | photo mile from `snap_to_river`, gauge mile from `river_gauges.river_mile` (300, 312-319); difference stored as `community_reports.gauge_relation`/`gauge_offset_miles` (column comment `20260817210000:73-74`) | **mixes** |
| `20260825224732:136-144`, `20260902132921:133-141` | assert `down + up = length_miles` after recompute | per-river migration invariant only; no trust check asserts it, and nothing in `src/` reads `river_mile_upstream` |
| `00164_harden_river_validation.sql:209-226` | `mileage_order_mismatch`: stored order vs `ST_LineLocatePoint` order | **orders** — safe |
| `00164_harden_river_validation.sql:229-236` | `mileage_equals_length`: stored mile == `length_miles` | placeholder heuristic; ruler-blind |
| `src/lib/trust/checks/river-geometry.ts:189-211` | `length_miles` vs measured line length | about the column, not the points; 143-156 already accepts "guide miles and a traced line" differing |
| `src/lib/trust/remediation.ts:312-318` | tells `mileage_order_mismatch` to run `db:correct-miles`, which is `correct_all_access_point_miles` (`00010_update_mile_calculations.sql:177-230`) against `river_mile_markers` | that table has 0 rows (`RIVERS_AND_DAMS_REVIEW_2026-08-24.md:29`); the remediation is a no-op |

### Stored-mile consumers

| Where | What it does | Class |
|---|---|---|
| `src/app/api/plan/route.ts:168` → `src/lib/calculations/floatTime.ts:188`, `244` | float time from `get_float_segment.distance_miles` | **subtracts** — safe |
| `src/app/api/plan/route.ts:186-189` | passes stored `start_river_mile` as `p_put_in_mile` (and the point) | gauge chosen on the stored ruler; section lookup stays in-frame — safe |
| `src/app/api/plan/route.ts:332-355`, warning text `394`, `398` | in-span gauges: stored endpoints vs `river_gauges.river_mile`; prints the gauge's mile | **cross-table**; on the Black the gauge frame is a third ruler (`00204:31-35`; Annapolis 25 / Poplar Bluff 55, `scripts/ingestion/DEPLOYMENT-STATUS.md:156`) |
| `src/app/api/plan/route.ts:641-653`, `src/lib/chat/tool-handlers.ts:330-342` | hazards with `river_mile_downstream` inside the stored span | **cross-table** (hazard miles hand-typed, `src/app/api/admin/hazards/route.ts:176`) |
| `src/app/api/plan/route.ts:670`, `src/app/api/shuttle/route.ts:100-105`, `117`, `170` → `src/lib/shuttle-plausibility.ts:18-19` | road miles vs `|takeOut − putIn|` | **subtracts** — safe |
| `src/app/api/plan/campgrounds/route.ts:69-71` → `00007_segment_aware_functions.sql:297-306` | campgrounds between stored endpoints, same table | **subtracts** — safe |
| `src/lib/access-points/detail.ts:113`, `362-401` | `getGaugeStatus`: gauge with largest `river_mile <= ` the access point's stored mile | **cross-table**; the Current's gauge miles were tuned to its access ruler (`00034_fix_akers_gauge_river_mile.sql:14-21`), others unverified |
| `src/lib/data/river-reaches.ts:71-92` | probes each reach at a mile inside its stored bounds via `p_put_in_mile` | in-frame — safe |
| `src/app/api/conditions/[riverId]/route.ts:143-148`, `src/lib/embed/cards.ts:336-339`, `src/app/api/rivers/[slug]/visuals/route.ts:67-70`, `gauge-derivation.ts:178-184` | call `get_river_condition_segment` with a point only | **mixes** via the section lookup above; only bites where sections have bounds — today the Black (`00204:112-113`) |
| `src/lib/trust/checks/float-endpoint-eligibility.ts:191-206` | NULL mile on an offered endpoint | ruler-blind — safe |
| `src/lib/trust/checks/validate-river-data.ts:65-86`, `schema-invariants.ts` | wrap SQL rules; no rule compares frames | no coverage |
| `src/app/api/rivers/[slug]/access-points/route.ts:69-72`, `src/lib/offline/bundle.ts:152-157`, `tool-handlers.ts:137`, `packages/eddy-hazards/index.ts:42`, `eddy-ios/src/components/map-sheet/RiverSheet.tsx:213`, `eddy-ios/src/hooks/useFloatPlan.ts:104-109` | sort/filter by stored mile | **orders** — safe |
| `eddy-ios/src/components/PlanSheet.tsx:586`, `PlanAlongRoute.tsx:48-54`, `65`, `src/components/plan/FloatPlanCard.tsx:964`, `PlanSummary.tsx:240` | miles from put-in; upstream/downstream test | **subtracts** — safe |
| `scripts/ingestion/ingest-dossier.ts:272`, `preload-dossier-access-points.py:255` | gauge and access miles typed from a dossier | producers of stored miles, ruler unrecorded |

### Displays of a stored mile as an absolute number

Web: `src/components/river/AccessPointStrip.tsx:101`, `106`, `247`;
`src/components/plan/FloatPlanCard.tsx:355`, `364`, `502`, `598`;
`PlanSummary.tsx:313`, `327`, `448`; `CompactAccessCard.tsx:175`;
`src/components/access-point/AccessPointHeader.tsx:95`;
`src/app/rivers/[state]/[slug]/page.tsx:546`; `src/app/api/search/route.ts:445`;
`src/components/mo-surface-water/chrome/rail.tsx:576`, `913`, `957`;
`chrome/DetailModal.tsx:182` (labels it "mi from headwaters"), `237`.
iOS: `RiverMap.tsx:538`, `696`, `1076`, `1139`, `1212`; `RiverSheet.tsx:235`,
`260`, `310`; `PlanResult.tsx:229`, `334`; `PlanSheet.tsx:646`;
`app/river/[slug].tsx:270`, `1674`; `app/river/[slug]/access/[accessSlug].tsx:212`,
`655`; `useEddySearch.ts:199`. None says which ruler.

---

## 3. What a user can see today, ranked

1. **The Black's reach gauge, from a point.** A put-in whose stored mile is
   just below the 38.0 dam boundary has a geometry mile ~7.8 lower, so the
   point-only callers (embeds, `/api/conditions?putIn=`, visuals) place it in
   `upper-lesterville` and read Annapolis, above Clearwater Dam — the exact
   failure `00204:33-35` was written to prevent. Any approved Black access
   point with a stored mile in roughly [38.0, 45.8] is affected; how many
   there are is one query. `/api/plan` is not affected (it passes the stored
   mile).
2. **iOS mile posts beside pins.** At z12 on the Bourbeuse a pin reading
   "Mile 12.5" sits beside a post reading "42". Visible to anyone pacing a
   stretch on any of the nine rivers; the claim in `eddy-geo/index.ts:64-66`
   is false there.
3. **River Visual gauge relation.** A photo taken at the gauge on the
   Meramec is filed "23 mi downstream" (or "at" when it is 23 miles away).
   Rendered only on the admin review page today
   (`src/app/admin/reports/page.tsx:90-97`, `543`, `660`), so moderators see
   it, not the public.
4. **MO surface-water rail and modal.** `DetailModal.tsx:182` asserts "from
   headwaters" for a guide mile; `rail.tsx:913` (access, guide ruler) and
   `957` (POI, geometry ruler) print miles from two rulers in one list.
5. **Cross-table windows in `/api/plan`.** In-span gauges and hazards are
   selected on stored miles typed at different times; where a river's
   gauge or hazard miles were typed on the other ruler, a gauge is silently
   in or out of the span and its printed "(mile 55)" is on a third scale.
   Known on the Black; unmeasured elsewhere.
6. **Every absolute "Mile X".** Not wrong — on the Buffalo it is the NPS
   number a floater carries — but unlabelled, and it stops matching the map
   in their hand the day the river moves rulers.

Float time, reach length, shuttle plausibility and the order of every list are
unaffected on every river.

---

## 4. Options

### A — keep the guide rulers, stop mixing

Make each of the four mixing paths subtract or stay in one frame:

- `get_river_condition_segment` point path: resolve the nearest approved
  access point's stored mile and use that for the section lookup, or drop the
  section lookup when only a point is given (the distance fallback at
  `20260826162627:251-257` is frame-free). Fixes item 1.
- `gauge-derivation.ts`: snap the *gauge station* through `snap_to_river` too,
  so both miles are geometry miles and the difference is real on every river.
  Fixes item 3 without touching a stored value.
- Mile posts: label from stored anchors (interpolate between access-point
  miles along the line) or suppress posts on rivers whose offset exceeds the
  post interval. Fixes item 2.
- Label the ruler: "guide mile" where a river carries one, and drop
  "from headwaters" at `DetailModal.tsx:182`.
- Add a trust check that measures, per river, the median offset for each
  mile-carrying table against access points, and files a finding when any two
  tables disagree by more than a mile — the thing that would have caught the
  Black's three frames and this review's nine rivers.

Costs: two rulers forever, one `rivers.mile_frame` (or offset) column to
record which is which, and every future geometry consumer must remember. Gains:
no published number changes; the Buffalo stays on NPS mileposts.

### B — move every river to the geometry ruler

One migration per river in the pattern of `20260902132921`, each with the
`populated` guard, a 500 m cutoff, the `down + up = length_miles` invariant
and one published-reach assertion as outside evidence. Beyond that pattern it
must also recompute `river_hazards.river_mile_downstream` and
`river_sections.river_mile_start/end` (the Current had none;
`RECENT_BRANCHES_FIX_PLAN_2026-09-01.md:584-588`), and on the Black move the
38.0 boundary and both gauge miles. Precondition: `length_miles` must agree
with the line first (`river-geometry.ts:156`), or the new miles are scaled by
the same error War Eagle had.

What changes for users: every "Mile X" on the nine rivers shifts by the
offset — Buffalo access points read ~16 higher than the NPS matrix, Black
points ~8 lower, Bourbeuse ~30 higher. Reach lengths, float times and ordering
do not move. Mile posts, POI miles, photo relations and the point-path section
lookup become right with no code change, and `00165` already puts new rivers
here, so the catalog converges on one ruler instead of two.

### C — geometry canonical, guide mile alongside

B for storage, plus a nullable per-point `guide_mile` (or per-river offset)
used only for display where a published guide exists. Keeps the Buffalo's
NPS number on screen while every computation runs on one ruler. More columns,
one more thing for the trust check in A to watch.

### Recommendation, and what to know before choosing

The two code fixes in A that snap both sides through geometry (the Black's
point path, the photo relation) are correct under every option and close
items 1 and 3; they can go first. The ruler decision should wait on:

1. Per river, which guide the stored miles match — NPS on the Buffalo is
   documented; the Meramec, Niangua, Bourbeuse, St. Francis, Gasconade and
   Eleven Point sources are not recorded anywhere in the repo. If nobody can
   name the guide, the ruler is not protecting a match with anything.
2. The same offset table for gauges, hazards, POIs and section bounds against
   access points, per river (one query in the `20260902132921:27-33` shape) —
   this decides how many tables a B migration touches and whether A's
   cross-table windows are already wrong somewhere besides the Black.
3. The count of Black access points in the [38.0, 45.8] band and which gauge
   `/api/conditions` returns for each today.
4. `length_miles_disagrees_geometry` findings on the nine rivers — B's
   precondition.
5. How many `river_visual` rows sit on the nine rivers (the photo-relation
   backfill after either fix), and whether iOS users on those rivers reach
   z12, where the mile posts appear.

Nothing here should be applied to production without that evidence and an
explicit call on which numbers the product speaks.
