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

An unsupported section gets a named station observation, explicitly saying the
section is not assessed. A river with no usable gauge still gets a location-based
unavailable fallback with relevant alerts and the separate weather summary. It
never invents a station or pays for a model call. Section-generation target
selection and row persistence are unchanged; disabling unused targets is separate.

## Structured claims and prose

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

## Rollout

No production data, SQL migration, model switch or saved-report regeneration.
After deployment, inspect fresh Van Buren and Black tailwater Reads, their compact
versions, missing-gauge reports and alert attribution. The original 2.57 ft /
756 cfs example must remain Good and below its 1,190–2,700 cfs optimal range.
