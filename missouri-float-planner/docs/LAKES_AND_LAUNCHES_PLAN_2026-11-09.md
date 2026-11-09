# Lakes and launches — the expansion plan

**Status: approved for Phase 0, 2026-11-09.** Turns the "expand dams and
lakes" research into a sequence Eddy can execute, with every source claim
re-measured from this environment on the date above. Revised the same day
after review: the freshness rule, the launch model, the gates, the ramp
elevation output and the rollout order all changed; §7 records the
decisions. Companions: `DAM_PRODUCT_AUDIT_2026-11-09.md` (where the dam
product stands and what to fix first), `dam-expansion.md` (what adding a
USACE dam costs), `DAM_EXPANSION_SURVEY_2026-08.md` (TVA, Nashville,
Ameren), `TAILWATER_PLAN.md` (the audience decision this plan must not
displace), and `MULTI_STATE_SCALING_PLAN.md` (the timezone, state and URL
work a Southeast cluster depends on).

**Verdict in one line:** the product idea is right and the data is better
than the registry suggests, but two of the research premises do not survive
measurement. The three Arkansas hydro dams publish no hourly generation at
all, so they are lake pages and not thinner generation pages. And the Corps'
national recreation-status layer carries no update time and has notes that
are years stale in places, so a status from it can be shown only as what it
is: an agency listing with no known date. Everything else in the research
checks out, and three things are better than it assumed: the Kansas City
ramp layer carries ramp-bottom and closure elevations on 153 of 224 ramps,
Eddy already holds the Arkansas and Missouri agency ramp inventories for
every first-wave lake in `agency_gis_features`, and the Southeast reservoirs
publish pool, guide curve, release and tailwater temperature live through
the same CWMS API the dam layer already reads.

**The quality bar is the river bar.** Accurate, attributable, useful, and
understandable without a wall of explanatory text. The risk in this plan is
not architecture; it is telling someone a ramp is usable on the strength of
government information that is incomplete or years old. Every rule in §5
exists to prevent that one failure.

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
| Layer last edited | 2026-07-22 (service metadata); features carry their own `last_edited_date` (2024-12-09 and 2025-01-15 at Truman) |

The layer documents `elev_low` as the **bottom of the ramp** and `elev_high`
as the **elevation at which the ramp is closed**, in feet in the lake's own
datum. They are two different facts, not one usable range: below the low
value the end of the ramp is out of the water; above the high value the
Corps closes it (usually because the approach or parking floods). Truman's
Corps ramps mostly carry 704 and 724 against a 706 ft multipurpose pool.
Two traps are already visible. Warsaw City Harbor and East Bledsoe Ferry are
filed under "Truman Lake" with elevations of 645 and 677: they are on the
Lake of the Ozarks arm below the dam, so the lake assignment field cannot be
trusted without the elevation. And many ramps carry no elevations at all,
which must render as "no elevation thresholds published", never as
"usable". Talley Bend's high-water ramp carries 724 and 727, a three-foot
band; either that is right and worth saying, or the fields mean something
else at that ramp, and Phase 0 checks it specifically.

### 1.3 The Corps' national recreation layer: good shape, no dates

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

Per first-wave lake, today:

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
nothing about when. "Looks current" in the table above is a human reading a
note, which is exactly what the product cannot rely on. An unchanged value
observed by Eddy for three weeks is not evidence that the Corps looked at
the ramp in those three weeks; an area listed open since 2022 would pass
that test. What the layer can honestly supply is in §2.3 and §5: the
agency's listing, labelled as a listing with no known date, and the status
`Partial` preserved as "Limited access" rather than folded into open or
closed.

The layer's own description says the points are **entrance locations**.
Seven of Table Rock's 38 areas are `waterAccessPoint`; the rest are
multipurpose areas and marinas whose ramp is somewhere inside the area. The
status is therefore an **area** status, not a ramp status. The research's
qualification stands and becomes a rule in §5: an entrance is never a launch
pin, and an area status reaches a launch only through a reviewed link.

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

### 1.6 Eddy already holds most of the first-wave ramp inventory

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
cheapest fact in this plan: the first lakes' launch lists are a model and a
review away, not an ingestion away. It is also why Eddy is not building a
nationwide ramp directory from scratch.

### 1.7 What the research got right

Verified today and carried into the plan unchanged: USACE's national
layer is the right discovery source and the wrong launch-pin source; the
Kansas City layer's elevations support lake-level-aware ramp cautions;
Reclamation's API is official and reachable; TVA is blocked; a dam and a
lake are different entities; the `/dams/...` URLs and generation charts
must stay; and the Folsom pattern (one ramp closes, a different low-water
ramp opens at a different elevation, a third stays open for larger boats)
is exactly what a per-ramp model with elevation thresholds can express and
a single lake number cannot.

---

## 2. Product decisions

1. **A lake is an entity. A dam is not renamed.** The dam page keeps its
   URL, title, schedule and generation surfaces (ADR 0017, the November
   title rewrite). A lake gets an identity, a controlling-structure
   relationship, launches, and status provenance. One dam usually controls
   one lake; Taneycomo (Table Rock above, Powersite below) and the Truman to
   Lake of the Ozarks pair are why the relationship is a list, not a field.
2. **Two destinations with two intents, linked both ways.** A dam page
   prioritises generation, releases and the water below. A lake page
   prioritises elevation, launches, facilities and restrictions. Someone
   searching "Table Rock Lake boat ramps" and someone searching "Table Rock
   Dam generation schedule" are not the same visitor, and the lake
   experience develops its own identity rather than staying an appendix to
   a dam chart. In the first wave the lake content lands on the dam page as
   an "On the lake" section; a lake earns `/lakes/<slug>` on content quality
   and search demand, **not** on whether an official ramp-status source
   exists for it. Some agencies never publish one, and a lake with a verified
   level, a chart and three reviewed launches is useful without it. Search
   Console's one recorded signal (lake-level queries show impressions and
   few clicks, `dam-page-copy.ts`) says the demand exists and the current
   page does not answer it.
3. **Four reported statuses, labelled by their provenance, and two separate
   cautions.** The reported statuses are `Reported open`, `Limited access`
   (the source's `Partial`, never folded into open or closed),
   `Reported closed` and `Status unknown`. Each carries its source and the
   best date that source gives (§3, three timestamps); when the source gives
   none, the line reads "Agency lists as open · update date unavailable",
   in the lower-trust style, and is never presented as a verified real-time
   condition. Separately, a ramp's published elevation thresholds against
   the current pool produce a `Low-water caution` or a `High-water caution`,
   worded as in §5. A caution never upgrades a status, never contradicts a
   reported closure, and never says "available".
4. **Launch methods are not amenities.** `trailer` and `hand` describe how
   a boat enters the water; a courtesy dock, parking, toilets and a fee are
   facilities and belong in amenities. A `hand_launch` value joins the
   access-point vocabulary (`packages/eddy-types`, `launch-roles.ts`, iOS
   `accessLayers.ts`). Existing river gravel bars are **not** reclassified
   automatically; a gravel bar gets `hand_launch` only when a human says so.
5. **One physical launch has one identity.** A place used for a river float,
   a lake launch and a campground is one row with one set of photos,
   favorites and facility details, however many surfaces show it. The model
   in §3 enforces that with a link, and the Taneycomo endpoints are the
   first test of it.
6. **Official conditions and launch information stay free.** Saved lakes,
   lake alerts and a lake Read follow the dam model: later, and Premium.
7. **Tailwater leads on the trout dams; the lake leads on lake-focused
   destinations.** On Bull Shoals, Norfork and Table Rock the water below the
   dam keeps the lead `TAILWATER_PLAN.md` gave it, but that is not a
   requirement to bury every lake feature under every chart; the "On the
   lake" section is a visible, linked section, not a footnote. On Texoma,
   Truman and every lake with no Eddy river below it, the lake content can
   lead.
8. **No bathymetry, no navigation, no proprietary depth product.** Out of
   scope for the reasons the research gave.

---

## 3. The data model, kept to what Eddy does not already have

Eddy already has an access-point model with a review workflow, an agency
GIS feature inventory with refusal rules, favorites and map layers keyed by
kind and role (ADR 0008), and a provider-and-snapshot pattern for dams.
This section adds a lake identity, a launch row that links to all of that,
and a status observation with honest timestamps. Nothing else.

**`src/lib/lakes/registry.ts`** (code, pinned by tests, like
`usace-registry.ts`):

| Field | Why |
| --- | --- |
| `slug`, `name`, `states[]`, `timeZone` | identity; two-state lakes (Texoma, Bull Shoals, Table Rock) exist |
| `controllingDams[]` with a role (`impounds`, `holdsBelow`, `receivesFrom`) | the dam↔lake relationship, replacing the never-used `rivers.controlling_dam_id` |
| `pool` source: `{ kind: 'dam', damId }` or `{ kind: 'cwms', office, tsId }` or `{ kind: 'rise', itemId }` | reuse the dam's `poolElevation` where the dam is already in the registry; otherwise the lake owns its series |
| `datum: 'NGVD29' \| 'NAVD88'` and published offset | §5 rule; Buford publishes 0.1124 ft, the Ozark projects are NGVD29 |
| `operatingRange?`: either `{ guideCurveTsId }` or `{ conservationPoolFt, floodPoolFt, source, asOf }` | optional; "normal for the season" comes from an official curve where one exists and from documented pool elevations where it does not, and the page says so when neither exists |
| `sources`: USACE recreation project name(s), NWK ramp lake name, AGFC/MDC waterbody spellings | the join keys measured in §1 are strings, and they differ per source |

**Tables (migrations under `supabase/`):**

- `lakes` mirror row (slug, name, geometry from 3DHP when a polygon is
  wanted) so launches, stars and embeds have a key; populated from the
  registry the way `gauge_stations` carries dam release stations.
- `lake_launches`: `lake_slug`, name, point geometry, `launch_methods[]`
  (`trailer`, `hand`), `amenities[]` (courtesy dock, parking, toilets, fee,
  using the vocabulary access points already use), `managing_agency` (the
  closed vocabulary from migration `20260824183425`, widened as needed),
  `ramp_bottom_elev_ft`, `ramp_closure_elev_ft`, `elev_datum`,
  `elev_source`, `elev_source_updated_at`, `approved`, the evidence links
  into `agency_gis_features` the 2026-10-29 import already uses for rivers,
  and **`access_point_id` (nullable, unique)**: when the same physical place
  is already an access point, the launch row points at it and takes its
  name, photos, favorites and facilities from there. The launch table exists
  only because access points carry river miles, snapping and float-endpoint
  logic a lake ramp has no use for; the link is what keeps one place one
  identity. A later unification is possible; a duplicate pin is not.
- `lake_status_observations`, keyed by **source area**, not by launch:
  `source` (`usace_recreation`, `state_agency`, `operator`), the source's
  area identifier (`recreationBoundaryIdpk` for the Corps layer), `status`
  (`open`, `partial`, `closed`, `unknown`), `notes`, and three timestamps:
  - `source_updated_at`: when the agency says it updated the record, if it
    says (the Kansas City layer's `last_edited_date`, AGFC's
    `last_verified_date`, a date a note states; null for the Corps
    recreation layer);
  - `first_observed_at`: when Eddy first saw this status value for this
    area;
  - `last_checked_at`: when Eddy last successfully retrieved it.
  A launch shows an area's status only through a reviewed
  `lake_launch_areas` link (one launch can sit inside one Corps area; a
  marina's ramp inside a multipurpose area is the common case). The display
  date is `source_updated_at` when present and "update date unavailable"
  when not; `first_observed_at` is never shown as if it were the agency's
  date.
- `AgencyProvider` grows `usace_recreation` and `nwk_ramps` so the existing
  snapshot, validate, stage, review loop ingests both layers with the same
  refusal rules (complete snapshots only, source identity by GUID or
  `recreationBoundaryIdpk`, curated places never overwritten).

**Existing seams that take a fourth kind in one entry each, when their
phase arrives and not before:** `StarKind` in `packages/eddy-sync`,
`EMBED_KINDS` in `src/lib/embed/options.ts`, `ConditionsKind` in
`conditions/directory.ts`, iOS `KindMarkKind`, and a `starred_lakes` table
keyed by slug and validated against the registry, as `starred_dams` is.

**Lake trend:** `DamHistoryMetric` is `generationFlow | release` today.
Adding `poolElevation` to the hourly history cron is what gives every lake
a 24-hour and 7-day line from Eddy's own record; it is also the only way a
Kansas City lake (Truman, via Ameren's daily number) gets a trend at all.
`sync-dam-history`'s expected-stream accounting must grow with it, or the
monitor goes `partial` on day one.

**Wire contract:** the lake content ships as an optional `lake` block on
`DamSnapshot` first, so the web can build and change it while iOS ignores
the unknown field, exactly as `generationForecast` established. The block
is promoted to its own `/api/lakes/<slug>` response when a lake earns a
page. iOS draws it only once the shape has stopped moving (§4, step 3).

---

## 4. The order of work

Estimates are relative to the dam work already shipped. Each step has a
gate that can say no.

### Step 1 — Phase 0, now, alongside the dam audit's items 1–3

The research asked for a focused feasibility audit first, and the
measurements above say why. It runs in parallel with the audit's P1 fixes,
the `/dams` index and the explainer content; none of it touches a shipped
page.

1. **Record the Corps recreation layer daily** for all 414 projects with a
   script under `scripts/` (`probe-usace-recreation.ts`), storing each
   area's status fields and notes by `recreationBoundaryIdpk` with the three
   timestamps from §3. What this measures is **which projects maintain the
   fields at all** (a status that changes was edited; one that never changes
   may be live or abandoned), whether `PrevBoat` moves when `Boat` does, and
   whether notes are ever edited. It does **not** establish that an
   unchanged value is current, and nothing in the product treats it as if
   it did. The script also parses dates out of `Notes` and marks a record
   stale mechanically when the note's own date is in the past, so "until 1
   March 2022" flags itself. **Gate:** per project, the layer is classed as
   maintained (status edits seen), static (none seen) or stale (dated notes
   in the past); only maintained projects' statuses render in the pilot, and
   always with the §2.3 label.
2. **Verify the Kansas City ramp elevations** at Truman and Stockton against
   the pool elevations Eddy already holds (Truman from Ameren; Stockton from
   nothing, which is itself a finding), against the Corps' posted ramp
   tables where a human can read them, against the two Lake of the Ozarks
   ramps misfiled under Truman, and against the odd entries (Talley Bend's
   724–727 band). Confirm per ramp that the low value is the ramp bottom and
   the high value is the closure elevation, as the layer documents, and
   decide the display rule for ramps with neither. **Gate:** the documented
   semantics hold on at least 90% of Corps-managed ramps with values.
3. **Spatially join `agency_gis_features` to Table Rock and Truman** (AGFC
   by `waterbody`, MDC by proximity to the lake polygon from 3DHP), match
   each candidate against existing access points so one place stays one
   identity, and produce the review queue: name, agency, type, coordinates,
   verification date, nearest Corps recreation area. No publication.
4. **Probe `Hartwell.Energy-SCHED` live** and the equivalent at Thurmond.
   If it is a forward hourly schedule, the Savannah chain is a generation
   product and step 4 below is larger and better than planned.
5. **Write the ADR**: lake as entity, the status vocabulary and its
   provenance labels, the three timestamps, the datum rule, launch methods
   versus amenities, the one-identity rule, entrance-is-not-a-launch. Record
   §7 so it is decided rather than drifted into.

### Step 2 — Pilot on Table Rock and Truman, web first

Two lakes, chosen because together they exercise everything the first wave
will meet. Table Rock has the busiest dam page, strong generation data, and
ramps that come from three sources at once (MDC on the Missouri side, AGFC
on the Arkansas side, the Corps layer on both). Truman has the delayed pool
reading, 45 ramps with elevation thresholds, two misfiled ramps and no CWMS
at all.

- Registry entries and `lakes` rows; `poolElevation` in the hourly history;
  the "On the lake" section on both dam pages with the current elevation,
  the 24-hour and 7-day change, and the operating range where documented
  (Table Rock publishes `%-Flood Pool`; Truman's conservation and flood
  pool come from the registry with a source).
- Launches from the step 1 review queue, approved one by one with the
  existing access-point review workflow, rendered as a list and map layer
  filtered `All`, `Trailer`, `Hand launch`. Every launch shows its agency,
  method, amenities and, where a reviewed area link exists and the project
  is classed maintained, the §2.3 status line with its provenance label.
- Truman's ramps carry the elevation cautions in §5 wording, with the pool
  dated "as of yesterday", because that is what Ameren's number is. That
  constraint is a feature of the pilot, not a defect.
- Confirm the experience on mobile web before any iOS work. The wire block
  is optional and iOS ignores it.

**Gate:** each lake has a verified identity, a live pool series with a
trend from Eddy's own history, and at least one reviewed launch with a
method. An operating range, an official status source and a target launch
count are **not** gates; what is missing renders honestly or is omitted.

### Step 3 — The remaining four first-wave lakes, then iOS

Bull Shoals, Beaver, Norfork, Texoma, on the pilot's model.

- Texoma is the breadth test: 121 Corps areas, 105 with no `Boat` status,
  and Texas Parks and Wildlife and Oklahoma ramp lists that are web pages,
  not layers. Expect Texoma to ship with launches and `Status unknown`
  almost everywhere, which is the honest state.
- Once the wire block has stopped changing, iOS draws the same section on
  the dam screen from the same fields, and `StarKind` gains `lake`.
- Evaluate dedicated `/lakes/<slug>` pages on content quality and search
  demand (export Search Console for lake queries first, as the audit asked
  for dam queries). Table Rock is the obvious first candidate.

**Gate:** the four lakes pass the step 2 gate; iOS parity waits for a
stable contract, not a date.

### Step 4 — Geographic expansion

In order, each lake needing a verified live pool series and a defined user
purpose before it publishes:

- **DeGray, Narrows, Blakely Mountain** as lake-first entries: a new
  `UsaceOffice` member `MVK`, the `DCP-rev` hourly pool spelling and daily
  `Manual` flows marked `dailyMean` in `resolve.ts`, no powerhouse claim (no
  `nameplate`, no `generationOnCfs`, no pattern strip). Each declares its
  `tailwaterFishery` (trout at all three) and gets AGFC's launches from the
  inventory already held. Their dam pages exist because the registry drives
  them, titled for what they carry: lake level and releases, not a schedule.
- **Oologah, Skiatook, Kaw, Wister** only after
  `scripts/discover-usace-locations.ts` finds their SWT four-letter codes
  (name probes return nothing, as `dam-expansion.md` predicts). None has a
  river Eddy carries below it; they are lake pages for Tulsa-area boaters
  and the first test of whether a lake without a dam story earns traffic.
- **Hartwell, J. Strom Thurmond, Lake Lanier (Buford), Allatoona**, in that
  order: the two SAS projects share one vocabulary and both carry hourly
  generation; the two SAM projects carry the richest lake data (guide curve,
  storage, tailwater temperature). Prerequisites, all already priced
  elsewhere: `timeZone` on the dam and lake registries threaded through
  `shared/dam-schedule-copy.ts` and the DST anchoring in `DamPatternDay`
  (survey §2, scaling plan F4); `state` widened to GA and SC; SAS and SAM
  spellings in `resolve.ts` with `scripts/check-usace-resolver.ts` run before
  shipping; the datum rule exercised by Buford's published offset. No
  eastern river is required for a lake page, which is what makes this
  cluster reachable before the TVA prerequisites are met. **Gate:** the
  timezone work ships with a test that renders a Hartwell day in Eastern
  time and a Table Rock day in Central from the same code path.

### Step 5 — Notifications, embeds, national providers

- **Starred-dam notifications first.** `TAILWATER_PLAN.md` step 6 and the
  audit's item 4 ("tomorrow's schedule is posted", "generation starts in
  the next hour") are not delayed by this plan; they share the delivery
  path every lake alert will use and their audience exists today.
- Lake-level alerts (pool crosses a level the user sets, or leaves the
  operating range) and status-change alerts (a maintained source's status
  changes, using `first_observed_at` of the new value as the event) on
  starred lakes.
- A `lake` embed kind: pool, trend, operating range, and the launch
  advisories for one lake, for marinas, campgrounds and tourism sites. The
  dam widgets have no partner installs after a season
  (`DAM_PRODUCT_AUDIT_2026-11-09.md` §1); the lake card is the first one
  with an obvious host.
- Reclamation through RISE (Mead, Powell, Shasta, Folsom, Flaming Gorge,
  New Melones, Grand Coulee; Oroville is a state project and is not in
  RISE), with California State Parks' launch notices as the status source
  for Folsom. Mountain and Pacific time ride on the step 4 timezone work.
- TVA, when it serves.

---

## 5. Rules that hold across every step

- **Three timestamps, never conflated.** `source_updated_at` is the
  agency's date and the only one a reader sees as such; `first_observed_at`
  is Eddy's; `last_checked_at` is the fetch. A status with no agency date
  renders as "Agency lists as <status> · update date unavailable". Nothing
  derives currency from how long Eddy has watched a value stay the same.
- **Preserve the source's timestamp on readings.** Every pool reading
  carries the time the source stamped it; a day-old Ameren pool says so.
- **Never mix vertical datums.** A lake's pool, its operating range and its
  ramps' elevation thresholds render in one datum, named on the page. A ramp
  threshold whose datum is unknown is not compared with the pool.
- **Observed, scheduled and forecast stay apart**, as `dam-types.ts`
  already requires. A guide curve is a target, drawn as one, never as a
  reading. Ameren's anticipated discharge and any `Energy-SCHED` series
  are plans.
- **An entrance is not a launch, and an area status is not a ramp status.**
  Recreation-layer points discover areas and carry status for the area; a
  launch pin comes from a ramp layer, an agency facility layer, or a reviewed
  placement, and says which; an area's status reaches a launch only through
  a reviewed link.
- **A computed caution never promotes a status and never says
  "available".** The wording is fixed:
  - Low-water caution: *"The latest lake level is below this ramp's
    published lower elevation. Launching may be difficult or unavailable.
    Based on published elevation thresholds, not an official closure
    report."*
  - High-water caution: *"The latest lake level is above the elevation at
    which this ramp is closed. Based on published elevation thresholds, not
    an official closure report."*
  Slope, sediment, obstructions, dock placement, vehicle clearance and
  temporary closures are not in the data, and the wording does not pretend
  they are.
- **`Partial` is "Limited access".** It is never shown as open, closed or
  unknown.
- **One place, one identity.** A lake launch that is also an access point
  links to it and borrows its identity; no second pin, photo set or
  favorite.
- **No "normal" without a published curve or a documented pool.** Where
  neither exists, the page shows the number and the trend and says the
  operating range is not published.
- **Nothing publishes from an incomplete snapshot.** The agency GIS
  refusal rules (complete inventories, stable identities, curated rows
  untouched) apply to the two new providers unchanged.

---

## 6. What this plan deliberately does not do

- Add dams for their own sake. The audit's "not recommended now" stands;
  every dam entry in step 4 is there because it carries a lake someone
  boats on, and it ships as what it is.
- Replace, rename or redirect any `/dams/...` URL.
- Start tables, favorites, alerts and new pages simultaneously. Each seam
  opens in the step that needs it.
- Reclassify existing river access points by machine.
- Build a navigation, bathymetry or depth product, or license one.
- Treat the National Hydrography Dataset as maintained; lake geometry
  comes from 3DHP when a polygon is needed, and only then.
- Promise TVA before TVA serves a page to a server.

---

## 7. Decisions, recorded 2026-11-09

| Decision | Verdict | Direction |
| --- | --- | --- |
| Lakes as first-class entities | Approved | Dams and lakes stay separate; every existing dam URL and chart is preserved. |
| Corps status freshness | Modified | An unchanged value observed for three weeks is not evidence it is current. Three timestamps (§3); display "Agency lists as <status> · update date unavailable" when the agency gives no date; `Partial` is "Limited access". |
| Implementation order | Approved | Phase 0 runs now, alongside the dam audit's items 1–3; the pilot follows them. |
| Hand-launch vocabulary | Approved with changes | Add `hand_launch`; do not reclassify existing gravel bars automatically. |
| Tailwater versus lake priority | Approved | Tailwater leads on the trout dams; lake leads on lake-focused destinations; neither buries the other, and the two destinations link both ways. |
| Rollout size | Modified | Table Rock and Truman first, web first; the other four and iOS after the contract is stable; dedicated lake pages on content and demand, not on status-source coverage. |
| Launch model | Modified | One physical launch, one identity: `lake_launches` links to an existing access point where the place already exists; launch methods (`trailer`, `hand`) are separate from amenities. |
| Gates | Modified | Required: verified identity, trustworthy measurements, reviewed launches. Optional: operating range, status source, launch count. Missing optional features render honestly or are omitted. |
| Ramp elevations | Modified | Thresholds produce the two cautions in §5 wording, never "launch available". |

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
| USACE NWK_Boat_Ramps layer | metadata, counts, Truman features | 224 ramps, 18 lakes, 153 with `elev_low`, Truman 45, Stockton 24; per-feature `last_edited_date`; `elev_low` documented as ramp bottom, `elev_high` as closure elevation |
| Reclamation RISE | `location?search=Folsom`, `catalog-item?search=Lake Mead elevation` | 406 with `Accept: application/json`; 200 with `application/vnd.api+json` |
| TVA | `tva.com/environment/lake-levels/norris` | 403 |
| RIDB | `facilities?limit=1` without key | 401 (key required, as expected) |
| USACE Savannah District site | Hartwell boat-ramp page | 403 from this environment |
| Repo | `agency-gis/2026-10-29/*.json` | AGFC and MDC lake ramp counts in §1.6 |
