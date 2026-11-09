# 0019 — A lake is an entity, and what it reports carries its agency's date

Status: active · 2026-11 · decided in
`missouri-float-planner/docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md` §7, after
review; the Phase 0 evidence is `LAKES_PHASE0_AUDIT_2026-11-09.md` beside it.

## Context

Eddy's dam pages answer "when do the units run". The lake behind each dam is a
`lakeName` and two metrics on the dam. Lake visitors ask different questions
(is it rising, where can I launch, what is closed), and the sources that answer
them are uneven: the Corps' recreation-area status layer is maintained by
project staff at very different cadences; the Kansas City ramp layer publishes
ramp-bottom and closure elevations, not usability; agency ramp inventories Eddy
already holds name a waterbody but not a lake Eddy has. The risk is not
architecture. It is telling someone a ramp is usable on the strength of a
status nobody has looked at since 2022.

## Decision

1. **A lake is an entity, separate from its dam.** A code registry carries its
   identity, controlling structures (a list with roles), pool source, datum
   and optional operating range. Dam URLs, titles and charts are unchanged.
   Dam pages lead with generation and the water below; lake surfaces lead with
   elevation, launches, facilities and restrictions; they link both ways.
2. **Three timestamps, never conflated.** `source_updated_at` is the agency's
   date and the only one a reader sees as such. `first_observed_at` is when
   Eddy first saw a value; `last_checked_at` is the fetch. A status with no
   agency date renders as "Agency lists as <status> · update date
   unavailable". Watching a value stay the same proves nothing about it.
3. **The Corps' vocabulary is kept.** `Reported open`, `Limited access` (the
   source's Partial), `Reported closed`, `Seasonal closure`, `Status unknown`.
   Partial is never folded into open or closed.
4. **A status belongs to the recreation area, not the ramp.** The area's point
   is an entrance; it is never a launch pin, and its status reaches a launch
   only through a reviewed link. Measured 2026-11-09: entrances sit 500 to
   1,650 m from the ramps that share their names.
5. **Elevation thresholds produce cautions, never clearance.** A ramp's
   published bottom and closure elevations against the pool, in one named
   datum, yield a low-water or a high-water caution in fixed wording that says
   it is based on published thresholds and not an official closure report.
   Missing thresholds mean "not published", not "fine".
6. **One physical launch has one identity.** A lake launch that is already an
   access point links to it and borrows its name, photos, favorites and
   facilities. Launch methods (`trailer`, `hand`) are a human decision and are
   separate from amenities; existing river access points are not reclassified
   by machine.
7. **Gates require identity, measurements and reviewed launches.** An
   operating range, a status source and a launch count are optional and render
   honestly or are omitted.

## Consequences

- `scripts/lakes/recreation-status.ts`, `nwk-ramps.ts` and `launch-queue.ts`
  implement 2 to 6 as pure, tested functions before any page exists; the fixed
  caution wording and the provenance line live there, and a test fails on
  wording that says "available".
- The daily ledger workflow writes to a data branch, never to production or to
  `main`; it is evidence, not a feed.
- The pilot is Table Rock and Truman on the web; iOS follows a stable wire
  block; the remaining lakes and new districts follow the plan's order.
