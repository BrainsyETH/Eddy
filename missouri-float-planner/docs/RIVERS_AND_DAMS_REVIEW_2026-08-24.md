# Rivers & dams source review — 2026-08-24

**Status: measurements + a readiness call.** Everything below was measured
against production (`ilefwfpvphadsbptiaur`) and the live upstream sources on
2026-08-24. Companions: `DAM_EXPANSION_SURVEY_2026-08.md` (what shipped and
why), `TAILWATER_PLAN.md` (what to build next in the Ozarks),
`WATER_REGIMES_STRATEGY.md` (why regulated water at all).

**Verdict in one line:** the river footprint is ready; the dam footprint is
live but *unwatched*, and it proved it — three of twenty-four dams stopped
recording 53 hours ago and nothing in the system noticed.

---

## 1. What is carried today

### Rivers — 24 active (17 MO, 7 AR), 1 staged

| Measure | Count |
|---|---|
| Active rivers | 24 |
| Inactive, fully staged | 1 (Elk River — 5 access points, 1 gauge, 1 section, 1 hazard) |
| Approved access points | 308 |
| Pending access points | 92 |
| Wired gauge stations | 45 (44 USGS, 1 NWS, 1 USACE) |
| River sections | 56 |
| River hazards | 22 |
| Services linked to a river | 196 |
| `river_mile_markers` rows | **0** |

Every active river has geometry, `direction_verified = true`, a description,
and one `river_characteristics` row. Every approved access point carries a
`river_mile_downstream` and an `is_float_endpoint` flag except one (Montauk).

### Dams — 24 in the registry, five distinct sources

| Source | Projects | What it gives |
|---|---|---|
| CWMS/CDA — SWL (Little Rock) | 8 | hourly release, pool, % flood pool, inflow, tailwater elev/temp; 6 reservoir + Ozark & Dardanelle L&D |
| CWMS/CDA — SWT (Tulsa) | 8 | same shape, resolved live rather than transcribed |
| CWMS/CDA — MVS (St. Louis) | 2 | **daily-mean** release + hourly forecast + pool |
| CWMS/CDA — LRN (Nashville) | 3 | hourly observed on split station prefixes + a ~9-day cfs forecast |
| SWPA schedule scrape | 18 columns | hour-ending MW loading, all 18 wired to a dam |
| Ameren JSON API | 1 (+1 rider) | Bagnell hourly pool/tailwater/discharge; Truman's observed pool + outflow |
| NWK (Kansas City) | 2 | nothing — schedule-only entries by design |

`KNOWN_UNPUBLISHED` correctly names Pomme de Terre. `UNWIRED_SWPA_PROJECTS`
is empty and, verified against today's `mon.htm`, that is still true: the
file carries exactly 18 columns (BBD DEN KEY FGD WFD TKD EUF RSK OZK DAD BEV
TRD BSD NFD GFD STD HST CAN) and every one is claimed.

---

## 2. Source health, measured 2026-08-24

| Source | Result |
|---|---|
| USGS | 44 of 45 wired stations read within 6 hours |
| CWMS SWL | live — `Table_Rock_Dam.Flow-Plant…` returned 46 hourly points through 21:00Z |
| CWMS LRN | live — `RWNK2-WOLF_CREEK.Flow-Turbine…` returned 42 hourly points through 17:00Z |
| SWPA | all seven weekday files HTTP 200, ~42 KB, header dated MONDAY AUGUST 24, 2026 |
| `dam_metric_readings` | **15 dams fresh (2–4 h), 3 dams frozen 53 h, 6 dams empty** |
| Trust ledger | 11 checks, all `ok`, last tick 21:01; 10 open findings |

Every upstream source is healthy. Every gap below is ours.

---

## 3. Findings, ranked

### P0 — the three Cumberland dams stopped recording and cannot resume on their own

`dam_metric_readings` for `lrn-wolf-creek-dam`, `lrn-center-hill-dam` and
`lrn-dale-hollow-dam` ends at **2026-08-22 16:00** — 352 rows each, then
nothing. Every other dam is 2–4 hours fresh in the same table.

The cause is one line in `src/app/api/cron/sync-dam-history/route.ts`:

```ts
const dams = Object.values(USACE_DAMS).filter(
  (d) => hasPowerhouse(d) && d.office && d.cdaLocation
);
```

The LRN entries carry **`cdaLocations`** (plural) — the split-prefix shape
that `8ccfbf6` introduced precisely because no single prefix spans a project's
tailwater and pool stations. They have no `cdaLocation`, so the filter drops
all three. `seriesFor()` already handles both shapes correctly
(`dam.cdaLocations ?? (dam.cdaLocation ? [dam.cdaLocation] : [])`), so the
*read* path works and the dam pages still show live metrics — only the
recorder is blind. The date matches: `68249d4` merged this state to main on
2026-08-22.

This is the one class of dam data that **cannot be repaired later**. CWMS
serves a rolling week; the route's own comment says so ("a dam left out of
this filter loses those hours permanently"). Every day this stands costs
three dams a permanent day, and the retention horizon is 730 days, so the
frozen strips will sit there looking plausible for two years.

Fix: widen the filter to `(d.cdaLocation || d.cdaLocations?.length)`, then
run one `?backfillHours=192` pass. The window from 08-22 16:00 to now is
still inside CWMS's rolling week **today**; it will not be next week.

### P1 — the trust ledger does not watch the dam layer at all

Eleven checks are registered: `eddy_knowledge`,
`float_endpoint_eligibility`, `float_summary`, `gauge_wiring`,
`known_regressions`, `ledger_heartbeat`, `river_geometry`,
`schema_invariants`, `service_geo_consistency`, `usgs_site_drift`,
`validate_river_data`. None of them touches `dam_metric_readings`, the SWPA
scrape, or the Ameren endpoint.

That is precisely why P0 ran for 53 hours in silence. The river side has a
ledger that catches an unsnapped access point within a day; the dam side has
nothing, and the dam side is the half whose data is irrecoverable.

Minimum viable check — `dam_freshness`: for every dam the history cron
*claims*, assert a reading inside the last 6 hours; raise `high` per dam.
Two obvious siblings: SWPA file date (it already fails closed at fetch time,
but a closed fail is currently invisible) and Ameren reachability from
Vercel egress rather than from a build box.

### P2 — six dams have no observed generation history, and two of those are gaps

| Dam | Why empty | Verdict |
|---|---|---|
| Clearwater | no turbines | correct |
| Wappapello | 175 kW station service only — `hasPowerhouse` false | correct |
| Stockton, Truman | NWK publishes nothing to CWMS | correct |
| **Mark Twain** | nameplate 2×58 MW, SWPA column `CAN`, dam page describes a plant — but release is `dailyMean` (skipped, rightly) and no `generationFlow` is declared or resolved | **gap**: the strip's past half is permanently empty under a dam Eddy says has a powerhouse |
| **Bagnell** | `amerenMetrics`, no `office` → excluded by the same filter as P0 | **gap**: Ameren publishes hourly discharge (and 15-minute), so this history exists and is simply not being taken |

Bagnell is the cheaper of the two: the fetch already exists in
`src/lib/ameren/osage.ts`, and it is the only dam in the registry with a
published forward *intent*
(`bagnellDamAnticipatedDischargeToday`) and with water-quality readings.

### P3 — `release` and `generationFlow` are byte-identical for much of the fleet

Over the 400-hour window in the table:

| Dam | Hours where the two series are equal |
|---|---|
| Keystone | 100.0% |
| Beaver | 88.9% |
| Greers Ferry | 82.8% |
| Bull Shoals | 74.3% |
| Table Rock | 73.6% |
| Dardanelle | 64.6% |
| Ozark | 56.4% |
| Robert S. Kerr / Webbers Falls | ~43% |
| Norfork | 0.5% |
| Tenkiller, Fort Gibson, Broken Bow, Eufaula, Denison, all three LRN | 0.0% |

`releaseExcludesGeneration` is unset on every dam, which is the correct
conservative default and means nothing is being subtracted. But the split is
informative: at Keystone the two are the *same series under two names* for
every hour measured, while at Fort Gibson and the LRN trio they never agree.
The registry's own note asks for someone to verify a specific project's pair
against its district's definitions and record it with a date — Keystone at
100% is the case that most deserves it, because Eddy currently stores and
draws one fact twice.

### P4 — geometry and snap defects on the river side

Open in the ledger, and confirmed directly:

- **Ha Ha Tonka State Park (Niangua) snaps 7,765 m** — 4.8 miles — and is
  published with `river_mile 79.5`. Whistle Bridge 1,769 m, Mother Nature's
  Riverfront Retreat 1,525 m; all three also have a NULL `location_snap`
  while still carrying a mile, which is the `access_point_not_snapped`
  warning. On a 92-mile river, a 4.8-mile error is a float plan that is
  wrong by half a day.
- **Montauk State Park (Current) snaps 2,236 m** at `river_mile 0.10`, and
  is separately flagged as "a launch nobody can choose".
- **Buffalo City (Buffalo) snaps 1,001 m** — notable because it is the
  access point where the Buffalo meets the White.
- **War Eagle Creek: `length_miles` 33.17 vs 68.1 measured from the stored
  line — 51% off**, open since 08-06.
- **Courtois Creek has no gauge station within 1 km of its geometry**, and
  both Courtois and Huzzah are wired to the *same* station, 07014000 (Huzzah
  Creek near Steelville). Courtois is being graded off a neighbouring creek.
- **Jacks Fork at Mountain View**: `level_low` = `level_optimal_min` = 100
  cfs — the one `error`-severity row `validate_river_data()` returns. A tie,
  not an inversion, so it is a one-value fix.
- **`06928900` (Big Piney River near Houston) is `active = false`, has never
  had a reading, and is still wired to Big Piney as a secondary gauge with a
  full six-threshold set.** A dead station dressed as a live one.

### P5 — editorial debt, unevenly distributed

| Gap | Count | Who |
|---|---|---|
| Rivers with **zero hazards** | 12 | Buffalo, Current, Eleven Point, Jacks Fork, Caddo, Crooked Creek, James, Spring (AR), Spring (MO), Huzzah, Courtois, War Eagle |
| Rivers with **zero sections** | 7 | Jacks Fork, Eleven Point, Niangua, Kings, Huzzah, Courtois, Spring (MO) |
| Rivers with no `float_summary`/`float_tip` | 12 | incl. Current, Meramec, Buffalo, Eleven Point, Gasconade, Black |
| Approved access points with no description | 79 | concentrated on the AR batch + Spring (MO): Kings 10/10, Spring AR 10/10, Spring MO 14/14, Crooked Creek 9/9, Big River 9/9, Bryant 8/8, Mulberry 7/7, War Eagle 7/7, Caddo 4/4 |
| Pending access points awaiting review | 92 | Meramec 27, Niangua 15, Courtois 12, Huzzah 12, Gasconade 6, Eleven Point 6 |
| Active rivers with zero services | 1 | Spring River (MO) |

Zero hazards on the Buffalo (Gray Rock) and zero on the Caddo (which is a
different river above 1,000 cfs) are the two that read as absences of
research rather than absences of hazard.

Two notes on why these are silent:

- The `float_summary` check grades the prose that *exists* — it verifies no
  measurement in the summary exceeds the gauge's dangerous threshold. It does
  not require a summary, so twelve missing ones never raise a finding.
- `check-eddy-knowledge` asserts `EDDY_KNOWLEDGE.md` has a section per active
  river, which is a different question from whether the database does.

### P6 — dead weight

- **`rivers.controlling_dam_id`** shipped 2026-08-13 with a careful comment
  ("matched against the release gauge station's `site_id_external` at
  validation, so a tailwater cannot be wired to a neighbouring project's
  outflow"). It is **NULL on all 25 rows** and referenced by no code outside
  the generated `database.ts`. The validation it describes does not exist.
  The Black — the one river that *is* a tailwater — leaves it null and gets
  its link from the registry's `tailwater` field instead. Either wire it or
  drop it; a column that documents a guarantee it does not provide is worse
  than no column.
- **`river_mile_markers` is empty** despite two migrations
  (`00008_river_mile_markers`, `00009_mile_marker_corrections`) and an
  importer (`import-mile-markers.ts`, guard: **NONE**, CSV probed at
  hardcoded local paths).

---

## 4. A correction to the registry's own expansion note

`usace-registry.ts`, in the `hasPowerhouse` docblock, says:

> DeGray, Narrows/Lake Greeson and Blakely Mountain are the near candidates,
> and CWMS publishes turbine flow for all three.

**Measured 2026-08-24: it does not.** All three are **MVK (Vicksburg)**, not
SWL — `office=SWL` returns zero series for each name. Under `office=MVK` the
catalog lists 13, 11 and 40 series respectively, and **not one is
`Flow-Plant`, `Flow-Power` or `Flow-Turbine`**. What is actually published:

- **DeGray** — hourly `Elev` (`DCP-rev`), `%` full, `Stor`, `Precip`;
  flow only as **daily `Manual`** (`Flow-In`/`Flow-Out`/`Flow`) plus a
  6-hour `Forecast`. Rereg dam and tailwater stage are daily manual.
- **Narrows (Lake Greeson)** — same shape, 11 series.
- **Blakely Mountain (Lake Ouachita)** — mostly dam-safety instrumentation:
  piezometer stage and water temperature, manhole and weir turbidity. Hourly
  elevation, daily manual flows.

None of the three appears in SWPA's 18 columns either. So a fourth district
would cost a new `UsaceOffice` member, a fourth parameter vocabulary in
`resolve.ts`, and a `dailyMean`-shaped daily flow — and would buy a pool
number, not a generation console. That is Wappapello's shape, not Table
Rock's. It should drop well down the list, and the docblock should carry a
dated correction the way `WATER_REGIMES_STRATEGY.md` now does for LRN.

The general lesson is the same one the LRN survey learned: **a claim about
what a district publishes decays.** Nothing in CI re-measures these, which is
another argument for P1.

---

## 5. Where to expand, in order

### First: tailwaters, not dams

Twenty-three of twenty-four dams have no river below them. The metrics
already exist and are already fetched; what is missing is curated
`river_sections`. This is the highest-value expansion in the repository
because the marginal cost is editorial, not integration.

1. **The White below Bull Shoals** — the standout. Bull Shoals is already in
   the registry with hourly turbine flow and a live SWPA column, and Eddy
   *already owns an access point on the White*: Buffalo City, at river mile
   131.4 of the Buffalo, is the confluence. Cotter and the Wildcat Shoals
   reach are the most-floated trout tailwater in the Ozarks, and generation
   is the whole planning question there. It reuses the exact `tailwater` +
   `sectionSlug` shape the Black already proves.
2. **The North Fork below Norfork Dam** — Eddy carries `north-fork-white`
   *above* Norfork Lake (07057500, Tecumseh). The 4.8 miles below the dam are
   a different river with a different regime, and the registry already
   declares `tailwaterFishery: 'trout'` for a project that publishes no
   temperature. Adding the tailwater as a reach on the existing river is
   cheaper than a new river and fixes a real conceptual gap: today the page
   implies one river where there are two.
3. **Lake Taneycomo below Table Rock** — the most-searched of all of them,
   but blocked on Powersite, which `DAM_EXPANSION_SURVEY` correctly diagnoses
   as an architectural gap rather than a data one. Do it after (1) and (2)
   have paid for the reach-under-a-dam pattern.
4. **The Little Red below Greers Ferry** and **the Caney Fork below Center
   Hill** — the latter is where the LRN `generationForecast` work finally
   earns its keep, but it needs the eastern-timezone parameterization first.

### Second: finish Ameren before adding a district

Bagnell is the only dam with a stated forward intent, the only one with
intake DO and total dissolved gas, and it completes Truman. Its hourly
discharge is being fetched for display and thrown away for history. Adding
it to the recorder is the same change as the P0 fix — the filter needs to
admit non-CWMS providers anyway — and the Osage below Bagnell is a genuine
Missouri float and fishing destination that Eddy carries no part of.

### Third: rivers — activate before adding

**Elk River is already staged and inactive** with 5 access points, a gauge, a
section and a hazard. Whatever gate stopped it should be closed out; a fully
built river sitting behind `active = false` is the cheapest river Eddy will
ever add.

Beyond that, the strongest MO candidates by float traffic are the Osage Fork
of the Gasconade, Little Piney Creek, Roubidoux Creek, Beaver Creek and Big
Sugar/Indian Creek; in AR, the Saline (Benton), the Strawberry, and the
Illinois. But see the verdict — none of them should go in first.

---

## 6. Readiness

**Rivers: ready.** Twenty-four rivers with verified direction, complete
geometry, 308 snapped and miled access points, 44 of 45 gauges reading inside
six hours, one `error`-severity validation row that is a tie between two
thresholds, and a trust ledger that has been running 484 `validate_river_data`
passes and is currently green. The open findings are real but bounded: five
snap outliers, one 51%-wrong length, one dead gauge wiring. That is a
maintenance list, not a blocker.

**Dams: live, but not ready to expand.** Not because of volume — twenty-four
projects across four districts and two non-federal providers is a genuinely
impressive footprint, and every upstream source answered today. It is not
ready because of one asymmetry: **the dam layer has zero automated integrity
coverage, and dam history is the only data in the system that cannot be
backfilled.** Those two facts met on 2026-08-22 and produced three frozen
dams that nobody would have found by looking at the pages, which still render
live metrics from the same registry.

Adding a twenty-fifth dam multiplies an unwatched surface. Adding a
twenty-fifth river adds to an editorial backlog that already includes 92
unreviewed access points and 79 approved ones with no description.

**The gate, in order:**

1. Fix the `cdaLocation` filter and run a backfill pass — **today**, while
   the missing window is still inside CWMS's rolling week.
2. Register a `dam_freshness` trust check, plus SWPA file-date and Ameren
   reachability. Without this, (1) will happen again and be found the same
   way: by someone looking.
3. Clear the five snap outliers and the War Eagle length, and either wire or
   drop `controlling_dam_id`.

After those three, the White below Bull Shoals is the next thing to build,
and it is worth more than any new dam on the list.
