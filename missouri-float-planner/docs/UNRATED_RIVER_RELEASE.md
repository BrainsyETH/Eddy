# Releasing a river with measurements but no recreational rating

An unrated river shows its measured stage/discharge, timestamp and hydrograph.
It has no recreational condition bands. Plans still include distance, access
and shuttle information; any float time is labeled **Typical float time** and
uses published typical times or normal vessel speeds, without a live-flow
adjustment. Unknown conditions do not qualify for the current floatable filter
or Today recommendations. Official flood-stage overrides continue to apply.

## Explicit release choice

The pending `explicit_unrated_river_release` migration adds
`rivers.condition_rating_mode`, defaulting existing rivers to `rated`. No river
is activated, reclassified or recalibrated by applying the migration.

For a reviewed unrated dossier:

- Set `conditionRatingMode` to `unrated` and the conditions readiness review's
  `ratingMode` to `unrated`, with its reviewer, date and evidence.
- Keep the existing owner `SIGNED-OFF` requirement. Do not mark evidence verified
  merely to pass ingestion. The conditions evidence is acceptance of the
  measurements-only presentation, not a claim of calibrated floatability.
- Name an explicit `primaryGaugeSiteId`; give each representative gauge an
  explicit `measurementUnit` (`ft` or `cfs`) supported by provider metadata.
- Leave section thresholds empty. Retain historical/research thresholds in
  research documents rather than inserting them as a live ladder.
- Stage only while inactive. The importer refuses retained thresholds on
  existing gauge links outside the write plan instead of silently deleting
  those links. For planned measurement links it clears both primary and
  alternate recreational anchors, and retains official flood metadata.
- Complete all the existing corridor, legal-access, gauge, conditions, hazard
  review and routing criteria. A fresh primary measurement in its selected
  unit is still required. The separate tailwater pilot gate still applies.

The importer stages links and stores the policy but never activates a river.
The activation RPC requires matching conditions-review mode and rejects any
recreational anchors left on an unrated river's linked gauges. Its preview and
failed-batch rollback behavior is unchanged. Omitting a mode retains the rated
policy; an empty ladder by itself never grants an activation exception.

## Deployment and verification

1. Deploy the shared-classifier, planner, agent and web changes. Ship the iOS
   presentation in the next app build/update; existing clients understand the
   unchanged `unknown` code but lack the new typical-time presentation.
2. Apply the migration through the normal reviewed deployment, record the
   production-assigned version and rename the file only if it differs. Move its
   ledger line from pending to applied, run `make check-db`, and regenerate
   database types from the deployed schema. The new policy column is used by
   operator scripts and validation, not a required field on public payloads.
3. After the dossier and exact endpoints are approved, run the ordinary ingest
   dry run and activation preview. Review all findings before applying the
   activation. Confirm raw readings remain visible and no positive condition
   verdict appears across the river page, planner, iOS and agent tools.

Tests execute the full new validator and activation RPC in PGlite with geometry
functions replaced by test doubles; they verify the rating policy, freshness,
review matching, conflict rejection, preview rollback and tailwater exclusion.
They do not validate production PostGIS geometry. Existing route tests cover
published and computed typical-time parity, fresh reading preservation, and
unchanged dangerous/regulated withholding.

## Elk status

Elk is not opted into this mode by this PR. Its dossier remains unsigned and
inactive. The cleanup migration/imports, verified private bank and road pins,
above-dam planner eligibility and final release review remain separate work.
The Tiff-to-Noel model marks remain research-only. Operator questions and the
observational diagnostic are in the Elk release review merged with #1412.
