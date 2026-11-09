# Lakes Phase 0 — feasibility audit, 2026-11-09

**Status: measurements + gate verdicts, first run.** Step 1 of
`LAKES_AND_LAUNCHES_PLAN_2026-11-09.md`, executed the day the plan was
approved. Every number here was produced by a script in `scripts/lakes/` from
a complete download made that day; the outputs are in
`scripts/ingestion/lakes/2026-11-09/` and the recording continues daily
through `.github/workflows/usace-recreation-ledger.yml`. The decisions this
audit implements are ADR 0019.

**Verdict in one line:** the freshness problem the review raised is smaller
than it looked, because the Corps publishes a second copy of its
recreation-status layer that carries a per-area update date; the ramp
elevations check out against the lakes' pools except where they expose a
misfiled ramp; the launch inventory for Truman is nearly complete from
sources Eddy already holds, while Table Rock's is nearly empty because its
ramps are the Corps' own and no layer places them; and Hartwell and Thurmond
carry a day-ahead hourly generation schedule in CWMS.

---

## 1. Status freshness

### The finding that changes the question

The plan measured `Recreation/Recreation_Site/FeatureServer/0` and found
status fields with no dates. The same server hosts
`Hosted/RecreationSite_Status_gdb/FeatureServer/0`: the same 4,854 entrances
with the same `recreationboundaryidpk`, plus `date_updated`,
`days_since_last_update`, a `boat_ramp` count, `launch_lanes`,
`manmade_canoe_kayak_launch`, parking counts and a `psa_description`. Its
service metadata says it was last edited 2026-10-31.

| Measure (hosted layer, 2026-11-09 19:11Z) | Value |
| --- | --- |
| Areas | 4,854 across 410 projects |
| Areas with a status or boat status | 2,623 |
| …of which carry `date_updated` | 2,623 (100%) |
| Age of `date_updated`: ≤30 d / ≤90 d / ≤365 d / ≤2 y | 637 / 794 / 839 / 359 |
| `status` values | Open 2,204 · Seasonal Closure 140 · Closed 87 · Partial 192 |
| `boat` values | Open 1,255 · Closed 159 · Partial 15 |
| Areas with `boat_ramp` ≥ 1 | 2,912; 2,905 report launch lanes |
| Areas with a canoe/kayak launch | 202 (none at the six first-wave lakes; 1 at Lanier, 2 at Allatoona) |
| Notes | 510; 46 state a date, every one of them 2017–2023 |

Compared with the public layer the plan measured: the two disagree on the
boat status of 257 areas, and 210 entrance points sit more than 50 m apart
between them (one by 1,100 km). The hosted layer is the edited source and the
one with provenance; `scripts/lakes/recreation-status.ts` reads it and keeps
the public layer only as a cross-check. Nineteen areas carry an empty
boundary id and are identified by the area id the layer carries beside it
(three of them are Lanier parks).

### Per-project classification from the agency's own dates

`record-usace-recreation.ts --report` classes every project from the newest
`date_updated` and from changes Eddy observes (none yet, one run): maintained
184, static 118, stale 52, unmaintained 56. The first-wave and candidate
lakes:

| Project | Areas | With boat status | Newest agency date | Ramp areas · lanes | Class |
| --- | ---: | ---: | --- | --- | --- |
| Table Rock | 38 | 16 | 2026-04-28 | 29 · 67 | static |
| Truman | 25 | 12 | 2026-10-16 | 20 · 55 | maintained |
| Bull Shoals | 38 | 11 | 2026-06-25 | 23 · 30 | static |
| Beaver | 28 | 14 | 2026-08-12 | 16 · 25 | maintained |
| Norfork | 30 | 15 | 2026-06-26 | 21 · 34 | static |
| Texoma | 121 | 16 | 2026-07-23 | 76 · 130 | maintained (109 days) |
| Stockton | 17 | 10 | 2026-10-14 | 13 · 47 | maintained |
| Greers Ferry | 32 | 16 | 2026-05-26 | 19 · 94 | static |
| DeGray / Narrows / Blakely | 26 / 22 / 41 | 11 / 9 / 16 | 2026-10-02 / 10-15 / 10-14 | | maintained |
| Oologah / Skiatook / Kaw / Wister | 19 / 11 / 16 / 9 | 9 / 7 / 10 / 0 | 2026-08-13 / 07-22 / 08-07 / 07-20 | | maintained |
| Hartwell / Thurmond | 103 / 118 | 34 / 34 | 2026-10-29 / 10-06 | 84 · 124 / 90 · 139 | maintained |
| Lanier / Allatoona | 75 / 82 | 29 / 15 | 2026-10-15 / 09-10 | 65 · 146 / 51 · 96 | maintained |
| Wolf Creek / Center Hill / Dale Hollow | 38 / 25 / 28 | 7 / 8 / 7 | 2025-09-29 / 08-29 / 08-29 | | stale |

The class is a summary; the date is the evidence, and the date is what a
reader sees. A status at Table Rock renders as "Corps of Engineers listing,
updated 2026-04-28" or not at all. Nothing is promoted for staying the same:
`recreation-status.test.ts` asserts that three weeks of identical reads leave
a project `static` and that one observed change makes it `maintained`.

### What the daily ledger now measures

`scripts/ingestion/lakes/usace-recreation-ledger.json` holds run 1 (one area
per line, 4,854 entries). The workflow commits each day's run to
`data/usace-recreation-ledger`. After three weeks it answers two questions
the source dates cannot: whether `date_updated` moves when a status moves
(so the date can be trusted as an edit stamp), and which projects edit at
all. It never answers "is this status current"; the date does, or nothing
does.

**Gate (plan step 1):** met on the first run for the projects classed
`maintained`, with the three-timestamp rule in force. Table Rock, Bull
Shoals, Norfork and Greers Ferry are `static`: their statuses may render only
with their April–June dates shown, and the pilot should expect a Table Rock
reader to see a six-month-old date. The three-week recording decides nothing
by itself; it checks the date field's behaviour.

## 2. Kansas City ramp elevations

`nwk-ramp-dossier.ts` checked all 224 ramps against each lake's documented
pools (Truman 706.0 / 739.6, Stockton 867.0 / 892.0, Pomme de Terre 839.0 /
874.0 ft NGVD29). The layer documents `elev_low` as the bottom of the ramp
and `elev_high` as the elevation at which the ramp is closed.

| Lake | Ramps | Both elevations | Flags |
| --- | ---: | ---: | --- |
| Truman | 45 | 22 | 23 `no_thresholds`; 2 `thresholds_below_this_lake` (Warsaw City Harbor, East Bledsoe Ferry: 645 / 677 ft, the Lake of the Ozarks arm below the dam); 1 `narrow_band` (Talley Bend high-water ramp, 724 / 727) |
| Stockton | 24 | 15 | 9 `no_thresholds`; nothing else |
| Pomme de Terre | 14 | 14 | 2 `closure_above_flood_pool` (Pittsburg Area State Park and Nemo Marina, 834 / 960: 960 reads as "never closes", to confirm) |

What the numbers say: at Truman, 19 ramps carry exactly 704 and 724, two
feet below the multipurpose pool and eighteen above it. That is consistent
with the documented semantics and also looks like a lake-wide default rather
than a per-ramp survey; the district should be asked. The two misfiled
ramps are confirmed independently by the polygon join in §3 (594 m and
1,861 m off Truman, downstream of the dam). Feature edit dates are
2024-12-09 and 2025-01-15, so this source's `source_updated_at` is about a
year old everywhere.

Not done here: the comparison against the district's posted ramp tables.
`nwk.usace.army.mil` returns 403 to this environment, so that check needs a
person with a browser. The gate ("documented semantics hold on 90% of
Corps-managed ramps with values") cannot be scored until then; nothing
measured contradicts the semantics, and the 704 / 724 uniformity is the one
thing to ask about.

`rampCaution` and `RAMP_CAUTION_COPY` in `scripts/lakes/nwk-ramps.ts`
implement the plan's two cautions with fixed wording; a test fails on copy
that says "available" or "open", and on a pool compared across datums.

## 3. Launch review queues for Table Rock and Truman

`build-lake-launch-queue.ts` joined the stored AGFC and MDC inventories, the
Kansas City ramp layer and the Corps status layer to USGS 3DHP waterbody
polygons (Table Rock 32 + 137 km², Truman 82 + 96 + 22 km²), clustered
features within 75 m into places, matched places to Corps areas by distance
(≤400 m) or by name (≤5 km), and matched them to the access points a
read-only production query found inside the two lakes' bounding boxes.

| Lake | Places within 500 m | Sources | Linked to a Corps area | Linked to an existing Eddy access point | Filed under the lake but off the polygon | Corps ramp areas with no pin |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Truman | 37 | NWK 36 (24 ramps, 12 "Access"), MDC 1 | 11 (7 by name) | 0 | 8 | 6 |
| Table Rock | 6 | AGFC 6 | 1 | 1 (Romp Hole, Kings River arm, 1 m) | 0 | 28 |

**Truman is nearly complete.** The eight off-polygon features are the two
Lake of the Ozarks ramps (East Bledsoe Ferry, Warsaw City Harbor), Drake
Harbor (also below the dam), and five on the upstream arms (Grand River,
Deepwater Creek, Cross Timbers, Sac River, City of Roscoe) that sit beyond
the conservation-pool footprint the 3DHP polygon draws. The arm ramps are
real Truman ramps at higher pools; the review decides them, the queue lists
them. Six Corps areas still lack a pin, two of them municipal.

**Table Rock is nearly empty, and that is the finding.** Its 29 ramp areas
are Corps parks, Missouri State Park and marinas (Baxter, Big M, Cape Fair,
Campbell Point, Eagle Rock, Indian Point, Mill Creek, Old Hwy 86, Viola,
Aunts Creek and the rest); neither the Arkansas nor the Missouri agency
layer carries them, and the Little Rock District publishes no ramp layer (the
Kansas City layer is the only one on the server). The Corps status layer
gives each area's ramp count, launch lanes and entrance, which is enough for
a reviewer to place the pin from imagery, and 28 such placements is the
pilot's real curation cost. Three AGFC ramps at the head of the lake are
filed under "White River" (Beaver Lake Dam Site, Bertrand, Houseman) and
need a decision about which waterbody they belong to.

**Entrance is not a launch, measured.** Where a Corps area and a ramp share a
name, the entrance sits 442 m (Shawnee Bend), 514 m (Long Shoal), 634 m
(Cricket Creek), 785 m (Talley Bend), 817 m (Thibaut Point), 1,543 m (Berry
Bend) and 1,651 m (Sparrowfoot) from the ramp. The plan's rule stands with
numbers.

**One identity.** The only overlap with Eddy's existing access points is
Romp Hole on the Kings River arm; the Taneycomo endpoints sit below Table
Rock Dam and are not on the lake. The pilot will not create a duplicate pin.

**Gate (plan step 1, item 3):** the queue exists for both lakes; no
publication, no launch methods assigned (the queue leaves `launch_methods`
empty by construction).

## 4. Hartwell and Thurmond scheduled energy

Read live at 18:40Z: `Hartwell.Energy-SCHED.Total.1Hour.1Hour.Raw-SHEF_SAS`
and the Thurmond equivalent carry hourly MWh through 05:00Z the next day
(midnight Eastern), with nonzero values in hours still ahead (Hartwell 66 MWh
at 21:00Z and 52 at 00:00Z; Thurmond 139 at 00:00Z and 35 at 03:00Z). The
observed `Energy.Total` series carries zeros for the same future hours, so
anything reading it must slice at now, as the LRN forecast taught.

This is a day-ahead hourly generation schedule in CWMS for the Savannah
projects, in energy rather than flow, which is SWPA's shape with the
Cumberland's delivery. Not measured: when the next day's hours appear (SWPA
posts overnight and weekend sheets the evening before), and whether a
MW-to-cfs reference exists for the Hartwell units. Both belong to the
Southeast step; the daily workflow does not record this series, and should
before that step is designed.

## 5. The ADR

`docs/decisions/0019-lakes-are-entities-with-their-own-provenance.md`
records the seven decisions from the plan's §7 as rules the code now
enforces.

## What the pilot inherits

- The status surface for Table Rock will show April dates. That is honest
  and should be designed for, not hidden.
- Truman's launches come from the district layer with elevations; Table
  Rock's need about 28 reviewer placements from entrance, description,
  launch-lane count and imagery.
- Ramp cautions at Truman run against Ameren's day-old pool and a
  threshold set that is uniform across most ramps; the caution copy already
  says what the numbers are based on.
- The workflow needs no secret and writes to one data branch; enabling it is
  a merge.

## Appendix — files

`scripts/ingestion/lakes/README.md` lists every output and the commands that
reproduce it.
