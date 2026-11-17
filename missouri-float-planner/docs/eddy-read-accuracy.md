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
  review. `20261117200000_twenty_one_stretches_read_their_own_gauge.sql` is
  the pattern: it asserts in the same statement that no put-in changed gauge,
  and `scripts/stretch-gauge-migration.test.ts` runs it against a fixture.

A stretch with no gauge on it may use the nearest one when that is the only
gauge or the closest. A gauge below a stretch can read floatable while the
stretch is thin; the stretch's block in `EDDY_KNOWLEDGE.md` is where that is
said.

An unsupported section gets a named station observation, explicitly saying the
section is not assessed. A river with no usable gauge still gets a location-based
unavailable fallback with relevant alerts and the separate weather summary. It
never invents a station or pays for a model call. Section-generation target
selection and row persistence are unchanged; disabling unused targets is separate.

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
- **Recent rain.** Three states, never merged: a measured amount, a measured
  zero ("none reported at <weather point> in the past 3 hours"), and no
  measurement. Each names the weather point. It is one point, not the
  watershed above the gauge, and the prompt says so.

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
Only river and section Reads are recorded; secondary-gauge commentary
(`generate-gauge-update.ts`) and the statewide summary are not.

`npm run audit:eddy-reads` prints the current model-written and code-written
counts, fallback causes from the log, knowledge-file reach coverage and
malformed prompt inputs. It is read-only.

## Rollout

No production data, SQL migration, model switch or saved-report regeneration.
After deployment, inspect fresh Van Buren and Black tailwater Reads, their compact
versions, missing-gauge reports and alert attribution. The original 2.57 ft /
756 cfs example must remain Good and below its 1,190–2,700 cfs optimal range.
Prompt changes take effect for newly generated Reads after deployment; saved
Reads retain their wording until refreshed. Review a fresh batch across river
and secondary-gauge Reads for useful, varied openings and clear geographic scope.
