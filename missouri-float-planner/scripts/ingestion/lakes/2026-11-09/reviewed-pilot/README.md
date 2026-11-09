# Pilot data verification — November 9, 2026

These are real source observations and source/imagery-reviewed launch records,
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

## Reviewed locations

`launches.json` records the source URLs, coordinates, review notes and
review method. Review was performed by Codex using agency records and
georeferenced imagery, not by an on-site human inspector. No record claims
a ramp is currently open. Unknown fees and amenities remain unknown.

| Lake | Approved launch | Coordinate basis |
| --- | --- | --- |
| Table Rock | Table Rock State Park | Official park ramp coordinates, checked against imagery |
| Table Rock | Moonshine Beach | Paved ramp mapped from georeferenced imagery; agency map identifies launch |
| Table Rock | Cow Creek | Paved ramp mapped from georeferenced imagery; agency map identifies launch |
| Truman | Long Shoal | Current USACE NWK ramp feature, checked against imagery |
| Truman | Sparrowfoot | Current USACE NWK ramp feature, checked against imagery |
| Truman | Thibaut Point | Current USACE NWK ramp feature, checked against imagery |

The Table Rock set covers the Branson/dam end and Cow Creek; it does not
cover the whole reservoir. The Truman set covers Long Shoal, the northern
main-lake arm, and the Sparrowfoot end. Public copy says **three reviewed
launches**, not a complete directory. All six have verified trailer ramps;
none was guessed to be a dedicated hand launch.

Production access points were re-read before approval. No existing identity
matched these six. The unapproved Romp Hole candidate was linked to its
existing canonical access point, `9a1a7b6c-2476-4fc8-a512-740227fff6d7`.

`stage-launch-candidates.sql` staged 43 unapproved candidates. The reviewed
SQL approved three of those and added the three Table Rock locations,
leaving **46 total rows, six approved, 40 unapproved**. The approved SQL
only updates an existing row while it is unapproved; it does not overwrite
later editorial changes to approved records.

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
values in the district layer are not a completed threshold review.

## Public release

The shared public-page allowlist remains empty. These data changes do not
publish lake routes, add sitemap entries or expose lake links. Release
still requires the monitored production sync and passing release checks.
Current CI details belong in PR #1765, not in this data evidence record.
