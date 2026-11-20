# Eddy Read accuracy boundary

Both generators use `report-facts.ts` for authoritative report facts and rendering.

## Classification and units

River facts take the existing loader condition; they do not classify again.
Secondary gauges classify once using the same website-compatible classifier,
including its existing missing-measurement fallback. This PR does not change SQL
classification. Numeric band comparisons require the matching measurement: no
cfs means no cfs-band comparison, even if the shared classifier returned a rating.
Official flood-stage overrides remain independent of recreational thresholds.
A Dangerous fallback omits its optimal-band sentence. An editorial danger
threshold is not an official closure order.

## Geographic scope and missing gauges

Explicit curated station assignments take priority and are never erased by an
RPC failure or empty result. Without a usable curated link, positional selection
uses the website's `get_river_condition_segment` RPC. Selection and reach support
are separate: a non-curated station supports a section only with known section
start/end and gauge river miles inside [start, end). No proximity buffer is used.
If curation exists but its station cannot be loaded, a substitute does not inherit
curated support, even if it lies within the section.

### Connecting a stretch to a gauge

`river_sections.primary_gauge_station_id` is not private to the Read.
`get_river_condition_segment` uses the same column, with the stretch's mile
bounds, to choose the gauge that grades a float plan: an assigned stretch
overrides positional selection for every put-in inside its bounds. Three rules
follow.

- Set the gauge and both bounds together. An assigned stretch with no bounds
  matches every mile on its river.
- Bounds use the stored `river_mile_downstream` of the access points at the
  stretch's ends, because that is the scale the planner passes in. On the
  Bourbeuse, Meramec, St. Francis, Buffalo and Black those miles are offset
  from the river line by 7 to 30 miles, so a caller that passes a map point
  resolves a different mile from one that passes an access point's stored
  mile. Bounds on those rivers cannot be right for both until the miles agree.
- Before assigning, compare the gauge each approved access point resolves to
  with and without the change, by stored mile and by map point. A change that
  moves a put-in to another gauge is a planner change and needs its own
  review. `20261117211017_twenty_one_stretches_read_their_own_gauge.sql` is
  the pattern: it asserts in the same statement that no put-in changed gauge,
  and `scripts/stretch-gauge-migration.test.ts` runs it against a fixture.

A stretch with no gauge on it may use the nearest one when that is the only
gauge or the closest. A gauge below a stretch can read floatable while the
stretch is thin; the stretch's block in `EDDY_KNOWLEDGE.md` is where that is
said.

A spring or tributary between a gauge and a put-in is the other thing position
cannot see. The planner takes the nearest gauge at or above a put-in, so a
gauge just above a large spring grades everything below it from water that has
not met the spring. The Jacks Fork was that case: the Alley Spring gauge sits
above the spring's inflow, and the put-ins from the spring to Eminence read
Too Low on the days the stretch floated. `20261117221408` adds a stretch from
the spring to Two Rivers graded by Eminence, and `20261117225734` makes
Eminence the river's main gauge. Check a suspected case with the readings
before writing anything: where gauges sit either side of an inflow, the gain
between them at low water is the inflow. The Niangua has the same shape at
Windyville and Bennett Spring. `20261118214137` makes Tunnel Dam its main
gauge: its header records the owner's decision on the top of that gauge's
ladder (Dangerous at the NWS action flow, a provisional High), and shows how
two stretches can be right on a river whose stored access miles are offset
from its line.

Two gauges on a river are the third case. With no stretch, a stored mile falls
to the river's main gauge and a map point takes the nearest gauge by distance,
so an access page and the planner can grade one put-in from two gauges.
`20261119184853` adds ten stretches on seven rivers so both agree, with each
boundary at the creek that changes the river. Its header records the one
put-in that cannot be fixed that way (Jewett, on the St. Francis, whose chart
mile equals a whitewater put-in's planner mile) and how one range serves both
scales on the Bourbeuse. An unrated second gauge is assigned like any other:
its put-ins then show a reading and no condition on both paths, instead of
another gauge's condition on one of them.

A tailwater whose main gauge is the dam's release is the fourth. The release
is measured at the dam, so without stretches every put-in reads it, however
far downstream. `20261120142104` adds three stretches on the White below Bull
Shoals Dam: the release for the first 24 miles, the gauge near Norfork down to
the North Fork, and Calico Rock below it. A second dam joining is where
position misleads: the gauge near Norfork is the nearest one upstream of Red's
Landing, but it sits above the North Fork and never sees Norfork Dam's water.
The same migration gives the links their miles, because the float plan's check
of gauges inside a float reads only links that carry one; without a mile a
gauge's flood stage cannot reach a plan that passes it. Put-ins on the two
lower stretches show their own gauge alone, without the Bull Shoals release
beside it (owner, 2026-11-20): by then Crooked Creek, the Buffalo and Norfork
Dam's water have joined, so one dam's release no longer describes the river.

While stretch Reads are paused, an assignment has one live effect: the
planner's gauge for put-ins inside the stretch.

An unsupported section gets a named station observation, explicitly saying the
section is not assessed. A river with no usable gauge still gets a location-based
unavailable fallback with relevant alerts and the separate weather summary. It
never invents a station or pays for a model call.

### Stretch Reads are paused

Eddy does not write a Read per stretch. `STRETCH_READS_ENABLED` in
`src/lib/eddy/stretch-reads.ts` is `false`, so the daily pass and the
event-driven rewrites generate whole-river targets only.

They were paused on 2026-11-17 because no screen shows them. Every reader of
`eddy_updates` on the website and in the iOS app asks for river-level rows, and
nothing requests `/api/eddy-update/<river>?section=`. The pass had been writing
58 stretch rows a day, seven of them with a model call. What people see is the
river Read, each secondary gauge's Read (`generate-gauge-update.ts`), and the
planner's rating for a put-in.

The stretch code paths below remain, for the day a screen shows a stretch
Read. Turning them back on is that one constant.

## Structured claims and prose

River and secondary-gauge Reads lead with the most useful supported takeaway
for a floater: conditions, a meaningful measured change, or practical advice.
The summary and full text each name the reporting town or landmark within the
claim it qualifies; that geographic scope does not require a location-first
opening. Examples illustrate different sentence shapes, not reusable templates.
Active flood alerts and Dangerous advice retain priority. Each generation is
independent, so prompt guidance alone does not guarantee variety across a batch.

Both system prompts ask for the first line supplied in the facts:

    [CLAIMS] condition=good relation=below

A missing line is not a failure; a line that disagrees with the facts selects the
factual fallback. The line is removed before parsing and never published. The
model writes all three prose fields, including the condition statement, and they
are published as written. Code adds nothing in front of them; the factual text is
used only as the fallback. All three prose fields pass a narrow backstop for explicit condition labels,
literal present assertions, numeric reading/unit errors and the original screenshot
pattern. `Condition: Flood` maps to Dangerous in that backstop; a structured
condition must use the exact canonical code. Direct negated band assertions are
checked against the computed relation rather than skipped.

There is no general English tense parser or growing forecast-verb whitelist.
Forecasts such as “could climb” or “if the river drops” are not current assertions.
A valid claims header is not proof of correct prose: arbitrary paraphrases and
geographic inferences remain outside the narrow check. The prompt requires any
stated condition or band comparison to match the computed facts exactly. Real
sentence regression cases live in `report-facts.test.ts`.

Stage uses at most two decimals and discharge whole cfs in prompt/display text.
Validation accepts raw values, stage to one/two decimals and discharge to whole
cfs/nearest ten, using the same rounding conventions. Classification and band
relation use unrounded data; bounds retain their precision.

## Alerts and costs

Both generators gather relevant active flood alerts before selecting fallbacks.
Expired alerts are removed. Warnings precede watches; duplicate event types and
long/overlapping county lists are summarized to bound fallback text. A gauge
rating never cancels an alert. Missing/blank matching terms return no attributed
local alerts and log unavailable coverage; they never return all statewide alerts.
An empty list is not presented as an all-clear. Matching still uses the existing
river-area terms, not station-level flood-boundary verification.

Guaranteed fallbacks skip paid model calls, knowledge and trajectory work.
Weather fetching remains for the separate weather summary. Published fallback
sources exclude discarded model context. Unused primary snapshot queries are gone.

## Prompt inputs

Each input says what it measures, where and over what window, or it is left out.

- **River note.** `river_characteristics.river_note` reaches the prompt as
  "Gauge notes:". The river loader drops a note that is ingest bookkeeping
  (`Per-section hydro types: ...`) or carries an unrendered value
  (`=undefined`); see `src/lib/eddy/river-note.ts`. The `eddy_knowledge` trust
  check reports the same rows as `river_note_malformed`. The dossier ingest
  does not write the column.
- **Trend.** The 24-hour and 6-hour changes and the rate cover the past day.
  The peak and low are labelled with the number of days the returned readings
  span (`GaugeTrajectory.windowDays`), measured from the data, not from the
  number of days requested.
- **Weather and the days ahead.** Neither Read prompt carries the current
  weather or a forecast. Weather belongs in the app's Weather section (owner,
  2026-11-18): that section is rebuilt on every view, and a Read is written
  once and stored, so a forecast in the Read can be a day old and contradict
  the section beside it. The one exception is an `[OUTLOOK]` block naming the
  days rain is likely, at the same 70% threshold the Watch for section uses
  (`src/lib/eddy/material-outlook.ts`). With it, the Read may say once, in the
  full text and conditionally, that rain could change the reading. Without it,
  the Read says nothing about the days ahead. Not included: the NWS river
  forecast, whose grading lives in the outlook route. Flood alerts still reach
  both Reads through their own block and still lead.
- **Recent rain.** Three states, never merged: a measured amount, a measured
  zero ("none reported at <weather point> in the past 3 hours"), and no
  measurement. Each names the weather point. It is one point, not the
  watershed above the gauge, and the prompt says so.
- **Rain to river.** No Read is told how long rain takes to reach a gauge, and
  the prompt forbids stating it. Eight rivers used to carry a hand-set "hours
  from rain to gauge response" with no source; they were deleted on 2026-11-18
  after lag was measured from two years of storms
  (`scripts/research/rain-lag-2026-11`). Twelve gauges earned a measured
  time-to-crest range, held in `src/lib/rainfall/lag-release.ts`; it is used
  only by the Weather section, for those gauges, when rain is in the outlook,
  and is worded as what past rains did. Every other studied gauge has a
  recorded reason for having none, most often that the time varies too much
  from storm to storm. A gauge joins the list only through a locked study of
  the same kind. The eight per-river recovery rates (`drop_rate_note`, "0.3–0.6
  ft/day") were as unsourced as the lag numbers and were deleted on
  2026-11-19, on the owner's word. No Read is told a rate or a timeline for a
  river coming back down, and the prompt forbids stating one: the measured
  6- and 24-hour change is what the Read knows about how fast it is moving.

## Knowledge by gauge

`EDDY_KNOWLEDGE.md` is selected per consumer by `src/lib/eddy/knowledge.ts`,
so that each fact reaching a Read is about the water its gauge speaks for. The
file's own Format Rules say how to write it. In short:

- Text straight under a river's heading is true along the whole river and
  reaches every Read on it.
- `### Gauge: <name> {@site}` holds what one gauge sits on and speaks for. It
  starts with a `Sits` line (what enters above the gauge and what enters below
  it) and a `Speaks for` line.
- Reach notes carry the `{@site}` of the gauge that speaks for them.
- `### Towns` is for chat.

| Consumer | Gets |
| --- | --- |
| River Read | General, the river-wide block, the reporting gauge's block, reach notes tagged with it, and the other gauges' `Sits` and `Speaks for` lines under an "elsewhere, patterns only" header |
| Gauge Read | the river-wide block, that gauge's block, reach notes tagged with it |
| Chat | General and everything about the river in view, towns included |

`{unconfirmed}` on a gauge heading keeps a drafted block out of every prompt. A
river with no confirmed block for a gauge is selected as it was before gauge
blocks existed: the river-wide block, plus, for a gauge Read, any reach note
that names the gauge's town. All 49 gauge blocks on 25 rivers are confirmed as
of 2026-11-19; the three tailwaters carry none. Six rivers were confirmed with
the owner river by river. The other 30 blocks were confirmed, at the owner's
direction, from two checks: where each sizeable creek joins, read from the
national stream network (NHDPlus) and placed on Eddy's river lines, and which
gauge each approved put-in resolves to. `knowledge.test.ts` lists every
confirmed gauge and fails on a draft it does not expect, so a new block is a
deliberate change.

A second gauge's block says which of three states it is in. **Rated**: its own
levels. **Borrowed**: no levels of its own, with the gauge its put-ins are
graded by and how closely the two track (the Spring River at Imboden, on
Hardy). **Unrated**: no levels and no condition, only the reading, its
direction and NWS flood stage (the Spring River near Waco, the St. Francis near
Patterson). A main gauge's ladder is not carried to a second gauge by a flow
ratio: where trips have been logged at the gauge itself, they decide.

Confirm a gauge line from the readings where they can speak: with a gauge on
each side of an inflow, the gain between them at low water is the inflow. That
is how the Alley Spring and Windyville gauges were shown to sit above their
springs.

The daily `eddy_knowledge` trust check reports `knowledge_gauge_mismatch` when
the file tags a gauge the river is not linked to, or when a river has
confirmed blocks but none for its main gauge.

## Generation records

`eddy_updates` holds published text only and is pruned after 48 hours. Every
attempt to write a river Read also writes one row to `eddy_generation_log`
(`src/lib/eddy/generation-record.ts`): the structured inputs with their units
and timestamps, the prompt, the model's text as returned, what was published,
and hashes of the system prompt and injected knowledge beside the deployed
commit. Rows are kept 180 days. Nothing reads the table at request time, and a
failed write never changes what is published.

`outcome` is `model`, `fallback` or `error`. A fallback or error carries its
cause in `reason`:

| Reason | Decided | Meaning |
| --- | --- | --- |
| `no_gauge` | before the model | no reporting station resolved for the target |
| `no_reading` | before the model | a station, but no height or discharge |
| `no_rating` | before the model | a reading, but nothing to rate it against |
| `unsupported_section` | before the model | a rated reading from a station that is not on the requested stretch |
| `claims_mismatch` | after the model | the `[CLAIMS]` line disagreed with the computed facts |
| `contradiction` | after the model | the prose tripped the contradiction guard; the codes are in `contradictions` |
| `missing_api_key`, `empty_response`, `model_error` | n/a | nothing was published |

These are recorded, not yet worded differently for readers: the four
pre-model causes still publish the same factual fallback.

The table is created by `20261117041752_eddy_generation_log.sql`. Against a
database without it the generator logs one warning per process and keeps no
records.
Secondary-gauge Reads (`generate-gauge-update.ts`) are recorded in the same
table and told apart by `workload`: `river_update` or `gauge_update`. A gauge
row has no `section_slug`; its station is in `usgs_site_id`, and
`knowledge_blocks` lists `river` and each `section:<slug>` reach note that was
attached. The statewide summary is not recorded.

`npm run audit:eddy-reads` prints the current model-written and code-written
counts, fallback causes from the log, knowledge-file reach coverage and
malformed prompt inputs. It is read-only.

## Read checks

`npm run report:eddy-reads` scores published Reads against the rules their
prompts set and prints the pass rate per rule per day, or per week over a long
window (`-- --days 200 --by week`). It is read-only. Run it before and after a
change to a prompt or to `EDDY_KNOWLEDGE.md`; the change helped if the columns
moved. The rules live in `src/lib/eddy/read-checks.ts`:

| Column | A Read passes when |
| --- | --- |
| `sum<=120` | its summary is 120 characters or fewer |
| `read<=240` | its short Read is 240 characters or fewer |
| `no-nums` | its short Read quotes no reading, temperature or rain percentage |
| `no-fcst` | its short Read leaves the forecast to the Watch for panel |
| `no-wx` | no block describes the weather: sky, temperature or wind |
| `no-will` | no sentence states flatly that the water or weather will change or stay |
| `in-inputs` | every measurement appears in the prompt's facts with the same unit |
| `not-file` | no measurement appears only in the knowledge block of the prompt |

These are evidence, not a gate. They never change what is published; the
publish guard above stays narrow. The length limits are targets the owner set
for readability, not truncation points, so a long Read is counted and still
published.

`no-will` counts a sentence only when it says something will change or
persist: a set phrase ("no rain is on its way", "isn't going anywhere"), or
will / won't / going to with a verb of change or a time ahead. The future
tense for today's water ("you will be dragging", "the pools will be thin at
this level") is not a forecast and is not counted.

`no-wx` leaves "cold" and "clear" alone, because cold water and clear water
are the river, and it does not count rain that fell or could: that is river
news. On the last days the prompts still carried weather, 2026-11-17 and
2026-11-18, 20% of river Reads passed it, and 32% of gauge Reads over the nine
days to 2026-11-17. That is the number the prompt change is meant to move.

The two number rules need the prompt, so they show `-` for gauge Reads written
before those were logged. They compare value and unit only: a number that is
in the facts for another place still passes.

What no rule here catches is a claim about a place or a cause the inputs do
not support, such as a spring credited to a gauge that sits above it. That
needs a model grader, or a knowledge file that tags each fact with its gauge.

Baseline, 2026-11-17. River Reads are the 25 logged that day. Gauge Reads are
the 182 written from 2026-11-09 to 2026-11-17:

| | `sum<=120` | `read<=240` | `no-nums` | `no-fcst` | `no-will` | `in-inputs` | `not-file` | median Read |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| River | 96% | 48% | 80% | 88% | 76% | 100% | 100% | 250 chars |
| Gauge | 97% | 68% | 62% | 83% | 93% | - | - | 229 chars |

## Rollout

No production data, SQL migration, model switch or saved-report regeneration.
After deployment, inspect fresh Van Buren and Black tailwater Reads, their compact
versions, missing-gauge reports and alert attribution. The original 2.57 ft /
756 cfs example must remain Good and below its 1,190–2,700 cfs optimal range.
Prompt changes take effect for newly generated Reads after deployment; saved
Reads retain their wording until refreshed. Review a fresh batch across river
and secondary-gauge Reads for useful, varied openings and clear geographic scope.
