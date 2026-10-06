# Eddy Read accuracy boundary

Both report generators use `report-facts.ts` for the authoritative condition,
matching-unit optimal-band comparison, prompt facts and post-generation checks.

## Classification and units

The condition uses the shared website-compatible classifier, including its
existing missing-measurement fallback. This is a deliberate compatibility choice:
we are not changing the SQL classifiers or introducing a migration in this PR.
The Read's numeric optimal-band comparison is stricter: missing discharge for a
cfs band, or missing stage for a feet band, makes the comparison unavailable.
Never use the other measurement to claim below/within/above that band.
Official flood-stage overrides remain independent of recreational thresholds.
A Dangerous fallback omits the optimal-band sentence even if discharge is within
that band. An editorial danger threshold is not an official closure order.

## Geographic scope

For sections with a start river mile, the loader delegates gauge selection to
`get_river_condition_segment`, the same database resolver used by the website.
That resolver handles reach overrides, upstream selection and downstream/primary
fallbacks. Without a mile, an explicit assigned station can still be resolved.
A failed or unresolved lookup never establishes a section assessment: its Read
uses a station-specific fallback saying that the section is not assessed.
Static local knowledge does not establish current conditions elsewhere.
Section targets and row persistence are unchanged; sections resolved by the RPC
can receive normal generated Reads. Unused primary-gauge snapshot loading has
been removed from secondary-gauge target discovery.

## Validation and formatting

The guard checks all three prose fields and replaces a rejected response as a
whole. Explicit condition labels and capitalized canonical rating names are
checked; ordinary lowercase “flowing,” “good conditions for a float,” and NWS
“flood conditions” are not treated as assignments of an Eddy rating. The prompt
asks for explicit condition labels when naming the computed rating.

Negation and modal qualifiers must govern the assertion; incidental weather
phrases such as “with no rain in sight” cannot exempt a present assertion.
This is a deliberately narrow guard, not a general English/geographic parser.
Arbitrary paraphrases are not guaranteed to be validated.

Prompts format stage to at most two decimals and discharge to whole cfs, with
thousands separators. The guard accepts raw readings, stage rounded to one or
two decimals, and discharge rounded to whole cfs or the nearest ten. Classification
and band relation always use the unrounded data. Bounds retain their precision.

## Alerts and fallback work

Both generators fetch relevant active NWS flood alerts before choosing a fallback.
Expired alerts are removed. Fallbacks lead with a bounded alert summary; warnings
precede watches, repeated event types are collapsed, and overlapping/long county
lists become “the river area.” A gauge rating does not cancel an alert. Alert
lookup failures are logged, never described as an all-clear. River-area matching
uses the existing filter, not station-level flood-boundary verification.

Unavailable ratings and unresolved sections skip the paid model call. River
fallbacks also skip local knowledge, trajectory and precipitation processing.
Weather fetching remains because it supplies the separate returned weather
summary. Published fallback sources exclude discarded model context.

## Rollout

No production data, SQL functions, model settings, or saved reports are changed.
After deployment, inspect fresh Current/Van Buren Reads and compact/social text.
The October 5 example (2.57 ft, 756 cfs; band 1,190–2,700 cfs) must remain Good
and below optimal, with no unsupported current Montauk/Akers claims.
