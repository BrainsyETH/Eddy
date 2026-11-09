# Lakes and launches — the expansion plan

**Status: proposed plan, 2026-11-09.** Turns the "expand dams and lakes"
research into a sequence Eddy can execute, with every source claim
re-measured from this environment on the date above. Companions:
`DAM_PRODUCT_AUDIT_2026-11-09.md` (where the dam product stands and what to
fix first), `dam-expansion.md` (what adding a USACE dam costs),
`DAM_EXPANSION_SURVEY_2026-08.md` (TVA, Nashville, Ameren),
`TAILWATER_PLAN.md` (the audience decision this plan must not displace), and
`MULTI_STATE_SCALING_PLAN.md` (the timezone, state and URL work a Southeast
cluster depends on).

**Verdict in one line:** the product idea is right and the data is better
than the registry suggests, but two of the research premises do not survive
measurement. The three Arkansas hydro dams publish no hourly generation at
all, so they are lake pages and not thinner generation pages. And the Corps'
national recreation-status layer carries no update time and has notes that
are years stale in places, so "Reported open" cannot be shown until Eddy has
watched the layer long enough to know how often it moves. Everything else in
the research checks out, and three things are better than it assumed: the
Kansas City ramp layer carries usable-elevation ranges on 153 of 224 ramps,
Eddy already holds the Arkansas and Missouri agency ramp inventories for every
Phase 1 lake in `agency_gis_features`, and the Southeast reservoirs publish
pool, guide curve, release and tailwater temperature live through the same
CWMS API the dam layer already reads.

---

## 1. What was measured, and what it changes

All probes were made 2026-11-09 between 16:00 and 18:30 UTC from the Claude
cloud environment. Raw responses were kept in the session scratchpad only;
the numbers below are what decided the plan. The CWMS **catalog** metadata
(`extents.latest-time`) froze on 2026-09-14 for every office probed, so the
catalog says nothing about liveness; every "live" claim below is a timeseries
read over the last 48 hours to 7 days, as `dam-expansion.md` already warns.

### 1.1 The Arkansas hydro trio publish no hourly generation

| Project | Office | Live series read today | Flow series |
| --- | --- | --- | --- |
| DeGray | MVK | `Degray Lake.Elev.Inst.1Hour.0.DCP-rev` 399.59 ft at 16:00Z | daily `Manual` Flow-Out only (0.0 on 11-09, that is a manual entry, not a reading); `%.Percent Full` reads 0.0 and is unusable |
| Narrows (Lake Greeson) | MVK | `Narrows Dam.Elev.Inst.1Hour.0.DCP-rev` 533.02 ft at 16:00Z | daily `Manual` only |
| Blakely Mountain (Lake Ouachita) | MVK | `Blakely.Elev.Inst.1Hour.0.DCP-rev` 568.66 ft at 17:00Z; the 15-minute series stopped 2026-10-15 | daily `Manual` only |

Not one `Flow-Plant`, `Flow-Power` or `Flow-Turbine` series exists at any of
the three. `RIVERS_AND_DAMS_REVIEW_2026-08-24.md` §4 measured the same thing
in August; the research's premise that "the existing system can represent
observed generation" for these three is wrong. What they can carry is the
Wappapello shape: hourly pool, daily release a day or more in arrears, and
nothing about the powerhouse. That is a lake page. It is still worth
building, and it is why this plan puts lakes first and dams second.

### 1.2 Kansas City still publishes nothing to CWMS, but its ramp layer is real

`catalog/TIMESERIES?office=NWK&like=Truman.*` returns zero series, as it did
in August. Truman's pool keeps coming from Ameren, a day behind.

The Kansas City District boat-ramp layer
(`Hosted/NWK_Boat_Ramps/FeatureServer/0`) is a different story:

| Measure | Value |
| --- | --- |
| Ramps | 224 across 18 lakes (plus one "Other") |
| Ramps with `elev_low` set | 153 |
| Truman | 45 (Corps, MDC, Missouri State Parks, lessees and municipal ramps) |
| Stockton | 24 |
| Pomme de Terre | 14 |
| Layer last edited | 2026-07-22 (service metadata); features edited 2024-12-09 and 2025-01-15 |

The elevation attributes read as a usable pool range in feet, in the lake's
own datum: Truman's Corps ramps mostly carry 704–724 against a 706 ft
multipurpose pool, Talley Bend's high-water ramp carries 724–727, and
Deepwater's lease ramp 704–723. Two traps are already visible in the data.
Warsaw City Harbor and East Bledsoe Ferry are filed under "Truman Lake" with
ranges of 645–677: they are on the Lake of the Ozarks arm below the dam, so
the lake assignment field cannot be trusted without the elevation. And many
ramps carry no range at all, which must render as "no low-water range
published", never as "usable".

### 1.3 The Corps' national recreation layer: good shape, unknown freshness

`Recreation/Recreation_Site/FeatureServer/0` holds 4,855 recreation areas
across 414 projects, each with `AreaStatus`, `Boat`, `Beach`, `Camp` and
`Flood` fields whose values are `Open`, `Closed`, `Partial`, `Status
Unknown` or null, plus a free-text `Notes` field and the previous value of
each status. Project names are upper case and `LIKE` is case-sensitive
(`'TABLE ROCK LAKE'`, `'DENISON DAM - LAKE TEXOMA, TX AND OK'`,
`'HARRY S. TRUMAN DAM AND RESERVOIR MISSOURI'`).

| Measure | Value |
| --- | --- |
| Areas with any `AreaStatus` | 2,664 of 4,855 (55%) |
| Areas with any `Boat` status | 1,443 of 4,855 (30%) |
| Subtypes | `waterAccessPoint`, `dayUseArea`, `campground`, `marinaAndOrResort`, `multipurposeArea`, `landAccessPoint`, `scenicViewingArea` |
| Timestamp fields | **none** |

Per Phase 1 lake, today:

| Project | Areas | `Boat` set | Notes that look current | Notes that are stale |
| --- | --- | --- | --- | --- |
| Table Rock | 38 | 16 | "Boat ramp and parking fully functional" | |
| Bull Shoals | 38 | 11 | "Some launching available with limited parking", "beach and boat ramp closed" (high water) | |
| Beaver | 28 | 14 | "Swim beach closed due to flood damage" | |
| Norfork | 30 | 15 | "Some launching available with limited parking" | |
| Texoma | 121 | 16 | | no notes at all on 121 areas |
| Truman | 25 | 12 | "Shoulder season camping Oct.–Nov." | |
| Hartwell | 103 | 40 | "Day use closed for season" | |
| Lanier | 77 | 31 | "Closed for season" | |
| DeGray | 26 | 11 | | "Winter closure until 1 March 2022" |
| Greers Ferry | 32 | 16 | | "Campsites open May 15, 2022" |
| Clearwater | 8 | 4 | | "Camping opens 5-20-2020" |

So the layer is maintained, unevenly, by project staff, and it tells a reader
nothing about when. Eddy can use it two ways without lying: as a discovery
source for area names, subtypes, managing agency and entrance coordinates
(which it is designed for), and as a status source **only after** Eddy has
recorded the layer daily for several weeks and can say "the Corps' reported
status, last changed on <date Eddy saw it change>". That is the ADR 0013
discipline applied to a status field, and it is Phase 0 below.

The layer's own description says the points are **entrance locations**.
Seven of Table Rock's 38 areas are `waterAccessPoint`; the rest are
multipurpose areas and marinas whose ramp is somewhere inside the area. The
research's qualification stands and becomes a rule in §5: an entrance is
never a launch pin.

### 1.4 The Southeast reservoirs are live in CWMS today

| Project | Office | Pool read today | Also live |
| --- | --- | --- | --- |
| Hartwell | SAS | `Hartwell.Elev-Pool.Inst.1Hour.0.Raw-SHEF_SAS` 647.78 ft at 13:00Z | hourly `Flow-Power`, `Flow-Out`, per-unit `Flow-Power` (all 0 overnight, consistent with idle units), hourly `Energy-SCHED` (a **scheduled** energy series, catalogued to 2026-09-14, not yet read live) |
| J. Strom Thurmond | SAS | `Thurmond.Elev-Pool.Inst.1Hour.0.Raw-SHEF_SAS` 317.70 ft at 14:00Z | same vocabulary as Hartwell |
| Buford (Lake Lanier) | SAM | `Buford.Elev.Inst.15Minutes.0.Raw-USGS` 1062.52 ft at 17:15Z, NGVD-29 with a published NAVD-88 offset | `Elev-Guide Curve` 1070.35 ft (15-minute, through 2029), `Flow-Out` 606 cfs, `Temp-Water-TW` 53.6 °F, `Buford-Tailwater.Elev` |
| Allatoona | SAM | `Allatoona.Elev.Inst.1Hour.0.Raw-USGS` 831.97 ft at 17:00Z | `Elev-Guide Curve` daily 835.00 ft; `Stor`; `Temp-Water-TW` (catalogued, not live in the window read) |

Two things decide the shape of a Southeast page. The guide curve is
published as a timeseries at Buford and Allatoona, and as `Elev-GC` and a
family of daily percentile series (`Elev-Pool_p05` … `p95`, 1962 onward) at
Hartwell, so "is the level normal for this time of year" is an official
number there, not an Eddy inference. And the hourly `Flow-Power` series at
Hartwell and Thurmond mean the Savannah chain can carry an observed
generation chip and pattern strip the way the Vicksburg dams cannot. SEPA
markets the power and publishes no loading page, so, as at the Cumberland
dams, there is no reference megawatt pair; `Energy-SCHED` is the one lead
worth chasing for a forward schedule, and it is unverified.

Costs that do not go away: the whole Savannah and Chattahoochee footprint is
Eastern time, which `MULTI_STATE_SCALING_PLAN.md` F4 and the survey's TVA
section already priced; `UsaceDam.state` is a union that stops at TX, KY and
TN; and `resolve.ts` knows none of the SAS or SAM spellings (`Elev-Pool`
here means the pool, where at LRN it meant the same thing and at SWL the
pool is `Elev` on `-Headwater`). The Hartwell district website itself returns
403 from this environment, so its posted ramp table cannot be read here; the
national layer carries Hartwell's 46 water-access areas with a `Boat` status
on 40, which is the better machine source anyway.

### 1.5 Reclamation, TVA, RIDB, NID

- **RISE** (`data.usbr.gov/rise/api`) answers from this environment once the
  request sends `Accept: application/vnd.api+json`; it is JSON:API, with
  `location`, `catalog-item` and result endpoints, provisional-data
  disclaimers in every item, and `verticalDatum` and `timezone` per
  location. Folsom and Grand Coulee items were found by search. A provider
  for it is a real but ordinary piece of work.
- **TVA** still returns 403 on `tva.com/environment/lake-levels/*`. Nothing
  has changed since August; the survey's two prerequisites stand.
- **RIDB** needs the key Eddy already holds (`RIDB_API_KEY`); unauthenticated
  calls return 401, which is expected.
- **NID** serves its national package; it identifies structures and says
  nothing about operations or launches, as the research noted.

### 1.6 Eddy already holds most of the Phase 1 ramp inventory

The 2026-10-29 agency GIS import (`scripts/ingestion/agency-gis/README.md`)
stored 3,361 AGFC facilities and 554 MDC boat ramps in
`agency_gis_features`, with the agency's own `waterbody`, owner, type and
`last_verified_date` where supplied. Counting the stored snapshot by
waterbody:

| Lake | AGFC "Boating Access" features | Other AGFC facilities on the lake |
| --- | ---: | --- |
| Bull Shoals | 20 | 8 courtesy docks, 10 parking areas, swimming area |
| Norfork | 22 (+1 filed as "Lake Norfork") | 11 courtesy docks, 9 marinas |
| Beaver | 14 | weigh-in station, fishing pier |
| Greers Ferry | 14 | 6 courtesy docks, marina |
| DeGray | 18 (+2 on the rereg pool) | campgrounds, 29 restrooms |
| Lake Greeson | 11 | 3 marinas, campgrounds |
| Lake Ouachita | 7 (+8 filed as "Ouachita Lake") | |
| Lake Dardanelle | 20 (+3 as "Dardanelle Lake") | 7 courtesy docks, 2 marinas |

MDC names its ramps by place rather than lake, so the Missouri count needs
a spatial join rather than a name match; the name match alone finds six at
Stockton, four at Truman and four at Norfork. Only 17 of the 3,915 features
were staged as river access candidates; the lake ramps sit in the inventory
unpublished because Eddy has no lake to attach them to. That is the single
cheapest fact in this plan: the first six lakes' launch lists are a model
and a review away, not an ingestion away.

### 1.7 What the research got right

Verified today and carried into the plan unchanged: USACE's national
layer is the right discovery source and the wrong launch-pin source; the
Kansas City layer's `elev_low` and `elev_high` support lake-level-aware
ramp guidance; Reclamation's API is official and reachable; TVA is blocked;
a dam and a lake are different entities; the `/dams/...` URLs and
generation charts must stay; and the Folsom pattern (one ramp closes, a
different low-water ramp opens at a different elevation, a third stays open
for larger boats) is exactly what a per-ramp model with elevation ranges
can express and a single lake number cannot.

---

## 2. Product decisions this plan makes

1. **A lake is an entity. A dam is not renamed.** The dam page keeps its
   URL, title, schedule and generation surfaces (ADR 0017, the November
   title rewrite). A lake gets an identity, a controlling-structure
   relationship, launches, and status provenance. One dam usually controls
   one lake; Taneycomo (Table Rock above, Powersite below) and the Truman to
   Lake of the Ozarks pair are why the relationship is a list, not a field.
2. **Lakes land on the dam page first, as an "On the lake" section**, below
   the water-below-the-dam content `TAILWATER_PLAN.md` decided leads. Only
   when a lake has launches, a trend and at least one official status source
   does it earn `/lakes/<slug>`, which then links to and from the dam page
   without duplicating either's primary content. Search Console's one
   recorded signal (lake-level queries show impressions and few clicks,
   `dam-page-copy.ts`) says the demand exists and the current page does not
   answer it.
3. **Three launch statuses, one separate caution.** `Reported open`,
   `Reported closed`, `Status unknown`, each with the source and the date
   Eddy last saw it change. A lake-level calculation produces a separate
   `Low-water caution` or `High-water caution` line from the ramp's own
   elevation range. It never upgrades `Status unknown` to open, and it
   never contradicts a reported closure.
4. **Trailer and hand launches are distinct.** A `hand_launch` value joins
   the access-point vocabulary (`packages/eddy-types`, `launch-roles.ts`,
   iOS `accessLayers.ts`); a kayak can go in where a trailer cannot, and
   that is half of "where can I launch today" for Eddy's existing audience.
5. **Official conditions and launch status stay free.** Saved lakes, lake
   alerts and a lake Read follow the dam model: later, and Premium.
6. **No bathymetry, no navigation, no proprietary depth product.** Out of
   scope for the reasons the research gave.

---

## 3. The data model, kept small

The registry pattern that carries 24 dams carries lakes too: a code registry
pinned by tests for identity and wiring, and tables only for things people
review or that change daily.

**`src/lib/lakes/registry.ts`** (code, like `usace-registry.ts`):

| Field | Why |
| --- | --- |
| `slug`, `name`, `states[]`, `timeZone` | identity; two-state lakes (Texoma, Bull Shoals) exist |
| `controllingDams[]` with a role (`impounds`, `holdsBelow`, `receivesFrom`) | the dam↔lake relationship, replacing the never-used `rivers.controlling_dam_id` |
| `pool` source: `{ kind: 'dam', damId }` or `{ kind: 'cwms', office, tsId }` or `{ kind: 'rise', itemId }` | reuse the dam's `poolElevation` where the dam is already in the registry; otherwise the lake owns its series |
| `datum: 'NGVD29' \| 'NAVD88'` and published offset | §5 rule; Buford publishes 0.1124 ft, the Ozark projects are NGVD29 |
| `operatingRange`: either `{ guideCurveTsId }` or `{ conservationPoolFt, floodPoolFt, source, asOf }` | "normal for the season" comes from an official curve where one exists and from documented pool elevations where it does not |
| `sources`: USACE recreation project name(s), NWK ramp lake name, AGFC/MDC waterbody spellings | the join keys measured in §1 are strings, and they differ per source |

**Tables (migrations under `supabase/`):**

- `lakes` mirror row (slug, name, geometry from 3DHP when wanted) so
  launches, stars and embeds have a key; populated from the registry the way
  `gauge_stations` carries dam release stations.
- `lake_launches`: `lake_slug`, name, point geometry, `launch_kinds[]`
  (`trailer`, `hand`, `courtesy_dock`), `managing_agency` (the closed
  vocabulary from migration `20260824183425`, widened as needed), fee,
  `usable_elev_low_ft`, `usable_elev_high_ft`, `elev_datum`,
  `elev_source`, `approved`, and the evidence links into
  `agency_gis_features` the 2026-10-29 import already uses for rivers.
- `lake_launch_status_observations`: `launch_id` or `lake_slug` + source
  area id, `source` (`usace_recreation`, `state_agency`, `operator`),
  `status`, `notes`, `first_seen_at`, `last_seen_at`, `changed_at`. The
  current status is the newest row; the freshness claim is `changed_at`.
- `AgencyProvider` grows `usace_recreation` and `nwk_ramps` so the existing
  snapshot, validate, stage, review loop ingests both layers with the same
  refusal rules (complete snapshots only, source identity by GUID,
  curated places never overwritten).

**Existing seams that take a fourth kind in one entry each:** `StarKind`
in `packages/eddy-sync`, `EMBED_KINDS` in `src/lib/embed/options.ts`,
`ConditionsKind` in `conditions/directory.ts`, iOS `KindMarkKind`, and the
starred-items tables (a `starred_lakes` row keyed by slug and validated
against the registry, as `starred_dams` is).

**Lake trend:** `DamHistoryMetric` is `generationFlow | release` today.
Adding `poolElevation` to the hourly history cron is what gives every lake
a 24-hour and 7-day line from Eddy's own record; it is also the only way a
Kansas City lake (Truman, via Ameren's daily number) gets a trend at all.
`sync-dam-history`'s expected-stream accounting must grow with it, or the
monitor goes `partial` on day one.

---

## 4. Phases

Estimates are relative to the dam work already shipped. Each phase has a
gate that can say no.

### Phase 0 — Feasibility audit (two to three weeks of elapsed time, little of it engineering)

The research asked for this first, and the measurements above say why.

1. **Record the Corps recreation layer daily** for all 414 projects with a
   script under `scripts/` (`probe-usace-recreation.ts`), storing each
   area's status fields and notes by `recreationBoundaryIdpk`. After three
   weeks, report: how many areas changed status at all, per district and
   per Phase 1 lake; whether `PrevBoat` moves when `Boat` does; whether
   notes are ever edited. **Gate:** if the Phase 1 lakes show no movement in
   three weeks, the layer is a discovery source only and the status feature
   needs a different source per lake.
2. **Verify the Kansas City ramp elevations** at Truman and Stockton:
   compare `elev_low`/`elev_high` against the pool elevations Eddy already
   holds (Truman from Ameren; Stockton from nothing, which is itself a
   finding), against the Corps' posted ramp tables where a human can read
   them, and against the two Lake of the Ozarks ramps misfiled under Truman.
   Decide the display rule for ramps with no range. **Gate:** the ranges
   agree with the posted tables on at least 90% of Corps-managed ramps.
3. **Spatially join `agency_gis_features` to the six Phase 1 lakes** (AGFC
   by `waterbody`, MDC by proximity to the lake polygon from 3DHP), and
   produce the review queue: name, agency, type, coordinates, verification
   date, nearest Corps recreation area. No publication.
4. **Probe `Hartwell.Energy-SCHED` live** and the equivalent at Thurmond.
   If it is a forward hourly schedule, the Savannah chain is a generation
   product and Phase 3 is larger and better than planned.
5. **Write the ADR**: lake as entity, status vocabulary, datum rule,
   entrance-is-not-a-launch rule. Record the decisions in §2 so they are
   decided rather than drifted into.

### Phase 1 — Six lakes Eddy already carries (after the audit's items 1–3 in `DAM_PRODUCT_AUDIT_2026-11-09.md` §5 have landed)

Table Rock, Bull Shoals, Beaver, Norfork, Texoma, Truman.

- Registry entries, `lakes` rows, `poolElevation` in the hourly history,
  the trend line and the operating range on the dam page's new "On the
  lake" section. Table Rock, Bull Shoals, Beaver and Norfork publish
  `%-Flood Pool` already; the section shows pool, 24-hour and 7-day change,
  and where the pool sits against conservation and flood pool.
- Launches from the Phase 0 review queue, approved one by one with the
  existing access-point review workflow, rendered as a list and map layer
  filtered by `All`, `Trailer`, `Hand launch`. Every launch shows its
  agency, kinds, fee, and the status line from §2.3 if and only if Phase 0
  item 1 passed for that lake.
- Truman is the ramp-elevation pilot: 45 ramps, ranges on most, pool from
  Ameren a day behind. The caution line must say the pool is as of
  yesterday; that constraint is a feature of the pilot, not a defect.
- Texoma is the breadth test: 121 Corps areas, 105 with no `Boat` status,
  and Texas Parks and Wildlife and Oklahoma ramp lists that are web pages,
  not layers. Expect Texoma to ship with launches and `Status unknown`
  almost everywhere, which is the honest state.
- iOS: the dam screen gains the same section from the same wire fields
  (`DamSnapshot` grows an optional `lake` block; old clients ignore it, as
  `generationForecast` established).

**Gate:** each lake has at least five approved launches with kinds, a trend
from Eddy's own history, and a documented operating range before its
section renders.

### Phase 2 — Nearby lakes without a generation product

- DeGray, Narrows, Blakely Mountain as **lake-first** entries: a new
  `UsaceOffice` member `MVK`, the `DCP-rev` hourly pool spelling and
  daily `Manual` flows marked `dailyMean` in `resolve.ts`, no powerhouse
  claim (no `nameplate`, no `generationOnCfs`, no pattern strip). Each
  declares its `tailwaterFishery` (trout at all three) and gets AGFC's
  launches from the inventory already held. Their dam pages exist because
  the registry drives them, titled for what they carry: lake level and
  releases, not a schedule.
- Oologah, Skiatook, Kaw, Wister only after
  `scripts/discover-usace-locations.ts` finds their SWT four-letter codes
  (name probes return nothing, as `dam-expansion.md` predicts) and the
  recreation layer's status churn at those projects is known. None has a
  river Eddy carries below it; they are lake pages for Tulsa-area boaters
  and the first test of whether a lake without a dam story earns traffic.

**Gate:** a verified live pool series and a defined user purpose per lake,
as the research required.

### Phase 3 — The first Southeast cluster

Hartwell, J. Strom Thurmond, Lake Lanier (Buford), Allatoona, in that
order: the two SAS projects share one vocabulary and both carry hourly
generation; the two SAM projects carry the richest lake data (guide curve,
storage, tailwater temperature).

Prerequisites, all already priced elsewhere: `timeZone` on the dam and lake
registries threaded through `shared/dam-schedule-copy.ts` and the DST
anchoring in `DamPatternDay` (survey §2, scaling plan F4); `state` widened
to GA and SC; SAS and SAM spellings in `resolve.ts` with
`scripts/check-usace-resolver.ts` run before shipping; the datum rule
exercised by Buford's published offset. No eastern river is required for a
lake page, which is what makes this cluster reachable before the TVA
prerequisites are met.

**Gate:** the timezone work ships with a test that renders a Hartwell day
in Eastern time and a Table Rock day in Central from the same code path.

### Phase 4 — Alerts, embeds, and the next providers

- Lake-level alerts (pool crosses a level the user sets, or leaves the
  operating range) and launch-status alerts (a reported status changes) on
  starred lakes, using the status observation table's `changed_at` as the
  event. These reuse the dam alert work `TAILWATER_PLAN.md` step 6 asks
  for and the audit ranks fourth.
- A `lake` embed kind: pool, trend, operating range, and the launch
  advisories for one lake, for marinas, campgrounds and tourism sites. The
  dam widgets have no partner installs after a season
  (`DAM_PRODUCT_AUDIT_2026-11-09.md` §1); the lake card is the first one
  with an obvious host.
- Reclamation through RISE (Mead, Powell, Shasta, Folsom, Flaming Gorge,
  New Melones, Grand Coulee, Oroville is a state project and is not in
  RISE), with California State Parks' launch notices as the status source
  for Folsom. Mountain and Pacific time ride on the Phase 3 timezone work.
- TVA, when it serves.

---

## 5. Rules that hold across every phase

- **Preserve the source's timestamp.** Every reading, status and note
  carries the time the source stamped it or, where the source stamps
  nothing (the recreation layer), the time Eddy first saw the value. The
  page says which.
- **Never mix vertical datums.** A lake's pool, its operating range and its
  ramps' elevation ranges render in one datum, named on the page. A ramp
  range whose datum is unknown is not compared with the pool.
- **Observed, scheduled and forecast stay apart**, as `dam-types.ts`
  already requires. A guide curve is a target, drawn as one, never as a
  reading. Ameren's anticipated discharge and any `Energy-SCHED` series
  are plans.
- **An entrance is not a launch.** Recreation-layer points discover areas
  and carry status for the area; a launch pin comes from a ramp layer, an
  agency facility layer, or a reviewed placement, and says which.
- **A computed caution never promotes a status.** The three reported
  statuses come from a source; the low-water and high-water lines come
  from arithmetic; they are drawn as two different things.
- **No "normal" without a published curve or a documented pool.** Where
  neither exists, the page shows the number and the trend and says the
  operating range is not published.
- **Nothing publishes from an incomplete snapshot.** The agency GIS
  refusal rules (complete inventories, stable identities, curated rows
  untouched) apply to the two new providers unchanged.

---

## 6. What this plan deliberately does not do

- Add dams for their own sake. The audit's "not recommended now" stands;
  every dam entry in Phases 2 and 3 is there because it carries a lake
  someone boats on, and it ships as what it is.
- Replace, rename or redirect any `/dams/...` URL.
- Build a navigation, bathymetry or depth product, or license one.
- Treat the National Hydrography Dataset as maintained; lake geometry
  comes from 3DHP when a polygon is needed, and only then.
- Promise TVA before TVA serves a page to a server.

---

## 7. Decisions needed before Phase 1 starts

1. **Confirm the entity decision** (§2.1, §2.2): lakes as first-class with
   `/lakes/<slug>` later, dam pages unchanged.
2. **Accept the freshness rule for Corps-reported status**: nothing renders
   as "Reported open" until Phase 0 has measured churn at that lake, and the
   label always carries the date Eddy saw it change. The alternative, show
   the field as the Corps publishes it, is cheaper and would have told a
   DeGray visitor in November 2026 about a closure "until 1 March 2022".
3. **Order against the audit.** Recommended: Phase 0 runs now in parallel
   with the audit's items 1 to 3 (the P1 fixes, the `/dams` index, the
   explainer content), and Phase 1 UI starts after them. The lake section
   is new reach; the audit items are correctness on pages people already
   land on.
4. **Hand launches as a vocabulary change** touch web, iOS and
   `packages/eddy-types`; confirm the term and whether existing river
   gravel-bar accesses should carry it.
5. **Audience precedence.** `TAILWATER_PLAN.md` says the wading angler wins
   a conflict on the dam page. The "On the lake" section sits below the
   water-below-the-dam content on the three trout tailwater dams; on a lake
   with no Eddy river below it (Texoma, Truman, every Phase 2 and 3 entry),
   the lake section can lead. Confirm that split.

---

## Appendix — probe record, 2026-11-09

| Source | Request | Result |
| --- | --- | --- |
| CWMS catalog, SWL | `like=DeGray.*`, `Narrows.*`, `Blakely.*` | 0 series each (they are MVK) |
| CWMS catalog, MVK | `like=DeGray.*` / `Narrows.*` / `Blakely.*` | 16 / 13 / 48 series; no turbine flow; catalog `latest-time` frozen 2026-09-14 |
| CWMS timeseries, MVK | hourly `Elev...DCP-rev`, 2026-11-07 to 11-09 | live at all three; Blakely 15-minute series dead since 2026-10-15 |
| CWMS catalog, NWK | `like=Truman.*` | 0 series |
| CWMS catalog, SWT | `like=Oologah.*`, `OOLO.*`, `SKIA.*`, `KAW.*`, `WIST.*` | 0 series; codes need the location discovery script |
| CWMS, SAS | Hartwell 129 series, Thurmond 143 | hourly pool, per-unit and total `Flow-Power`, `Flow-Out`, `Energy-SCHED`, `Elev-GC` and percentile family; pool live 13:00Z–14:00Z |
| CWMS, SAM | Buford 32 series, Allatoona 21, `like=Lanier.*` 0 | 15-minute pool, guide curve, release, tailwater temperature live at Buford; hourly pool and daily guide curve live at Allatoona |
| USACE Recreation_Site layer | metadata, counts, distinct values, 13 projects by exact name | 4,855 areas, 414 projects, status fields present, no timestamps, notes stale at three projects |
| USACE NWK_Boat_Ramps layer | metadata, counts, Truman features | 224 ramps, 18 lakes, 153 with `elev_low`, Truman 45, Stockton 24 |
| Reclamation RISE | `location?search=Folsom`, `catalog-item?search=Lake Mead elevation` | 406 with `Accept: application/json`; 200 with `application/vnd.api+json` |
| TVA | `tva.com/environment/lake-levels/norris` | 403 |
| RIDB | `facilities?limit=1` without key | 401 (key required, as expected) |
| USACE Savannah District site | Hartwell boat-ramp page | 403 from this environment |
| Repo | `agency-gis/2026-10-29/*.json` | AGFC and MDC lake ramp counts in §1.6 |
