# Pilot data verification — November 9, 2026

These are real source observations and source/imagery research for launch candidates,
not the illustrative values in the layout screenshots. Target project:
`ilefwfpvphadsbptiaur` (Eddy / FloatMe production).

## Database and history

- Migration `20261109224918` applied. Both lake tables have RLS enabled,
  no client policies or grants, and service-role access. The repository
  migration ledger matches all live post-baseline versions; the live
  client-access contract returned no problems.
- `pool-readings.json` contains the 200 observations written by idempotent
  upsert on `(lake_slug, observed_at)`. `history-sources.json` records the
  original endpoint URLs, response status/type and fetch instant.
- Table Rock: 192 hourly CWMS readings, November 1 23:00Z through November 9
  22:00Z, 910.20–910.59 ft. Series
  `Table_Rock_Dam-Headwater.Elev.Inst.1Hour.0.Decodes-rev`, requested in feet.
- Truman: eight distinct Ameren daily reports, November 2 05:30Z through
  November 9 05:30Z, 705.10–705.42 ft. Converted with the application's
  `parseTrumanBlock`, preserving each report's Central-time observation
  stamp. Historical date requests return different dated reports.
- Both latest values match the existing production dam snapshots.
- This verifies the sources, parser, database write and recorded history.
  It does **not** claim that the new scheduled cron handler has run in
  production. Its first monitored production run remains a release gate.

## Owner-approved pilot launches

`launches.json` records the source URLs, coordinates, review notes and
research method. Codex checked agency records and georeferenced imagery.
Research alone did not satisfy ADR 0019 approval. The owner subsequently
accepted these six prepared candidates and their proposed trailer methods
in conversation; Codex recorded that explicit decision in production. No record
claims a ramp is currently open. Unknown fees and amenities remain unknown.

| Lake | Owner-approved launch | Coordinate basis |
| --- | --- | --- |
| Table Rock | Table Rock State Park | Official park ramp coordinates, checked against imagery |
| Table Rock | Moonshine Beach | Paved ramp mapped from georeferenced imagery; agency map identifies launch |
| Table Rock | Cow Creek | Paved ramp mapped from georeferenced imagery; agency map identifies launch |
| Truman | Long Shoal | Current USACE NWK ramp feature, checked against imagery |
| Truman | Sparrowfoot | Current USACE NWK ramp feature, checked against imagery |
| Truman | Thibaut Point | Current USACE NWK ramp feature, checked against imagery |

The Table Rock locations cover the Branson/dam end and Cow Creek; they do
not cover the whole reservoir. The Truman locations cover Long Shoal, the
northern main-lake arm and the Sparrowfoot end. `proposed_launch_methods`
retains the research suggestion (trailer for each); `approved_launch_methods`
and `owner-approval.json` record the owner's subsequent acceptance. This is
owner approval of the supplied research, not an assertion that the owner
independently inspected imagery or visited the sites.

Production access points were checked for existing identities. No existing
identity matched these six. The pending Romp Hole candidate remains linked
to its canonical access point, `9a1a7b6c-2476-4fc8-a512-740227fff6d7`.

### Approval correction

The earlier agent SQL had approved these six locations. That contradicted
ADR 0019. `restore-human-review.sql` returned exactly those six
unchanged records to pending review, cleared their approval timestamps and
methods, and preserved their research as proposals in the review notes.
The update checked both the original approval and last-edit timestamps so
it could not reset a later human edit. The read-back at that stage
confirmed **46 total rows, zero approved**: nine Table Rock candidates and 37 Truman candidates.
All six proposal notes are present. The other 40 records were untouched.

The former `approve-reviewed-launches.sql` is removed.
`stage-researched-launches.sql` now stages only unapproved proposals with
empty methods and leaves every existing record untouched on conflict.
Neither staging script approves launches. The production history and schema
remain in place; no rollback of valid observations was needed.

### Explicit owner approval — November 9, 2026 (Central)

After discussing the agency sources, inferred pin placement and launch methods,
the owner instructed: “yeah lets just approve them all now”. Scope was the six
prepared candidates listed above. All six were approved with `trailer` methods
at `2026-11-10T00:44:37.813096Z` (November 9, 6:44 PM Central).

The transaction checked exact IDs, unchanged last-edit timestamps, pending
approval, empty methods, source presence and valid coordinates. It updated
only approval fields, methods, review notes and last-edit times, and inserted
six `lake_launch_approve` audit records in the same transaction. All-or-none
row-count enforcement required six unchanged records. The read-back verified
**46 total rows: six approved and 40 pending**, with coordinates and source
counts unchanged. `owner-approval.json` records the approval basis and audit IDs.
No additional candidate, threshold, or public UI release was approved by this
operation. The normal staging scripts still create pending proposals only.

Specific holds recorded during review:

- Cricket Creek: the source pin is in open water, not on the ramp.
- Holiday Island: the source pin does not clearly identify the public ramp.
- Truman State Park: the two-lane campground ramp is restricted to campers;
  the separate four-lane ramp near the marina is public. See
  <https://mostateparks.com/park/truman-park/boating>.
- Other candidates retain their original review requirements. In particular,
  proximity to a broad lake polygon never proves the place belongs in the
  lake's public launch list.

Ramp-elevation cautions remain disabled for both lakes. Published threshold
values in the district layer are not a completed threshold review. They stay
in the review data but are excluded from public payloads and display, along
with the elevation-caution footer, until that lake passes threshold review.

## Public release

After merging the foundation, the owner instructed: “merged. lets turn it on”.
The activation change adds only `table-rock` and `truman` to both allowlists
in `src/lib/lakes/public-pages.ts`. One publishes lake routes, sitemap entries
and lake links. The other independently enables the dam photo header,
replacement conditions card and lake preview. Registry membership and
backfilled history cannot enable additional destinations.

The hourly pool-history collector is intentionally independent: deploying
the foundation starts its scheduled production writes even while both UI
gates stay closed. Owner approval is recorded for the six prepared locations.
The first monitored production run and release checks remain prerequisites
for merging the activation change; the activation PR records their results. Cron health and the UI both use six hours for hourly observations and 36 hours for daily
reports. A delayed daily report becomes outdated rather than extending that
window silently. The foundation review and its checks are recorded in PR #1765.
